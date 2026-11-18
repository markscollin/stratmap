// Ownership transfer: owner-only, to an admin, one owned workspace per person, atomic, audited.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, and } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import handler from '../workspace/transfer-ownership'
import leaveHandler from '../workspace/leave'
import { setupSchema, cleanDb, seedWorkspace, seedMember, testDb, TEST_USER_ID, TEST_WS_ID } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes, type MockRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'

type Handler = (req: VercelRequest, res: VercelResponse) => unknown
async function call(h: Handler, opts: Parameters<typeof createReq>[0]): Promise<MockRes> {
  const res = createRes()
  await h(createReq(opts) as never, res as never)
  return res
}
const as = (userId: string) => vi.mocked(requireAuth).mockResolvedValue({ userId, workspaceId: TEST_WS_ID })
const transfer = (userId: string, confirmName = 'Test Workspace') => call(handler, { method: 'POST', body: { userId, confirmName } })
const permissionOf = async (userId: string) =>
  (await testDb.select().from(schema.workspaceMembers).where(and(eq(schema.workspaceMembers.workspaceId, TEST_WS_ID), eq(schema.workspaceMembers.userId, userId))))[0]?.permission
const ownerId = async () => (await testDb.select().from(schema.workspaces).where(eq(schema.workspaces.id, TEST_WS_ID)))[0].ownerId

beforeAll(async () => { await setupSchema() })
beforeEach(async () => {
  await cleanDb()
  await seedWorkspace() // u-test owns it
  await seedMember('u-ad', 'admin', 'ad@co.com')
  await seedMember('u-ad2', 'admin', 'ad2@co.com')
  await seedMember('u-ed', 'editor', 'ed@co.com')
  as(TEST_USER_ID)
})

describe('POST /api/workspace/transfer-ownership', () => {
  it('hands the workspace to an admin; the old owner becomes an admin; one audit entry; the old owner may now leave', async () => {
    const res = await transfer('u-ad')
    expect(res._status).toBe(200)
    expect(await ownerId()).toBe('u-ad')
    expect(await permissionOf('u-ad')).toBe('owner')
    expect(await permissionOf(TEST_USER_ID)).toBe('admin')
    const log = await testDb.select().from(schema.auditLog).where(eq(schema.auditLog.action, 'workspace.ownership_transferred'))
    expect(log).toHaveLength(1)
    expect(log[0].actorUserId).toBe(TEST_USER_ID)
    expect(log[0].targetId).toBe('u-ad')
    // the former owner is now an ordinary admin: leaving works
    as(TEST_USER_ID)
    expect((await call(leaveHandler, { method: 'POST' }))._status).toBe(204)
  })

  it('only the owner can transfer', async () => {
    as('u-ad')
    expect((await transfer('u-ad2'))._status).toBe(403)
    expect(await ownerId()).toBe(TEST_USER_ID)
  })

  it('needs the workspace name typed exactly', async () => {
    const res = await transfer('u-ad', 'test workspace')
    expect(res._status).toBe(400)
    expect((res._body as { error: string }).error).toBe('confirm-name-mismatch')
    expect(await ownerId()).toBe(TEST_USER_ID)
  })

  it('the new owner must already be an admin, a member, and not yourself', async () => {
    expect(((await transfer('u-ed'))._body as { error: string }).error).toBe('target-not-admin')
    expect((await transfer('u-nobody'))._status).toBe(404)
    expect(((await transfer(TEST_USER_ID))._body as { error: string }).error).toBe('already-owner')
    expect(await ownerId()).toBe(TEST_USER_ID)
  })

  it('refuses someone who already owns another live workspace, but not one who only owns a deleted one', async () => {
    await testDb.insert(schema.workspaces).values({ id: 'ws-other', name: 'Other', ownerId: 'u-ad', ownerRole: 'CEO', size: '1-10' })
    const refused = await transfer('u-ad')
    expect(refused._status).toBe(409)
    expect((refused._body as { error: string }).error).toBe('owns-another-workspace')
    expect(await ownerId()).toBe(TEST_USER_ID)
    await testDb.update(schema.workspaces).set({ deletedAt: new Date(), deletedBy: 'u-ad' }).where(eq(schema.workspaces.id, 'ws-other'))
    expect((await transfer('u-ad'))._status).toBe(200)
  })

  it('two transfers made together leave exactly one owner', async () => {
    await Promise.all([transfer('u-ad'), transfer('u-ad2')])
    const members = await testDb.select().from(schema.workspaceMembers).where(eq(schema.workspaceMembers.workspaceId, TEST_WS_ID))
    const owners = members.filter(m => m.permission === 'owner')
    expect(owners).toHaveLength(1)
    expect(owners[0].userId).toBe(await ownerId())
  })

  it('the old owner cannot transfer again after handing over', async () => {
    await transfer('u-ad')
    as(TEST_USER_ID)
    expect((await transfer('u-ad2'))._status).toBe(403)
  })
})
