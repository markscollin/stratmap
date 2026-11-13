// Launch review R-10: "Duplicate chart" used to copy what the chart list held (nothing), so the copy was empty.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))

import { eq } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import handler from '../charts/[id]/duplicate'
import { setupSchema, cleanDb, seedWorkspace, seedChart, seedMember, testDb, TEST_USER_ID, TEST_WS_ID, TEST_CHART_ID } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'

const dup = async (id = TEST_CHART_ID) => {
  const res = createRes()
  await handler(createReq({ method: 'POST', query: { id } }) as never, res as never)
  return res
}
const setTier = (planTier: 'free' | 'starter' | 'growth') => testDb.update(schema.workspaces).set({ planTier }).where(eq(schema.workspaces.id, TEST_WS_ID))

beforeAll(async () => { await setupSchema() })

beforeEach(async () => {
  await cleanDb()
  await seedWorkspace()
  await setTier('growth')
  await seedChart()
  await testDb.update(schema.charts).set({ status: 'live', isPublic: true }).where(eq(schema.charts.id, TEST_CHART_ID))
  await testDb.insert(schema.departments).values([
    { id: 'd-eng', chartId: TEST_CHART_ID, name: 'Eng', colour: '#0EA5E9' },
    { id: 'd-ops', chartId: TEST_CHART_ID, name: 'Ops', colour: '#8B5CF6' },
  ])
  // 5 roles, 4 lines: a small tree.
  await testDb.insert(schema.nodes).values([
    { id: 'n1', chartId: TEST_CHART_ID, name: 'Ada', title: 'CEO', x: 0, y: 0, departmentId: 'd-eng' },
    { id: 'n2', chartId: TEST_CHART_ID, name: 'Bo', title: 'CTO', x: -100, y: 150, departmentId: 'd-eng', managerId: 'n1' },
    { id: 'n3', chartId: TEST_CHART_ID, name: 'Cy', title: 'COO', x: 100, y: 150, departmentId: 'd-ops', managerId: 'n1' },
    { id: 'n4', chartId: TEST_CHART_ID, name: 'Di', title: 'Eng', x: -150, y: 300, departmentId: 'd-eng', managerId: 'n2' },
    { id: 'n5', chartId: TEST_CHART_ID, name: 'Ed', title: 'Ops', x: 150, y: 300, departmentId: 'd-ops', managerId: 'n3' },
  ])
  await testDb.insert(schema.edges).values([
    { id: 'e1', chartId: TEST_CHART_ID, sourceId: 'n1', targetId: 'n2' },
    { id: 'e2', chartId: TEST_CHART_ID, sourceId: 'n1', targetId: 'n3' },
    { id: 'e3', chartId: TEST_CHART_ID, sourceId: 'n2', targetId: 'n4' },
    { id: 'e4', chartId: TEST_CHART_ID, sourceId: 'n3', targetId: 'n5' },
  ])
  await testDb.insert(schema.jobDescriptions).values({ id: 'jd-1', nodeId: 'n1', chartId: TEST_CHART_ID, status: 'approved', responsibilities: 'secret', requirements: '', version: 1, updatedBy: 'x', salaryBandMin: 1, salaryBandMax: 2 })
  vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
})

const contentOf = async (chartId: string) => ({
  nodes: await testDb.select().from(schema.nodes).where(eq(schema.nodes.chartId, chartId)),
  edges: await testDb.select().from(schema.edges).where(eq(schema.edges.chartId, chartId)),
  depts: await testDb.select().from(schema.departments).where(eq(schema.departments.chartId, chartId)),
})

