// Roadmap 2.1: POST /api/charts/:id/import adds people from a spreadsheet import to
// an existing chart. Importing into a NEW chart reuses POST /api/charts (also covered
// here for large imports).
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import importHandler from '../charts/[id]/import'
import chartsHandler from '../charts/index'
import {
  setupSchema, cleanDb, seedWorkspace, seedChart, seedNode, seedMember, testDb,
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
const setTier = (planTier: 'free' | 'starter' | 'growth' | 'enterprise') =>
  testDb.update(schema.workspaces).set({ planTier }).where(eq(schema.workspaces.id, TEST_WS_ID))

const q = { id: TEST_CHART_ID }
const node = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, name: `Person ${id}`, title: 'Engineer', x: 0, y: 0, ...extra })
const doImport = (body: unknown, query = q) => call(importHandler, { method: 'POST', query, body })

beforeAll(async () => { await setupSchema() })
beforeEach(async () => {
  await cleanDb()
  await seedWorkspace() // u-test is owner, Free plan
  await seedChart()
  await seedNode()      // 1 existing role
  vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
})

describe('POST /api/charts/:id/import', () => {
  it('adds nodes, edges and departments with fresh ids and keeps what was there', async () => {
    const res = await doImport({
      departments: [{ id: 'dept-0', name: 'Engineering', colour: '#0EA5E9' }],
      nodes: [
        node('a', { departmentId: 'dept-0', managerId: null, status: 'active', roleType: 'existing', location: 'Paris', startDate: '2024-01-02' }),
        node('b', { departmentId: 'dept-0', managerId: 'a', status: 'open', roleType: 'new-headcount' }),
      ],
      edges: [{ sourceId: 'a', targetId: 'b' }],
    })
    expect(res._status).toBe(201)
    expect(res._body).toEqual({ imported: 2, edges: 1, newDepartments: 1 })

    const nodes = await testDb.select().from(schema.nodes).where(eq(schema.nodes.chartId, TEST_CHART_ID))
    expect(nodes).toHaveLength(3) // the seeded one plus two
    const a = nodes.find(n => n.name === 'Person a')!
    const b = nodes.find(n => n.name === 'Person b')!
    expect(a.id).not.toBe('a')
    expect(b.managerId).toBe(a.id)
    expect(a).toMatchObject({ location: 'Paris', startDate: '2024-01-02', status: 'active', roleType: 'existing' })
    expect(b).toMatchObject({ status: 'open', roleType: 'new-headcount' })

    const [edge] = await testDb.select().from(schema.edges).where(eq(schema.edges.chartId, TEST_CHART_ID))
    expect(edge).toMatchObject({ sourceId: a.id, targetId: b.id })
    const [dept] = await testDb.select().from(schema.departments).where(eq(schema.departments.chartId, TEST_CHART_ID))
    expect(a.departmentId).toBe(dept.id)
  })

  it('reuses a department with the same name (any case) and keeps its colour', async () => {
    await testDb.insert(schema.departments).values({ id: 'd-eng', chartId: TEST_CHART_ID, name: 'Engineering', colour: '#123456' })
    const res = await doImport({
      departments: [
        { id: 'x1', name: 'ENGINEERING', colour: '#0EA5E9' },
        { id: 'x2', name: 'Legal', colour: '#10B981' },
      ],
      nodes: [node('a', { departmentId: 'x1' }), node('b', { departmentId: 'x2' })],
    })
    expect(res._body).toMatchObject({ newDepartments: 1 })
    const depts = await testDb.select().from(schema.departments).where(eq(schema.departments.chartId, TEST_CHART_ID))
    expect(depts.map(d => d.name).sort()).toEqual(['Engineering', 'Legal'])
    expect(depts.find(d => d.name === 'Engineering')!.colour).toBe('#123456')
    const a = (await testDb.select().from(schema.nodes)).find(n => n.name === 'Person a')!
    expect(a.departmentId).toBe('d-eng')
  })

  it('drops references that point outside the import', async () => {
    const res = await doImport({
      departments: [],
      nodes: [node('a', { managerId: 'someone-elses-node', departmentId: 'missing-dept' }), node('b')],
      edges: [
        { sourceId: 'a', targetId: 'b' },
        { sourceId: 'a', targetId: 'b' },          // duplicate
        { sourceId: 'a', targetId: 'a' },          // self
        { sourceId: 'a', targetId: 'node-test' },  // a node already on the chart
        { sourceId: 'ghost', targetId: 'b' },
      ],
    })
    expect(res._status).toBe(201)
    expect(res._body).toMatchObject({ edges: 1 })
    const a = (await testDb.select().from(schema.nodes)).find(n => n.name === 'Person a')!
    expect(a.managerId).toBeNull()
    expect(a.departmentId).toBeNull()
  })

  it('rejects bad payloads without writing anything', async () => {
    for (const body of [
      { nodes: [] },
      { nodes: [node('a'), node('a')] },
      { nodes: [{ id: 'a', title: 'x', x: 0, y: 0 }] },            // no name
      { nodes: [node('bad id!')] },
      { nodes: [node('a', { status: 'banana' })] },
    ]) {
      expect((await doImport(body))._status).toBe(400)
    }
    expect(await testDb.select().from(schema.nodes)).toHaveLength(1)
  })

  it('only accepts POST and only charts in your workspace', async () => {
    expect((await call(importHandler, { method: 'GET', query: q }))._status).toBe(405)
    expect((await doImport({ nodes: [node('a')] }, { id: 'no-such-chart' }))._status).toBe(404)
  })

  it.each(['viewer', 'commenter'] as const)('forbids a %s', async (role) => {
    await seedMember(`u-${role}`, role)
    vi.mocked(requireAuth).mockResolvedValue({ userId: `u-${role}`, workspaceId: TEST_WS_ID })
    expect((await doImport({ nodes: [node('a')] }))._status).toBe(403)
    expect(await testDb.select().from(schema.nodes)).toHaveLength(1)
  })

  it('allows an editor', async () => {
    await seedMember('u-editor', 'editor')
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'u-editor', workspaceId: TEST_WS_ID })
    expect((await doImport({ nodes: [node('a')] }))._status).toBe(201)
  })
})

