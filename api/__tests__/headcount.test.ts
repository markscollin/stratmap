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
import listHandler from '../headcount'
import itemHandler from '../headcount/[id]'
import {
  setupSchema, cleanDb, seedWorkspace, seedChart, seedWorkspaceDept, seedHeadcountPlan, testDb,
  TEST_USER_ID, TEST_WS_ID, TEST_CHART_ID, TEST_DEPT_ID, TEST_PLAN_ID,
} from './helpers/db'
import { createReq } from './helpers/req'
import { createRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'
import { eq } from 'drizzle-orm'

beforeAll(async () => { await setupSchema() })

beforeEach(async () => {
  await cleanDb()
  vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
})

describe('GET /api/headcount', () => {
  it('returns empty array when no plans exist', async () => {
    await seedWorkspace()
    const res = createRes()
    await listHandler(createReq() as never, res as never)
    expect(res._status).toBe(200)
    expect(res._body).toEqual([])
  })

  it('returns plans for the workspace', async () => {
    await seedWorkspace()
    await seedHeadcountPlan()
    const res = createRes()
    await listHandler(createReq() as never, res as never)
    const body = res._body as { id: string; title: string }[]
    expect(body).toHaveLength(1)
    expect(body[0].title).toBe('Senior Engineer')
  })

  it('includes denormalized department name and colour via LEFT JOIN', async () => {
    await seedWorkspace()
    await seedWorkspaceDept()
    await testDb.insert(schema.headcountPlans).values({
      id: TEST_PLAN_ID,
      workspaceId: TEST_WS_ID,
      title: 'Staff Engineer',
      roleType: 'new-headcount',
      targetQuarter: '2026-Q3',
      departmentId: TEST_DEPT_ID,
      createdBy: TEST_USER_ID,
    })
    const res = createRes()
    await listHandler(createReq() as never, res as never)
    const body = res._body as { departmentName: string; departmentColour: string }[]
    expect(body[0].departmentName).toBe('Engineering')
    expect(body[0].departmentColour).toBe('#0EA5E9')
  })

  it('returns null department fields when plan has no department', async () => {
    await seedWorkspace()
    await seedHeadcountPlan()
    const res = createRes()
    await listHandler(createReq() as never, res as never)
    const body = res._body as { departmentName: string | null; departmentColour: string | null }[]
    expect(body[0].departmentName).toBeNull()
    expect(body[0].departmentColour).toBeNull()
  })

  it('only returns plans from the authed workspace', async () => {
    await seedWorkspace()
    await seedHeadcountPlan()
    await testDb.execute(
      `INSERT INTO workspaces (id, name, owner_id, owner_role, size) VALUES ('ws-other', 'Other', 'u-other', 'CTO', '1-10')`
    )
    await testDb.insert(schema.headcountPlans).values({
      id: 'plan-other', workspaceId: 'ws-other', title: 'Other Plan',
      roleType: 'new-headcount', targetQuarter: '2026-Q1', createdBy: 'u-other',
    })
    const res = createRes()
    await listHandler(createReq() as never, res as never)
    const body = res._body as { id: string }[]
    expect(body.every(p => p.id !== 'plan-other')).toBe(true)
  })

  it('returns 405 for unsupported methods', async () => {
    await seedWorkspace()
    const res = createRes()
    await listHandler(createReq({ method: 'DELETE' }) as never, res as never)
    expect(res._status).toBe(405)
  })
})

describe('POST /api/headcount', () => {
  it('creates a plan and returns 201', async () => {
    await seedWorkspace()
    const res = createRes()
    await listHandler(
      createReq({ method: 'POST', body: { title: 'Product Manager', targetQuarter: '2026-Q2' } }) as never,
      res as never,
    )
    expect(res._status).toBe(201)
    const body = res._body as { title: string; targetQuarter: string; status: string; roleType: string }
    expect(body.title).toBe('Product Manager')
    expect(body.targetQuarter).toBe('2026-Q2')
    expect(body.status).toBe('planned')
    expect(body.roleType).toBe('new-headcount')
  })

  it('accepts optional fields', async () => {
    await seedWorkspace()
    await seedChart()
    await seedWorkspaceDept()
    const res = createRes()
    await listHandler(
      createReq({
        method: 'POST',
        body: {
          title: 'Designer',
          targetQuarter: '2026-Q3',
          departmentId: TEST_DEPT_ID,
          roleType: 'backfill',
          chartId: TEST_CHART_ID,
          notes: 'Urgent hire',
        },
      }) as never,
      res as never,
    )
    expect(res._status).toBe(201)
    const body = res._body as { roleType: string; notes: string }
    expect(body.roleType).toBe('backfill')
    expect(body.notes).toBe('Urgent hire')
  })

  it('persists plan to the database', async () => {
    await seedWorkspace()
    await listHandler(
      createReq({ method: 'POST', body: { title: 'Data Analyst', targetQuarter: '2026-Q1' } }) as never,
      createRes() as never,
    )
    const rows = await testDb.select().from(schema.headcountPlans)
      .where(eq(schema.headcountPlans.workspaceId, TEST_WS_ID))
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('Data Analyst')
    expect(rows[0].createdBy).toBe(TEST_USER_ID)
  })

  it('returns 400 when title is missing', async () => {
    await seedWorkspace()
    const res = createRes()
    await listHandler(
      createReq({ method: 'POST', body: { targetQuarter: '2026-Q2' } }) as never,
      res as never,
    )
    expect(res._status).toBe(400)
  })

  it('returns 400 when targetQuarter is missing', async () => {
    await seedWorkspace()
    const res = createRes()
    await listHandler(
      createReq({ method: 'POST', body: { title: 'Engineer' } }) as never,
      res as never,
    )
    expect(res._status).toBe(400)
  })
})

describe('PUT /api/headcount/[id]', () => {
  it('updates plan title', async () => {
    await seedWorkspace()
    await seedHeadcountPlan()
    const res = createRes()
    await itemHandler(
      createReq({ method: 'PUT', query: { id: TEST_PLAN_ID }, body: { title: 'Lead Engineer' } }) as never,
      res as never,
    )
    expect(res._status).toBe(200)
    const body = res._body as { title: string }
    expect(body.title).toBe('Lead Engineer')
  })

  it('updates plan status to filled', async () => {
    await seedWorkspace()
    await seedHeadcountPlan()
    const res = createRes()
    await itemHandler(
      createReq({ method: 'PUT', query: { id: TEST_PLAN_ID }, body: { status: 'filled' } }) as never,
      res as never,
    )
    expect(res._status).toBe(200)
    const body = res._body as { status: string }
    expect(body.status).toBe('filled')
  })

  it('allows admin to approve a plan', async () => {
    await seedWorkspace()
    await seedHeadcountPlan()
    // Seed an admin member
    await testDb.insert(schema.workspaceMembers).values({
      id: 'wm-admin', workspaceId: TEST_WS_ID, userId: TEST_USER_ID,
      email: 'admin@example.com', permission: 'admin',
    })
    const res = createRes()
    await itemHandler(
      createReq({ method: 'PUT', query: { id: TEST_PLAN_ID }, body: { status: 'approved' } }) as never,
      res as never,
    )
    expect(res._status).toBe(200)
    const body = res._body as { status: string }
    expect(body.status).toBe('approved')
  })

  it('allows owner to approve a plan', async () => {
    await seedWorkspace()
    await seedHeadcountPlan()
    await testDb.insert(schema.workspaceMembers).values({
      id: 'wm-owner', workspaceId: TEST_WS_ID, userId: TEST_USER_ID,
      email: 'owner@example.com', permission: 'owner',
    })
    const res = createRes()
    await itemHandler(
      createReq({ method: 'PUT', query: { id: TEST_PLAN_ID }, body: { status: 'approved' } }) as never,
      res as never,
    )
    expect(res._status).toBe(200)
  })

  it('blocks editor from approving a plan (403)', async () => {
    await seedWorkspace()
    await seedHeadcountPlan()
    // Auth as a different user who is only an editor
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'u-editor', workspaceId: TEST_WS_ID })
    await testDb.insert(schema.workspaceMembers).values({
      id: 'wm-editor', workspaceId: TEST_WS_ID, userId: 'u-editor',
      email: 'editor@example.com', permission: 'editor',
    })
    const res = createRes()
    await itemHandler(
      createReq({ method: 'PUT', query: { id: TEST_PLAN_ID }, body: { status: 'approved' } }) as never,
      res as never,
    )
    expect(res._status).toBe(403)
  })

  it('blocks non-member from approving (403)', async () => {
    await seedWorkspace()
    await seedHeadcountPlan()
    // Auth as a user with no workspace_members row
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'u-stranger', workspaceId: TEST_WS_ID })
    const res = createRes()
    await itemHandler(
      createReq({ method: 'PUT', query: { id: TEST_PLAN_ID }, body: { status: 'approved' } }) as never,
      res as never,
    )
    expect(res._status).toBe(403)
  })

  it('returns 404 when plan does not exist', async () => {
    await seedWorkspace()
    const res = createRes()
    await itemHandler(
      createReq({ method: 'PUT', query: { id: 'nonexistent' }, body: { title: 'X' } }) as never,
      res as never,
    )
    expect(res._status).toBe(404)
  })

  it('cannot update a plan from another workspace', async () => {
    await seedWorkspace()
    await testDb.execute(
      `INSERT INTO workspaces (id, name, owner_id, owner_role, size) VALUES ('ws-other', 'Other', 'u-other', 'CTO', '1-10')`
    )
    await testDb.insert(schema.headcountPlans).values({
      id: 'plan-other', workspaceId: 'ws-other', title: 'Other Plan',
      roleType: 'new-headcount', targetQuarter: '2026-Q1', createdBy: 'u-other',
    })
    const res = createRes()
    await itemHandler(
      createReq({ method: 'PUT', query: { id: 'plan-other' }, body: { title: 'Hijacked' } }) as never,
      res as never,
    )
    expect(res._status).toBe(404)
  })
})

describe('DELETE /api/headcount/[id]', () => {
  it('deletes plan and returns 204', async () => {
    await seedWorkspace()
    await seedHeadcountPlan()
    const res = createRes()
    await itemHandler(
      createReq({ method: 'DELETE', query: { id: TEST_PLAN_ID } }) as never,
      res as never,
    )
    expect(res._status).toBe(204)
    expect(res._ended).toBe(true)
    const rows = await testDb.select().from(schema.headcountPlans)
      .where(eq(schema.headcountPlans.id, TEST_PLAN_ID))
    expect(rows).toHaveLength(0)
  })

  it('is idempotent — deleting a nonexistent plan returns 204', async () => {
    await seedWorkspace()
    const res = createRes()
    await itemHandler(
      createReq({ method: 'DELETE', query: { id: 'nonexistent' } }) as never,
      res as never,
    )
    expect(res._status).toBe(204)
  })

  it('returns 405 for unsupported methods', async () => {
    await seedWorkspace()
    const res = createRes()
    await itemHandler(
      createReq({ method: 'POST', query: { id: TEST_PLAN_ID } }) as never,
      res as never,
    )
    expect(res._status).toBe(405)
  })
})
