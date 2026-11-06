// Roadmap 2.4: two people editing one chart can't silently overwrite each other.
// Structural edits bump charts.revision; a stale X-Chart-Revision gets 409 chart-changed.
// Moving boxes (bulk position PUT) never conflicts and never bumps.
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
import nodesHandler from '../charts/[id]/nodes'
import nodeHandler from '../charts/[id]/nodes/[nodeId]'
import edgesHandler from '../charts/[id]/edges'
import edgeHandler from '../charts/[id]/edges/[edgeId]'
import importHandler from '../charts/[id]/import'
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

async function revision() {
  const [c] = await testDb.select({ r: schema.charts.revision }).from(schema.charts).where(eq(schema.charts.id, TEST_CHART_ID))
  return c.r
}

const q = { id: TEST_CHART_ID }
const rev = (n: number | string) => ({ 'x-chart-revision': String(n) })
const newNode = (id: string) => ({ id, name: 'N', title: 'T', x: 0, y: 0 })

beforeAll(async () => { await setupSchema() })

beforeEach(async () => {
  await cleanDb()
  await seedWorkspace()
  await seedChart()
  await seedNode()
  await seedEdge()
  vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
})

describe('chart revision (optimistic concurrency)', () => {
  it('a new chart starts at revision 0 and GET returns it', async () => {
    const res = await call(chartHandler, { method: 'GET', query: q })
    expect((res._body as { revision: number }).revision).toBe(0)
  })

  it('a node create with the current revision succeeds, bumps it and returns the new one', async () => {
    const res = await call(nodesHandler, { method: 'POST', query: q, headers: rev(0), body: newNode('n-a') })
    expect(res._status).toBe(201)
    expect(res._headers['X-Chart-Revision']).toBe('1')
    expect(await revision()).toBe(1)
  })

  it('a stale revision gets 409 chart-changed, the current revision, and writes nothing', async () => {
    await call(nodesHandler, { method: 'POST', query: q, headers: rev(0), body: newNode('n-a') })
    const res = await call(nodesHandler, { method: 'POST', query: q, headers: rev(0), body: newNode('n-b') })
    expect(res._status).toBe(409)
    expect(res._body).toMatchObject({ error: 'chart-changed', revision: 1 })
    expect(res._headers['X-Chart-Revision']).toBe('1')
    const all = await testDb.select().from(schema.nodes).where(eq(schema.nodes.chartId, TEST_CHART_ID))
    expect(all.map(n => n.id).sort()).toEqual([TEST_NODE_ID, 'node-b', 'n-a'].sort())
    expect(await revision()).toBe(1)
  })

  it('chaining with the revision from each response works', async () => {
    let r = '0'
    for (const id of ['n-a', 'n-b', 'n-c']) {
      const res = await call(nodesHandler, { method: 'POST', query: q, headers: rev(r), body: newNode(id) })
      expect(res._status).toBe(201)
      r = res._headers['X-Chart-Revision']
    }
    expect(r).toBe('3')
  })

  it('requests without the header are not checked (scripts, older clients) but still bump', async () => {
    await call(nodesHandler, { method: 'POST', query: q, headers: rev(0), body: newNode('n-a') })
    const res = await call(nodesHandler, { method: 'POST', query: q, body: newNode('n-b') })
    expect(res._status).toBe(201)
    expect(await revision()).toBe(2)
  })

  it('a garbage header is ignored rather than trusted', async () => {
    const res = await call(nodesHandler, { method: 'POST', query: q, headers: { 'x-chart-revision': 'abc' }, body: newNode('n-a') })
    expect(res._status).toBe(201)
  })

  it('every structural write is checked: node edit/delete, edge add/delete, import, rename, status', async () => {
    await testDb.update(schema.charts).set({ revision: 5 }).where(eq(schema.charts.id, TEST_CHART_ID))
    const stale = rev(2)
    const cases: [string, Handler, Parameters<typeof createReq>[0]][] = [
      ['node edit', nodeHandler, { method: 'PUT', query: { ...q, nodeId: TEST_NODE_ID }, body: { name: 'X' } }],
      ['node delete', nodeHandler, { method: 'DELETE', query: { ...q, nodeId: TEST_NODE_ID } }],
      ['edge add', edgesHandler, { method: 'POST', query: q, body: { sourceId: TEST_NODE_ID, targetId: TEST_NODE_ID } }],
      ['edge delete', edgeHandler, { method: 'DELETE', query: { ...q, edgeId: TEST_EDGE_ID } }],
      ['import', importHandler, { method: 'POST', query: q, body: { nodes: [newNode('i-1')], edges: [], departments: [] } }],
      ['rename', chartHandler, { method: 'PUT', query: q, body: { name: 'Renamed' } }],
      ['status', chartHandler, { method: 'PUT', query: q, body: { status: 'archived' } }],
    ]
    for (const [label, handler, opts] of cases) {
      const res = await call(handler, { ...opts, headers: stale })
      // edge add with identical ends fails validation (400) before the check; give it two real ends below
      if (label === 'edge add') expect([400, 409]).toContain(res._status)
      else expect(res._status, label).toBe(409)
    }
    expect(await revision()).toBe(5)
    const [c] = await testDb.select().from(schema.charts).where(eq(schema.charts.id, TEST_CHART_ID))
    expect(c.name).not.toBe('Renamed')
  })

  it('edge add with a stale revision is refused too', async () => {
    await call(nodesHandler, { method: 'POST', query: q, headers: rev(0), body: newNode('n-a') })
    const res = await call(edgesHandler, { method: 'POST', query: q, headers: rev(0), body: { sourceId: TEST_NODE_ID, targetId: 'n-a' } })
    expect(res._status).toBe(409)
  })

  it('moving boxes never conflicts and never bumps', async () => {
    await call(nodesHandler, { method: 'POST', query: q, headers: rev(0), body: newNode('n-a') })
    const res = await call(nodesHandler, { method: 'PUT', query: q, headers: rev(0), body: [{ id: 'n-a', x: 10, y: 20 }] })
    expect(res._status).toBe(204)
    expect(await revision()).toBe(1)
  })

  it('turning sharing on or off never conflicts', async () => {
    await testDb.update(schema.charts).set({ revision: 4 }).where(eq(schema.charts.id, TEST_CHART_ID))
    const res = await call(chartHandler, { method: 'PUT', query: q, headers: rev(0), body: { isPublic: true } })
    expect(res._status).toBe(200)
    expect(await revision()).toBe(4)
  })

  it('a failed request (bad body, no permission) does not bump the revision', async () => {
    const bad = await call(nodesHandler, { method: 'POST', query: q, headers: rev(0), body: { nope: true } })
    expect(bad._status).toBe(400)
    expect(await revision()).toBe(0)
  })

  it('two simultaneous writes with the same revision: exactly one wins', async () => {
    const [a, b] = await Promise.all([
      call(nodesHandler, { method: 'POST', query: q, headers: rev(0), body: newNode('n-a') }),
      call(nodesHandler, { method: 'POST', query: q, headers: rev(0), body: newNode('n-b') }),
    ])
    expect([a._status, b._status].sort()).toEqual([201, 409])
    expect(await revision()).toBe(1)
  })
})