describe('plan limits', () => {
  // Free allows 30 roles per chart and the chart already has 1.
  it('blocks an import that would go over the limit, and writes nothing', async () => {
    const res = await doImport({ nodes: Array.from({ length: 30 }, (_, i) => node(`n${i}`)) })
    expect(res._status).toBe(402)
    expect(res._body).toMatchObject({ error: 'plan-limit', limit: 'nodes', max: 30, tier: 'free' })
    expect(await testDb.select().from(schema.nodes)).toHaveLength(1)
  })

  it('allows an import that exactly fills the plan', async () => {
    const res = await doImport({ nodes: Array.from({ length: 29 }, (_, i) => node(`n${i}`)) })
    expect(res._status).toBe(201)
    expect(await testDb.select().from(schema.nodes)).toHaveLength(30)
  })

  it('a higher plan allows more', async () => {
    await setTier('starter') // 100
    expect((await doImport({ nodes: Array.from({ length: 99 }, (_, i) => node(`n${i}`)) }))._status).toBe(201)
    expect((await doImport({ nodes: [node('one-more')] }))._status).toBe(402)
  })

  it('is read-only while the workspace has more charts than its plan allows', async () => {
    await testDb.insert(schema.charts).values({
      id: 'chart-2', workspaceId: TEST_WS_ID, name: 'Second', ownerId: TEST_USER_ID, creatorId: TEST_USER_ID, version: 1,
    }) // Free allows 1 chart
    const res = await doImport({ nodes: [node('a')] })
    expect(res._status).toBe(402)
    expect(res._body).toMatchObject({ error: 'plan-frozen', limit: 'charts' })
  })
})

describe('importing into a new chart (POST /api/charts) at scale', () => {
  it('inserts thousands of roles without hitting the bind-parameter limit', async () => {
    await setTier('enterprise')
    const N = 4500 // ~15 columns each is over 65k parameters in one statement
    const templateNodes = Array.from({ length: N }, (_, i) => node(`n${i}`, { managerId: i === 0 ? null : 'n0' }))
    const templateEdges = Array.from({ length: N - 1 }, (_, i) => ({ sourceId: 'n0', targetId: `n${i + 1}` }))
    const res = await call(chartsHandler, { method: 'POST', body: { name: 'Big import', templateNodes, templateEdges, templateDepts: [] } })
    expect(res._status).toBe(201)
    const chartId = (res._body as { id: string }).id
    expect(await testDb.select().from(schema.nodes).where(eq(schema.nodes.chartId, chartId))).toHaveLength(N)
    expect(await testDb.select().from(schema.edges).where(eq(schema.edges.chartId, chartId))).toHaveLength(N - 1)
  }, 60_000)
})
