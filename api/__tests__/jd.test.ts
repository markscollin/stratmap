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
import handler from '../charts/[id]/jd/[nodeId]'
import {
  setupSchema, cleanDb, seedWorkspace, seedChart, seedNode, testDb,
  TEST_USER_ID, TEST_WS_ID, TEST_CHART_ID, TEST_NODE_ID, TEST_JD_ID,
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

describe('GET /api/charts/[id]/jd/[nodeId]', () => {
  it('returns a default with null id when no JD exists for the node', async () => {
    const res = createRes()
    await handler(createReq({ query: { id: TEST_CHART_ID, nodeId: TEST_NODE_ID } }) as never, res as never)
    expect(res._status).toBe(200)
    const body = res._body as { id: null; nodeId: string; status: string }
    expect(body.id).toBeNull()
    expect(body.nodeId).toBe(TEST_NODE_ID)
    expect(body.status).toBe('draft')
  })

  it('returns the JD when one exists', async () => {
    await testDb.insert(schema.jobDescriptions).values({
      id: TEST_JD_ID,
      nodeId: TEST_NODE_ID,
      chartId: TEST_CHART_ID,
      responsibilities: 'Lead the team',
      requirements: '5+ years',
      updatedBy: TEST_USER_ID,
    })

    const res = createRes()
    await handler(createReq({ query: { id: TEST_CHART_ID, nodeId: TEST_NODE_ID } }) as never, res as never)
    expect(res._status).toBe(200)
    const body = res._body as { responsibilities: string }
    expect(body.responsibilities).toBe('Lead the team')
  })

  it('returns 404 when chart is not in the authenticated workspace', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: 'ws-other' })
    const res = createRes()
    await handler(createReq({ query: { id: TEST_CHART_ID, nodeId: TEST_NODE_ID } }) as never, res as never)
    expect(res._status).toBe(404)
  })
})

describe('PUT /api/charts/[id]/jd/[nodeId]', () => {
  it('creates a new JD and returns 201 when none exists', async () => {
    const res = createRes()
    await handler(
      createReq({ method: 'PUT', query: { id: TEST_CHART_ID, nodeId: TEST_NODE_ID }, body: { responsibilities: 'Own the roadmap', status: 'draft' } }) as never,
      res as never,
    )
    expect(res._status).toBe(201)
    const body = res._body as { responsibilities: string; version: number }
    expect(body.responsibilities).toBe('Own the roadmap')
    expect(body.version).toBe(1)
  })

  it('updates existing JD without bumping version for content-only saves', async () => {
    await testDb.insert(schema.jobDescriptions).values({
      id: TEST_JD_ID,
      nodeId: TEST_NODE_ID,
      chartId: TEST_CHART_ID,
      responsibilities: 'Original',
      requirements: '',
      version: 1,
      updatedBy: TEST_USER_ID,
    })

    const res = createRes()
    await handler(
      createReq({ method: 'PUT', query: { id: TEST_CHART_ID, nodeId: TEST_NODE_ID }, body: { responsibilities: 'Updated' } }) as never,
      res as never,
    )
    expect(res._status).toBe(200)
    const body = res._body as { responsibilities: string; version: number }
    expect(body.responsibilities).toBe('Updated')
    expect(body.version).toBe(1)
  })

  it('bumps version when client explicitly sends a higher version', async () => {
    await testDb.insert(schema.jobDescriptions).values({
      id: TEST_JD_ID,
      nodeId: TEST_NODE_ID,
      chartId: TEST_CHART_ID,
      responsibilities: 'Original',
      requirements: '',
      version: 1,
      updatedBy: TEST_USER_ID,
    })

    const res = createRes()
    await handler(
      createReq({ method: 'PUT', query: { id: TEST_CHART_ID, nodeId: TEST_NODE_ID }, body: { status: 'draft', version: 2 } }) as never,
      res as never,
    )
    expect(res._status).toBe(200)
    const body = res._body as { version: number }
    expect(body.version).toBe(2)
  })

  it('preserves unchanged fields when updating JD', async () => {
    await testDb.insert(schema.jobDescriptions).values({
      id: TEST_JD_ID,
      nodeId: TEST_NODE_ID,
      chartId: TEST_CHART_ID,
      responsibilities: 'Lead',
      requirements: 'Must have 5 years',
      version: 1,
      updatedBy: TEST_USER_ID,
    })

    const res = createRes()
    await handler(
      createReq({ method: 'PUT', query: { id: TEST_CHART_ID, nodeId: TEST_NODE_ID }, body: { responsibilities: 'Lead teams' } }) as never,
      res as never,
    )
    const body = res._body as { requirements: string }
    expect(body.requirements).toBe('Must have 5 years')
  })

  it('records updatedBy from the authenticated user', async () => {
    const res = createRes()
    await handler(
      createReq({ method: 'PUT', query: { id: TEST_CHART_ID, nodeId: TEST_NODE_ID }, body: { responsibilities: 'Lead' } }) as never,
      res as never,
    )
    const body = res._body as { updatedBy: string }
    expect(body.updatedBy).toBe(TEST_USER_ID)
  })

  it('returns 405 for unsupported methods', async () => {
    const res = createRes()
    await handler(createReq({ method: 'DELETE', query: { id: TEST_CHART_ID, nodeId: TEST_NODE_ID } }) as never, res as never)
    expect(res._status).toBe(405)
  })
})
