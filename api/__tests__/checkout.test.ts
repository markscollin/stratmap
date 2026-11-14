import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'

// The route resolves the caller's role via api/_lib/access → db, so the db module
// must be mocked even though these tests pass the permission on the auth context.
vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})

vi.mock('../_lib/auth', () => ({
  requireAuth: vi.fn(),
  requireUser: vi.fn(),
}))

const sessionCreate = vi.fn()
const portalCreate = vi.fn()
const customerCreate = vi.fn()
vi.mock('stripe', () => ({
  default: class {
    customers = { create: customerCreate }
    checkout = { sessions: { create: sessionCreate } }
    billingPortal = { sessions: { create: portalCreate } }
  },
}))

import { requireAuth } from '../_lib/auth'
import handler from '../checkout'
import { createReq } from './helpers/req'
import { createRes } from './helpers/res'
import { TEST_USER_ID, TEST_WS_ID, setupSchema, cleanDb, seedWorkspace, testDb } from './helpers/db'
import * as schema from '../../src/lib/db/schema'
import { eq } from 'drizzle-orm'

const PRICE_ENV = [
  'STRIPE_SECRET_KEY',
  'STRIPE_STARTER_MONTHLY_PRICE_ID',
  'STRIPE_STARTER_ANNUAL_PRICE_ID',
  'STRIPE_GROWTH_MONTHLY_PRICE_ID',
  'STRIPE_GROWTH_ANNUAL_PRICE_ID',
]

beforeAll(async () => { await setupSchema() })

beforeEach(async () => {
  await cleanDb()
  await seedWorkspace()
  portalCreate.mockReset().mockResolvedValue({ url: 'https://billing.stripe.test/portal' })
  vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID, permission: 'owner' })
  sessionCreate.mockReset().mockResolvedValue({ url: 'https://checkout.stripe.test/abc' })
  customerCreate.mockReset().mockResolvedValue({ id: 'cus_new' })
  PRICE_ENV.forEach(k => delete process.env[k])
})

afterEach(() => { PRICE_ENV.forEach(k => delete process.env[k]) })

describe('POST /api/checkout', () => {
  it('returns 403 for non-admin members (billing is admin-only)', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID, permission: 'editor' })
    const res = createRes()
    await handler(createReq({ method: 'POST', body: { tier: 'starter', billingCycle: 'monthly' } }) as never, res as never)
    expect(res._status).toBe(403)
    expect(sessionCreate).not.toHaveBeenCalled()
  })


  it('returns 405 for non-POST methods', async () => {
    const res = createRes()
    await handler(createReq({ method: 'GET' }) as never, res as never)
    expect(res._status).toBe(405)
  })

  it('returns 400 when tier or billingCycle is missing', async () => {
    const res = createRes()
    await handler(createReq({ method: 'POST', body: { tier: 'starter' } }) as never, res as never)
    expect(res._status).toBe(400)
  })

  it('short-circuits to the success page in dev mode (no Stripe key)', async () => {
    const res = createRes()
    await handler(createReq({ method: 'POST', body: { tier: 'starter', billingCycle: 'monthly' } }) as never, res as never)
    const body = res._body as { url: string }
    expect(body.url).toBe('/billing/success?plan=starter')
    expect(sessionCreate).not.toHaveBeenCalled()
  })

  it('returns 400 when no price is configured for the tier/cycle', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    const res = createRes()
    await handler(createReq({ method: 'POST', body: { tier: 'starter', billingCycle: 'monthly' } }) as never, res as never)
    expect(res._status).toBe(400)
  })

  it('creates a Stripe checkout session and returns its url', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.STRIPE_STARTER_MONTHLY_PRICE_ID = 'price_starter_monthly'
    const res = createRes()
    await handler(createReq({ method: 'POST', body: { tier: 'starter', billingCycle: 'monthly' } }) as never, res as never)

    expect(sessionCreate).toHaveBeenCalledTimes(1)
    const arg = sessionCreate.mock.calls[0][0]
    // The webhook derives the tier from the price id; metadata only links the workspace.
    expect(arg.line_items).toEqual([{ price: 'price_starter_monthly', quantity: 1 }])
    expect(arg.metadata).toEqual({ workspaceId: TEST_WS_ID })
    expect(arg.subscription_data).toEqual({ metadata: { workspaceId: TEST_WS_ID } })
    expect(arg.client_reference_id).toBe(TEST_WS_ID)
    expect(arg.customer).toBe('cus_new') // a customer is made before Checkout (R-19)
    expect(arg.allow_promotion_codes).toBe(true)
    const body = res._body as { url: string }
    expect(body.url).toBe('https://checkout.stripe.test/abc')
  })

  it('reuses the Stripe customer after a cancellation', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.STRIPE_STARTER_MONTHLY_PRICE_ID = 'price_starter_monthly'
    await testDb.update(schema.workspaces).set({ stripeCustomerId: 'cus_old' }).where(eq(schema.workspaces.id, TEST_WS_ID))
    const res = createRes()
    await handler(createReq({ method: 'POST', body: { tier: 'starter', billingCycle: 'monthly' } }) as never, res as never)
    expect(sessionCreate.mock.calls[0][0].customer).toBe('cus_old')
  })

  it('sends an existing subscriber to the Customer Portal instead of a second subscription', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID = 'price_growth_monthly'
    await testDb.update(schema.workspaces)
      .set({ planTier: 'starter', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' })
      .where(eq(schema.workspaces.id, TEST_WS_ID))
    const res = createRes()
    await handler(createReq({ method: 'POST', body: { tier: 'growth', billingCycle: 'monthly' } }) as never, res as never)
    expect(sessionCreate).not.toHaveBeenCalled()
    expect(portalCreate.mock.calls[0][0].customer).toBe('cus_1')
    expect(res._body).toEqual({ url: 'https://billing.stripe.test/portal', portal: true })
  })
})

