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
import handler from '../charts/[id]/nodes/[nodeId]'
import {
  setupSchema, cleanDb, seedWorkspace, seedChart, seedNode, testDb,
  TEST_USER_ID, TEST_WS_ID, TEST_CHART_ID, TEST_NODE_ID,
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

describe('PUT /api/charts/[id]/nodes/[nodeId]', () => {
  it('updates node fields and returns the updated node', async () => {
    const res = createRes()
    await handler(
      createReq({ method: 'PUT', query: { id: TEST_CHART_ID, nodeId: TEST_NODE_ID }, body: { name: 'Alice Updated', title: 'CEO & Founder' } }) as never,
      res as never,
    )
    expect(res._status).toBe(200)
    const body = res._body as { name: string; title: string }
    expect(body.name).toBe('Alice Updated')
    expect(body.title).toBe('CEO & Founder')
  })

  it('returns 404 when node does not exist in this chart', async () => {
    const res = createRes()
    await handler(
      createReq({ method: 'PUT', query: { id: TEST_CHART_ID, nodeId: 'no-such-node' }, body: { name: 'X' } }) as never,
      res as never,
    )
    expect(res._status).toBe(404)
  })

  it('returns 404 when chart does not belong to workspace', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: 'ws-other' })
    const res = createRes()
    await handler(
      createReq({ method: 'PUT', query: { id: TEST_CHART_ID, nodeId: TEST_NODE_ID }, body: { name: 'X' } }) as never,
      res as never,
    )
    expect(res._status).toBe(404)
  })
})

describe('DELETE /api/charts/[id]/nodes/[nodeId]', () => {
  it('removes the node and returns 204', async () => {
    const res = createRes()
    await handler(
      createReq({ method: 'DELETE', query: { id: TEST_CHART_ID, nodeId: TEST_NODE_ID } }) as never,
      res as never,
    )
    expect(res._status).toBe(204)
    expect(res._ended).toBe(true)

    const nodes = await testDb.select().from(schema.nodes)
    expect(nodes).toHaveLength(0)
  })

  it('returns 405 for unsupported methods', async () => {
    const res = createRes()
    await handler(
      createReq({ method: 'GET', query: { id: TEST_CHART_ID, nodeId: TEST_NODE_ID } }) as never,
      res as never,
    )
    expect(res._status).toBe(405)
  })
})
