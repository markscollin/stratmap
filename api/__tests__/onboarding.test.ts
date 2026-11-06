// Roadmap 2.7: sample charts and the getting-started checklist.
import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import chartsHandler from '../charts/index'
import nodesHandler from '../charts/[id]/nodes'
import onboardingHandler from '../workspace/onboarding'
import shareHandler from '../charts/[id]/share'
import { getChartUsage, requireChartsEditable } from '../_lib/access'
import {
  setupSchema, cleanDb, seedWorkspace, seedChart, seedMember, testDb,
  TEST_USER_ID, TEST_WS_ID, TEST_CHART_ID,
} from './helpers/db'
import { createReq } from './helpers/req'
import { createRes, type MockRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'

type Handler = (req: VercelRequest, res: VercelResponse) => unknown
async function call(handler: Handler, opts: Parameters<typeof createReq>[0]): Promise<MockRes> {
  const res = createRes()
  await handler(createReq(opts) as never, res as never)
  return res
}

const node = (i: number) => ({ id: `s${i}`, name: `Role ${i}`, title: 'T', x: i * 10, y: 0 })
const sampleBody = (n = 5, name = 'Sample org chart') => ({
  name, isSample: true, templateNodes: Array.from({ length: n }, (_, i) => node(i)), templateEdges: [], templateDepts: [],
})
const realBody = (name = 'Our org', n = 0) => ({
  name, templateNodes: Array.from({ length: n }, (_, i) => node(i)), templateEdges: [], templateDepts: [],
})

const fetchMock = vi.fn(async (..._a: unknown[]) => new Response('{}', { status: 200 }))
const events = () => fetchMock.mock.calls.map(c => (JSON.parse((c[1] as RequestInit).body as string) as { event: string }).event)

beforeAll(async () => { await setupSchema() })
beforeEach(async () => {
  await cleanDb()
  await seedWorkspace() // free plan, u-test is owner
  vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  process.env.POSTHOG_KEY = 'phc_test'
})
afterEach(() => { vi.unstubAllGlobals(); delete process.env.POSTHOG_KEY })

const YES = { 'x-analytics-consent': '1' }

describe('sample charts', () => {
  it('are stored flagged and returned in the list', async () => {
    const res = await call(chartsHandler, { method: 'POST', body: sampleBody() })
    expect(res._status).toBe(201)
    expect((res._body as { isSample: boolean }).isSample).toBe(true)
    const list = (await call(chartsHandler, { method: 'GET' }))._body as { isSample: boolean }[]
    expect(list.map(c => c.isSample)).toEqual([true])
  })

  it('do not count toward the plan: a Free workspace can have its one real chart AND a sample, in either order', async () => {
    expect((await call(chartsHandler, { method: 'POST', body: sampleBody() }))._status).toBe(201)
    expect((await call(chartsHandler, { method: 'POST', body: realBody('Mine') }))._status).toBe(201)
    // The Free limit (1 real chart) still applies to real charts.
    const third = await call(chartsHandler, { method: 'POST', body: realBody('Second') })
    expect(third._status).toBe(402)
    expect((third._body as { error: string; limit: string })).toMatchObject({ error: 'plan-limit', limit: 'charts' })
  })

  it('are never what puts a workspace over its limit (chart usage ignores them)', async () => {
    await call(chartsHandler, { method: 'POST', body: sampleBody() })
    await call(chartsHandler, { method: 'POST', body: realBody('Mine') })
    expect(await getChartUsage(TEST_WS_ID)).toMatchObject({ count: 1, max: 1, frozen: false })
    const res = createRes()
    expect(await requireChartsEditable(TEST_WS_ID, res as never)).toBe(true)
  })

  it('at most one per workspace', async () => {
    await call(chartsHandler, { method: 'POST', body: sampleBody() })
    const again = await call(chartsHandler, { method: 'POST', body: sampleBody(5, 'Another') })
    expect(again._status).toBe(409)
    expect((again._body as { error: string }).error).toBe('sample-exists')
  })

  it('a deleted sample can be added again', async () => {
    await call(chartsHandler, { method: 'POST', body: sampleBody() })
    await testDb.delete(schema.charts).where(eq(schema.charts.isSample, true))
    expect((await call(chartsHandler, { method: 'POST', body: sampleBody() }))._status).toBe(201)
  })

  it('must stay small, so they cannot be used to dodge the chart limit', async () => {
    const res = await call(chartsHandler, { method: 'POST', body: sampleBody(21) })
    expect(res._status).toBe(400)
    expect((res._body as { error: string }).error).toBe('sample-too-large')
    expect((await call(chartsHandler, { method: 'POST', body: sampleBody(20) }))._status).toBe(201)
  })

  it('need editor rights to create', async () => {
    await testDb.update(schema.workspaces).set({ planTier: 'free' }).where(eq(schema.workspaces.id, TEST_WS_ID))
    await seedMember('u-viewer', 'viewer')
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'u-viewer', workspaceId: TEST_WS_ID })
    expect((await call(chartsHandler, { method: 'POST', body: sampleBody() }))._status).toBe(403)
  })

  it('a chart is not a sample unless asked', async () => {
    const res = await call(chartsHandler, { method: 'POST', body: realBody() })
    expect((res._body as { isSample: boolean }).isSample).toBe(false)
  })

  it('do not fire the funnel: creating a sample is not the first chart, and the real one still is', async () => {
    await call(chartsHandler, { method: 'POST', body: sampleBody(), headers: YES })
    expect(events()).toEqual([])
    await call(chartsHandler, { method: 'POST', body: realBody(), headers: YES })
    expect(events()).toEqual(['first_chart_created'])
  })

  it('adding the 10th role to a sample does not count as ten_roles_reached', async () => {
    const created = await call(chartsHandler, { method: 'POST', body: sampleBody(9) })
    const id = (created._body as { id: string }).id
    await call(nodesHandler, { method: 'POST', query: { id }, headers: YES, body: { id: 'extra', name: 'N', title: 'T', x: 0, y: 0 } })
    expect(events()).toEqual([])
  })
})

