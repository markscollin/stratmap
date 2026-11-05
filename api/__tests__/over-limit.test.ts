// Roadmap 1.6: over the limit after a downgrade, data becomes read-only (never deleted).
// Owner decisions:
//  - More charts than the plan allows → EVERY chart is view-only until charts are
//    deleted down to the limit or the workspace upgrades. Deleting and making a
//    chart private stay allowed.
//  - A chart with more roles than the plan allows → existing roles can be edited
//    and removed; only adding new ones is blocked.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import chartHandler from '../charts/[id]'
import chartsHandler from '../charts/index'
import nodesHandler from '../charts/[id]/nodes'
import nodeHandler from '../charts/[id]/nodes/[nodeId]'
import edgesHandler from '../charts/[id]/edges'
import edgeHandler from '../charts/[id]/edges/[edgeId]'
import shareHandler from '../charts/[id]/share'
import jdHandler from '../charts/[id]/jd/[nodeId]'
import {
  setupSchema, cleanDb, seedWorkspace, seedChart, seedNode, seedEdge, testDb,
  TEST_USER_ID, TEST_WS_ID, TEST_CHART_ID, TEST_NODE_ID, TEST_EDGE_ID,
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

async function setTier(planTier: 'free' | 'starter' | 'growth') {
  await testDb.update(schema.workspaces).set({ planTier }).where(eq(schema.workspaces.id, TEST_WS_ID))
}

/** Adds `n` extra charts on top of the seeded one. */
async function addCharts(n: number) {
  for (let i = 0; i < n; i++) {
    await testDb.insert(schema.charts).values({
      id: `chart-extra-${i}`, workspaceId: TEST_WS_ID, name: `Extra ${i}`, ownerId: TEST_USER_ID, creatorId: TEST_USER_ID, version: 1,
    })
  }
}

const q = { id: TEST_CHART_ID }

beforeAll(async () => { await setupSchema() })

beforeEach(async () => {
  await cleanDb()
  await seedWorkspace()  // u-test is owner
  await seedChart()
  await seedNode()
  await seedEdge()
  vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
})

describe('over the chart limit after a downgrade', () => {
  // Starter allows 5 charts and includes job descriptions, so feature locks don't get in the way.
  beforeEach(async () => {
    await addCharts(5)  // 6 charts
    await setTier('starter')
  })

  function expectFrozen(res: MockRes) {
    expect(res._status).toBe(402)
    expect(res._body).toMatchObject({ error: 'plan-frozen', limit: 'charts', count: 6, max: 5, tier: 'starter' })
    expect((res._body as { message: string }).message).toMatch(/view-only until you delete 1 chart or upgrade/)
  }

  it('blocks every write to chart content', async () => {
    expectFrozen(await call(chartHandler, { method: 'PUT', query: q, body: { name: 'Renamed' } }))
    expectFrozen(await call(nodesHandler, { method: 'POST', query: q, body: { name: 'New', title: 'Role', x: 0, y: 0 } }))
    expectFrozen(await call(nodesHandler, { method: 'PUT', query: q, body: [{ id: TEST_NODE_ID, x: 1, y: 2 }] }))
    expectFrozen(await call(nodeHandler, { method: 'PUT', query: { ...q, nodeId: TEST_NODE_ID }, body: { title: 'CEO' } }))
    expectFrozen(await call(nodeHandler, { method: 'DELETE', query: { ...q, nodeId: TEST_NODE_ID } }))
    expectFrozen(await call(edgesHandler, { method: 'POST', query: q, body: { sourceId: 'node-b', targetId: TEST_NODE_ID } }))
    expectFrozen(await call(edgeHandler, { method: 'DELETE', query: { ...q, edgeId: TEST_EDGE_ID } }))
    expectFrozen(await call(shareHandler, { method: 'POST', query: q }))
    expectFrozen(await call(jdHandler, { method: 'PUT', query: { ...q, nodeId: TEST_NODE_ID }, body: { responsibilities: 'x' } }))

    // Nothing changed.
    const [node] = await testDb.select().from(schema.nodes).where(eq(schema.nodes.id, TEST_NODE_ID))
    expect(node.title).toBe('CTO')
    expect(await testDb.select().from(schema.edges)).toHaveLength(1)
  })

  it('still lets everyone view charts', async () => {
    const res = await call(chartHandler, { method: 'GET', query: q })
    expect(res._status).toBe(200)
  })

  it('still lets you make a chart private and revoke its link', async () => {
    await testDb.update(schema.charts).set({ isPublic: true }).where(eq(schema.charts.id, TEST_CHART_ID))
    const unshare = await call(chartHandler, { method: 'PUT', query: q, body: { isPublic: false } })
    expect(unshare._status).toBe(200)
    expect((unshare._body as { isPublic: boolean }).isPublic).toBe(false)
    expect((await call(shareHandler, { method: 'DELETE', query: q }))._status).not.toBe(402)
    // Re-sharing is an edit.
    expectFrozen(await call(chartHandler, { method: 'PUT', query: q, body: { isPublic: true } }))
  })

  it('blocks creating another chart', async () => {
    const res = await call(chartsHandler, { method: 'POST', body: { name: 'Seventh' } })
    expect(res._status).toBe(402)
    expect(res._body).toMatchObject({ error: 'plan-limit', limit: 'charts' })
  })

  it('unfreezes once enough charts are deleted', async () => {
    const del = await call(chartHandler, { method: 'DELETE', query: { id: 'chart-extra-0' } })
    expect(del._status).toBeLessThan(300)
    const res = await call(nodeHandler, { method: 'PUT', query: { ...q, nodeId: TEST_NODE_ID }, body: { title: 'CEO' } })
    expect(res._status).toBe(200)
  })

  it('unfreezes on upgrade', async () => {
    await setTier('growth')
    const res = await call(chartHandler, { method: 'PUT', query: q, body: { name: 'Renamed' } })
    expect(res._status).toBe(200)
  })

  it('does not freeze a workspace exactly at its limit', async () => {
    await testDb.delete(schema.charts).where(eq(schema.charts.id, 'chart-extra-4'))  // 5 of 5
    const res = await call(chartHandler, { method: 'PUT', query: q, body: { name: 'Renamed' } })
    expect(res._status).toBe(200)
  })

  it('checks the role before the plan', async () => {
    await testDb.update(schema.workspaceMembers).set({ permission: 'viewer' }).where(eq(schema.workspaceMembers.userId, TEST_USER_ID))
    const res = await call(chartHandler, { method: 'PUT', query: q, body: { name: 'Renamed' } })
    expect(res._status).toBe(403)
  })
})

describe('over the node limit after a downgrade', () => {
  // Free allows 30 roles per chart. The seeded chart gets 32.
  beforeEach(async () => {
    for (let i = 0; i < 30; i++) {
      await testDb.insert(schema.nodes).values({ id: `extra-${i}`, chartId: TEST_CHART_ID, name: `P${i}`, title: 'Role', x: 0, y: 0 })
    }
    await setTier('free')
  })

  it('blocks adding a role', async () => {
    const res = await call(nodesHandler, { method: 'POST', query: q, body: { name: 'New', title: 'Role', x: 0, y: 0 } })
    expect(res._status).toBe(402)
    expect(res._body).toMatchObject({ error: 'plan-limit', limit: 'nodes' })
  })

  it('still lets you edit, move, connect and remove roles', async () => {
    expect((await call(nodeHandler, { method: 'PUT', query: { ...q, nodeId: TEST_NODE_ID }, body: { title: 'CEO' } }))._status).toBe(200)
    expect((await call(nodesHandler, { method: 'PUT', query: q, body: [{ id: TEST_NODE_ID, x: 5, y: 5 }] }))._status).toBe(204)
    expect((await call(edgesHandler, { method: 'POST', query: q, body: { sourceId: TEST_NODE_ID, targetId: 'extra-0' } }))._status).toBe(201)
    expect((await call(nodeHandler, { method: 'DELETE', query: { ...q, nodeId: 'extra-1' } }))._status).toBeLessThan(300)
  })

  it('allows adding again once back under the limit', async () => {
    for (let i = 0; i < 3; i++) {
      await call(nodeHandler, { method: 'DELETE', query: { ...q, nodeId: `extra-${i}` } })
    }  // 29 of 30
    const res = await call(nodesHandler, { method: 'POST', query: q, body: { name: 'New', title: 'Role', x: 0, y: 0 } })
    expect(res._status).toBe(201)
  })
})
