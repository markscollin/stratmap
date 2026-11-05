// Roadmap 1.3 + 1.4 against a real Neon database: the webhook's event claim
// (INSERT … ON CONFLICT DO NOTHING RETURNING on neon-http), subscription sync and
// the effective plan, through the real handlers. Stripe itself is mocked.
// Run: DATABASE_URL=<dev branch url> npm run test:live
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest'

const subs = new Map<string, unknown>()
vi.mock('stripe', () => ({
  default: class {
    webhooks = { constructEvent: vi.fn() }
    subscriptions = { retrieve: async (id: string) => subs.get(id) }
  },
}))
vi.mock('../_lib/email', async (orig) => ({
  ...(await orig<typeof import('../_lib/email')>()),
  sendPaymentFailed: vi.fn().mockResolvedValue({ sent: false, skipped: true }),
}))

import { eq, like } from 'drizzle-orm'
import { db } from '../_lib/db'
import { getEffectivePlan } from '../_lib/access'
import { sendPaymentFailed } from '../_lib/email'
import * as schema from '../../src/lib/db/schema'
import webhook from '../webhooks/stripe'
import { createReq } from '../__tests__/helpers/req'
import { createRes, type MockRes } from '../__tests__/helpers/res'

const RUN = `live-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const WS = `ws-${RUN}`
const SUB = `sub_${RUN}`

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for live tests')
if (process.env.VERCEL_ENV === 'production') throw new Error('Refusing to run live tests against production')

function setSub(status: string) {
  subs.set(SUB, {
    id: SUB, status, customer: `cus_${RUN}`, cancel_at_period_end: false, cancel_at: null,
    items: { data: [{ price: { id: `price_growth_${RUN}` }, current_period_end: 1_900_000_000 }] },
  })
}

async function send(id: string, type: string, object: unknown): Promise<MockRes> {
  const req = createReq({ method: 'POST', body: { id, type, data: { object } }, headers: {} }) as unknown as Record<PropertyKey, unknown>
  req[Symbol.asyncIterator] = async function* () { /* pre-parsed body path */ }
  const res = createRes()
  await webhook(req as never, res as never)
  return res
}

beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_live'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_live'
  process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID = `price_growth_${RUN}`
  await db.insert(schema.workspaces).values({ id: WS, name: `Live ${RUN}`, ownerId: `u-${RUN}`, ownerRole: 'Founder/CEO', size: '1-10' })
  await db.insert(schema.workspaceMembers).values({ id: `wm-${RUN}`, workspaceId: WS, userId: `u-${RUN}`, email: `owner-${RUN}@example.test`, permission: 'owner' })
})

afterAll(async () => {
  await db.delete(schema.workspaces).where(eq(schema.workspaces.id, WS))
  await db.delete(schema.stripeEvents).where(like(schema.stripeEvents.id, `%${RUN}%`))
  delete process.env.STRIPE_SECRET_KEY
  delete process.env.STRIPE_WEBHOOK_SECRET
  delete process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID
})

describe('billing life-cycle on Neon', () => {
  it('checkout → past_due (grace, one email, replay is a no-op) → canceled', async () => {
    setSub('active')
    const checkout = await send(`evt_co_${RUN}`, 'checkout.session.completed', {
      id: `cs_${RUN}`, mode: 'subscription', subscription: SUB, metadata: { workspaceId: WS },
    })
    expect(checkout._body).toEqual({ received: true })
    expect((await getEffectivePlan(WS))?.tier).toBe('growth')

    setSub('past_due')
    const failed = { id: `in_${RUN}`, attempt_count: 1, billing_reason: 'subscription_cycle', next_payment_attempt: null,
      parent: { subscription_details: { subscription: SUB } } }
    await send(`evt_fail_${RUN}`, 'invoice.payment_failed', failed)
    const replay = await send(`evt_fail_${RUN}`, 'invoice.payment_failed', failed)
    expect(replay._body).toEqual({ received: true, duplicate: true })
    expect(vi.mocked(sendPaymentFailed)).toHaveBeenCalledTimes(1)
    const [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, WS))
    expect(ws.subscriptionStatus).toBe('past_due')
    expect((await getEffectivePlan(WS))?.tier).toBe('growth')

    setSub('canceled')
    await send(`evt_del_${RUN}`, 'customer.subscription.deleted', { id: SUB })
    expect((await getEffectivePlan(WS))?.tier).toBe('free')
    const [after] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, WS))
    expect(after.stripeSubscriptionId).toBeNull()
    expect(after.stripeCustomerId).toBe(`cus_${RUN}`)
  })
})
