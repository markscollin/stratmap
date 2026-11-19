// Launch review R-22 (daily billing reconciliation, refunds and disputes), R-27 (prune rate_limits) and R-40 (trial-ending emails).
import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})

const subs = new Map<string, Record<string, unknown>>()
const charges = new Map<string, Record<string, unknown>>()
vi.mock('stripe', () => ({
  default: class {
    webhooks = { constructEvent: vi.fn() }
    subscriptions = { retrieve: async (id: string) => { const s = subs.get(id); if (!s) throw new Error(`No such subscription: ${id}`); return s }, cancel: vi.fn() }
    charges = { retrieve: async (id: string) => charges.get(id) }
  },
}))
const reported: string[] = []
vi.mock('../_lib/sentry', () => ({ reportError: (e: unknown) => { reported.push(e instanceof Error ? e.message : String(e)) } }))
const trialMail = vi.fn(async (_o: { to: string; ended: boolean; subject?: string }) => ({ sent: true }))
const billingMail = vi.fn(async (_o: { to: string; subject: string; lines: string[] }) => ({ sent: true }))
vi.mock('../_lib/email', async importOriginal => ({
  ...(await importOriginal<typeof import('../_lib/email')>()),
  sendTrialEnding: (o: { to: string; ended: boolean }) => trialMail(o),
  sendBillingAlert: (o: { to: string; subject: string; lines: string[] }) => billingMail(o),
}))

import cronHandler from '../cron/daily-maintenance'
import webhook from '../webhooks/stripe'
import { pruneRateLimits, hitRateLimit } from '../_lib/rateLimit'
import { sendTrialNotices } from '../_lib/trialNotices'
import { setupSchema, cleanDb, seedWorkspace, seedChart, seedNode, testDb, TEST_WS_ID } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'
import { eq } from 'drizzle-orm'

const DAY = 86_400_000
const PERIOD_END = 1_900_000_000
const run = async (auth: string | null = 'Bearer s3cret') => {
  const res = createRes()
  await cronHandler(createReq({ method: 'GET', headers: auth ? { authorization: auth } : {} }) as never, res as never)
  return res
}
const ws = async () => (await testDb.select().from(schema.workspaces).where(eq(schema.workspaces.id, TEST_WS_ID)))[0]

function sub(over: { id?: string; status?: string } = {}) {
  const s = { id: over.id ?? 'sub_1', status: over.status ?? 'active', customer: 'cus_1', metadata: {}, cancel_at_period_end: false, cancel_at: null,
    items: { data: [{ price: { id: 'price_starter' }, current_period_end: PERIOD_END }] } }
  subs.set(s.id, s)
  return s
}

beforeAll(async () => { await setupSchema() })
beforeEach(async () => {
  await cleanDb(); await seedWorkspace()
  subs.clear(); charges.clear(); reported.length = 0; trialMail.mockClear(); billingMail.mockClear()
  process.env.CRON_SECRET = 's3cret'
  process.env.STRIPE_SECRET_KEY = 'sk_test_x'
  process.env.STRIPE_STARTER_MONTHLY_PRICE_ID = 'price_starter'
})
afterEach(() => { delete process.env.CRON_SECRET; delete process.env.STRIPE_SECRET_KEY; delete process.env.BILLING_ALERT_EMAIL })

describe('the daily maintenance endpoint', () => {
  it('refuses without CRON_SECRET and without the right secret', async () => {
    expect((await run(null))._status).toBe(401)
    expect((await run('Bearer wrong'))._status).toBe(401)
    delete process.env.CRON_SECRET
    expect((await run('Bearer s3cret'))._status).toBe(503)
  })

  it('without a Stripe key it still prunes and sends notices', async () => {
    delete process.env.STRIPE_SECRET_KEY
    const res = await run()
    expect(res._status).toBe(200)
    expect(res._body).toEqual({ reconcile: 'stripe-not-configured', rateLimitsPruned: 0, trialNotices: { warned: 0, ended: 0 }, scheduledVersions: { saved: 0, unchanged: 0, deferred: 0, failed: 0 } })
  })

  it('saves a daily version of a changed chart on a Growth workspace, and reports it', async () => {
    delete process.env.STRIPE_SECRET_KEY
    await testDb.update(schema.workspaces).set({ planTier: 'growth' }).where(eq(schema.workspaces.id, TEST_WS_ID))
    await seedChart(); await seedNode()
    const res = await run()
    expect(res._body).toMatchObject({ scheduledVersions: { saved: 1, failed: 0 } })
    const [v] = await testDb.select().from(schema.chartSnapshots)
    expect(v.kind).toBe('scheduled')
  })
})

