// R-69: billing races and lapsed states. Each case was reproduced against the old code before the fix.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
const subs = new Map<string, Record<string, unknown>>()
const retrieve = vi.fn(async (id: string) => {
  await new Promise(r => setTimeout(r, 1)) // a real network call: lets two syncs interleave
  const s = subs.get(id)
  if (!s) throw Object.assign(new Error(`No such subscription: ${id}`), { code: 'resource_missing' })
  return s
})
const cancel = vi.fn(async (id: string) => { const s = subs.get(id); if (s) s.status = 'canceled'; return s })
const paymentsList = vi.fn(async () => ({ data: [{ payment: { type: 'payment_intent', payment_intent: 'pi_1' } }] }))
const refundCreate = vi.fn(async () => ({ id: 're_1' }))
vi.mock('stripe', () => ({ default: class { subscriptions = { retrieve, cancel }; invoicePayments = { list: paymentsList }; refunds = { create: refundCreate } } }))
const reported: string[] = []
vi.mock('../_lib/sentry', () => ({ reportError: (e: unknown) => { reported.push(e instanceof Error ? e.message : String(e)) } }))

import Stripe from 'stripe'
import { eq } from 'drizzle-orm'
import { syncSubscription } from '../_lib/billing'
import { setupSchema, cleanDb, seedWorkspace, testDb, TEST_WS_ID } from './helpers/db'
import * as schema from '../../src/lib/db/schema'

const stripe = new Stripe('sk') as never
const PERIOD_END = 1_900_000_000
function sub(id: string, status = 'active', price = 'price_starter') {
  const s = { id, status, customer: 'cus_1', metadata: { workspaceId: TEST_WS_ID }, cancel_at_period_end: false, cancel_at: null, latest_invoice: `in_${id}`,
    items: { data: [{ price: { id: price }, current_period_end: PERIOD_END }] } }
  subs.set(id, s)
  return s
}
const ws = async () => (await testDb.select().from(schema.workspaces).where(eq(schema.workspaces.id, TEST_WS_ID)))[0]

beforeAll(async () => { await setupSchema() })
beforeEach(async () => {
  await cleanDb(); await seedWorkspace()
  subs.clear(); reported.length = 0
  for (const m of [retrieve, cancel, paymentsList, refundCreate]) m.mockClear()
  process.env.STRIPE_STARTER_MONTHLY_PRICE_ID = 'price_starter'
  process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID = 'price_growth'
})

describe('R-69.1 two subscriptions for one workspace arriving at the same time', () => {
  it('exactly one is linked; the other is cancelled and refunded (none left paying unseen)', async () => {
    sub('sub_A'); sub('sub_B', 'active', 'price_growth')
    // B's whole sync happens after A has read the (unlinked) workspace and before A writes its link: the race window.
    const realUpdate = testDb.update.bind(testDb)
    let raced = false
    const spy = vi.spyOn(testDb, 'update').mockImplementation(((table: unknown) => {
      if (table === schema.workspaces && !raced) {
        raced = true
        const builder = realUpdate(table as never)
        return { set: (v: never) => { const w = builder.set(v); return { where: (c: never) => ({ returning: async (r: never) => { await syncSubscription(stripe, 'sub_B', { workspaceId: TEST_WS_ID }); return w.where(c).returning(r) }, then: async (ok: (x: unknown) => unknown, ko: (e: unknown) => unknown) => { try { await syncSubscription(stripe, 'sub_B', { workspaceId: TEST_WS_ID }); return ok(await w.where(c)) } catch (e) { return ko(e) } } }) } } }
      }
      return realUpdate(table as never)
    }) as never)
    await syncSubscription(stripe, 'sub_A', { workspaceId: TEST_WS_ID })
    spy.mockRestore()
    const linked = (await ws()).stripeSubscriptionId
    expect(['sub_A', 'sub_B']).toContain(linked)
    const other = linked === 'sub_A' ? 'sub_B' : 'sub_A'
    expect(cancel.mock.calls.map(c => c[0])).toEqual([other])
    expect(refundCreate).toHaveBeenCalledTimes(1)
  })
})

describe('R-69.2 a lapsed subscription is not "live"', () => {
  for (const status of ['unpaid', 'paused', 'incomplete']) {
    it(`a new subscription replaces a linked ${status} one (which is cancelled, not refunded), instead of being refunded as a duplicate`, async () => {
      sub('sub_old', status)
      await testDb.update(schema.workspaces).set({ stripeSubscriptionId: 'sub_old', subscriptionStatus: status, stripeCustomerId: 'cus_1' }).where(eq(schema.workspaces.id, TEST_WS_ID))
      sub('sub_new')
      await syncSubscription(stripe, 'sub_new', { workspaceId: TEST_WS_ID })
      expect(await ws()).toMatchObject({ stripeSubscriptionId: 'sub_new', planTier: 'starter', subscriptionStatus: 'active' })
      expect(cancel.mock.calls.map(c => c[0])).toEqual(['sub_old'])
      expect(refundCreate).not.toHaveBeenCalled()
    })
  }
})

describe('R-69.4 an older read never overwrites a newer one', () => {
  it('a sync whose Stripe read is older than the last written one changes nothing', async () => {
    sub('sub_1')
    await testDb.update(schema.workspaces).set({ stripeSubscriptionId: 'sub_1', planTier: 'starter', subscriptionStatus: 'active' }).where(eq(schema.workspaces.id, TEST_WS_ID))
    // a newer read (canceled) is written first...
    subs.get('sub_1')!.status = 'canceled'
    await syncSubscription(stripe, 'sub_1', { readAt: new Date(2_000) })
    expect(await ws()).toMatchObject({ planTier: 'free', stripeSubscriptionId: null })
    // ...then a slower request that read the subscription earlier, while it was still active, arrives
    subs.get('sub_1')!.status = 'active'
    await syncSubscription(stripe, 'sub_1', { workspaceId: TEST_WS_ID, readAt: new Date(1_000) })
    expect(await ws()).toMatchObject({ planTier: 'free', stripeSubscriptionId: null })
  })
})

describe('R-69.5 a checkout that completes for a workspace deleted meanwhile', () => {
  it('is not linked to it; the payment is cancelled and refunded, and a human is told', async () => {
    await testDb.update(schema.workspaces).set({ deletedAt: new Date(), deletedBy: 'u' }).where(eq(schema.workspaces.id, TEST_WS_ID))
    sub('sub_late')
    const result = await syncSubscription(stripe, 'sub_late', { workspaceId: TEST_WS_ID })
    expect(result).toBeNull()
    expect((await ws()).stripeSubscriptionId).toBeNull()
    expect(cancel).toHaveBeenCalledWith('sub_late')
    expect(refundCreate).toHaveBeenCalledTimes(1)
    expect(reported.some(m => /deleted workspace/.test(m))).toBe(true)
  })
})
