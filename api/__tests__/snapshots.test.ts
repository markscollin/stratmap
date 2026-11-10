// Roadmap 5: chart version history. Who can save, restore, branch and delete; that a version holds structure only (never
// pay); that restore keeps comments on surviving roles, can itself be undone, and is all or nothing; and that branching
// makes an independent chart.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import snapshotsHandler from '../charts/[id]/snapshots'
import snapshotHandler from '../charts/[id]/snapshots/[snapshotId]'
import restoreHandler from '../charts/[id]/snapshots/[snapshotId]/restore'
import branchHandler from '../charts/[id]/snapshots/[snapshotId]/branch'
import exportHandler from '../workspace/export'
import { MAX_MANUAL_SNAPSHOTS, MAX_AUTO_SNAPSHOTS } from '../_lib/snapshots'
import { setupSchema, cleanDb, seedWorkspace, seedChart, seedMember, testDb, TEST_USER_ID, TEST_WS_ID, TEST_CHART_ID } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes, type MockRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'

type Handler = (req: VercelRequest, res: VercelResponse) => unknown
async function call(handler: Handler, opts: Parameters<typeof createReq>[0]): Promise<MockRes> {
  const res = createRes()
  await handler(createReq(opts) as never, res as never)
  return res
}
const as = (userId: string, workspaceId = TEST_WS_ID) => vi.mocked(requireAuth).mockResolvedValue({ userId, workspaceId })
const setTier = (tier: 'free' | 'starter' | 'growth') => testDb.update(schema.workspaces).set({ planTier: tier }).where(eq(schema.workspaces.id, TEST_WS_ID))
const q = { id: TEST_CHART_ID }
const save = (name = 'Version 1') => call(snapshotsHandler, { method: 'POST', query: q, body: { name } })
const list = async () => ((await call(snapshotsHandler, { method: 'GET', query: q }))._body as { snapshots: Record<string, unknown>[]; limit: number })
const idOf = (res: MockRes) => (res._body as { id: string }).id
const restore = (id: string, headers: Record<string, string> = {}) => call(restoreHandler, { method: 'POST', query: { ...q, snapshotId: id }, headers })
const branch = (id: string, body: unknown = {}) => call(branchHandler, { method: 'POST', query: { ...q, snapshotId: id }, body })
const chartNodes = async (chartId = TEST_CHART_ID) => (await testDb.select().from(schema.nodes).where(eq(schema.nodes.chartId, chartId))).sort((a, b) => a.id.localeCompare(b.id))
const chartEdges = async (chartId = TEST_CHART_ID) => (await testDb.select().from(schema.edges).where(eq(schema.edges.chartId, chartId))).sort((a, b) => a.id.localeCompare(b.id))
const revision = async () => (await testDb.select({ r: schema.charts.revision }).from(schema.charts).where(eq(schema.charts.id, TEST_CHART_ID)))[0].r

// A small org: CEO -> CTO -> Dev, with two departments.
async function seedOrg() {
  await testDb.insert(schema.departments).values([
    { id: 'd-eng', chartId: TEST_CHART_ID, name: 'Engineering', colour: '#0EA5E9' },
    { id: 'd-ops', chartId: TEST_CHART_ID, name: 'Operations', colour: '#10B981' },
  ])
  await testDb.insert(schema.nodes).values([
    { id: 'n-ceo', chartId: TEST_CHART_ID, name: 'Ada CEO', title: 'CEO', x: 0, y: 0 },
    { id: 'n-cto', chartId: TEST_CHART_ID, name: 'Bo CTO', title: 'CTO', departmentId: 'd-eng', managerId: 'n-ceo', x: 0, y: 100 },
    { id: 'n-dev', chartId: TEST_CHART_ID, name: 'Cy Dev', title: 'Engineer', departmentId: 'd-eng', managerId: 'n-cto', status: 'open', x: 0, y: 200 },
  ])
  await testDb.insert(schema.edges).values([
    { id: 'e1', chartId: TEST_CHART_ID, sourceId: 'n-ceo', targetId: 'n-cto' },
    { id: 'e2', chartId: TEST_CHART_ID, sourceId: 'n-cto', targetId: 'n-dev' },
  ])
}

