// Launch review R-02 / owner decision D-1: deleting a role keeps a copy for a few days, and
// POST /api/charts/:id/nodes/:nodeId/restore (the server half of Undo) brings back the role,
// its comments and its reporting lines.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import nodeHandler from '../charts/[id]/nodes/[nodeId]'
import restoreHandler from '../charts/[id]/nodes/[nodeId]/restore'
import { PLAN_LIMITS } from '../../src/lib/plans'
import cronHandler from '../cron/purge-deleted'
import { purgeExpiredTrash, TRASH_DAYS } from '../_lib/nodeTrash'
import {
  setupSchema, cleanDb, seedWorkspace, seedChart, seedNode, seedMember, testDb,
  TEST_USER_ID, TEST_WS_ID, TEST_CHART_ID, TEST_NODE_ID,
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
const q = (nodeId = TEST_NODE_ID) => ({ id: TEST_CHART_ID, nodeId })
const del = (nodeId = TEST_NODE_ID, headers: Record<string, string> = {}) => call(nodeHandler, { method: 'DELETE', query: q(nodeId), headers })
const restore = (nodeId = TEST_NODE_ID, headers: Record<string, string> = {}) => call(restoreHandler, { method: 'POST', query: q(nodeId), headers })
const roleIds = async () => (await testDb.select({ id: schema.nodes.id }).from(schema.nodes)).map(n => n.id).sort()
const ago = (days: number) => new Date(Date.now() - days * 86_400_000)

beforeAll(async () => { await setupSchema() })

beforeEach(async () => {
  await cleanDb()
  await seedWorkspace()
  await seedChart()
  await seedNode()
  // A boss above the role and a report below it, each joined by a line.
  await testDb.insert(schema.nodes).values([
    { id: 'boss', chartId: TEST_CHART_ID, name: 'Boss', title: 'CEO', x: 0, y: 0 },
    { id: 'report', chartId: TEST_CHART_ID, name: 'Report', title: 'Eng', x: 0, y: 200 },
  ])
  await testDb.insert(schema.edges).values([
    { id: 'e-up', chartId: TEST_CHART_ID, sourceId: 'boss', targetId: TEST_NODE_ID },
    { id: 'e-down', chartId: TEST_CHART_ID, sourceId: TEST_NODE_ID, targetId: 'report' },
    { id: 'e-other', chartId: TEST_CHART_ID, sourceId: 'boss', targetId: 'report' },
  ])
  // A thread: a resolved top-level comment with a reply.
  await testDb.insert(schema.roleComments).values([
    { id: 'c-reply', workspaceId: TEST_WS_ID, chartId: TEST_CHART_ID, nodeId: TEST_NODE_ID, parentId: 'c-top', authorId: 'someone', body: 'agreed', mentions: [] },
    { id: 'c-top', workspaceId: TEST_WS_ID, chartId: TEST_CHART_ID, nodeId: TEST_NODE_ID, authorId: TEST_USER_ID, body: 'Budget?', mentions: ['someone'], resolvedAt: new Date('2026-11-01T10:00:00Z'), resolvedBy: TEST_USER_ID },
  ])
  vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
})

describe('deleting a role keeps a copy', () => {
  it('stores the role, its comments and its lines, then removes them from the chart', async () => {
    expect((await del())._status).toBe(204)
    expect(await roleIds()).toEqual(['boss', 'report'])
    const [copy] = await testDb.select().from(schema.deletedNodes)
    expect(copy).toMatchObject({ chartId: TEST_CHART_ID, nodeId: TEST_NODE_ID, deletedBy: TEST_USER_ID })
    expect(copy.data.node.name).toBe('Alice')
    expect(copy.data.comments.map(c => c.id).sort()).toEqual(['c-reply', 'c-top'])
    expect(copy.data.edges.map(e => e.id).sort()).toEqual(['e-down', 'e-up'])
    expect(await testDb.select().from(schema.roleComments)).toHaveLength(0) // comments cascaded with the role
  })

  it("removes the role's reporting lines (they were left dangling before) but not other people's", async () => {
    await del()
    expect((await testDb.select().from(schema.edges)).map(e => e.id)).toEqual(['e-other'])
  })

  it('a retried delete (the role is already gone) is a quiet 204 and keeps the first copy', async () => {
    await del()
    const [first] = await testDb.select().from(schema.deletedNodes)
    expect((await del())._status).toBe(204)
    const rows = await testDb.select().from(schema.deletedNodes)
    expect(rows).toHaveLength(1)
    expect(rows[0].data.node.name).toBe(first.data.node.name)
  })

  it('deleting the same role id a second time (after a restore) replaces the copy, never duplicates it', async () => {
    await del(); await restore(); await del()
    expect(await testDb.select().from(schema.deletedNodes)).toHaveLength(1)
  })

  it('erases this chart\'s expired copies as a side effect', async () => {
    await testDb.insert(schema.deletedNodes).values({ id: 'old', chartId: TEST_CHART_ID, nodeId: 'ancient', deletedBy: 'x', deletedAt: ago(TRASH_DAYS + 1), data: { node: {} as never, comments: [], edges: [] } })
    await del()
    expect((await testDb.select().from(schema.deletedNodes)).map(r => r.nodeId)).toEqual([TEST_NODE_ID])
  })
})

describe('POST /api/charts/:id/nodes/:nodeId/restore', () => {
  it('brings back the role, its comments (thread intact) and its lines, and uses up the copy', async () => {
    await del()
    const res = await restore()
    expect(res._status).toBe(201)
    expect(await roleIds()).toEqual(['boss', 'report', TEST_NODE_ID].sort())
    const [node] = await testDb.select().from(schema.nodes).where(eq(schema.nodes.id, TEST_NODE_ID))
    expect(node).toMatchObject({ name: 'Alice', title: 'CTO', x: 100, y: 100 })

    const comments = await testDb.select().from(schema.roleComments)
    expect(comments.map(c => c.id).sort()).toEqual(['c-reply', 'c-top'])
    const top = comments.find(c => c.id === 'c-top')!
    expect(top.resolvedAt).toEqual(new Date('2026-11-01T10:00:00Z')) // real dates, not strings
    expect(top.mentions).toEqual(['someone'])
    expect(comments.find(c => c.id === 'c-reply')!.parentId).toBe('c-top')

    expect((await testDb.select().from(schema.edges)).map(e => e.id).sort()).toEqual(['e-down', 'e-other', 'e-up'])
    expect(await testDb.select().from(schema.deletedNodes)).toHaveLength(0)
  })

  it('does not bring back a line whose other end was deleted in the meantime', async () => {
    await del()
    await del('report')
    expect((await restore())._status).toBe(201)
    expect((await testDb.select().from(schema.edges)).map(e => e.id)).toEqual(['e-up'])
  })

  it('is idempotent: restoring a role that is already there changes nothing', async () => {
    const res = await restore() // never deleted
    expect(res._status).toBe(200)
    expect(res._body).toMatchObject({ alreadyThere: true })
  })

  it('answers 404 nothing-to-restore when there is no copy, so the client can create the role afresh', async () => {
    const res = await restore('never-existed')
    expect(res._status).toBe(404)
    expect((res._body as { error: string }).error).toBe('nothing-to-restore')
  })

  it('answers 404 once the copy is older than the window', async () => {
    await del()
    await testDb.update(schema.deletedNodes).set({ deletedAt: ago(TRASH_DAYS + 1) })
    expect((await restore())._status).toBe(404)
    expect(await roleIds()).toEqual(['boss', 'report'])
  })

  it('needs the editor role', async () => {
    await del()
    await seedMember('viewer-1', 'viewer')
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'viewer-1', workspaceId: TEST_WS_ID })
    expect((await restore())._status).toBe(403)
    expect(await roleIds()).toEqual(['boss', 'report'])
  })

  it("cannot reach another workspace's chart", async () => {
    await del()
    vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: 'ws-other' })
    expect((await restore())._status).toBe(404)
  })

  it('respects the plan: a full chart gets 402 plan-limit and nothing is restored', async () => {
    await del()
    // Fill the chart to the Free limit (the 3 roles already there count).
    const room = PLAN_LIMITS.free.maxNodesPerChart - 2
    await testDb.insert(schema.nodes).values(Array.from({ length: room }, (_, i) => ({ id: `fill-${i}`, chartId: TEST_CHART_ID, name: `F${i}`, title: 'x', x: 0, y: 0 })))
    const res = await restore()
    expect(res._status).toBe(402)
    expect((res._body as { error: string }).error).toBe('plan-limit')
    expect((await roleIds()).includes(TEST_NODE_ID)).toBe(false)
  })

  it('a stale chart revision is refused with 409 and nothing is restored', async () => {
    await del()
    const res = await restore(TEST_NODE_ID, { 'x-chart-revision': '0' })
    expect(res._status).toBe(409)
    expect((await roleIds()).includes(TEST_NODE_ID)).toBe(false)
    expect(await testDb.select().from(schema.deletedNodes)).toHaveLength(1)
  })

  it('counts as a structural edit: the revision goes up and the new one is returned', async () => {
    await del()
    const [{ r: before }] = await testDb.select({ r: schema.charts.revision }).from(schema.charts)
    const res = await restore()
    expect(res._headers['X-Chart-Revision']).toBe(String(before + 1))
  })

  it('only POST is allowed', async () => {
    expect((await call(restoreHandler, { method: 'GET', query: q() }))._status).toBe(405)
  })
})

