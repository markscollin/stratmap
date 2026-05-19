import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})

vi.mock('../_lib/auth', () => ({
  requireAuth: vi.fn(),
  requireUser: vi.fn(),
}))

import { requireAuth, requireUser } from '../_lib/auth'
import handler from '../workspace'
import { setupSchema, cleanDb, seedWorkspace, testDb, TEST_USER_ID, TEST_WS_ID } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'
import { eq } from 'drizzle-orm'

beforeAll(async () => { await setupSchema() })

beforeEach(async () => {
  await cleanDb()
  vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
  vi.mocked(requireUser).mockResolvedValue({ userId: TEST_USER_ID })
})

describe('GET /api/workspace', () => {
  it('returns workspace with members', async () => {
    await seedWorkspace()
    const res = createRes()
    await handler(createReq() as never, res as never)
    expect(res._status).toBe(200)
    const body = res._body as { id: string; members: unknown[] }
    expect(body.id).toBe(TEST_WS_ID)
    expect(body.members).toHaveLength(1)
  })

  it('returns 404 when workspace does not exist', async () => {
    const res = createRes()
    await handler(createReq() as never, res as never)
    expect(res._status).toBe(404)
  })

  it('returns 405 for unsupported methods', async () => {
    await seedWorkspace()
    const res = createRes()
    await handler(createReq({ method: 'DELETE' }) as never, res as never)
    expect(res._status).toBe(405)
  })
})

describe('POST /api/workspace', () => {
  it('creates a workspace and returns 201', async () => {
    const res = createRes()
    await handler(
      createReq({ method: 'POST', body: { name: 'Acme', ownerRole: 'Founder/CEO', size: '11-50' } }) as never,
      res as never,
    )
    expect(res._status).toBe(201)
    const body = res._body as { name: string }
    expect(body.name).toBe('Acme')
  })

  it('seeds the owner as a workspace member', async () => {
    const res = createRes()
    await handler(
      createReq({ method: 'POST', body: { name: 'Acme', ownerRole: 'Founder/CEO', size: '11-50' } }) as never,
      res as never,
    )
    const members = await testDb.select().from(schema.workspaceMembers).where(eq(schema.workspaceMembers.userId, TEST_USER_ID))
    expect(members).toHaveLength(1)
    expect(members[0].permission).toBe('owner')
  })

  it('returns 400 when required fields are missing', async () => {
    const res = createRes()
    await handler(
      createReq({ method: 'POST', body: { name: 'Acme' } }) as never,
      res as never,
    )
    expect(res._status).toBe(400)
  })

  it('is idempotent — returns existing workspace when user already has one', async () => {
    await seedWorkspace()
    const res = createRes()
    await handler(
      createReq({ method: 'POST', body: { name: 'Another', ownerRole: 'Founder/CEO', size: '1-10' } }) as never,
      res as never,
    )
    // Returns 200 (not 201) with the original workspace
    expect(res._status).toBe(200)
    const body = res._body as { name: string }
    expect(body.name).toBe('Test Workspace')
  })
})