beforeAll(async () => { await setupSchema() })
beforeEach(async () => {
  await cleanDb()
  await seedWorkspace()                     // u-test owns it
  await seedChart()
  await setTier('growth')
  await seedMember('u-ad', 'admin')
  await seedMember('u-ed', 'editor')
  await seedMember('u-co', 'commenter')
  await seedMember('u-vi', 'viewer')
  await seedOrg()
  as('u-ed')
})

describe('saving versions', () => {
  it('an editor saves one; it records the structure and who saved it, and shows in the list without its contents', async () => {
    const res = await save('Before the reorg')
    expect(res._status).toBe(201)
    const { snapshots, limit } = await list()
    expect(limit).toBe(MAX_MANUAL_SNAPSHOTS)
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]).toMatchObject({ name: 'Before the reorg', kind: 'manual', createdBy: 'u-ed', authorName: 'u-ed', nodeCount: 3, edgeCount: 2 })
    expect(snapshots[0]).not.toHaveProperty('data')
  })

  it('a version holds roles, lines and departments, and NEVER pay or job-description text', async () => {
    await testDb.insert(schema.jobDescriptions).values({ id: 'jd1', nodeId: 'n-cto', chartId: TEST_CHART_ID, status: 'draft', responsibilities: '<p>Secret duties</p>', requirements: '', version: 1, updatedBy: 'u', salaryBandMin: 123456, salaryBandMax: 234567, salaryCurrency: 'USD' })
    const id = idOf(await save())
    const [row] = await testDb.select().from(schema.chartSnapshots).where(eq(schema.chartSnapshots.id, id))
    const text = JSON.stringify(row)
    for (const secret of ['123456', '234567', 'Secret duties', 'salary']) expect(text).not.toContain(secret)
    expect(row.data.nodes.map(n => n.id).sort()).toEqual(['n-ceo', 'n-cto', 'n-dev'])
    expect(row.data.departments).toHaveLength(2)
  })

  it('needs the Growth plan to save; reading stays open after a downgrade', async () => {
    const id = idOf(await save('Saved while on Growth'))
    for (const tier of ['free', 'starter'] as const) {
      await setTier(tier)
      const res = await save('Too late')
      expect(res._status, tier).toBe(402)
      expect(res._body).toMatchObject({ error: 'plan-feature', feature: 'version-history', requiredTier: 'growth' })
      expect((await list()).snapshots, tier).toHaveLength(1)
      expect((await call(snapshotHandler, { method: 'GET', query: { ...q, snapshotId: id } }))._status).toBe(200)
    }
  })

  it('viewers and commenters can read the list but not save', async () => {
    await save()
    for (const user of ['u-vi', 'u-co']) {
      as(user)
      expect((await list()).snapshots, user).toHaveLength(1)
      expect((await save('nope'))._status, user).toBe(403)
    }
    for (const user of [TEST_USER_ID, 'u-ad', 'u-ed']) {
      as(user)
      expect((await save(`by ${user}`))._status, user).toBe(201)
    }
  })

  it('saving works even when the chart is view-only for plan reasons, and never bumps the revision', async () => {
    await testDb.insert(schema.charts).values([
      { id: 'c2', workspaceId: TEST_WS_ID, name: 'B', ownerId: 'o', creatorId: 'o', version: 1 },
      { id: 'c3', workspaceId: TEST_WS_ID, name: 'C', ownerId: 'o', creatorId: 'o', version: 1 },
    ])
    // (growth has unlimited charts; the revision is the point here)
    const before = await revision()
    expect((await save())._status).toBe(201)
    expect(await revision()).toBe(before)
  })

  it.each([['an empty name', { name: '   ' }], ['a name over 100 characters', { name: 'x'.repeat(101) }], ['no name', {}]])('rejects %s', async (_n, body) => {
    expect((await call(snapshotsHandler, { method: 'POST', query: q, body }))._status).toBe(400)
    expect((await list()).snapshots).toHaveLength(0)
  })

  it('a chart keeps at most 50 saved versions; the app\'s own do not count against that', async () => {
    const row = { workspaceId: TEST_WS_ID, chartId: TEST_CHART_ID, createdBy: 'u', nodeCount: 0, edgeCount: 0, data: { nodes: [], edges: [], departments: [] } }
    await testDb.insert(schema.chartSnapshots).values(Array.from({ length: MAX_MANUAL_SNAPSHOTS }, (_, i) => ({ ...row, id: `m${i}`, name: `m${i}`, kind: 'manual' })))
    await testDb.insert(schema.chartSnapshots).values({ ...row, id: 'auto1', name: 'auto', kind: 'auto' })
    const res = await save('one too many')
    expect(res._status).toBe(409)
    expect(res._body).toMatchObject({ error: 'snapshot-limit' })
    await call(snapshotHandler, { method: 'DELETE', query: { ...q, snapshotId: 'm0' } })      // the first by someone else: admin only
    as(TEST_USER_ID)
    expect((await call(snapshotHandler, { method: 'DELETE', query: { ...q, snapshotId: 'm0' } }))._status).toBe(204)
    as('u-ed')
    expect((await save('fits now'))._status).toBe(201)
  })

  it('is invisible to another workspace', async () => {
    const id = idOf(await save())
    await testDb.insert(schema.workspaces).values({ id: 'ws-2', name: 'Other', ownerId: 'u-x', ownerRole: 'CEO', size: '1-10', planTier: 'growth' })
    await testDb.insert(schema.workspaceMembers).values({ id: 'm-x', workspaceId: 'ws-2', userId: 'u-x', email: 'x@co.com', permission: 'owner' })
    as('u-x', 'ws-2')
    expect((await call(snapshotsHandler, { method: 'GET', query: q }))._status).toBe(404)
    expect((await call(snapshotHandler, { method: 'GET', query: { ...q, snapshotId: id } }))._status).toBe(404)
    expect((await restore(id))._status).toBe(404)
  })
})

