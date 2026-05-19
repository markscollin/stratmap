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
import handler from '../charts/[id]'
import {
  setupSchema, cleanDb, seedWorkspace, seedChart, testDb,
  TEST_USER_ID, TEST_WS_ID, TEST_CHART_ID,
} from './helpers/db'
import { createReq } from './helpers/req'
import { createRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'

beforeAll(async () => { await setupSchema() })

beforeEach(async () => {
  await cleanDb()
  await seedWorkspace()
  await seedChart()
  vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
})

describe('GET /api/charts/[id]', () => {
  it('returns chart with nodes, edges, and departments', async () => {
    await testDb.insert(schema.nodes).values({ id: 'n-1', chartId: TEST_CHART_ID, name: 'Alice', title: 'CEO', x: 0, y: 0 })
    await testDb.insert(schema.edges).values({ id: 'e-1', chartId: TEST_CHART_ID, sourceId: 'n-1', targetId: 'n-1' })
    await testDb.insert(schema.departments).values({ id: 'd-1', chartId: TEST_CHART_ID, name: 'Eng', colour: '#blue' })

    const res = createRes()
    await handler(createReq({ query: { id: TEST_CHART_ID } }) as never, res as never)
    expect(res._status).toBe(200)
    const body = res._body as { id: string; nodes: unknown[]; edges: unknown[]; departments: unknown[] }
    expect(body.id).toBe(TEST_CHART_ID)
    expect(body.nodes).toHaveLength(1)
    expect(body.edges).toHaveLength(1)
    expect(body.departments).toHaveLength(1)
  })

  it('returns 404 when chart belongs to a different workspace', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: 'ws-other' })
    const res = createRes()
    await handler(createReq({ query: { id: TEST_CHART_ID } }) as never, res as never)
    expect(res._status).toBe(404)
  })

  it('returns 404 for unknown chart id', async () => {
    const res = createRes()
    await handler(createReq({ query: { id: 'no-such-chart' } }) as never, res as never)
    expect(res._status).toBe(404)
  })
})

describe('PUT /api/charts/[id]', () => {
  it('updates chart name', async () => {
    const res = createRes()
    await handler(createReq({ method: 'PUT', query: { id: TEST_CHART_ID }, body: { name: 'Renamed' } }) as never, res as never)
    expect(res._status).toBe(200)
    const body = res._body as { name: string }
    expect(body.name).toBe('Renamed')
  })

  it('updates chart status', async () => {
    const res = createRes()
    await handler(createReq({ method: 'PUT', query: { id: TEST_CHART_ID }, body: { status: 'live' } }) as never, res as never)
    expect(res._status).toBe(200)
    const body = res._body as { status: string }
    expect(body.status).toBe('live')
  })
})

describe('DELETE /api/charts/[id]', () => {
  it('deletes chart and returns 204', async () => {
    const res = createRes()
    await handler(createReq({ method: 'DELETE', query: { id: TEST_CHART_ID } }) as never, res as never)
    expect(res._status).toBe(204)
    expect(res._ended).toBe(true)
  })

  it('cascades deletion to nodes and edges', async () => {
    await testDb.insert(schema.nodes).values({ id: 'n-1', chartId: TEST_CHART_ID, name: 'Alice', title: 'CEO', x: 0, y: 0 })
    await testDb.insert(schema.edges).values({ id: 'e-1', chartId: TEST_CHART_ID, sourceId: 'n-1', targetId: 'n-1' })

    const res = createRes()
    await handler(createReq({ method: 'DELETE', query: { id: TEST_CHART_ID } }) as never, res as never)
    expect(res._status).toBe(204)

    const nodes = await testDb.select().from(schema.nodes)
    const edges = await testDb.select().from(schema.edges)
    expect(nodes).toHaveLength(0)
    expect(edges).toHaveLength(0)
  })

  it('returns 405 for unsupported methods', async () => {
    const res = createRes()
    await handler(createReq({ method: 'POST', query: { id: TEST_CHART_ID } }) as never, res as never)
    expect(res._status).toBe(405)
  })
})
