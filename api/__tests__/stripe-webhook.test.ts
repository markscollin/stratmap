import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})

vi.mock('stripe', () => ({
  default: class {
    webhooks = { constructEvent: vi.fn() }
  },
}))

import handler from '../webhooks/stripe'
import { setupSchema, cleanDb, seedWorkspace, testDb, TEST_WS_ID } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'
import { eq } from 'drizzle-orm'

// The webhook reads the raw request stream via `for await (const chunk of req)`.
// Mock requests must be async-iterable; we yield nothing so getRawBody returns empty
// and the handler falls through to the dev pre-parsed-body path.
function webhookReq(body: unknown) {
  const req = createReq({ method: 'POST', body, headers: {} }) as Record<string, unknown>
  req[Symbol.asyncIterator] = async function* () { /* empty raw body */ }
  return req
}

beforeAll(async () => { await setupSchema() })

beforeEach(async () => {
  await cleanDb()
  await seedWorkspace()
  process.env.STRIPE_SECRET_KEY = 'sk_test'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
  delete process.env.VERCEL_ENV
})

afterEach(() => {
  delete process.env.STRIPE_SECRET_KEY
  delete process.env.STRIPE_WEBHOOK_SECRET
  delete process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID
})

async function getTier(): Promise<string> {
  const [ws] = await testDb.select().from(schema.workspaces).where(eq(schema.workspaces.id, TEST_WS_ID))
  return ws.planTier
}

describe('POST /api/webhooks/stripe', () => {
  it('returns 405 for non-POST methods', async () => {
    const res = createRes()
    await handler(createReq({ method: 'GET' }) as never, res as never)
    expect(res._status).toBe(405)
  })

  it('returns 400 when Stripe is not configured', async () => {
    delete process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_WEBHOOK_SECRET
    const res = createRes()
    await handler(createReq({ method: 'POST', body: {} }) as never, res as never)
    expect(res._status).toBe(400)
  })

  it('upgrades the workspace on checkout.session.completed', async () => {
    const event = {
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', metadata: { workspaceId: TEST_WS_ID, planTier: 'growth' }, customer: 'cus_1', subscription: 'sub_1' } },
    }
    const res = createRes()
    await handler(webhookReq(event) as never, res as never)

    expect(await getTier()).toBe('growth')
    const [ws] = await testDb.select().from(schema.workspaces).where(eq(schema.workspaces.id, TEST_WS_ID))
    expect(ws.stripeCustomerId).toBe('cus_1')
    expect(ws.stripeSubscriptionId).toBe('sub_1')
  })

  it('ignores checkout.session.completed without metadata', async () => {
    const event = { type: 'checkout.session.completed', data: { object: { id: 'cs_2', metadata: {} } } }
    const res = createRes()
    await handler(webhookReq(event) as never, res as never)
    expect(await getTier()).toBe('free')
    expect((res._body as { received: boolean }).received).toBe(true)
  })

  it('downgrades to free on customer.subscription.deleted', async () => {
    await testDb.update(schema.workspaces)
      .set({ planTier: 'growth', stripeSubscriptionId: 'sub_1' })
      .where(eq(schema.workspaces.id, TEST_WS_ID))
    const event = { type: 'customer.subscription.deleted', data: { object: { id: 'sub_1' } } }
    const res = createRes()
    await handler(webhookReq(event) as never, res as never)
    expect(await getTier()).toBe('free')
  })

  it('changes tier on customer.subscription.updated', async () => {
    process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID = 'price_growth'
    await testDb.update(schema.workspaces)
      .set({ planTier: 'starter', stripeSubscriptionId: 'sub_1' })
      .where(eq(schema.workspaces.id, TEST_WS_ID))
    const event = {
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1', items: { data: [{ price: { id: 'price_growth' } }] } } },
    }
    const res = createRes()
    await handler(webhookReq(event) as never, res as never)
    expect(await getTier()).toBe('growth')
  })
})
