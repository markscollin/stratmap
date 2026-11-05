// Roadmap 1.1 against a real Neon database: create → preview → accept → reuse
// blocked, plus resend/revoke, through the real handlers on the neon-http driver.
// Run: DATABASE_URL=<dev branch url> npm run test:live
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest'

vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))
vi.mock('../_lib/email', async (orig) => ({
  ...(await orig<typeof import('../_lib/email')>()),
  sendWorkspaceInvite: vi.fn().mockResolvedValue({ sent: false, skipped: true }),
}))
vi.mock('../_lib/identity', () => ({ getUserIdentity: vi.fn() }))

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, like } from 'drizzle-orm'
import { requireAuth, requireUser } from '../_lib/auth'
import { sendWorkspaceInvite } from '../_lib/email'
import { getUserIdentity } from '../_lib/identity'
import { db } from '../_lib/db'
import * as schema from '../../src/lib/db/schema'
import invitesHandler from '../workspace/invites'
import inviteItemHandler from '../workspace/invites/[id]'
import previewHandler from '../invites/[token]'
import acceptHandler from '../invites/accept'
import { createReq } from '../__tests__/helpers/req'
import { createRes, type MockRes } from '../__tests__/helpers/res'

type Handler = (req: VercelRequest, res: VercelResponse) => unknown

const RUN = `live-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const WS = `ws-${RUN}`
const OWNER = `u-owner-${RUN}`
const INVITEE = `u-invitee-${RUN}`
const EMAIL = `invitee-${RUN}@example.test`

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for live tests')
if (process.env.VERCEL_ENV === 'production') throw new Error('Refusing to run live tests against production')

async function call(handler: Handler, opts: Parameters<typeof createReq>[0]): Promise<MockRes> {
  const res = createRes()
  await handler(createReq(opts) as never, res as never)
  return res
}

function lastToken(): string {
  const calls = vi.mocked(sendWorkspaceInvite).mock.calls
  return calls[calls.length - 1][0].inviteUrl.split('/invite/')[1]
}

beforeAll(async () => {
  await db.insert(schema.workspaces).values({ id: WS, name: `Live ${RUN}`, ownerId: OWNER, ownerRole: 'Founder/CEO', size: '1-10', planTier: 'growth' })
  await db.insert(schema.workspaceMembers).values({ id: `wm-${RUN}`, workspaceId: WS, userId: OWNER, email: `owner-${RUN}@example.test`, name: 'Owner', permission: 'owner' })
  vi.mocked(requireAuth).mockResolvedValue({ userId: OWNER, workspaceId: WS })
  vi.mocked(requireUser).mockResolvedValue({ userId: INVITEE })
  vi.mocked(getUserIdentity).mockResolvedValue({ emails: [EMAIL], name: 'Invitee', avatarUrl: null })
})

afterAll(async () => {
  await db.delete(schema.workspaces).where(eq(schema.workspaces.id, WS)) // cascades members + invites
  await db.delete(schema.rateLimits).where(like(schema.rateLimits.key, `%${RUN}%`))
})

describe('invite lifecycle on Neon', () => {
  it('create → resend (old link dies) → preview → accept → link cannot be reused', async () => {
    const created = await call(invitesHandler, { method: 'POST', body: { invites: [{ email: EMAIL, permission: 'commenter' }] } })
    expect(created._status).toBe(201)
    const id = (created._body as { invites: { id: string }[] }).invites[0].id
    const firstToken = lastToken()

    expect((await call(inviteItemHandler, { method: 'POST', query: { id } }))._status).toBe(200)
    const token = lastToken()
    expect(token).not.toBe(firstToken)
    expect((await call(previewHandler, { method: 'GET', query: { token: firstToken }, headers: { 'x-forwarded-for': RUN } }))._status).toBe(404)

    const preview = await call(previewHandler, { method: 'GET', query: { token }, headers: { 'x-forwarded-for': RUN } })
    expect(preview._status).toBe(200)
    expect(preview._body).toMatchObject({ workspaceName: `Live ${RUN}`, inviterName: 'Owner', email: EMAIL, permission: 'commenter' })

    const accepted = await call(acceptHandler, { method: 'POST', body: { token } })
    expect(accepted._status).toBe(201)
    const [member] = await db.select().from(schema.workspaceMembers).where(eq(schema.workspaceMembers.userId, INVITEE))
    expect(member).toMatchObject({ workspaceId: WS, permission: 'commenter', email: EMAIL })

    expect((await call(acceptHandler, { method: 'POST', body: { token } }))._status).toBe(404) // consumed: single use
    const [left] = await db.select().from(schema.pendingInvites).where(eq(schema.pendingInvites.workspaceId, WS))
    expect(left).toBeUndefined()
  })

  it('revoke removes the invite', async () => {
    const created = await call(invitesHandler, { method: 'POST', body: { invites: [{ email: `other-${RUN}@example.test`, permission: 'viewer' }] } })
    const id = (created._body as { invites: { id: string }[] }).invites[0].id
    expect((await call(inviteItemHandler, { method: 'DELETE', query: { id } }))._status).toBe(204)
    expect(await db.select().from(schema.pendingInvites).where(eq(schema.pendingInvites.id, id))).toHaveLength(0)
  })
})