describe('purgeExpiredTrash', () => {
  it('erases only copies older than the window, across charts', async () => {
    await del()
    await testDb.insert(schema.deletedNodes).values({ id: 'old', chartId: TEST_CHART_ID, nodeId: 'ancient', deletedBy: 'x', deletedAt: ago(TRASH_DAYS + 1), data: { node: {} as never, comments: [], edges: [] } })
    expect(await purgeExpiredTrash()).toBe(1)
    expect((await testDb.select().from(schema.deletedNodes)).map(r => r.nodeId)).toEqual([TEST_NODE_ID])
  })

  it('copies go with their chart', async () => {
    await del()
    await testDb.delete(schema.charts).where(eq(schema.charts.id, TEST_CHART_ID))
    expect(await testDb.select().from(schema.deletedNodes)).toHaveLength(0)
  })
})

describe('the daily job', () => {
  it('also erases expired copies of deleted roles', async () => {
    process.env.CRON_SECRET = 'cron-secret'
    try {
      await testDb.insert(schema.deletedNodes).values({ id: 'old', chartId: TEST_CHART_ID, nodeId: 'ancient', deletedBy: 'x', deletedAt: ago(TRASH_DAYS + 1), data: { node: {} as never, comments: [], edges: [] } })
      const res = await call(cronHandler, { method: 'GET', headers: { authorization: 'Bearer cron-secret' } })
      expect(res._status).toBe(200)
      expect(res._body).toEqual({ purged: 0, trashPurged: 1 })
    } finally { delete process.env.CRON_SECRET }
  })
})
