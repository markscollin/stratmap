// GET /api/roles/search (replaces the hard-coded mockRoleSearchResults) and the
// node/department counts on GET /api/charts (replaces CHART_DISPLAY).
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../_lib/auth'
import searchHandler from '../roles/search'
import chartsHandler from '../charts/index'
import { setupSchema, cleanDb, seedWorkspace, seedChart, seedMember, testDb, TEST_USER_ID, TEST_WS_ID, TEST_CHART_ID } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes, type MockRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'

type Handler = (req: VercelRequest, res: VercelResponse) => unknown
async function call(handler: Handler, opts: Parameters<typeof createReq>[0]): Promise<MockRes> {
  const res = createRes()
  await handler(createReq(opts) as never, res as never)
  return res
}

const node = (id: string, name: string, title: string, status: 'active' | 'open' | 'planned' | 'backfill' = 'active', departmentId: string | null = null, chartId = TEST_CHART_ID) =>
  ({ id, chartId, name, title, status, departmentId, x: 0, y: 0 })

beforeAll(async () => { await setupSchema() })

beforeEach(async () => {
  await cleanDb()
  await seedWorkspace()
  await seedChart()
  await testDb.insert(schema.departments).values({ id: 'd-eng', chartId: TEST_CHART_ID, name: 'Engineering', colour: '#0EA5E9' })
  await testDb.insert(schema.nodes).values([
    node('n1', 'Priya', 'Senior Software Engineer', 'active', 'd-eng'),
    node('n2', 'Software Engineer', 'Software Engineer', 'open', 'd-eng'),
    node('n3', 'Sam', 'Product Manager'),
    node('n4', 'Growth 100%', 'Marketer'),
  ])
  // Another workspace's chart must never appear.
  await testDb.insert(schema.workspaces).values({ id: 'ws-other', name: 'Other', ownerId: 'u-o', ownerRole: 'Founder/CEO', size: '1-10' })
  await testDb.insert(schema.charts).values({ id: 'c-other', workspaceId: 'ws-other', name: 'Secret', ownerId: 'u-o', creatorId: 'u-o' })
  await testDb.insert(schema.nodes).values(node('n9', 'Spy', 'Software Engineer', 'active', null, 'c-other'))
  vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
})

describe('GET /api/roles/search', () => {
  it('matches titles case-insensitively within the workspace only', async () => {
    const res = await call(searchHandler, { method: 'GET', query: { q: 'engineer' } })
    expect(res._status).toBe(200)
    const { results } = res._body as { results: { nodeId: string; dept: string | null; chart: string }[] }
    expect(results.map(r => r.nodeId).sort()).toEqual(['n1', 'n2'])
    expect(results[0]).toMatchObject({ chart: 'Test Chart', dept: 'Engineering' })
  })

  it('names a person only for filled roles', async () => {
    const { results } = (await call(searchHandler, { method: 'GET', query: { q: 'engineer' } }))._body as { results: { nodeId: string; person: string | null }[] }
    expect(results.find(r => r.nodeId === 'n1')!.person).toBe('Priya')
    expect(results.find(r => r.nodeId === 'n2')!.person).toBeNull()
  })

  it('also matches person names', async () => {
    const { results } = (await call(searchHandler, { method: 'GET', query: { q: 'sam' } }))._body as { results: { nodeId: string }[] }
    expect(results.map(r => r.nodeId)).toEqual(['n3'])
  })

  it('treats % and _ literally', async () => {
    const pct = (await call(searchHandler, { method: 'GET', query: { q: '0%' } }))._body as { results: { nodeId: string }[] }
    expect(pct.results.map(r => r.nodeId)).toEqual(['n4'])
    const under = (await call(searchHandler, { method: 'GET', query: { q: '__' } }))._body as { results: unknown[] }
    expect(under.results).toHaveLength(0)
  })

  it('400 for queries shorter than 2 characters', async () => {
    expect((await call(searchHandler, { method: 'GET', query: { q: 'a' } }))._status).toBe(400)
  })

  it('viewers can search', async () => {
    await seedMember('u-v', 'viewer')
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'u-v', workspaceId: TEST_WS_ID })
    expect((await call(searchHandler, { method: 'GET', query: { q: 'engineer' } }))._status).toBe(200)
  })
})

describe('GET /api/charts counts', () => {
  it('returns real node and department counts for each chart', async () => {
    const res = await call(chartsHandler, { method: 'GET' })
    expect(res._body).toEqual([expect.objectContaining({ id: TEST_CHART_ID, nodeCount: 4, deptCount: 1 })])
  })
})
