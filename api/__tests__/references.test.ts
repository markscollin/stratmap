// Launch review R-30: ids in a request body that point at another row must belong to the caller's workspace (or chart).
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))

import { eq } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import nodesHandler from '../charts/[id]/nodes'
import nodeHandler from '../charts/[id]/nodes/[nodeId]'
import chartsHandler from '../charts/index'
import headcountList from '../headcount'
import headcountItem from '../headcount/[id]'
import {
  setupSchema, cleanDb, seedWorkspace, seedChart, seedNode, seedWorkspaceDept, seedHeadcountPlan, testDb,
  TEST_USER_ID, TEST_WS_ID, TEST_CHART_ID, TEST_NODE_ID, TEST_DEPT_ID, TEST_PLAN_ID,
} from './helpers/db'
import { createReq } from './helpers/req'
import { createRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'

type H = (req: never, res: never) => unknown
const call = async (h: H, opts: Parameters<typeof createReq>[0]) => { const res = createRes(); await h(createReq(opts) as never, res as never); return res }

// A second workspace with a chart, a role and a department of its own: what the caller must not be able to point at.
const OTHER = { ws: 'ws-other', chart: 'chart-other', node: 'node-other', dept: 'wd-other', chartDept: 'cd-other' }

beforeAll(async () => { await setupSchema() })
beforeEach(async () => {
  await cleanDb(); await seedWorkspace(); await seedChart(); await seedNode(); await seedWorkspaceDept()
  await testDb.update(schema.workspaces).set({ planTier: 'growth' })
  await testDb.insert(schema.workspaces).values({ id: OTHER.ws, name: 'Other', ownerId: 'someone', ownerRole: 'CEO', size: '1-10' })
  await testDb.insert(schema.workspaceDepartments).values({ id: OTHER.dept, workspaceId: OTHER.ws, name: 'Theirs', colour: '#000' })
  await testDb.insert(schema.charts).values({ id: OTHER.chart, workspaceId: OTHER.ws, name: 'Theirs', ownerId: 'someone', creatorId: 'someone', version: 1 })
  await testDb.insert(schema.nodes).values({ id: OTHER.node, chartId: OTHER.chart, name: 'X', title: 'Y', x: 0, y: 0 })
  await testDb.insert(schema.departments).values({ id: OTHER.chartDept, chartId: OTHER.chart, name: 'Theirs', colour: '#000' })
  vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
})

const q = { id: TEST_CHART_ID }
const newNode = (extra: Record<string, unknown>) => ({ id: 'n-new', name: 'A', title: 'B', departmentId: '', managerId: '', status: 'active', employmentType: 'full-time', x: 0, y: 0, ...extra })

describe('roles', () => {
  it('create: a department or manager from another workspace is a 400 invalid-reference', async () => {
    for (const [field, value] of [['departmentId', OTHER.dept], ['departmentId', OTHER.chartDept], ['managerId', OTHER.node], ['managerId', 'nobody']] as const) {
      const res = await call(nodesHandler as H, { method: 'POST', query: q, body: newNode({ [field]: value }) })
      expect(res._status, `${field}=${value}`).toBe(400)
      expect(res._body).toMatchObject({ error: 'invalid-reference', field })
    }
    expect(await testDb.select().from(schema.nodes).where(eq(schema.nodes.id, 'n-new'))).toHaveLength(0)
  })

  it('create: this workspace\'s department, this chart\'s department and a role in this chart are fine', async () => {
    await testDb.insert(schema.departments).values({ id: 'cd-mine', chartId: TEST_CHART_ID, name: 'Mine', colour: '#111' })
    expect((await call(nodesHandler as H, { method: 'POST', query: q, body: newNode({ id: 'n-a', departmentId: TEST_DEPT_ID, managerId: TEST_NODE_ID }) }))._status).toBe(201)
    expect((await call(nodesHandler as H, { method: 'POST', query: q, body: newNode({ id: 'n-b', departmentId: 'cd-mine' }) }))._status).toBe(201)
  })

  it('edit: a changed reference is checked, an unchanged one is not (a role with a deleted manager can still be edited)', async () => {
    await testDb.update(schema.nodes).set({ managerId: 'deleted-boss', departmentId: 'old-dept' }).where(eq(schema.nodes.id, TEST_NODE_ID))
    const put = (body: Record<string, unknown>) => call(nodeHandler as H, { method: 'PUT', query: { ...q, nodeId: TEST_NODE_ID }, body })
    expect((await put({ title: 'New title', managerId: 'deleted-boss', departmentId: 'old-dept' }))._status).toBe(200)
    expect((await put({ managerId: OTHER.node }))._status).toBe(400)
    expect((await put({ departmentId: OTHER.dept }))._status).toBe(400)
    expect((await put({ managerId: '', departmentId: '' }))._status).toBe(200)
    expect((await put({ departmentId: TEST_DEPT_ID }))._status).toBe(200)
  })
})

describe('headcount', () => {
  const post = (body: Record<string, unknown>) => call(headcountList as H, { method: 'POST', body: { title: 'Hire', roleType: 'new-headcount', targetQuarter: '2027-Q1', ...body } })

  it('create: another workspace\'s department or chart is a 400, own ones work', async () => {
    expect((await post({ departmentId: OTHER.dept }))._body).toMatchObject({ error: 'invalid-reference', field: 'departmentId' })
    expect((await post({ chartId: OTHER.chart }))._body).toMatchObject({ error: 'invalid-reference', field: 'chartId' })
    expect((await post({ departmentId: TEST_DEPT_ID, chartId: TEST_CHART_ID }))._status).toBe(201)
    expect((await post({ departmentId: '', chartId: null }))._status).toBe(201)
  })

  it('update: same checks, and clearing is allowed', async () => {
    await seedHeadcountPlan()
    const put = (body: Record<string, unknown>) => call(headcountItem as H, { method: 'PUT', query: { id: TEST_PLAN_ID }, body })
    expect((await put({ departmentId: OTHER.dept }))._status).toBe(400)
    expect((await put({ chartId: OTHER.chart }))._status).toBe(400)
    expect((await put({ chartId: TEST_CHART_ID }))._status).toBe(200)
    expect((await put({ departmentId: null, chartId: null }))._status).toBe(200)
  })

  it('the list never shows a department name from another workspace, even for a stale id', async () => {
    await seedHeadcountPlan()
    await testDb.update(schema.headcountPlans).set({ departmentId: OTHER.dept }).where(eq(schema.headcountPlans.id, TEST_PLAN_ID))
    const body = (await call(headcountList as H, { method: 'GET' }))._body as { departmentName: string | null }[]
    expect(body[0].departmentName).toBeNull()
  })
})

describe('templates for a new chart', () => {
  it('a template naming another workspace\'s department creates the chart with that department unlinked', async () => {
    const res = await call(chartsHandler as H, { method: 'POST', body: {
      name: 'From template', templateNodes: [], templateEdges: [],
      templateDepts: [{ id: 'd1', name: 'Mine', colour: '#111', workspaceDepartmentId: TEST_DEPT_ID }, { id: 'd2', name: 'Theirs', colour: '#222', workspaceDepartmentId: OTHER.dept }],
    } })
    expect(res._status).toBe(201)
    const rows = await testDb.select().from(schema.departments).where(eq(schema.departments.chartId, (res._body as { id: string }).id))
    const byName = Object.fromEntries(rows.map(r => [r.name, r.workspaceDepartmentId]))
    expect(byName).toEqual({ Mine: TEST_DEPT_ID, Theirs: null })
  })
})
