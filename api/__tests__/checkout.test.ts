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
vi.mock('stripe', () => ({
  default: class {
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
    expect(arg.customer).toBeUndefined()
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
