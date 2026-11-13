import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})

vi.mock('../_lib/auth', () => ({
  requireAuth: vi.fn(),
  requireUser: vi.fn(),
}))

import { requireAuth } from '../_lib/auth'
import edgesHandler from '../charts/[id]/edges'
import edgeIdHandler from '../charts/[id]/edges/[edgeId]'
import {
  setupSchema, cleanDb, seedWorkspace, seedChart, seedNode, seedEdge, testDb,
  TEST_USER_ID, TEST_WS_ID, TEST_CHART_ID, TEST_NODE_ID, TEST_EDGE_ID,
} from './helpers/db'
import { createReq } from './helpers/req'
import { createRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'
import { eq } from 'drizzle-orm'

beforeAll(async () => { await setupSchema() })

beforeEach(async () => {
  await cleanDb()
  await seedWorkspace()
  await seedChart()
  await seedNode()
  vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
})

describe('POST /api/charts/[id]/edges', () => {
  it('creates an edge and returns 201', async () => {
    await testDb.insert(schema.nodes).values({ id: 'n-b', chartId: TEST_CHART_ID, name: 'Bob', title: 'CTO', x: 0, y: 100 })

    const res = createRes()
    await edgesHandler(
      createReq({ method: 'POST', query: { id: TEST_CHART_ID }, body: { sourceId: TEST_NODE_ID, targetId: 'n-b' } }) as never,
      res as never,
    )
    expect(res._status).toBe(201)
    const body = res._body as { sourceId: string; targetId: string; chartId: string }
    expect(body.sourceId).toBe(TEST_NODE_ID)
    expect(body.targetId).toBe('n-b')
    expect(body.chartId).toBe(TEST_CHART_ID)
  })

  it('returns 400 when sourceId is missing', async () => {
    const res = createRes()
    await edgesHandler(
      createReq({ method: 'POST', query: { id: TEST_CHART_ID }, body: { targetId: 'n-b' } }) as never,
      res as never,
    )
    expect(res._status).toBe(400)
  })

  it('returns 400 when targetId is missing', async () => {
    const res = createRes()
    await edgesHandler(
      createReq({ method: 'POST', query: { id: TEST_CHART_ID }, body: { sourceId: TEST_NODE_ID } }) as never,
      res as never,
    )
    expect(res._status).toBe(400)
  })

  it('returns 404 when chart is not in the authenticated workspace', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: 'ws-other' })
    const res = createRes()
    await edgesHandler(
      createReq({ method: 'POST', query: { id: TEST_CHART_ID }, body: { sourceId: TEST_NODE_ID, targetId: 'n-b' } }) as never,
      res as never,
    )
    expect(res._status).toBe(404)
  })

  it('returns 405 for unsupported methods', async () => {
    const res = createRes()
    await edgesHandler(createReq({ method: 'GET', query: { id: TEST_CHART_ID } }) as never, res as never)
    expect(res._status).toBe(405)
  })
})

