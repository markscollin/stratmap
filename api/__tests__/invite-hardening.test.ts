// R-33: invites cannot be used to relay text from our domain, and a departed inviter's links die with their membership.
import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import * as emailModule from '../_lib/email'
import invitesHandler, { INVITE_REQUESTS_PER_HOUR_FREE, INVITE_REQUESTS_PER_HOUR } from '../workspace/invites'
import memberHandler from '../workspace/members/[userId]'
import leaveHandler from '../workspace/leave'
import { setupSchema, cleanDb, seedWorkspace, seedMember, testDb, TEST_USER_ID, TEST_WS_ID } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes, type MockRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'

type Handler = (req: VercelRequest, res: VercelResponse) => unknown
async function call(handler: Handler, opts: Parameters<typeof createReq>[0]): Promise<MockRes> {
  const res = createRes()
  await handler(createReq(opts) as never, res as never)
  return res
}
const as = (userId: string) => vi.mocked(requireAuth).mockResolvedValue({ userId, workspaceId: TEST_WS_ID })
const invite = (email: string) => call(invitesHandler, { method: 'POST', body: { invites: [{ email, permission: 'viewer' }] } })
const invitesLeft = async () => testDb.select().from(schema.pendingInvites).where(eq(schema.pendingInvites.workspaceId, TEST_WS_ID))

beforeAll(async () => { await setupSchema() })
beforeEach(async () => {
  await cleanDb()
  await seedWorkspace() // u-test owns it, Free plan
  as(TEST_USER_ID)
})
afterEach(() => { vi.restoreAllMocks() })

const sentMail = vi.hoisted(() => [] as { to: string; subject: string; html: string }[])
vi.mock('resend', () => ({
  Resend: class { emails = { send: async (m: { to: string; subject: string; html: string }) => { sentMail.push(m); return { data: { id: 'x' }, error: null } } } },
}))

describe('invite email subject', () => {
  it('carries no text chosen by the inviter or the workspace, which still appear escaped in the body', async () => {
    process.env.RESEND_API_KEY = 'test'
    sentMail.length = 0
    try {
      await emailModule.sendWorkspaceInvite({
        to: 'victim@example.com', workspaceName: 'URGENT: verify <b>your</b> bank login', inviterName: 'Your Bank Security', inviteUrl: 'https://app.test/invite/abc',
      })
    } finally { delete process.env.RESEND_API_KEY }
    expect(sentMail).toHaveLength(1)
    expect(sentMail[0].subject).toBe("You've been invited to a workspace on StratMap")
    expect(sentMail[0].subject).not.toMatch(/bank|URGENT/i)
    expect(sentMail[0].html).toContain('Your Bank Security')
    expect(sentMail[0].html).toContain('&lt;b&gt;your&lt;/b&gt;')
  })

  it('source never builds the subject from the names', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../_lib/email.ts', import.meta.url), 'utf8')
    const fn = src.slice(src.indexOf('export async function sendWorkspaceInvite'), src.indexOf('/** Sent to workspace admins'))
    const subjectLine = fn.split('\n').find(l => l.includes('const subject'))!
    expect(subjectLine).not.toMatch(/\$\{/)
  })

  it('the unwired, unescaped billing receipt sender is gone', () => {
    expect((emailModule as Record<string, unknown>).sendBillingReceipt).toBeUndefined()
  })
})

describe('hourly invite allowance', () => {
  it('is lower on Free than on a paid plan', async () => {
    expect(INVITE_REQUESTS_PER_HOUR_FREE).toBeLessThan(INVITE_REQUESTS_PER_HOUR)
    const statuses: number[] = []
    for (let i = 0; i < INVITE_REQUESTS_PER_HOUR_FREE + 1; i++) {
      const res = await invite(`n${i}@co.com`)
      statuses.push(res._status)
      // Free has 3 seats, so free the seats again to keep the seat cap out of the way of this check.
      await testDb.delete(schema.pendingInvites)
    }
    expect(statuses.slice(0, INVITE_REQUESTS_PER_HOUR_FREE).every(s => s === 201)).toBe(true)
    expect(statuses[INVITE_REQUESTS_PER_HOUR_FREE]).toBe(429)
  })

  it('a paying workspace gets the higher allowance', async () => {
    await testDb.update(schema.workspaces).set({ planTier: 'growth' }).where(eq(schema.workspaces.id, TEST_WS_ID))
    for (let i = 0; i < INVITE_REQUESTS_PER_HOUR_FREE + 1; i++) {
      expect((await invite(`p${i}@co.com`))._status).toBe(201)
      await testDb.delete(schema.pendingInvites)
    }
  })
})

describe('an inviter who stops being a member', () => {
  beforeEach(async () => {
    await testDb.update(schema.workspaces).set({ planTier: 'growth' }).where(eq(schema.workspaces.id, TEST_WS_ID))
    await seedMember('u-admin', 'admin')
  })
  const adminInvites = async () => {
    as('u-admin')
    expect((await invite('from-admin@co.com'))._status).toBe(201)
    as(TEST_USER_ID)
    expect((await invite('from-owner@co.com'))._status).toBe(201)
    expect(await invitesLeft()).toHaveLength(2)
  }

  it('removing them revokes their pending invites (and only theirs), and logs each', async () => {
    await adminInvites()
    const res = await call(memberHandler, { method: 'DELETE', query: { userId: 'u-admin' } })
    expect(res._status).toBe(204)
    expect((await invitesLeft()).map(i => i.email)).toEqual(['from-owner@co.com'])
    const log = await testDb.select().from(schema.auditLog).where(eq(schema.auditLog.action, 'invite.revoked'))
    expect(log).toHaveLength(1)
    expect(log[0].details).toMatchObject({ email: 'from-admin@co.com', reason: 'inviter-left' })
  })

  it('leaving does the same', async () => {
    await adminInvites()
    as('u-admin')
    expect((await call(leaveHandler, { method: 'POST' }))._status).toBe(204)
    expect((await invitesLeft()).map(i => i.email)).toEqual(['from-owner@co.com'])
  })

  it('a changed role keeps their invites (they are still a member)', async () => {
    await adminInvites()
    const res = await call(memberHandler, { method: 'PUT', query: { userId: 'u-admin' }, body: { permission: 'editor' } })
    expect(res._status).toBe(200)
    expect(await invitesLeft()).toHaveLength(2)
  })
})
