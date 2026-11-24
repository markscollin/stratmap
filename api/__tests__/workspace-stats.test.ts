// R-57: the dashboard counted live charts only, so a Free workspace with a freshly built chart read 0 everywhere.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))

import { requireAuth } from '../_lib/auth'
import handler from '../workspace/stats'
import { setupSchema, cleanDb, seedWorkspace, seedWorkspaceDept, testDb, TEST_WS_ID, TEST_USER_ID, TEST_DEPT_ID } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'

async function chart(id: string, status: string, roles: { status: string; departmentId?: string }[], isSample = false) {
  await testDb.insert(schema.charts).values({ id, workspaceId: TEST_WS_ID, name: id, status, isSample, version: 1, ownerId: TEST_USER_ID, creatorId: TEST_USER_ID } as never)
  for (const [i, r] of roles.entries()) {
    await testDb.insert(schema.nodes).values({ id: `${id}-n${i}`, chartId: id, name: `P${i}`, title: 'T', status: r.status, departmentId: r.departmentId ?? null, x: 0, y: i * 10 } as never)
  }
}
async function stats() {
  const res = createRes()
  await handler(createReq({ method: 'GET' }) as never, res as never)
  expect(res._status).toBe(200)
  return res._body as { totalHeadcount: number; totalOpen: number; scope: string; chartCount: number; deptBreakdown: { id: string; headcount: number; open: number }[] }
}

beforeAll(async () => { await setupSchema() })
beforeEach(async () => {
  await cleanDb(); await seedWorkspace(); await seedWorkspaceDept()
  vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
})

describe('GET /api/workspace/stats (R-57)', () => {
  it('with no live chart it counts every chart that is not archived or the sample', async () => {
    await chart('c-draft', 'draft', [{ status: 'active' }, { status: 'active' }, { status: 'open' }])
    await chart('c-review', 'review', [{ status: 'active' }])
    await chart('c-archived', 'archived', [{ status: 'active' }, { status: 'active' }])
    await chart('c-sample', 'draft', [{ status: 'active' }], true)
    expect(await stats()).toMatchObject({ totalHeadcount: 3, totalOpen: 1, scope: 'all', chartCount: 2 })
  })

  it('a Free user who builds a 3-role chart sees 3', async () => {
    await chart('c1', 'draft', [{ status: 'active' }, { status: 'active' }, { status: 'active' }])
    expect(await stats()).toMatchObject({ totalHeadcount: 3, scope: 'all', chartCount: 1 })
  })

  it('once any chart is live, only the live charts count', async () => {
    await chart('c-live', 'live', [{ status: 'active' }, { status: 'open' }])
    await chart('c-draft', 'draft', [{ status: 'active' }, { status: 'active' }, { status: 'active' }])
    expect(await stats()).toMatchObject({ totalHeadcount: 1, totalOpen: 1, scope: 'live', chartCount: 1 })
  })

  it('a role on a blank chart that uses a workspace department directly is counted in that department', async () => {
    await chart('c1', 'draft', [{ status: 'active', departmentId: TEST_DEPT_ID }, { status: 'open', departmentId: TEST_DEPT_ID }])
    const s = await stats()
    expect(s.deptBreakdown.find(d => d.id === TEST_DEPT_ID)).toMatchObject({ headcount: 1, open: 1 })
  })

  it('an empty workspace is all zeros with no charts in scope', async () => {
    expect(await stats()).toMatchObject({ totalHeadcount: 0, totalOpen: 0, chartCount: 0 })
  })
})
