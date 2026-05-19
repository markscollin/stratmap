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
