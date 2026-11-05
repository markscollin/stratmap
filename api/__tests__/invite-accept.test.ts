// Roadmap 1.1: invite links (single-use, expiring, hashed at rest), the public
// preview, acceptance (verified-email match, no escalation, no reuse), revoke
// and resend.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))
vi.mock('../_lib/email', async (orig) => ({
  ...(await orig<typeof import('../_lib/email')>()),
  sendWorkspaceInvite: vi.fn().mockResolvedValue({ sent: false, skipped: true }),
}))
vi.mock('../_lib/identity', () => ({ getUserIdentity: vi.fn() }))

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { requireAuth, requireUser } from '../_lib/auth'
import { sendWorkspaceInvite, escapeHtml } from '../_lib/email'
import { getUserIdentity } from '../_lib/identity'
import { hashInviteToken } from '../_lib/inviteTokens'
import invitesHandler from '../workspace/invites'
import inviteItemHandler from '../workspace/invites/[id]'
import previewHandler from '../invites/[token]'
import acceptHandler from '../invites/accept'
import workspaceHandler from '../workspace'
import { setupSchema, cleanDb, seedWorkspace, seedMember, testDb, TEST_USER_ID, TEST_WS_ID } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes, type MockRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'

type Handler = (req: VercelRequest, res: VercelResponse) => unknown
const INVITEE = 'u-invitee'
const OTHER_WS = 'ws-other'

async function call(handler: Handler, opts: Parameters<typeof createReq>[0]): Promise<MockRes> {
  const res = createRes()
  await handler(createReq(opts) as never, res as never)
  return res
}

/** Creates an invite as the owner and returns the raw token from the emailed link. */
async function invite(email = 'new@co.com', permission = 'editor'): Promise<{ token: string; id: string }> {
  vi.mocked(sendWorkspaceInvite).mockClear()
  const res = await call(invitesHandler, { method: 'POST', body: { invites: [{ email, permission }] } })
  expect(res._status).toBe(201)
  const url = vi.mocked(sendWorkspaceInvite).mock.calls[0][0].inviteUrl
  const token = url.split('/invite/')[1]
  return { token, id: (res._body as { invites: { id: string }[] }).invites[0].id }
}

function signInAs(userId: string, emails: string[]) {
  vi.mocked(requireUser).mockResolvedValue({ userId })
  vi.mocked(getUserIdentity).mockResolvedValue({ emails, name: 'New Person', avatarUrl: null })
}

async function memberOf(userId: string) {
  return testDb.select().from(schema.workspaceMembers).where(eq(schema.workspaceMembers.userId, userId))
}

beforeAll(async () => { await setupSchema() })

beforeEach(async () => {
  await cleanDb()
  await seedWorkspace()  // u-test is owner of ws-test (free plan)
  await testDb.update(schema.workspaces).set({ planTier: 'growth' })
  vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
})

describe('creating invites', () => {
  it('emails a single-use /invite/<token> link and stores only its hash, with a 7-day expiry', async () => {
    const { token, id } = await invite()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)

    const [row] = await testDb.select().from(schema.pendingInvites).where(eq(schema.pendingInvites.id, id))
    expect(row.tokenHash).toBe(hashInviteToken(token))
    expect(JSON.stringify(row)).not.toContain(token)
    expect(row.invitedBy).toBe(TEST_USER_ID)
    const days = (row.expiresAt!.getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(6.9)
    expect(days).toBeLessThanOrEqual(7)
  })

  it('never returns the token or its hash to the client', async () => {
    const res = await call(invitesHandler, { method: 'POST', body: { invites: [{ email: 'a@co.com', permission: 'viewer' }] } })
    expect(res._body).not.toHaveProperty('invites.0.tokenHash')
    const list = await call(invitesHandler, { method: 'GET' })
    expect(list._status).toBe(200)
    const rows = (list._body as { invites: Record<string, unknown>[] }).invites
    expect(rows).toHaveLength(1)
    expect(rows[0]).not.toHaveProperty('tokenHash')
    expect(rows[0]).toMatchObject({ email: 'a@co.com', permission: 'viewer', expired: false })
  })

  it('only admins can list invites', async () => {
    await seedMember('u-ed', 'editor')
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'u-ed', workspaceId: TEST_WS_ID })
    expect((await call(invitesHandler, { method: 'GET' }))._status).toBe(403)
  })

  it('expired invites stop counting against the seat limit', async () => {
    await testDb.update(schema.workspaces).set({ planTier: 'free' }) // 3 seats, owner uses 1
    await invite('a@co.com')
    await invite('b@co.com')
    expect((await call(invitesHandler, { method: 'POST', body: { invites: [{ email: 'c@co.com' }] } }))._status).toBe(402)
    await testDb.update(schema.pendingInvites).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.pendingInvites.email, 'a@co.com'))
    expect((await call(invitesHandler, { method: 'POST', body: { invites: [{ email: 'c@co.com' }] } }))._status).toBe(201)
  })

  it('escapes workspace and inviter names in the email HTML', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)> & "q"')).toBe('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot;')
  })
})

