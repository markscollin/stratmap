import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})

// The webhook re-reads each subscription from Stripe. `subs` stands in for Stripe.
const subs = new Map<string, unknown>()
const retrieve = vi.fn(async (id: string) => {
  const sub = subs.get(id)
  if (!sub) throw new Error(`No such subscription: ${id}`)
  return sub
})
vi.mock('stripe', () => ({
  default: class {
    webhooks = { constructEvent: vi.fn() }
    subscriptions = { retrieve }
  },
}))

const sendPaymentFailed = vi.fn(async (_opts: { to: string }) => ({ sent: true }))
vi.mock('../_lib/email', () => ({ sendPaymentFailed: (opts: { to: string }) => sendPaymentFailed(opts) }))

import handler from '../webhooks/stripe'
import { setupSchema, cleanDb, seedWorkspace, seedMember, testDb, TEST_WS_ID } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'
import { eq } from 'drizzle-orm'

// The webhook reads the raw request stream via `for await (const chunk of req)`.
// Mock requests must be async-iterable; we yield nothing so getRawBody returns empty
// and the handler falls through to the dev pre-parsed-body path.
function webhookReq(body: unknown) {
  const req = createReq({ method: 'POST', body, headers: {} }) as unknown as Record<PropertyKey, unknown>
  req[Symbol.asyncIterator] = async function* () { /* empty raw body */ }
  return req
}

const PERIOD_END = 1_900_000_000 // 2030-03-17
let eventSeq = 0

function makeSub(over: {
  id?: string; status?: string; price?: string; cancelAtPeriodEnd?: boolean; cancelAt?: number | null; customer?: string
} = {}) {
  const sub = {
    id: over.id ?? 'sub_1',
    status: over.status ?? 'active',
    customer: over.customer ?? 'cus_1',
    cancel_at_period_end: over.cancelAtPeriodEnd ?? false,
    cancel_at: over.cancelAt ?? null,
    items: { data: [{ price: { id: over.price ?? 'price_starter' }, current_period_end: PERIOD_END }] },
  }
  subs.set(sub.id, sub)
  return sub
}

function event(type: string, object: unknown, id = `evt_${++eventSeq}`) {
  return { id, type, data: { object } }
}

async function send(evt: unknown) {
  const res = createRes()
  await handler(webhookReq(evt) as never, res as never)
  return res
}

async function getWs() {
  const [ws] = await testDb.select().from(schema.workspaces).where(eq(schema.workspaces.id, TEST_WS_ID))
  return ws
}

