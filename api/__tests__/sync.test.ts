// R-77: POST /api/charts/:id/sync ("Update from file") replaces a chart's roles and lines with what the person accepted,
// keeping existing roles' positions, comments and job descriptions, atomically and revision-checked.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, eq } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import syncHandler from '../charts/[id]/sync'
import importHandler from '../charts/[id]/import'
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
const q = { id: TEST_CHART_ID }
const sync = (body: unknown, headers: Record<string, string> = {}) => call(syncHandler, { method: 'POST', query: q, body, headers })
const role = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({ id, name: `Person ${id}`, title: 'Engineer', x: 0, y: 0, ...extra })
const chartNodes = () => testDb.select().from(schema.nodes).where(eq(schema.nodes.chartId, TEST_CHART_ID))
const chartEdges = () => testDb.select().from(schema.edges).where(eq(schema.edges.chartId, TEST_CHART_ID))

beforeAll(async () => { await setupSchema() })
beforeEach(async () => {
  await cleanDb()
  await seedWorkspace()
  await seedChart()
  await testDb.insert(schema.departments).values({ id: 'd-eng', chartId: TEST_CHART_ID, name: 'Engineering', colour: '#111111' })
  await testDb.insert(schema.nodes).values([
    { id: 'a', chartId: TEST_CHART_ID, name: 'Ada', title: 'CEO', x: 300, y: 0, externalId: '1', avatarUrl: 'https://img.clerk.com/a.png' },
    { id: 'b', chartId: TEST_CHART_ID, name: 'Bo', title: 'CTO', x: 100, y: 200, externalId: '2', departmentId: 'd-eng' },
    { id: 'c', chartId: TEST_CHART_ID, name: 'Cy', title: 'Engineer', x: 500, y: 200, externalId: '3' },
  ])
  await testDb.insert(schema.edges).values([
    { id: 'e-ab', chartId: TEST_CHART_ID, sourceId: 'a', targetId: 'b' },
    { id: 'e-ac', chartId: TEST_CHART_ID, sourceId: 'a', targetId: 'c' },
  ])
  await testDb.insert(schema.roleComments).values({ id: 'cm-1', workspaceId: TEST_WS_ID, chartId: TEST_CHART_ID, nodeId: 'c', authorId: TEST_USER_ID, body: 'Hi' })
  vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
})

// Bo is retitled and now reports to nobody's change; Cy leaves; Eve joins under Bo in a new department.
const accepted = () => ({
  nodes: [
    role('a', { name: 'Ada', title: 'CEO', externalId: '1', x: 9999, y: 9999 }),
    role('b', { name: 'Bo', title: 'Chief Technology Officer', externalId: '2', departmentId: 'd-eng' }),
    role('n-eve', { name: 'Eve', title: 'Engineer', externalId: '4', email: 'EVE@x.com', departmentId: 'd-new', managerId: 'b', x: 100, y: 360 }),
  ],
  edges: [{ id: 'e-ab', sourceId: 'a', targetId: 'b' }, { id: 'e-new', sourceId: 'b', targetId: 'n-eve' }],
  departments: [{ id: 'd-new', name: 'Platform', colour: '#0EA5E9' }],
})