// R-19: two Checkouts opened at once must belong to ONE Stripe customer, so the second payment can be recognised as a duplicate.
describe('one Stripe customer per workspace (R-19)', () => {
  const start = () => handler(createReq({ method: 'POST', body: { tier: 'starter', billingCycle: 'monthly' } }) as never, createRes() as never)
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.STRIPE_STARTER_MONTHLY_PRICE_ID = 'price_starter_monthly'
  })

  it('creates the customer before Checkout, stores its id on the workspace, and keys the request by workspace', async () => {
    await start()
    expect(customerCreate).toHaveBeenCalledTimes(1)
    expect(customerCreate.mock.calls[0][0]).toEqual({ metadata: { workspaceId: TEST_WS_ID } }) // opaque id only, no names or emails
    expect(customerCreate.mock.calls[0][1]).toEqual({ idempotencyKey: `customer-${TEST_WS_ID}` })
    const [ws] = await testDb.select().from(schema.workspaces).where(eq(schema.workspaces.id, TEST_WS_ID))
    expect(ws.stripeCustomerId).toBe('cus_new')
    expect(sessionCreate.mock.calls[0][0].customer).toBe('cus_new')
  })

  it('a second Checkout started later reuses that customer and creates no new one', async () => {
    await start(); await start()
    expect(customerCreate).toHaveBeenCalledTimes(1)
    expect(sessionCreate.mock.calls.map(c => c[0].customer)).toEqual(['cus_new', 'cus_new'])
  })

  it('two simultaneous starts end with one customer on the workspace and both sessions on it', async () => {
    await Promise.all([start(), start()])
    const [ws] = await testDb.select().from(schema.workspaces).where(eq(schema.workspaces.id, TEST_WS_ID))
    expect(ws.stripeCustomerId).toBe('cus_new')
    expect(sessionCreate.mock.calls.map(c => c[0].customer)).toEqual(['cus_new', 'cus_new'])
  })

  it('if another request saved a different customer first, that one wins', async () => {
    customerCreate.mockImplementation(async () => {
      await testDb.update(schema.workspaces).set({ stripeCustomerId: 'cus_first' }).where(eq(schema.workspaces.id, TEST_WS_ID))
      return { id: 'cus_late' }
    })
    await start()
    expect(sessionCreate.mock.calls[0][0].customer).toBe('cus_first')
  })
})

// R-20: without a Stripe key the route used to answer with a fake success everywhere.
describe('no Stripe key (R-20)', () => {
  const start = async () => { const res = createRes(); await handler(createReq({ method: 'POST', body: { tier: 'starter', billingCycle: 'monthly' } }) as never, res as never); return res }

  it('in explicit local dev it still simulates success', async () => {
    expect((await start())._body).toEqual({ url: '/billing/success?plan=starter' })
  })

  it.each([
    ['without ALLOW_DEV_BYPASS', () => { delete process.env.ALLOW_DEV_BYPASS }],
    ['on production', () => { process.env.VERCEL_ENV = 'production' }],
    ['on preview', () => { process.env.VERCEL_ENV = 'preview' }],
  ])('%s it is a 503 with a message, never a fake "Welcome to Starter"', async (_name, setup) => {
    const saved = { flag: process.env.ALLOW_DEV_BYPASS, env: process.env.VERCEL_ENV }
    setup()
    try {
      const res = await start()
      expect(res._status).toBe(503)
      expect(res._body).toMatchObject({ error: 'billing-unavailable' })
      expect(JSON.stringify(res._body)).not.toContain('billing/success')
      expect(sessionCreate).not.toHaveBeenCalled()
    } finally {
      if (saved.flag === undefined) delete process.env.ALLOW_DEV_BYPASS; else process.env.ALLOW_DEV_BYPASS = saved.flag
      if (saved.env === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = saved.env
    }
  })
})