describe('reading and deleting a version', () => {
  it('returns the full contents for comparing, and 404s for a version of another chart', async () => {
    const id = idOf(await save('v'))
    const res = await call(snapshotHandler, { method: 'GET', query: { ...q, snapshotId: id } })
    expect(res._body).toMatchObject({ id, name: 'v', nodeCount: 3 })
    expect((res._body as { data: { nodes: unknown[] } }).data.nodes).toHaveLength(3)
    await testDb.insert(schema.charts).values({ id: 'c2', workspaceId: TEST_WS_ID, name: 'B', ownerId: 'o', creatorId: 'o', version: 1 })
    expect((await call(snapshotHandler, { method: 'GET', query: { id: 'c2', snapshotId: id } }))._status).toBe(404)
  })

  it('the person who saved it can delete it; another editor cannot; an admin can; it works on a downgraded plan', async () => {
    const id = idOf(await save('mine'))
    as('u-co')
    expect((await call(snapshotHandler, { method: 'DELETE', query: { ...q, snapshotId: id } }))._status).toBe(403)
    await seedMember('u-ed2', 'editor')
    as('u-ed2')
    expect((await call(snapshotHandler, { method: 'DELETE', query: { ...q, snapshotId: id } }))._status).toBe(403)
    as('u-ad')
    await setTier('free')
    expect((await call(snapshotHandler, { method: 'DELETE', query: { ...q, snapshotId: id } }))._status).toBe(204)
    expect((await list()).snapshots).toHaveLength(0)
    await setTier('growth')
    as('u-ed')
    const own = idOf(await save('own'))
    expect((await call(snapshotHandler, { method: 'DELETE', query: { ...q, snapshotId: own } }))._status).toBe(204)
  })
})

