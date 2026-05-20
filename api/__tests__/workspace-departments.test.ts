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
import listHandler from '../workspace/departments'
import itemHandler from '../workspace/departments/[id]'
import {
  setupSchema, cleanDb, seedWorkspace, seedWorkspaceDept, testDb,
  TEST_USER_ID, TEST_WS_ID, TEST_DEPT_ID,
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

describe('GET /api/workspace/departments', () => {
  it('returns empty array when no departments exist', async () => {
    await seedWorkspace()
    const res = createRes()
    await listHandler(createReq() as never, res as never)
    expect(res._status).toBe(200)
    expect(res._body).toEqual([])
  })

  it('returns workspace departments', async () => {
    await seedWorkspace()
    await seedWorkspaceDept()
    const res = createRes()
    await listHandler(createReq() as never, res as never)
    expect(res._status).toBe(200)
    const body = res._body as { id: string; name: string; colour: string }[]
    expect(body).toHaveLength(1)
    expect(body[0].name).toBe('Engineering')
    expect(body[0].colour).toBe('#0EA5E9')
  })

  it('only returns departments from the authed workspace', async () => {
    await seedWorkspace()
    await seedWorkspaceDept()
    // Insert a dept for a different workspace (bypass FK for isolation)
    await testDb.execute(
      `INSERT INTO workspaces (id, name, owner_id, owner_role, size) VALUES ('ws-other', 'Other', 'u-other', 'CTO', '1-10')`
    )
    await testDb.insert(schema.workspaceDepartments).values({
      id: 'dept-other', workspaceId: 'ws-other', name: 'HR', colour: '#FF0000',
    })
    const res = createRes()
    await listHandler(createReq() as never, res as never)
    const body = res._body as { id: string }[]
    expect(body.every(d => d.id !== 'dept-other')).toBe(true)
  })

  it('returns 405 for unsupported methods', async () => {
    await seedWorkspace()
    const res = createRes()
    await listHandler(createReq({ method: 'DELETE' }) as never, res as never)
    expect(res._status).toBe(405)
  })
})

describe('POST /api/workspace/departments', () => {
  it('creates a department and returns 201', async () => {
    await seedWorkspace()
    const res = createRes()
    await listHandler(
      createReq({ method: 'POST', body: { name: 'Product', colour: '#10B981' } }) as never,
      res as never,
    )
    expect(res._status).toBe(201)
    const body = res._body as { name: string; colour: string; workspaceId: string }
    expect(body.name).toBe('Product')
    expect(body.colour).toBe('#10B981')
    expect(body.workspaceId).toBe(TEST_WS_ID)
  })

  it('persists the new department to the database', async () => {
    await seedWorkspace()
    const res = createRes()
    await listHandler(
      createReq({ method: 'POST', body: { name: 'Design', colour: '#8B5CF6' } }) as never,
      res as never,
    )
    const rows = await testDb.select().from(schema.workspaceDepartments)
      .where(eq(schema.workspaceDepartments.workspaceId, TEST_WS_ID))
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Design')
  })

  it('returns 400 when name is missing', async () => {
    await seedWorkspace()
    const res = createRes()
    await listHandler(
      createReq({ method: 'POST', body: { colour: '#FF0000' } }) as never,
      res as never,
    )
    expect(res._status).toBe(400)
  })

  it('returns 400 when colour is missing', async () => {
    await seedWorkspace()
    const res = createRes()
    await listHandler(
      createReq({ method: 'POST', body: { name: 'Finance' } }) as never,
      res as never,
    )
    expect(res._status).toBe(400)
  })
})

describe('PUT /api/workspace/departments/[id]', () => {
  it('updates the department name', async () => {
    await seedWorkspace()
    await seedWorkspaceDept()
    const res = createRes()
    await itemHandler(
      createReq({ method: 'PUT', query: { id: TEST_DEPT_ID }, body: { name: 'Platform' } }) as never,
      res as never,
    )
    expect(res._status).toBe(200)
    const body = res._body as { name: string }
    expect(body.name).toBe('Platform')
  })

  it('updates the department colour', async () => {
    await seedWorkspace()
    await seedWorkspaceDept()
    const res = createRes()
    await itemHandler(
      createReq({ method: 'PUT', query: { id: TEST_DEPT_ID }, body: { colour: '#EF4444' } }) as never,
      res as never,
    )
    expect(res._status).toBe(200)
    const body = res._body as { colour: string }
    expect(body.colour).toBe('#EF4444')
  })

  it('returns 404 when department does not exist', async () => {
    await seedWorkspace()
    const res = createRes()
    await itemHandler(
      createReq({ method: 'PUT', query: { id: 'nonexistent' }, body: { name: 'X' } }) as never,
      res as never,
    )
    expect(res._status).toBe(404)
  })

  it('cannot update a department from another workspace', async () => {
    await seedWorkspace()
    await testDb.execute(
      `INSERT INTO workspaces (id, name, owner_id, owner_role, size) VALUES ('ws-other', 'Other', 'u-other', 'CTO', '1-10')`
    )
    await testDb.insert(schema.workspaceDepartments).values({
      id: 'dept-other', workspaceId: 'ws-other', name: 'HR', colour: '#FF0000',
    })
    const res = createRes()
    await itemHandler(
      createReq({ method: 'PUT', query: { id: 'dept-other' }, body: { name: 'Hijacked' } }) as never,
      res as never,
    )
    expect(res._status).toBe(404)
  })
})

describe('DELETE /api/workspace/departments/[id]', () => {
  it('deletes the department and returns 204', async () => {
    await seedWorkspace()
    await seedWorkspaceDept()
    const res = createRes()
    await itemHandler(
      createReq({ method: 'DELETE', query: { id: TEST_DEPT_ID } }) as never,
      res as never,
    )
    expect(res._status).toBe(204)
    expect(res._ended).toBe(true)
    const rows = await testDb.select().from(schema.workspaceDepartments)
      .where(eq(schema.workspaceDepartments.id, TEST_DEPT_ID))
    expect(rows).toHaveLength(0)
  })

  it('is idempotent — deleting a nonexistent dept returns 204', async () => {
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
      createReq({ method: 'POST', query: { id: TEST_DEPT_ID } }) as never,
      res as never,
    )
    expect(res._status).toBe(405)
  })
})