describe('public invite preview', () => {
  it('shows workspace, inviter, email and role for a valid token', async () => {
    const { token } = await invite('new@co.com', 'commenter')
    const res = await call(previewHandler, { method: 'GET', query: { token } })
    expect(res._status).toBe(200)
    expect(res._body).toMatchObject({ workspaceName: 'Test Workspace', email: 'new@co.com', permission: 'commenter' })
  })

  it('404 for unknown or malformed tokens, 410 once expired', async () => {
    expect((await call(previewHandler, { method: 'GET', query: { token: 'x'.repeat(43) } }))._status).toBe(404)
    expect((await call(previewHandler, { method: 'GET', query: { token: "' OR 1=1" } }))._status).toBe(404)
    const { token, id } = await invite()
    await testDb.update(schema.pendingInvites).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.pendingInvites.id, id))
    expect((await call(previewHandler, { method: 'GET', query: { token } }))._status).toBe(410)
  })
})

describe('accepting an invite', () => {
  it('joins the workspace with the invited role and consumes the invite', async () => {
    const { token } = await invite('new@co.com', 'commenter')
    signInAs(INVITEE, ['new@co.com'])

    const res = await call(acceptHandler, { method: 'POST', body: { token } })
    expect(res._status).toBe(201)
    expect(res._body).toMatchObject({ workspaceId: TEST_WS_ID, permission: 'commenter' })

    const [m] = await memberOf(INVITEE)
    expect(m).toMatchObject({ workspaceId: TEST_WS_ID, permission: 'commenter', email: 'new@co.com', name: 'New Person' })
    expect(await testDb.select().from(schema.pendingInvites)).toHaveLength(0)
  })

  it('a link cannot be used twice', async () => {
    const { token } = await invite('new@co.com')
    signInAs(INVITEE, ['new@co.com'])
    expect((await call(acceptHandler, { method: 'POST', body: { token } }))._status).toBe(201)
    signInAs('u-second', ['new@co.com'])
    expect((await call(acceptHandler, { method: 'POST', body: { token } }))._status).toBe(404)
    expect(await memberOf('u-second')).toHaveLength(0)
  })

  it('rejects a user whose verified emails do not include the invited address', async () => {
    const { token } = await invite('new@co.com')
    signInAs(INVITEE, ['someone-else@co.com'])
    const res = await call(acceptHandler, { method: 'POST', body: { token } })
    expect(res._status).toBe(403)
    expect(res._body).toMatchObject({ error: 'invite-email-mismatch', email: 'new@co.com' })
    expect(await memberOf(INVITEE)).toHaveLength(0)
  })

  it('rejects an expired invite', async () => {
    const { token, id } = await invite()
    await testDb.update(schema.pendingInvites).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.pendingInvites.id, id))
    signInAs(INVITEE, ['new@co.com'])
    expect((await call(acceptHandler, { method: 'POST', body: { token } }))._status).toBe(410)
  })

  it('rejects malformed tokens with 400', async () => {
    signInAs(INVITEE, ['new@co.com'])
    expect((await call(acceptHandler, { method: 'POST', body: { token: 'short' } }))._status).toBe(400)
  })

  it('without a token, accepts the pending invite matching a verified email (sign-in auto-match)', async () => {
    await invite('new@co.com', 'viewer')
    signInAs(INVITEE, ['NEW@co.com'.toLowerCase()])
    const res = await call(acceptHandler, { method: 'POST', body: {} })
    expect(res._status).toBe(201)
    expect((await memberOf(INVITEE))[0].permission).toBe('viewer')
  })

  it('auto-match also accepts legacy invites that have no token or expiry', async () => {
    await testDb.insert(schema.pendingInvites).values({ id: 'legacy', workspaceId: TEST_WS_ID, email: 'old@co.com', permission: 'editor' })
    signInAs(INVITEE, ['old@co.com'])
    expect((await call(acceptHandler, { method: 'POST', body: {} }))._status).toBe(201)
  })

  it('without a token and with no matching invite → 404 no-invite (client goes to onboarding)', async () => {
    signInAs(INVITEE, ['nobody@co.com'])
    const res = await call(acceptHandler, { method: 'POST', body: {} })
    expect(res._status).toBe(404)
    expect(res._body).toMatchObject({ error: 'no-invite' })
  })

  it('auto-match skips expired invites', async () => {
    const { id } = await invite('new@co.com')
    await testDb.update(schema.pendingInvites).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.pendingInvites.id, id))
    signInAs(INVITEE, ['new@co.com'])
    expect((await call(acceptHandler, { method: 'POST', body: {} }))._status).toBe(404)
  })

  it('an existing member of the same workspace just clears the invite', async () => {
    await seedMember(INVITEE, 'viewer')
    const { token } = await invite('new@co.com', 'editor')
    signInAs(INVITEE, ['new@co.com'])
    const res = await call(acceptHandler, { method: 'POST', body: { token } })
    expect(res._status).toBe(200)
    expect(res._body).toMatchObject({ alreadyMember: true, permission: 'viewer' }) // no upgrade via invite
    expect(await testDb.select().from(schema.pendingInvites)).toHaveLength(0)
  })

  it('a member of another workspace gets 409 and the invite is kept', async () => {
    await testDb.insert(schema.workspaces).values({ id: OTHER_WS, name: 'Other', ownerId: INVITEE, ownerRole: 'Founder/CEO', size: '1-10' })
    await testDb.insert(schema.workspaceMembers).values({ id: 'wm-x', workspaceId: OTHER_WS, userId: INVITEE, email: 'new@co.com', permission: 'owner' })
    const { token } = await invite('new@co.com')
    signInAs(INVITEE, ['new@co.com'])
    expect((await call(acceptHandler, { method: 'POST', body: { token } }))._status).toBe(409)
    expect(await testDb.select().from(schema.pendingInvites)).toHaveLength(1)
  })

  it('after accepting, GET /api/workspace reports the invited role (not owner)', async () => {
    const { token } = await invite('new@co.com', 'editor')
    signInAs(INVITEE, ['new@co.com'])
    await call(acceptHandler, { method: 'POST', body: { token } })
    vi.mocked(requireAuth).mockResolvedValue({ userId: INVITEE, workspaceId: TEST_WS_ID })
    const res = await call(workspaceHandler, { method: 'GET' })
    expect(res._body).toMatchObject({ id: TEST_WS_ID, myPermission: 'editor' })
  })
})