describe('R-22: reconciliation repairs a lost webhook', () => {
  it('drops a workspace to Free when Stripe cancelled the subscription and the event never came', async () => {
    await testDb.update(schema.workspaces).set({ planTier: 'starter', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', subscriptionStatus: 'past_due' }).where(eq(schema.workspaces.id, TEST_WS_ID))
    sub({ status: 'canceled' })
    const res = await run()
    expect(res._body).toMatchObject({ reconcile: { checked: 1, corrected: 1, failed: 0 } })
    const w = await ws()
    expect(w.planTier).toBe('free')
    expect(w.stripeSubscriptionId).toBeNull()
    expect(reported.some(m => m.includes('reconciliation corrected'))).toBe(true)
  })

  it('changes and reports nothing when the workspace already matches Stripe', async () => {
    await testDb.update(schema.workspaces).set({ planTier: 'starter', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', subscriptionStatus: 'active' }).where(eq(schema.workspaces.id, TEST_WS_ID))
    sub()
    expect((await run())._body).toMatchObject({ reconcile: { checked: 1, corrected: 0, failed: 0 } })
    expect(reported).toEqual([])
  })

  it('one subscription Stripe cannot find is counted and reported, and the rest still run', async () => {
    await testDb.insert(schema.workspaces).values({ id: 'ws-2', name: 'Two', ownerId: 'o2', ownerRole: 'CEO', size: '1-10', planTier: 'starter', stripeSubscriptionId: 'sub_gone', subscriptionStatus: 'active', updatedAt: new Date(0) })
    await testDb.update(schema.workspaces).set({ planTier: 'starter', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', subscriptionStatus: 'past_due' }).where(eq(schema.workspaces.id, TEST_WS_ID))
    sub({ status: 'canceled' })
    expect((await run())._body).toMatchObject({ reconcile: { checked: 2, corrected: 1, failed: 1 } })
    expect((await ws()).planTier).toBe('free')
  })

  it('ignores workspaces with no subscription', async () => {
    expect((await run())._body).toMatchObject({ reconcile: { checked: 0 } })
  })
})

describe('R-22: refunds and disputes are reported, never acted on', () => {
  const send = async (type: string, object: unknown) => {
    const res = createRes()
    await webhook(createReq({ method: 'POST', body: { id: `evt_${Math.random()}`, type, data: { object } } }) as never, res as never)
    return res
  }
  beforeEach(() => { process.env.STRIPE_WEBHOOK_SECRET = 'whsec'; process.env.ALLOW_DEV_BYPASS = '1' })
  afterEach(() => { delete process.env.STRIPE_WEBHOOK_SECRET })

  it('charge.refunded goes to Sentry and to BILLING_ALERT_EMAIL, with no personal data, and leaves the plan alone', async () => {
    process.env.BILLING_ALERT_EMAIL = 'owner@stratmap.test'
    await testDb.update(schema.workspaces).set({ planTier: 'starter', stripeCustomerId: 'cus_1' }).where(eq(schema.workspaces.id, TEST_WS_ID))
    const res = await send('charge.refunded', { id: 'ch_1', customer: 'cus_1', amount: 1800, amount_refunded: 1800, currency: 'gbp' })
    expect(res._status).toBe(200)
    expect(reported.join('\n')).toContain('refunded')
    expect(billingMail).toHaveBeenCalledTimes(1)
    const mail = billingMail.mock.calls[0][0]
    expect(mail.to).toBe('owner@stratmap.test')
    expect(mail.lines.join(' ')).toContain(`Workspace ${TEST_WS_ID}`)
    expect(mail.lines.join(' ')).toContain('18.00 GBP')
    expect(mail.lines.join(' ')).not.toContain('test@example.com')
    expect((await ws()).planTier).toBe('starter')
  })

  it('charge.dispute.created finds the workspace through the charge, and still reports when no address is set', async () => {
    await testDb.update(schema.workspaces).set({ stripeCustomerId: 'cus_1' }).where(eq(schema.workspaces.id, TEST_WS_ID))
    charges.set('ch_9', { id: 'ch_9', customer: 'cus_1' })
    const res = await send('charge.dispute.created', { id: 'dp_1', charge: 'ch_9', amount: 4900, currency: 'gbp', reason: 'fraudulent' })
    expect(res._status).toBe(200)
    expect(reported.join('\n')).toContain('disputed')
    expect(reported.join('\n')).toContain(TEST_WS_ID)
    expect(billingMail).not.toHaveBeenCalled()
  })
})

describe('R-27: pruning rate_limits', () => {
  it('deletes rows whose window ended over an hour ago and keeps current ones, for 60 s and 3600 s windows', async () => {
    const now = Date.now()
    const nowSec = Math.floor(now / 1000)
    await testDb.insert(schema.rateLimits).values([
      { key: 'old-60', windowId: Math.floor((nowSec - 7200) / 60), count: 3, windowSeconds: 60 },
      { key: 'old-3600', windowId: Math.floor((nowSec - 3 * 3600) / 3600), count: 3, windowSeconds: 3600 },
      { key: 'old-legacy-60', windowId: Math.floor((nowSec - 7200) / 60), count: 3 },
      { key: 'old-legacy-3600', windowId: Math.floor((nowSec - 3 * 3600) / 3600), count: 3 },
    ])
    await hitRateLimit('fresh-60', 5, 60)
    await hitRateLimit('fresh-3600', 5, 3600)
    await testDb.insert(schema.rateLimits).values({ key: 'legacy-current-3600', windowId: Math.floor(nowSec / 3600), count: 1 })
    expect(await pruneRateLimits(now)).toBe(4)
    const left = (await testDb.select({ key: schema.rateLimits.key }).from(schema.rateLimits)).map(r => r.key).sort()
    expect(left).toEqual(['fresh-3600', 'fresh-60', 'legacy-current-3600'])
  })

  it('hitRateLimit records the window length', async () => {
    await hitRateLimit('k', 5, 3600)
    const [row] = await testDb.select().from(schema.rateLimits).where(eq(schema.rateLimits.key, 'k'))
    expect(row.windowSeconds).toBe(3600)
  })
})

describe('R-40: trial-ending emails', () => {
  const setTrial = (endsInDays: number, extra: Partial<typeof schema.workspaces.$inferInsert> = {}) =>
    testDb.update(schema.workspaces).set({ trialPlan: 'growth', trialEndsAt: new Date(Date.now() + endsInDays * DAY), ...extra }).where(eq(schema.workspaces.id, TEST_WS_ID))
  const addAdmin = () => testDb.insert(schema.workspaceMembers).values({ id: 'wm-admin', workspaceId: TEST_WS_ID, userId: 'u-admin', email: 'admin@example.com', permission: 'admin' })
  const addViewer = () => testDb.insert(schema.workspaceMembers).values({ id: 'wm-view', workspaceId: TEST_WS_ID, userId: 'u-view', email: 'viewer@example.com', permission: 'viewer' })

  it('warns owners and admins (not viewers) three days before the end, once', async () => {
    await addAdmin(); await addViewer(); await setTrial(2.5)
    expect(await sendTrialNotices()).toEqual({ warned: 1, ended: 0 })
    expect(trialMail.mock.calls.map(c => c[0].to).sort()).toEqual(['admin@example.com', 'test@example.com'])
    expect(trialMail.mock.calls.every(c => c[0].ended === false)).toBe(true)
    expect(await sendTrialNotices()).toEqual({ warned: 0, ended: 0 })
    expect(trialMail).toHaveBeenCalledTimes(2)
  })

  it('says nothing while the trial still has more than three days', async () => {
    await setTrial(10)
    expect(await sendTrialNotices()).toEqual({ warned: 0, ended: 0 })
  })

  it('sends one "ended" email after the end, and no warning afterwards', async () => {
    await setTrial(-0.2)
    expect(await sendTrialNotices()).toEqual({ warned: 0, ended: 1 })
    expect(trialMail.mock.calls[0][0].ended).toBe(true)
    expect(await sendTrialNotices()).toEqual({ warned: 0, ended: 0 })
  })

  it('sends both in order over a trial: warning first, then the ended notice', async () => {
    await setTrial(2)
    await sendTrialNotices()
    await setTrial(-0.1)
    expect(await sendTrialNotices()).toEqual({ warned: 0, ended: 1 })
    expect(trialMail.mock.calls.map(c => c[0].ended)).toEqual([false, true])
  })

  it('skips workspaces that pay, deleted ones, and trials that ended long ago', async () => {
    await setTrial(1, { planTier: 'starter' })
    expect(await sendTrialNotices()).toEqual({ warned: 0, ended: 0 })
    await setTrial(1, { planTier: 'free', deletedAt: new Date() })
    expect(await sendTrialNotices()).toEqual({ warned: 0, ended: 0 })
    await setTrial(-30, { deletedAt: null })
    expect(await sendTrialNotices()).toEqual({ warned: 0, ended: 0 })
    expect(trialMail).not.toHaveBeenCalled()
  })

  it('a failed email is reported, does not stop the others, and the notice is not repeated', async () => {
    await addAdmin(); await setTrial(2)
    trialMail.mockRejectedValueOnce(new Error('resend down'))
    expect(await sendTrialNotices()).toEqual({ warned: 1, ended: 0 })
    expect(trialMail).toHaveBeenCalledTimes(2)
    expect(reported).toContain('resend down')
  })

  it('a newly granted trial can be warned again (grant-trial clears the stamps)', async () => {
    await setTrial(2)
    await sendTrialNotices()
    await setTrial(2, { trialWarnedAt: null, trialEndedNoticeAt: null })
    expect(await sendTrialNotices()).toEqual({ warned: 1, ended: 0 })
  })
})

describe('the trial email text', () => {
  it('escapes the workspace name and states the real Free limits', async () => {
    const real = await vi.importActual<typeof import('../_lib/email')>('../_lib/email')
    const { PLAN_LIMITS } = await import('../../src/lib/plans')
    const dir = (await import('node:fs')).mkdtempSync((await import('node:os')).tmpdir() + '/mail-')
    const outbox = `${dir}/out.jsonl`
    process.env.E2E_EMAIL_OUTBOX = outbox
    delete process.env.RESEND_API_KEY
    await real.sendTrialEnding({
      to: 'a@b.test', workspaceName: '<img src=x onerror=1> Co', planName: 'Growth', endsOn: new Date('2026-12-01T00:00:00Z'), ended: false,
      limits: { charts: PLAN_LIMITS.free.maxCharts, rolesPerChart: PLAN_LIMITS.free.maxNodesPerChart, members: PLAN_LIMITS.free.seats },
      pricingUrl: 'https://app.test/pricing',
    })
    delete process.env.E2E_EMAIL_OUTBOX
    const mail = JSON.parse((await import('node:fs')).readFileSync(outbox, 'utf8').trim()) as { subject: string; html: string }
    expect(mail.html).not.toContain('<img')
    expect(mail.html).toContain('&lt;img')
    expect(mail.html).toContain('2026-12-01')
    expect(mail.html).toContain(`${PLAN_LIMITS.free.maxNodesPerChart} roles per chart`)
    expect(mail.html).toContain('https://app.test/pricing')
    expect(mail.subject).toContain('ends on 2026-12-01')
  })
})
