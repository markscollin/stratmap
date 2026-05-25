import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})

vi.mock('../_lib/auth', () => ({
  requireAuth: vi.fn(),
  requireUser: vi.fn(),
}))

vi.mock('../_lib/email', () => ({
  sendWorkspaceInvite: vi.fn().mockResolvedValue({ sent: false, skipped: true }),
}))

import { requireAuth } from '../_lib/auth'
import { sendWorkspaceInvite } from '../_lib/email'
import handler from '../workspace/invites'
import { setupSchema, cleanDb, seedWorkspace, testDb, TEST_USER_ID, TEST_WS_ID } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'
import { eq } from 'drizzle-orm'

beforeAll(async () => { await setupSchema() })

beforeEach(async () => {
  await cleanDb()
  await seedWorkspace()
  vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
  vi.mocked(sendWorkspaceInvite).mockClear()
})

describe('POST /api/workspace/invites', () => {
  it('returns 405 for non-POST methods', async () => {
    const res = createRes()
    await handler(createReq({ method: 'GET' }) as never, res as never)
    expect(res._status).toBe(405)
  })

  it('returns 400 when invites array is missing or empty', async () => {
    const res = createRes()
    await handler(createReq({ method: 'POST', body: { invites: [] } }) as never, res as never)
    expect(res._status).toBe(400)
  })

  it('persists pending invites and sends one email per filled invite', async () => {
    const res = createRes()
    await handler(
      createReq({ method: 'POST', body: { invites: [
        { email: 'alice@co.com', permission: 'editor' },
        { email: 'bob@co.com', permission: 'admin' },
      ] } }) as never,
      res as never,
    )

    expect(res._status).toBe(201)
    const rows = await testDb.select().from(schema.pendingInvites).where(eq(schema.pendingInvites.workspaceId, TEST_WS_ID))
    expect(rows).toHaveLength(2)
    expect(rows.map(r => r.email).sort()).toEqual(['alice@co.com', 'bob@co.com'])
    expect(sendWorkspaceInvite).toHaveBeenCalledTimes(2)
  })

  it('skips empty emails and defaults invalid permissions to editor', async () => {
    const res = createRes()
    await handler(
      createReq({ method: 'POST', body: { invites: [
        { email: '  ', permission: 'editor' },
        { email: 'carol@co.com', permission: 'not-a-role' },
      ] } }) as never,
      res as never,
    )

    expect(res._status).toBe(201)
    const rows = await testDb.select().from(schema.pendingInvites).where(eq(schema.pendingInvites.workspaceId, TEST_WS_ID))
    expect(rows).toHaveLength(1)
    expect(rows[0].email).toBe('carol@co.com')
    expect(rows[0].permission).toBe('editor')
    expect(sendWorkspaceInvite).toHaveBeenCalledTimes(1)
  })
})