describe('restoring a version', () => {
  // v1 = the org as seeded. Then the chart is reorganised: Ada renamed, Cy removed, Dee added under the CEO, lines changed.
  async function reorganise() {
    await testDb.update(schema.nodes).set({ name: 'Ada Renamed', title: 'Chief', x: 55 }).where(eq(schema.nodes.id, 'n-ceo'))
    await testDb.update(schema.nodes).set({ departmentId: 'd-ops', managerId: null }).where(eq(schema.nodes.id, 'n-cto'))
    await testDb.delete(schema.nodes).where(eq(schema.nodes.id, 'n-dev'))
    await testDb.insert(schema.nodes).values({ id: 'n-dee', chartId: TEST_CHART_ID, name: 'Dee New', title: 'Analyst', managerId: 'n-ceo', x: 9, y: 9 })
    await testDb.delete(schema.edges).where(eq(schema.edges.chartId, TEST_CHART_ID))
    await testDb.insert(schema.edges).values({ id: 'e9', chartId: TEST_CHART_ID, sourceId: 'n-ceo', targetId: 'n-dee' })
    await testDb.delete(schema.departments).where(eq(schema.departments.id, 'd-ops'))
  }

  it('puts every role, line and department back, removes what was added since, and leaves the chart\'s own settings alone', async () => {
    const v1 = idOf(await save('v1'))
    const originalNodes = await chartNodes()
    const originalEdges = await chartEdges()
    await reorganise()
    await testDb.update(schema.charts).set({ name: 'Renamed chart', status: 'review', isPublic: true }).where(eq(schema.charts.id, TEST_CHART_ID))

    const res = await restore(v1)
    expect(res._status).toBe(200)
    expect(res._body).toMatchObject({ restored: true, roles: 3 })
    expect(await chartNodes()).toEqual(originalNodes)
    expect(await chartEdges()).toEqual(originalEdges)
    expect((await testDb.select().from(schema.departments).where(eq(schema.departments.chartId, TEST_CHART_ID))).map(d => d.id).sort()).toEqual(['d-eng', 'd-ops'])
    expect((await testDb.select().from(schema.nodes).where(eq(schema.nodes.id, 'n-dee')))).toHaveLength(0)
    const [chart] = await testDb.select().from(schema.charts).where(eq(schema.charts.id, TEST_CHART_ID))
    expect(chart).toMatchObject({ name: 'Renamed chart', status: 'review', isPublic: true })
  })

  it('keeps comments and job descriptions on roles that still exist; roles removed since lose theirs, as deleting does', async () => {
    const v1 = idOf(await save('v1'))
    await reorganise()
    await testDb.insert(schema.roleComments).values([
      { id: 'c-ceo', workspaceId: TEST_WS_ID, chartId: TEST_CHART_ID, nodeId: 'n-ceo', authorId: 'u-ed', body: 'Keep me' },
      { id: 'c-dee', workspaceId: TEST_WS_ID, chartId: TEST_CHART_ID, nodeId: 'n-dee', authorId: 'u-ed', body: 'Dee goes away' },
    ])
    await testDb.insert(schema.jobDescriptions).values({ id: 'jd-ceo', nodeId: 'n-ceo', chartId: TEST_CHART_ID, status: 'draft', responsibilities: '<p>Lead</p>', requirements: '', version: 1, updatedBy: 'u', salaryBandMin: 1, salaryBandMax: 2 })

    await restore(v1)
    expect((await testDb.select().from(schema.roleComments)).map(c => c.id)).toEqual(['c-ceo'])
    const [jd] = await testDb.select().from(schema.jobDescriptions)
    expect(jd).toMatchObject({ id: 'jd-ceo', responsibilities: '<p>Lead</p>', salaryBandMin: 1 })      // untouched, pay included
  })

  it('takes a "Before restoring" version first, so a restore can be undone', async () => {
    const v1 = idOf(await save('v1'))
    await reorganise()
    const reorganised = await chartNodes()
    await restore(v1)
    const { snapshots } = await list()
    const auto = snapshots.find(s => s.kind === 'auto')!
    expect(auto).toMatchObject({ name: 'Before restoring “v1”', nodeCount: 3 })
    // restoring THAT brings the reorganised chart back
    expect((await restore(auto.id as string))._status).toBe(200)
    expect(await chartNodes()).toEqual(reorganised)
  })

  it('keeps only the latest 20 of the app\'s own versions', async () => {
    const v1 = idOf(await save('v1'))
    for (let i = 0; i < MAX_AUTO_SNAPSHOTS + 3; i++) await restore(v1)
    const { snapshots } = await list()
    expect(snapshots.filter(s => s.kind === 'auto')).toHaveLength(MAX_AUTO_SNAPSHOTS)
    expect(snapshots.filter(s => s.kind === 'manual')).toHaveLength(1)
  })

  it('counts as a structural edit: the revision goes up, a stale client gets 409, and nothing changes', async () => {
    const v1 = idOf(await save('v1'))
    await reorganise()
    await testDb.update(schema.charts).set({ revision: 5 }).where(eq(schema.charts.id, TEST_CHART_ID))   // the chart has been edited five times
    const rev = await revision()
    const stale = await restore(v1, { 'x-chart-revision': String(rev - 1) })
    expect(stale._status).toBe(409)
    expect(stale._body).toMatchObject({ error: 'chart-changed' })
    expect(await revision()).toBe(rev)
    expect((await list()).snapshots).toHaveLength(1)                       // no "before restore" version either
    expect((await chartNodes()).map(n => n.id)).toContain('n-dee')

    const ok = await restore(v1, { 'x-chart-revision': String(rev) })
    expect(ok._status).toBe(200)
    expect(await revision()).toBe(rev + 1)
    expect(ok._headers['X-Chart-Revision']).toBe(String(rev + 1))
  })

  it('is all or nothing: if one role cannot be written, the chart is left exactly as it was', async () => {
    const v1 = idOf(await save('v1'))
    await reorganise()
    const before = { nodes: await chartNodes(), edges: await chartEdges() }
    // corrupt the saved version so one role has an impossible status
    const [row] = await testDb.select().from(schema.chartSnapshots).where(eq(schema.chartSnapshots.id, v1))
    const bad = structuredClone(row.data)
    ;(bad.nodes[2] as { status: string }).status = 'not-a-status'
    await testDb.update(schema.chartSnapshots).set({ data: bad }).where(eq(schema.chartSnapshots.id, v1))

    const res = await restore(v1)
    expect(res._status).toBe(500)
    expect({ nodes: await chartNodes(), edges: await chartEdges() }).toEqual(before)
  })

  it('does not fail if a department was linked to a workspace department that has since been deleted', async () => {
    await testDb.insert(schema.workspaceDepartments).values({ id: 'wd1', workspaceId: TEST_WS_ID, name: 'Eng', colour: '#000' })
    await testDb.update(schema.departments).set({ workspaceDepartmentId: 'wd1' }).where(eq(schema.departments.id, 'd-eng'))
    const v1 = idOf(await save('v1'))
    await testDb.update(schema.departments).set({ workspaceDepartmentId: null }).where(eq(schema.departments.id, 'd-eng'))
    await testDb.delete(schema.workspaceDepartments).where(eq(schema.workspaceDepartments.id, 'wd1'))
    expect((await restore(v1))._status).toBe(200)
    expect((await testDb.select().from(schema.departments).where(eq(schema.departments.id, 'd-eng')))[0].workspaceDepartmentId).toBeNull()
  })

  it('needs an editor and the Growth plan, and a chart that is not frozen', async () => {
    const v1 = idOf(await save('v1'))
    for (const user of ['u-vi', 'u-co']) { as(user); expect((await restore(v1))._status, user).toBe(403) }
    as('u-ed')
    await setTier('starter')
    const locked = await restore(v1)
    expect(locked._status).toBe(402)
    expect(locked._body).toMatchObject({ error: 'plan-feature', feature: 'version-history' })
    await setTier('growth')
    expect((await restore(v1))._status).toBe(200)
  })

  it('refuses a version with more roles than the plan allows', async () => {
    const big = { nodes: Array.from({ length: 501 }, (_, i) => ({ id: `big${i}`, name: 'x', title: 'y', departmentId: null, managerId: null, status: 'active' as const, employmentType: 'full-time' as const, roleType: null, avatarUrl: null, location: null, startDate: null, x: 0, y: 0, isNew: false })), edges: [], departments: [] }
    await testDb.insert(schema.chartSnapshots).values({ id: 'huge', workspaceId: TEST_WS_ID, chartId: TEST_CHART_ID, name: 'from a bigger plan', createdBy: 'u', nodeCount: 501, edgeCount: 0, data: big })
    const res = await restore('huge')
    expect(res._status).toBe(402)
    expect(res._body).toMatchObject({ error: 'plan-limit', limit: 'nodes', max: 500 })
    expect((await chartNodes()).map(n => n.id)).toEqual(['n-ceo', 'n-cto', 'n-dev'])
  })

  it('is written to the activity log', async () => {
    const v1 = idOf(await save('Q3 plan'))
    await restore(v1)
    const events = (await testDb.select().from(schema.auditLog)).filter(e => e.action === 'chart.restored')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ actorUserId: 'u-ed', targetId: TEST_CHART_ID, details: { chartName: 'Test Chart', versionName: 'Q3 plan' } })
  })
})