async function linkSubscription(planTier: 'starter' | 'growth' = 'starter') {
  await testDb.update(schema.workspaces)
    .set({ planTier, stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', subscriptionStatus: 'active' })
    .where(eq(schema.workspaces.id, TEST_WS_ID))
}

function invoice(over: { attempt?: number; reason?: string; nextAttempt?: number | null; sub?: string } = {}) {
  return {
    id: 'in_1',
    attempt_count: over.attempt ?? 1,
    billing_reason: over.reason ?? 'subscription_cycle',
    next_payment_attempt: over.nextAttempt === undefined ? PERIOD_END : over.nextAttempt,
    parent: { type: 'subscription_details', subscription_details: { subscription: over.sub ?? 'sub_1' } },
  }
}

beforeAll(async () => { await setupSchema() })

beforeEach(async () => {
  await cleanDb()
  await seedWorkspace()
  subs.clear()
  retrieve.mockClear()
  sendPaymentFailed.mockClear()
  process.env.STRIPE_SECRET_KEY = 'sk_test'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
  process.env.STRIPE_STARTER_MONTHLY_PRICE_ID = 'price_starter'
  process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID = 'price_growth_annual'
  delete process.env.VERCEL_ENV
})

afterEach(() => {
  delete process.env.STRIPE_SECRET_KEY
  delete process.env.STRIPE_WEBHOOK_SECRET
  delete process.env.STRIPE_STARTER_MONTHLY_PRICE_ID
  delete process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID
  delete process.env.VERCEL_ENV
})

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

  it('refuses unsigned events on a preview deployment', async () => {
    process.env.VERCEL_ENV = 'preview'
    makeSub()
    const res = await send(event('customer.subscription.updated', { id: 'sub_1' }))
    expect(res._status).toBe(400)
    expect(retrieve).not.toHaveBeenCalled()
  })

  describe('checkout.session.completed', () => {
    it('derives the tier from the price id, not metadata', async () => {
      makeSub({ price: 'price_starter' })
      await send(event('checkout.session.completed', {
        id: 'cs_1', mode: 'subscription', customer: 'cus_1', subscription: 'sub_1',
        // A tampered or stale planTier in metadata must not matter.
        metadata: { workspaceId: TEST_WS_ID, planTier: 'growth' },
      }))
      const ws = await getWs()
      expect(ws.planTier).toBe('starter')
      expect(ws.stripeCustomerId).toBe('cus_1')
      expect(ws.stripeSubscriptionId).toBe('sub_1')
      expect(ws.subscriptionStatus).toBe('active')
      expect(ws.planExpiresAt?.getTime()).toBe(PERIOD_END * 1000)
      expect(ws.cancelAtPeriodEnd).toBe(false)
    })

    it('links the workspace via client_reference_id when metadata is missing', async () => {
      makeSub({ price: 'price_growth_annual' })
      await send(event('checkout.session.completed', {
        id: 'cs_1', mode: 'subscription', subscription: 'sub_1', client_reference_id: TEST_WS_ID, metadata: {},
      }))
      expect((await getWs()).planTier).toBe('growth')
    })

    it('ignores a session with no workspace', async () => {
      makeSub()
      const res = await send(event('checkout.session.completed', { id: 'cs_2', mode: 'subscription', subscription: 'sub_1', metadata: {} }))
      expect((await getWs()).planTier).toBe('free')
      expect((res._body as { received: boolean }).received).toBe(true)
    })

    it('keeps the current tier when the price is not recognised', async () => {
      makeSub({ price: 'price_unknown' })
      await send(event('checkout.session.completed', {
        id: 'cs_1', mode: 'subscription', subscription: 'sub_1', metadata: { workspaceId: TEST_WS_ID },
      }))
      const ws = await getWs()
      expect(ws.planTier).toBe('free')
      expect(ws.stripeSubscriptionId).toBe('sub_1')
    })
  })

  describe('subscription life-cycle', () => {
    it('changes tier when the price changes', async () => {
      await linkSubscription('starter')
      makeSub({ price: 'price_growth_annual' })
      await send(event('customer.subscription.updated', { id: 'sub_1' }))
      expect((await getWs()).planTier).toBe('growth')
    })

    it('keeps the plan until the period ends when cancelled at period end', async () => {
      await linkSubscription('starter')
      makeSub({ cancelAtPeriodEnd: true })
      await send(event('customer.subscription.updated', { id: 'sub_1' }))
      const ws = await getWs()
      expect(ws.planTier).toBe('starter')
      expect(ws.cancelAtPeriodEnd).toBe(true)
      expect(ws.planExpiresAt?.getTime()).toBe(PERIOD_END * 1000)
    })

    it('treats a scheduled cancel_at date as the plan end', async () => {
      await linkSubscription('starter')
      makeSub({ cancelAt: PERIOD_END - 100 })
      await send(event('customer.subscription.updated', { id: 'sub_1' }))
      const ws = await getWs()
      expect(ws.cancelAtPeriodEnd).toBe(true)
      expect(ws.planExpiresAt?.getTime()).toBe((PERIOD_END - 100) * 1000)
    })

    it('keeps the paid plan while past_due (grace period)', async () => {
      await linkSubscription('growth')
      makeSub({ status: 'past_due', price: 'price_growth_annual' })
      await send(event('customer.subscription.updated', { id: 'sub_1' }))
      const ws = await getWs()
      expect(ws.planTier).toBe('growth')
      expect(ws.subscriptionStatus).toBe('past_due')
    })

    it('downgrades to free when Stripe marks the subscription unpaid, but keeps the link', async () => {
      await linkSubscription('growth')
      makeSub({ status: 'unpaid', price: 'price_growth_annual' })
      await send(event('customer.subscription.updated', { id: 'sub_1' }))
      const ws = await getWs()
      expect(ws.planTier).toBe('free')
      expect(ws.subscriptionStatus).toBe('unpaid')
      // Paying the open invoice in the portal can reactivate it.
      expect(ws.stripeSubscriptionId).toBe('sub_1')
    })

    it('downgrades to free on customer.subscription.deleted and keeps the customer', async () => {
      await linkSubscription('growth')
      makeSub({ status: 'canceled' })
      await send(event('customer.subscription.deleted', { id: 'sub_1' }))
      const ws = await getWs()
      expect(ws.planTier).toBe('free')
      expect(ws.subscriptionStatus).toBe('canceled')
      expect(ws.stripeSubscriptionId).toBeNull()
      expect(ws.planExpiresAt).toBeNull()
      expect(ws.stripeCustomerId).toBe('cus_1')
    })

    it('ignores events for a subscription no workspace has', async () => {
      await linkSubscription('starter')
      makeSub({ id: 'sub_other', status: 'canceled' })
      await send(event('customer.subscription.deleted', { id: 'sub_other' }))
      expect((await getWs()).planTier).toBe('starter')
    })
  })

  describe('invoices', () => {
    beforeEach(async () => {
      await seedMember('u-admin', 'admin', 'admin@example.com')
      await seedMember('u-editor', 'editor', 'editor@example.com')
    })

    it('marks the workspace past_due and emails owners and admins on the first failed renewal', async () => {
      await linkSubscription('starter')
      makeSub({ status: 'past_due' })
      await send(event('invoice.payment_failed', invoice()))
      const ws = await getWs()
      expect(ws.subscriptionStatus).toBe('past_due')
      expect(ws.planTier).toBe('starter')
      const recipients = sendPaymentFailed.mock.calls.map(c => c[0].to).sort()
      expect(recipients).toEqual(['admin@example.com', 'test@example.com'])
    })

    it('does not email again on later retries', async () => {
      await linkSubscription('starter')
      makeSub({ status: 'past_due' })
      await send(event('invoice.payment_failed', invoice({ attempt: 2 })))
      expect(sendPaymentFailed).not.toHaveBeenCalled()
    })

    it('does not email for a failed first payment (Checkout handles that)', async () => {
      await linkSubscription('starter')
      makeSub({ status: 'incomplete' })
      await send(event('invoice.payment_failed', invoice({ reason: 'subscription_create' })))
      expect(sendPaymentFailed).not.toHaveBeenCalled()
    })

    it('clears past_due when the invoice is paid', async () => {
      await linkSubscription('starter')
      await testDb.update(schema.workspaces).set({ subscriptionStatus: 'past_due' }).where(eq(schema.workspaces.id, TEST_WS_ID))
      makeSub({ status: 'active' })
      await send(event('invoice.paid', invoice()))
      expect((await getWs()).subscriptionStatus).toBe('active')
    })

    it('reads the subscription id from the legacy invoice shape', async () => {
      await linkSubscription('starter')
      makeSub({ status: 'past_due' })
      await send(event('invoice.payment_failed', { id: 'in_1', attempt_count: 1, billing_reason: 'subscription_cycle', subscription: 'sub_1' }))
      expect((await getWs()).subscriptionStatus).toBe('past_due')
    })

    it('ignores invoices that are not for a subscription', async () => {
      await send(event('invoice.paid', { id: 'in_2', parent: null }))
      expect(retrieve).not.toHaveBeenCalled()
    })
  })

  describe('idempotency (roadmap 1.4)', () => {
    beforeEach(async () => { await seedMember('u-admin', 'admin', 'admin@example.com') })

    it('treats a replayed event as a no-op', async () => {
      await linkSubscription('starter')
      makeSub({ status: 'past_due' })
      const evt = event('invoice.payment_failed', invoice(), 'evt_replay')

      await send(evt)
      const replay = await send(evt)

      expect(replay._body).toEqual({ received: true, duplicate: true })
      expect(sendPaymentFailed).toHaveBeenCalledTimes(2) // owner + admin, once each
      expect(retrieve).toHaveBeenCalledTimes(1)
    })

    it('releases the claim when handling fails, so Stripe can retry', async () => {
      await linkSubscription('starter')
      const evt = event('customer.subscription.updated', { id: 'sub_1' }, 'evt_retry')

      // Stripe is down the first time.
      const failed = await send(evt)
      expect(failed._status).toBe(500)

      makeSub({ price: 'price_growth_annual' })
      const retried = await send(evt)
      expect(retried._body).toEqual({ received: true })
      expect((await getWs()).planTier).toBe('growth')
    })

    it('does not record event types it ignores', async () => {
      const res = await send(event('customer.created', { id: 'cus_1' }))
      expect(res._body).toEqual({ received: true })
      expect(await testDb.select().from(schema.stripeEvents)).toHaveLength(0)
    })
  })
})