describe('POST /api/charts/:id/duplicate', () => {
  it('copies a 5-role chart: the copy has 5 roles and 4 lines, wired to the copied roles', async () => {
    const res = await dup()
    expect(res._status).toBe(201)
    const copy = res._body as { id: string; name: string }
    expect(copy.id).not.toBe(TEST_CHART_ID)
    expect(copy.name).toBe('Test Chart (copy)')

    const { nodes, edges, depts } = await contentOf(copy.id)
    expect(nodes).toHaveLength(5)
    expect(edges).toHaveLength(4)
    expect(depts).toHaveLength(2)
    // Fresh ids everywhere, nothing shared with the original.
    const original = await contentOf(TEST_CHART_ID)
    const originalIds = new Set([...original.nodes, ...original.edges, ...original.depts].map(r => r.id))
    expect([...nodes, ...edges, ...depts].some(r => originalIds.has(r.id))).toBe(false)
    // The lines join copied roles, and the tree shape survived (CEO has two reports).
    const byId = new Map(nodes.map(n => [n.id, n]))
    for (const e of edges) { expect(byId.has(e.sourceId)).toBe(true); expect(byId.has(e.targetId)).toBe(true) }
    const ceo = nodes.find(n => n.name === 'Ada')!
    expect(edges.filter(e => e.sourceId === ceo.id)).toHaveLength(2)
    // Departments and manager links point inside the copy.
    const deptIds = new Set(depts.map(d => d.id))
    expect(nodes.every(n => !n.departmentId || deptIds.has(n.departmentId))).toBe(true)
    expect(nodes.find(n => n.name === 'Bo')!.managerId).toBe(ceo.id)
  })

  it('the original is untouched', async () => {
    await dup()
    const original = await contentOf(TEST_CHART_ID)
    expect(original.nodes).toHaveLength(5)
    expect(original.edges).toHaveLength(4)
  })

  it('the copy is a private draft and brings no job descriptions, comments or share links', async () => {
    const copy = (await dup())._body as { id: string; status: string; isPublic: boolean }
    expect(copy.status).toBe('draft')   // not live: an editor cannot copy their way past the approval workflow
    expect(copy.isPublic).toBe(false)
    expect(await testDb.select().from(schema.jobDescriptions).where(eq(schema.jobDescriptions.chartId, copy.id))).toHaveLength(0)
    expect(await testDb.select().from(schema.sharedLinks).where(eq(schema.sharedLinks.chartId, copy.id))).toHaveLength(0)
  })

  it('an empty chart duplicates too', async () => {
    await testDb.delete(schema.edges); await testDb.delete(schema.nodes)
    const res = await dup()
    expect(res._status).toBe(201)
    expect((await contentOf((res._body as { id: string }).id)).nodes).toHaveLength(0)
  })

  it('a long name still fits (the copy suffix never pushes it past 100 characters)', async () => {
    await testDb.update(schema.charts).set({ name: 'x'.repeat(100) }).where(eq(schema.charts.id, TEST_CHART_ID))
    const name = ((await dup())._body as { name: string }).name
    expect(name.length).toBeLessThanOrEqual(100)
    expect(name.endsWith(' (copy)')).toBe(true)
  })

  it('on Free, whose single chart slot is taken, it is refused with the plan-limit message and nothing is created', async () => {
    await setTier('free')
    const res = await dup()
    expect(res._status).toBe(402)
    expect(res._body).toMatchObject({ error: 'plan-limit', limit: 'charts' })
    expect(await testDb.select().from(schema.charts)).toHaveLength(1)
  })

  it('a chart bigger than the plan allows is refused on the role limit', async () => {
    await setTier('starter') // 5 charts, 100 roles
    await testDb.insert(schema.nodes).values(Array.from({ length: 100 }, (_, i) => ({ id: `big-${i}`, chartId: TEST_CHART_ID, name: `B${i}`, title: 'x', x: 0, y: 0 })))
    const res = await dup()
    expect(res._status).toBe(402)
    expect(res._body).toMatchObject({ limit: 'nodes' })
  })

  it('the sample chart can be copied, and the copy counts as a real chart', async () => {
    await setTier('starter')
    await testDb.update(schema.charts).set({ isSample: true }).where(eq(schema.charts.id, TEST_CHART_ID))
    const copy = (await dup())._body as { id: string; isSample: boolean }
    expect(copy.isSample).toBe(false)
  })

  it('needs the editor role; a viewer gets 403 and nothing is created', async () => {
    await seedMember('u-viewer', 'viewer')
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'u-viewer', workspaceId: TEST_WS_ID })
    expect((await dup())._status).toBe(403)
    expect(await testDb.select().from(schema.charts)).toHaveLength(1)
  })

  it("cannot copy another workspace's chart", async () => {
    vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: 'ws-other' })
    expect((await dup())._status).toBe(404)
  })

  it('only POST is allowed', async () => {
    const res = createRes()
    await handler(createReq({ method: 'GET', query: { id: TEST_CHART_ID } }) as never, res as never)
    expect(res._status).toBe(405)
  })
})