describe('GET /api/workspace/onboarding (checklist)', () => {
  const get = () => call(onboardingHandler, { method: 'GET' })
  const steps = async () => ((await get())._body as { steps: Record<string, boolean> }).steps

  it('starts with nothing done', async () => {
    expect((await get())._body).toEqual({ steps: { chart: false, invite: false, share: false }, complete: false, dismissed: false })
  })

  it('"chart" needs a chart of your own with 3+ roles; the sample never counts', async () => {
    await call(chartsHandler, { method: 'POST', body: sampleBody(5) })
    expect((await steps()).chart).toBe(false)
    await call(chartsHandler, { method: 'POST', body: realBody('Mine', 2) })
    expect((await steps()).chart).toBe(false)
    await testDb.delete(schema.charts).where(eq(schema.charts.isSample, false))
    await call(chartsHandler, { method: 'POST', body: realBody('Mine', 3) })
    expect((await steps()).chart).toBe(true)
  })

  it('"invite" is true once someone else is a member, or an invite is pending', async () => {
    expect((await steps()).invite).toBe(false)
    await testDb.insert(schema.pendingInvites).values({ id: 'inv1', workspaceId: TEST_WS_ID, email: 'a@example.com', permission: 'editor' })
    expect((await steps()).invite).toBe(true)
    await testDb.delete(schema.pendingInvites)
    expect((await steps()).invite).toBe(false)
    await seedMember('u-other', 'editor')
    expect((await steps()).invite).toBe(true)
  })

  it('"share" is true once any chart has a share link', async () => {
    await seedChart()
    expect((await steps()).share).toBe(false)
    await call(shareHandler, { method: 'POST', query: { id: TEST_CHART_ID } })
    expect((await steps()).share).toBe(true)
  })

  it('is complete only when all three are done', async () => {
    await call(chartsHandler, { method: 'POST', body: realBody('Mine', 3) })
    const [chart] = await testDb.select().from(schema.charts).where(eq(schema.charts.isSample, false))
    await seedMember('u-other', 'editor')
    expect(((await get())._body as { complete: boolean }).complete).toBe(false)
    await call(shareHandler, { method: 'POST', query: { id: chart.id } })
    expect((await get())._body).toMatchObject({ complete: true, steps: { chart: true, invite: true, share: true } })
  })

  it('does not leak other workspaces', async () => {
    await testDb.insert(schema.workspaces).values({ id: 'ws-other', name: 'Other', ownerId: 'u-x', ownerRole: 'Founder/CEO', size: '11-50' })
    await testDb.insert(schema.charts).values({ id: 'c-other', workspaceId: 'ws-other', name: 'Theirs', ownerId: 'u-x', creatorId: 'u-x' })
    await testDb.insert(schema.sharedLinks).values({ id: 'othercode0000001', chartId: 'c-other', createdBy: 'u-x' })
    expect((await steps()).share).toBe(false)
  })

  it('every member can read it, including viewers', async () => {
    await seedMember('u-viewer', 'viewer')
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'u-viewer', workspaceId: TEST_WS_ID })
    expect((await get())._status).toBe(200)
  })
})

describe('PUT /api/workspace/onboarding (dismiss)', () => {
  it('an admin dismisses it for the whole workspace, and can bring it back', async () => {
    expect((await call(onboardingHandler, { method: 'PUT', body: { dismissed: true } }))._status).toBe(200)
    expect(((await call(onboardingHandler, { method: 'GET' }))._body as { dismissed: boolean }).dismissed).toBe(true)
    await call(onboardingHandler, { method: 'PUT', body: { dismissed: false } })
    expect(((await call(onboardingHandler, { method: 'GET' }))._body as { dismissed: boolean }).dismissed).toBe(false)
  })

  it('editors and viewers cannot dismiss it', async () => {
    for (const role of ['editor', 'viewer'] as const) {
      await seedMember(`u-${role}`, role)
      vi.mocked(requireAuth).mockResolvedValue({ userId: `u-${role}`, workspaceId: TEST_WS_ID })
      expect((await call(onboardingHandler, { method: 'PUT', body: { dismissed: true } }))._status).toBe(403)
    }
  })

  it('rejects a bad body and other methods', async () => {
    expect((await call(onboardingHandler, { method: 'PUT', body: { dismissed: 'yes' } }))._status).toBe(400)
    expect((await call(onboardingHandler, { method: 'DELETE' }))._status).toBe(405)
  })
})
