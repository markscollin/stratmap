// Roadmap 2.3: product analytics. Server-side, consent-gated, opaque ids only, once per milestone.
import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))
vi.mock('../_lib/email', () => ({
  sendWorkspaceInvite: vi.fn().mockResolvedValue({ sent: false, skipped: true }),
  sendPaymentFailed: vi.fn().mockResolvedValue({ sent: false }),
}))
const sessionCreate = vi.fn()
const retrieve = vi.fn()
vi.mock('stripe', () => ({
  default: class {
    checkout = { sessions: { create: sessionCreate } }
    billingPortal = { sessions: { create: vi.fn() } }
    webhooks = { constructEvent: vi.fn() }
    subscriptions = { retrieve }
  },
}))

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth, requireUser } from '../_lib/auth'
import { track, eventUuid, hasAnalyticsConsent } from '../_lib/analytics'
import chartsHandler from '../charts/index'
import nodesHandler from '../charts/[id]/nodes'
import importHandler from '../charts/[id]/import'
import shareHandler from '../charts/[id]/share'
import invitesHandler from '../workspace/invites'
import workspaceHandler from '../workspace'
import signedUpHandler from '../analytics/signed-up'
import checkoutHandler from '../checkout'
import webhookHandler from '../webhooks/stripe'
import {
  setupSchema, cleanDb, seedWorkspace, seedChart, testDb, TEST_USER_ID, TEST_WS_ID, TEST_CHART_ID,
} from './helpers/db'
import { createReq } from './helpers/req'
import { createRes, type MockRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'
import { eq } from 'drizzle-orm'

type Handler = (req: VercelRequest, res: VercelResponse) => unknown
const YES = { 'x-analytics-consent': '1' }

async function call(handler: Handler, opts: Parameters<typeof createReq>[0]): Promise<MockRes> {
  const res = createRes()
  await handler(createReq(opts) as never, res as never)
  return res
}

const fetchMock = vi.fn(async (..._args: unknown[]) => new Response('{}', { status: 200 }))
interface Captured { api_key: string; event: string; distinct_id: string; uuid: string; properties: Record<string, unknown> }
function sent(): Captured[] {
  return fetchMock.mock.calls.map(c => JSON.parse((c[1] as RequestInit).body as string) as Captured)
}
const events = () => sent().map(s => s.event)

beforeAll(async () => { await setupSchema() })

beforeEach(async () => {
  await cleanDb()
  await seedWorkspace()
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  process.env.POSTHOG_KEY = 'phc_test'
  delete process.env.POSTHOG_HOST
  vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
  vi.mocked(requireUser).mockResolvedValue({ userId: TEST_USER_ID })
})
afterEach(() => { vi.unstubAllGlobals(); delete process.env.POSTHOG_KEY; delete process.env.POSTHOG_HOST })

describe('track()', () => {
  it('sends nothing without consent, and nothing without a key', async () => {
    await track('signed_up', { userId: 'u1', consent: false })
    delete process.env.POSTHOG_KEY
    await track('signed_up', { userId: 'u1', consent: true })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('goes to the EU cloud by default, and to POSTHOG_HOST when set', async () => {
    await track('signed_up', { userId: 'u1', consent: true })
    expect(fetchMock.mock.calls[0][0]).toBe('https://eu.i.posthog.com/capture/')
    process.env.POSTHOG_HOST = 'https://us.i.posthog.com/'
    await track('signed_up', { userId: 'u1', consent: true })
    expect(fetchMock.mock.calls[1][0]).toBe('https://us.i.posthog.com/capture/')
  })

  it('sends opaque ids and a workspace group, nothing else identifying', async () => {
    await track('workspace_created', { userId: 'u1', workspaceId: 'w1', consent: true, props: { plan: 'free' } })
    const [e] = sent()
    expect(e).toMatchObject({ api_key: 'phc_test', event: 'workspace_created', distinct_id: 'u1' })
    expect(e.properties).toMatchObject({ plan: 'free', $groups: { workspace: 'w1' } })
    expect(JSON.stringify(e)).not.toMatch(/@|email|name/i)
  })

  it('a milestone has a stable event id so repeats are deduplicated', () => {
    expect(eventUuid('first_chart_created', 'w1')).toBe(eventUuid('first_chart_created', 'w1'))
    expect(eventUuid('first_chart_created', 'w1')).not.toBe(eventUuid('first_chart_created', 'w2'))
    expect(eventUuid('first_chart_created', 'w1')).not.toBe(eventUuid('share_enabled', 'w1'))
    expect(eventUuid('invite_sent', 'w1')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('never throws or hangs the request when PostHog is down', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'))
    await expect(track('signed_up', { userId: 'u1', consent: true })).resolves.toBeUndefined()
  })

  it('reads consent only from the exact header value 1', () => {
    expect(hasAnalyticsConsent({ headers: { 'x-analytics-consent': '1' } })).toBe(true)
    expect(hasAnalyticsConsent({ headers: { 'x-analytics-consent': 'true' } })).toBe(false)
    expect(hasAnalyticsConsent({ headers: {} })).toBe(false)
  })
})

describe('funnel events from the API', () => {
  it('signed_up: sent once per user, only with consent', async () => {
    expect((await call(signedUpHandler, { method: 'POST' }))._status).toBe(204)
    expect(fetchMock).not.toHaveBeenCalled()
    await call(signedUpHandler, { method: 'POST', headers: YES })
    expect(events()).toEqual(['signed_up'])
    expect((await call(signedUpHandler, { method: 'GET', headers: YES }))._status).toBe(405)
  })

  it('workspace_created: only when a workspace is actually created', async () => {
    await testDb.delete(schema.workspaceMembers)
    await testDb.delete(schema.workspaces)
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u-new' })
    const body = { name: 'Acme', ownerRole: 'Founder/CEO', size: '11-50' }
    expect((await call(workspaceHandler, { method: 'POST', headers: YES, body }))._status).toBe(201)
    expect(events()).toEqual(['workspace_created'])
    expect(sent()[0].distinct_id).toBe('u-new')
    // A repeat returns the existing workspace and sends nothing more.
    fetchMock.mockClear()
    expect((await call(workspaceHandler, { method: 'POST', headers: YES, body }))._status).toBe(200)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('first_chart_created: the first chart only, and not without consent', async () => {
    const body = { name: 'One', template: 'blank' }
    await call(chartsHandler, { method: 'POST', body })           // no consent
    expect(fetchMock).not.toHaveBeenCalled()
    await call(chartsHandler, { method: 'POST', body: { ...body, name: 'Two' }, headers: YES }) // second chart
    expect(fetchMock).not.toHaveBeenCalled()
    await testDb.delete(schema.charts)
    await call(chartsHandler, { method: 'POST', body: { ...body, name: 'Three' }, headers: YES })
    expect(events()).toEqual(['first_chart_created'])
    expect(JSON.stringify(sent())).not.toContain('Three') // no chart names
  })

  it('ten_roles_reached: when adding the 10th role, once; not for the 9th or 11th', async () => {
    await seedChart()
    const add = (i: number) => call(nodesHandler, {
      method: 'POST', query: { id: TEST_CHART_ID }, headers: YES,
      body: { id: `n${i}`, name: 'N', title: 'T', x: 0, y: 0 },
    })
    for (let i = 1; i <= 9; i++) await add(i)
    expect(fetchMock).not.toHaveBeenCalled()
    await add(10)
    expect(events()).toEqual(['ten_roles_reached'])
    await add(11)
    expect(events()).toEqual(['ten_roles_reached'])
  })

  it('ten_roles_reached: also when an import crosses 10', async () => {
    await seedChart()
    const nodes = Array.from({ length: 12 }, (_, i) => ({ id: `i${i}`, name: `P${i}`, title: 'T', x: 0, y: 0 }))
    const res = await call(importHandler, { method: 'POST', query: { id: TEST_CHART_ID }, headers: YES, body: { nodes, edges: [], departments: [] } })
    expect(res._status).toBe(201)
    expect(events()).toEqual(['ten_roles_reached'])
    expect(sent()[0].properties.via).toBe('import')
  })

  it('invite_sent: counts invites, never sends the email addresses', async () => {
    const res = await call(invitesHandler, {
      method: 'POST', headers: YES,
      body: { invites: [{ email: 'a@example.com', permission: 'editor' }, { email: 'b@example.com', permission: 'viewer' }] },
    })
    expect(res._status).toBe(201)
    expect(events()).toEqual(['invite_sent'])
    expect(sent()[0].properties.count).toBe(2)
    expect(JSON.stringify(sent())).not.toContain('example.com')
  })

  it('share_enabled: when a link is created, not when an existing one is returned', async () => {
    await seedChart()
    const q = { id: TEST_CHART_ID }
    await call(shareHandler, { method: 'POST', query: q, headers: YES })
    expect(events()).toEqual(['share_enabled'])
    await call(shareHandler, { method: 'POST', query: q, headers: YES })
    expect(events()).toEqual(['share_enabled'])
  })
})

describe('upgraded (checkout → Stripe webhook)', () => {
  beforeEach(() => {
    sessionCreate.mockReset().mockResolvedValue({ url: 'https://checkout.stripe.test/x' })
    retrieve.mockReset().mockResolvedValue({
      id: 'sub_1', status: 'active', customer: 'cus_1', cancel_at_period_end: false, cancel_at: null,
      items: { data: [{ price: { id: 'price_starter' }, current_period_end: 1_900_000_000 }] },
    })
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
    process.env.STRIPE_STARTER_MONTHLY_PRICE_ID = 'price_starter'
    delete process.env.VERCEL_ENV
  })
  afterEach(() => {
    for (const k of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_STARTER_MONTHLY_PRICE_ID']) delete process.env[k]
  })

  async function checkout(headers: Record<string, string>) {
    vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID, permission: 'owner' })
    await call(checkoutHandler, { method: 'POST', headers, body: { tier: 'starter', billingCycle: 'monthly' } })
    return sessionCreate.mock.calls[0][0].metadata as Record<string, string>
  }

  async function completed(metadata: Record<string, string>) {
    const evt = { id: `evt_${Math.random()}`, type: 'checkout.session.completed', data: { object: { id: 'cs_1', mode: 'subscription', customer: 'cus_1', subscription: 'sub_1', metadata } } }
    const req = createReq({ method: 'POST', body: evt, headers: {} }) as unknown as Record<PropertyKey, unknown>
    req[Symbol.asyncIterator] = async function* () { /* empty raw body → dev pre-parsed path */ }
    await webhookHandler(req as never, createRes() as never)
  }

  it('checkout records the buyer for analytics only with consent', async () => {
    expect(await checkout({})).toEqual({ workspaceId: TEST_WS_ID })
    sessionCreate.mockClear()
    expect(await checkout(YES)).toEqual({ workspaceId: TEST_WS_ID, analyticsUser: TEST_USER_ID })
  })

  it('the webhook sends upgraded with the new tier when the buyer consented', async () => {
    await completed({ workspaceId: TEST_WS_ID, analyticsUser: TEST_USER_ID })
    expect(events()).toEqual(['upgraded'])
    expect(sent()[0]).toMatchObject({ distinct_id: TEST_USER_ID })
    expect(sent()[0].properties).toMatchObject({ plan: 'starter', $groups: { workspace: TEST_WS_ID } })
    const [ws] = await testDb.select().from(schema.workspaces).where(eq(schema.workspaces.id, TEST_WS_ID))
    expect(ws.planTier).toBe('starter')
  })

  it('the webhook sends nothing when the buyer did not consent', async () => {
    await completed({ workspaceId: TEST_WS_ID })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