describe('POST /api/charts/:id/sync', () => {
  it('applies joiners, leavers and edits; existing roles keep their position and photo', async () => {
    const res = await sync(accepted())
    expect(res._status).toBe(200)
    expect(res._body).toEqual({ roles: 3, added: 1, removed: 1, changed: 1 })
    const rows = await chartNodes()
    expect(rows.map(r => r.id).sort()).toEqual(['a', 'b', 'n-eve'])
    expect(rows.find(r => r.id === 'a')).toMatchObject({ x: 300, y: 0, avatarUrl: 'https://img.clerk.com/a.png' })
    expect(rows.find(r => r.id === 'b')).toMatchObject({ title: 'Chief Technology Officer', departmentId: 'd-eng' })
    expect(rows.find(r => r.id === 'n-eve')).toMatchObject({ x: 100, y: 360, departmentId: 'd-new', email: 'eve@x.com', externalId: '4', managerId: 'b' })
    expect((await chartEdges()).map(e => e.id).sort()).toEqual(['e-ab', 'e-new'])
    const depts = await testDb.select().from(schema.departments).where(eq(schema.departments.chartId, TEST_CHART_ID))
    expect(depts.map(d => d.name).sort()).toEqual(['Engineering', 'Platform'])
  })

  it('a leaver goes to the 3-day trash with their comments; a version is saved first; it is logged', async () => {
    await sync(accepted())
    const [trash] = await testDb.select().from(schema.deletedNodes).where(eq(schema.deletedNodes.nodeId, 'c'))
    expect(trash.deletedBy).toBe(TEST_USER_ID)
    expect(trash.data.comments.map(c => c.id)).toEqual(['cm-1'])
    const [version] = await testDb.select().from(schema.chartSnapshots).where(eq(schema.chartSnapshots.chartId, TEST_CHART_ID))
    expect(version).toMatchObject({ name: 'Before update from file', kind: 'auto', nodeCount: 3 })
    const [log] = await testDb.select().from(schema.auditLog).where(eq(schema.auditLog.action, 'chart.updated_from_file'))
    expect(log.details).toEqual({ chartName: 'Test Chart', added: 1, removed: 1, changed: 1 })
  })

  it('reuses a department the chart has by name, and drops references that point nowhere', async () => {
    const body = accepted()
    body.departments = [{ id: 'd-dup', name: 'engineering', colour: '#0EA5E9' }]
    body.nodes[2] = { ...body.nodes[2], departmentId: 'd-dup', managerId: 'ghost' }
    body.nodes[1] = { ...body.nodes[1], departmentId: 'another-workspace-dept' }
    body.edges.push({ id: 'e-ghost', sourceId: 'ghost', targetId: 'a' }, { id: 'e-self', sourceId: 'a', targetId: 'a' })
    expect((await sync(body))._status).toBe(200)
    const rows = await chartNodes()
    expect(rows.find(r => r.id === 'n-eve')).toMatchObject({ departmentId: 'd-eng', managerId: null })
    expect(rows.find(r => r.id === 'b')!.departmentId).toBeNull()
    expect((await chartEdges()).map(e => e.id).sort()).toEqual(['e-ab', 'e-new'])
    const depts = await testDb.select().from(schema.departments).where(eq(schema.departments.chartId, TEST_CHART_ID))
    expect(depts).toHaveLength(1)
  })

  it('a stale revision changes nothing (409)', async () => {
    const [{ revision }] = await testDb.select({ revision: schema.charts.revision }).from(schema.charts).where(eq(schema.charts.id, TEST_CHART_ID))
    const res = await sync(accepted(), { 'x-chart-revision': String(revision + 5) })
    expect(res._status).toBe(409)
    expect((await chartNodes()).map(r => r.id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('bumps the revision and returns it', async () => {
    const [{ revision }] = await testDb.select({ revision: schema.charts.revision }).from(schema.charts).where(eq(schema.charts.id, TEST_CHART_ID))
    const res = await sync(accepted(), { 'x-chart-revision': String(revision) })
    expect(res._status).toBe(200)
    expect(res._headers['X-Chart-Revision']).toBe(String(revision + 1))
  })

  it('refuses to grow the chart past the plan limit (Free: 25 roles), but a big chart may still shrink', async () => {
    const body = accepted()
    for (let i = 0; i < 30; i++) body.nodes.push(role(`n-${i}`))
    const res = await sync(body)
    expect(res._status).toBe(402)
    expect(res._body).toMatchObject({ error: 'plan-limit', limit: 'nodes' })
    expect(await chartNodes()).toHaveLength(3)
  })

  it('viewers cannot update a chart', async () => {
    await seedMember('u-viewer', 'viewer')
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'u-viewer', workspaceId: TEST_WS_ID })
    expect((await sync(accepted()))._status).toBe(403)
  })

  it('a chart in another workspace is not found', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: 'ws-other' })
    expect((await sync(accepted()))._status).toBe(404)
  })

  it('the import stores the file ID and email on each role (lower-cased), so an update can find them', async () => {
    const res = await call(importHandler, { method: 'POST', query: q, body: { nodes: [role('x', { externalId: 'E-9', email: 'Zed@X.com' })], edges: [], departments: [] } })
    expect(res._status).toBe(201)
    const [zed] = await testDb.select().from(schema.nodes).where(and(eq(schema.nodes.chartId, TEST_CHART_ID), eq(schema.nodes.externalId, 'E-9')))
    expect(zed.email).toBe('zed@x.com')
  })
})
