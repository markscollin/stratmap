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
import handler from '../charts/[id]/nodes'
import {
  setupSchema, cleanDb, seedWorkspace, seedChart, testDb,
  TEST_USER_ID, TEST_WS_ID, TEST_CHART_ID,
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
  vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
})

describe('POST /api/charts/[id]/nodes', () => {
  it('adds a node and returns 201', async () => {
    const res = createRes()
    await handler(
      createReq({ method: 'POST', query: { id: TEST_CHART_ID }, body: { name: 'Alice', title: 'CEO', x: 10, y: 20 } }) as never,
      res as never,
    )
    expect(res._status).toBe(201)
    const body = res._body as { name: string; chartId: string }
    expect(body.name).toBe('Alice')
    expect(body.chartId).toBe(TEST_CHART_ID)
  })

  it('generates a new id when none is provided', async () => {
    const res = createRes()
    await handler(
      createReq({ method: 'POST', query: { id: TEST_CHART_ID }, body: { name: 'Alice', title: 'CEO', x: 0, y: 0 } }) as never,
      res as never,
    )
    const body = res._body as { id: string }
    expect(body.id).toBeTruthy()
    expect(body.id.length).toBeGreaterThan(10)
  })

  it('bumps chart updatedAt after adding a node', async () => {
    // Set updatedAt to a known past time via JS to avoid Postgres now() clock skew in PGlite
    const pastTime = new Date(Date.now() - 60_000)
    await testDb.update(schema.charts).set({ updatedAt: pastTime }).where(eq(schema.charts.id, TEST_CHART_ID))

    const res = createRes()
    await handler(
      createReq({ method: 'POST', query: { id: TEST_CHART_ID }, body: { name: 'Alice', title: 'CEO', x: 0, y: 0 } }) as never,
      res as never,
    )
    const [after] = await testDb.select({ updatedAt: schema.charts.updatedAt }).from(schema.charts).where(eq(schema.charts.id, TEST_CHART_ID))
    expect(after.updatedAt.getTime()).toBeGreaterThan(pastTime.getTime())
  })

  it('returns 404 when chart is not in the authenticated workspace', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: 'ws-other' })
    const res = createRes()
    await handler(
      createReq({ method: 'POST', query: { id: TEST_CHART_ID }, body: { name: 'Alice', title: 'CEO', x: 0, y: 0 } }) as never,
      res as never,
    )
    expect(res._status).toBe(404)
  })
})

describe('PUT /api/charts/[id]/nodes (bulk positions)', () => {
  it('updates multiple node positions and returns 204', async () => {
    await testDb.insert(schema.nodes).values([
      { id: 'n-1', chartId: TEST_CHART_ID, name: 'Alice', title: 'CEO', x: 0, y: 0 },
      { id: 'n-2', chartId: TEST_CHART_ID, name: 'Bob', title: 'CTO', x: 0, y: 0 },
    ])

    const res = createRes()
    await handler(
      createReq({ method: 'PUT', query: { id: TEST_CHART_ID }, body: [{ id: 'n-1', x: 50, y: 75 }, { id: 'n-2', x: 200, y: 75 }] }) as never,
      res as never,
    )
    expect(res._status).toBe(204)
    expect(res._ended).toBe(true)

    const [n1] = await testDb.select().from(schema.nodes).where(eq(schema.nodes.id, 'n-1'))
    expect(n1.x).toBe(50)
    expect(n1.y).toBe(75)
  })

  it('returns 400 when body is not an array', async () => {
    const res = createRes()
    await handler(
      createReq({ method: 'PUT', query: { id: TEST_CHART_ID }, body: { id: 'n-1', x: 50, y: 75 } }) as never,
      res as never,
    )
    expect(res._status).toBe(400)
  })

  it('returns 405 for unsupported methods', async () => {
    const res = createRes()
    await handler(createReq({ method: 'DELETE', query: { id: TEST_CHART_ID } }) as never, res as never)
    expect(res._status).toBe(405)
  })
})