describe('revoking and resending', () => {
  it('a revoked link no longer works', async () => {
    const { token, id } = await invite()
    expect((await call(inviteItemHandler, { method: 'DELETE', query: { id } }))._status).toBe(204)
    signInAs(INVITEE, ['new@co.com'])
    expect((await call(acceptHandler, { method: 'POST', body: { token } }))._status).toBe(404)
  })

  it('resend rotates the token (old link dies, new one works) and resets the expiry', async () => {
    const { token: oldToken, id } = await invite()
    await testDb.update(schema.pendingInvites).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.pendingInvites.id, id))

    vi.mocked(sendWorkspaceInvite).mockClear()
    const res = await call(inviteItemHandler, { method: 'POST', query: { id } })
    expect(res._status).toBe(200)
    expect(res._body).toMatchObject({ expired: false })
    const newToken = vi.mocked(sendWorkspaceInvite).mock.calls[0][0].inviteUrl.split('/invite/')[1]
    expect(newToken).not.toBe(oldToken)

    signInAs(INVITEE, ['new@co.com'])
    expect((await call(acceptHandler, { method: 'POST', body: { token: oldToken } }))._status).toBe(404)
    expect((await call(acceptHandler, { method: 'POST', body: { token: newToken } }))._status).toBe(201)
  })

  it('admins cannot revoke or resend invites for admins; editors cannot manage invites at all', async () => {
    const { id } = await invite('boss@co.com', 'admin') // owner invites an admin
    await seedMember('u-admin', 'admin')
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'u-admin', workspaceId: TEST_WS_ID })
    expect((await call(inviteItemHandler, { method: 'DELETE', query: { id } }))._status).toBe(403)
    expect((await call(inviteItemHandler, { method: 'POST', query: { id } }))._status).toBe(403)

    await seedMember('u-ed', 'editor')
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'u-ed', workspaceId: TEST_WS_ID })
    expect((await call(inviteItemHandler, { method: 'DELETE', query: { id } }))._status).toBe(403)
  })

  it('cannot touch another workspace\'s invite', async () => {
    await testDb.insert(schema.workspaces).values({ id: OTHER_WS, name: 'Other', ownerId: 'u-o', ownerRole: 'Founder/CEO', size: '1-10' })
    await testDb.insert(schema.pendingInvites).values({ id: 'foreign', workspaceId: OTHER_WS, email: 'x@co.com', permission: 'viewer' })
    expect((await call(inviteItemHandler, { method: 'DELETE', query: { id: 'foreign' } }))._status).toBe(404)
    expect(await testDb.select().from(schema.pendingInvites)).toHaveLength(1)
  })
})