describe('POST /api/charts/[id]/edges with a client-supplied id (R-03)', () => {
  const post = (body: unknown, chartId = TEST_CHART_ID) => {
    const res = createRes()
    return edgesHandler(createReq({ method: 'POST', query: { id: chartId }, body }) as never, res as never).then(() => res)
  }
  const del = (edgeId: string) => {
    const res = createRes()
    return edgeIdHandler(createReq({ method: 'DELETE', query: { id: TEST_CHART_ID, edgeId } }) as never, res as never).then(() => res)
  }

  beforeEach(async () => {
    await testDb.insert(schema.nodes).values({ id: 'n-b', chartId: TEST_CHART_ID, name: 'Bob', title: 'CTO', x: 0, y: 100 })
  })

  it('stores the edge under the id the client chose, so it can be deleted straight away', async () => {
    const created = await post({ id: 'e-client-1', sourceId: TEST_NODE_ID, targetId: 'n-b' })
    expect(created._status).toBe(201)
    expect((created._body as { id: string }).id).toBe('e-client-1')

    expect((await del('e-client-1'))._status).toBe(204)
    const left = await testDb.select().from(schema.edges)
    expect(left.find(e => e.id === 'e-client-1')).toBeUndefined()
  })

  it('still generates an id when none is sent', async () => {
    const created = await post({ sourceId: TEST_NODE_ID, targetId: 'n-b' })
    expect(created._status).toBe(201)
    expect((created._body as { id: string }).id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('is idempotent: the same edge sent again returns it, with no second row and no revision bump', async () => {
    await post({ id: 'e-retry', sourceId: TEST_NODE_ID, targetId: 'n-b' })
    const [before] = await testDb.select({ r: schema.charts.revision }).from(schema.charts)
    const again = await post({ id: 'e-retry', sourceId: TEST_NODE_ID, targetId: 'n-b' })
    expect(again._status).toBe(200)
    expect((again._body as { id: string }).id).toBe('e-retry')
    const rows = (await testDb.select().from(schema.edges)).filter(e => e.id === 'e-retry')
    expect(rows).toHaveLength(1)
    const [after] = await testDb.select({ r: schema.charts.revision }).from(schema.charts)
    expect(after.r).toBe(before.r)
  })

  it('answers 409 id-taken when the id belongs to a different edge', async () => {
    await post({ id: 'e-taken', sourceId: TEST_NODE_ID, targetId: 'n-b' })
    const clash = await post({ id: 'e-taken', sourceId: 'n-b', targetId: TEST_NODE_ID })
    expect(clash._status).toBe(409)
    expect((clash._body as { error: string }).error).toBe('id-taken')
  })

  it('answers 409 (not 500) when the id is already used by an edge in another chart, and leaks nothing', async () => {
    await testDb.update(schema.workspaces).set({ planTier: 'growth' }).where(eq(schema.workspaces.id, TEST_WS_ID))
    await testDb.insert(schema.charts).values({ id: 'chart-2', workspaceId: TEST_WS_ID, name: 'Other', ownerId: TEST_USER_ID, creatorId: TEST_USER_ID, version: 1 })
    await testDb.insert(schema.nodes).values([
      { id: 'o-a', chartId: 'chart-2', name: 'A', title: 'A', x: 0, y: 0 },
      { id: 'o-b', chartId: 'chart-2', name: 'B', title: 'B', x: 0, y: 0 },
    ])
    await post({ id: 'e-shared', sourceId: 'o-a', targetId: 'o-b' }, 'chart-2')
    const clash = await post({ id: 'e-shared', sourceId: TEST_NODE_ID, targetId: 'n-b' })
    expect(clash._status).toBe(409)
    expect(JSON.stringify(clash._body)).not.toContain('chart-2')
  })

  it('rejects an id with unsafe characters', async () => {
    const bad = await post({ id: 'e/../x', sourceId: TEST_NODE_ID, targetId: 'n-b' })
    expect(bad._status).toBe(400)
  })
})

describe('DELETE /api/charts/[id]/edges/[edgeId]', () => {
  beforeEach(async () => {
    await seedEdge()
  })

  it('removes the edge and returns 204', async () => {
    const res = createRes()
    await edgeIdHandler(
      createReq({ method: 'DELETE', query: { id: TEST_CHART_ID, edgeId: TEST_EDGE_ID } }) as never,
      res as never,
    )
    expect(res._status).toBe(204)
    expect(res._ended).toBe(true)

    const edges = await testDb.select().from(schema.edges)
    expect(edges).toHaveLength(0)
  })

  it('returns 405 for unsupported methods', async () => {
    const res = createRes()
    await edgeIdHandler(
      createReq({ method: 'GET', query: { id: TEST_CHART_ID, edgeId: TEST_EDGE_ID } }) as never,
      res as never,
    )
    expect(res._status).toBe(405)
  })
})