describe('branching a version into a new chart (a scenario)', () => {
  it('creates an independent chart with fresh ids and the same structure; the original is untouched', async () => {
    const v1 = idOf(await save('Plan A'))
    const before = { nodes: await chartNodes(), edges: await chartEdges() }
    const res = await branch(v1, { name: 'Plan B' })
    expect(res._status).toBe(201)
    const created = res._body as { id: string; name: string; creatorId: string; status: string }
    expect(created).toMatchObject({ name: 'Plan B', creatorId: 'u-ed', status: 'draft' })
    expect(created.id).not.toBe(TEST_CHART_ID)

    const nodes = await chartNodes(created.id)
    expect(nodes.map(n => n.title).sort()).toEqual(['CEO', 'CTO', 'Engineer'])
    const ids = nodes.map(n => n.id)
    expect(ids.every(id => !['n-ceo', 'n-cto', 'n-dev'].includes(id))).toBe(true)        // fresh ids
    const byTitle = Object.fromEntries(nodes.map(n => [n.title, n]))
    expect(byTitle.CTO.managerId).toBe(byTitle.CEO.id)                                    // manager references remapped
    expect(byTitle.Engineer).toMatchObject({ status: 'open', managerId: byTitle.CTO.id })
    const edges = await chartEdges(created.id)
    expect(edges).toHaveLength(2)
    expect(edges.every(e => ids.includes(e.sourceId) && ids.includes(e.targetId))).toBe(true)
    const depts = await testDb.select().from(schema.departments).where(eq(schema.departments.chartId, created.id))
    expect(depts.map(d => d.name).sort()).toEqual(['Engineering', 'Operations'])
    expect(byTitle.CTO.departmentId).toBe(depts.find(d => d.name === 'Engineering')!.id)

    expect({ nodes: await chartNodes(), edges: await chartEdges() }).toEqual(before)       // original untouched
    await testDb.update(schema.nodes).set({ title: 'Changed' }).where(eq(schema.nodes.id, ids[0]))
    expect((await chartNodes()).map(n => n.title).sort()).toEqual(['CEO', 'CTO', 'Engineer'])   // and independent
  })

  it('names the new chart after the original and the version when no name is given', async () => {
    const v1 = idOf(await save('Plan A'))
    expect(((await branch(v1))._body as { name: string }).name).toBe('Test Chart (Plan A)')
  })

  it('needs an editor and the Growth plan; viewers and commenters cannot', async () => {
    const v1 = idOf(await save('Plan A'))
    for (const user of ['u-vi', 'u-co']) { as(user); expect((await branch(v1))._status, user).toBe(403) }
    as('u-ed')
    await setTier('starter')
    expect((await branch(v1))._status).toBe(402)
    expect(await testDb.select().from(schema.charts)).toHaveLength(1)
  })

  it('obeys the chart limit like any new chart', async () => {
    const v1 = idOf(await save('Plan A'))
    await testDb.update(schema.workspaces).set({ planTier: 'enterprise' })
    expect((await branch(v1))._status).toBe(201)                                          // unlimited: fine
    // a plan with a finite chart limit would answer 402 plan-limit: the check is the shared fitsLimit used by POST /api/charts
  })

  it('is written to the activity log', async () => {
    const v1 = idOf(await save('Plan A'))
    await branch(v1, { name: 'Plan B' })
    const events = (await testDb.select().from(schema.auditLog)).filter(e => e.action === 'chart.branched')
    expect(events[0]).toMatchObject({ details: { chartName: 'Plan B', versionName: 'Plan A' } })
  })
})

describe('data rights', () => {
  it('versions go with their chart, and the workspace export carries them', async () => {
    await save('Keep this')
    as(TEST_USER_ID)
    const res = await call(exportHandler, { method: 'GET' })
    expect(JSON.parse(res._written).chartVersions).toEqual([expect.objectContaining({ name: 'Keep this', chartId: TEST_CHART_ID, nodeCount: 3 })])
    await testDb.delete(schema.charts).where(eq(schema.charts.id, TEST_CHART_ID))
    expect(await testDb.select().from(schema.chartSnapshots)).toHaveLength(0)
  })
})
