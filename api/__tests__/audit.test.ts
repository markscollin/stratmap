// Roadmap 4.4: the audit log. Member, permission, invite, share and salary changes are recorded
// (never salary amounts), owners and admins can read the log, and the CSV is Enterprise only.
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
import { eq, asc } from 'drizzle-orm'
import { requireAuth, requireUser } from '../_lib/auth'
import { sendWorkspaceInvite } from '../_lib/email'
import { getUserIdentity } from '../_lib/identity'
import memberHandler from '../workspace/members/[userId]'
import invitesHandler from '../workspace/invites'
import inviteItemHandler from '../workspace/invites/[id]'
import acceptHandler from '../invites/accept'
import shareHandler from '../charts/[id]/share'
import chartHandler from '../charts/[id]'
import jdHandler from '../charts/[id]/jd/[nodeId]'
import auditHandler from '../workspace/audit'
import {
  setupSchema, cleanDb, seedWorkspace, seedChart, seedNode, seedMember, testDb,
  TEST_USER_ID, TEST_WS_ID, TEST_CHART_ID, TEST_NODE_ID,
} from './helpers/db'
import { createReq } from './helpers/req'
import { createRes, type MockRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'

type Handler = (req: VercelRequest, res: VercelResponse) => unknown

async function call(handler: Handler, opts: Parameters<typeof createReq>[0]): Promise<MockRes> {
  const res = createRes()
  await handler(createReq(opts) as never, res as never)
  return res
}
const as = (userId: string, workspaceId = TEST_WS_ID) => vi.mocked(requireAuth).mockResolvedValue({ userId, workspaceId })
const setTier = (tier: 'free' | 'starter' | 'growth' | 'enterprise') =>
  testDb.update(schema.workspaces).set({ planTier: tier }).where(eq(schema.workspaces.id, TEST_WS_ID))
const log = () => testDb.select().from(schema.auditLog).orderBy(asc(schema.auditLog.createdAt))
const lastEvent = async () => (await log()).at(-1)!

beforeAll(async () => { await setupSchema() })

beforeEach(async () => {
  await cleanDb()
  await seedWorkspace()          // u-test owns ws-test
  await seedChart()
  await seedNode()
  await setTier('growth')
  as(TEST_USER_ID)
})

describe('what gets recorded', () => {
  it('a role change records who, whom, and from/to', async () => {
    await seedMember('u-ed', 'editor', 'ed@co.com')
    const res = await call(memberHandler, { method: 'PUT', query: { userId: 'u-ed' }, body: { permission: 'viewer' } })
    expect(res._status).toBe(200)
    expect(await lastEvent()).toMatchObject({
      workspaceId: TEST_WS_ID, actorUserId: TEST_USER_ID, action: 'member.role_changed',
      targetType: 'member', targetId: 'u-ed', details: { email: 'ed@co.com', from: 'editor', to: 'viewer' },
    })
  })

  it('removing a member is recorded with their email (the member row is gone afterwards)', async () => {
    await seedMember('u-ed', 'editor', 'ed@co.com')
    expect((await call(memberHandler, { method: 'DELETE', query: { userId: 'u-ed' } }))._status).toBe(204)
    expect(await lastEvent()).toMatchObject({ action: 'member.removed', targetId: 'u-ed', details: { email: 'ed@co.com', role: 'editor' } })
  })

  it('a refused change records nothing', async () => {
    await seedMember('u-ad', 'admin')
    await seedMember('u-ed', 'editor')
    as('u-ad')
    // An admin cannot demote another admin or grant admin.
    expect((await call(memberHandler, { method: 'PUT', query: { userId: 'u-ed' }, body: { permission: 'admin' } }))._status).toBe(403)
    expect(await log()).toHaveLength(0)
  })

  it('invites: sent, resent and revoked', async () => {
    const created = await call(invitesHandler, { method: 'POST', body: { invites: [{ email: 'new@co.com', permission: 'editor' }] } })
    const id = (created._body as { invites: { id: string }[] }).invites[0].id
    expect(await lastEvent()).toMatchObject({ action: 'invite.sent', targetType: 'invite', targetId: id, details: { email: 'new@co.com', role: 'editor' } })

    await call(inviteItemHandler, { method: 'POST', query: { id } })
    expect((await lastEvent()).action).toBe('invite.resent')

    await call(inviteItemHandler, { method: 'DELETE', query: { id } })
    expect(await lastEvent()).toMatchObject({ action: 'invite.revoked', details: { email: 'new@co.com', role: 'editor' } })
  })

  it('the log never contains the invite token', async () => {
    await call(invitesHandler, { method: 'POST', body: { invites: [{ email: 'new@co.com', permission: 'editor' }] } })
    const url = vi.mocked(sendWorkspaceInvite).mock.calls.at(-1)![0].inviteUrl
    const token = url.split('/invite/')[1]
    expect(JSON.stringify(await log())).not.toContain(token)
  })

  it('accepting an invite records the new member, with the actor being the person who joined', async () => {
    const created = await call(invitesHandler, { method: 'POST', body: { invites: [{ email: 'new@co.com', permission: 'viewer' }] } })
    expect(created._status).toBe(201)
    const token = vi.mocked(sendWorkspaceInvite).mock.calls.at(-1)![0].inviteUrl.split('/invite/')[1]
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u-new' })
    vi.mocked(getUserIdentity).mockResolvedValue({ emails: ['new@co.com'], name: 'New', avatarUrl: null })
    expect((await call(acceptHandler, { method: 'POST', body: { token } }))._status).toBe(201)
    expect(await lastEvent()).toMatchObject({
      action: 'member.joined', actorUserId: 'u-new', targetId: 'u-new',
      details: { email: 'new@co.com', role: 'viewer', invitedBy: TEST_USER_ID },
    })
  })

  it('share links: created, revoked, and the public toggle on and off', async () => {
    await call(shareHandler, { method: 'POST', query: { id: TEST_CHART_ID } })
    expect(await lastEvent()).toMatchObject({ action: 'share.link_created', targetType: 'chart', targetId: TEST_CHART_ID, details: { chartName: 'Test Chart' } })

    await call(chartHandler, { method: 'PUT', query: { id: TEST_CHART_ID }, body: { isPublic: true } })
    expect((await lastEvent()).action).toBe('share.public_on')

    await call(chartHandler, { method: 'PUT', query: { id: TEST_CHART_ID }, body: { isPublic: false } })
    expect((await lastEvent()).action).toBe('share.public_off')

    await call(shareHandler, { method: 'DELETE', query: { id: TEST_CHART_ID } })
    expect((await lastEvent()).action).toBe('share.link_revoked')
  })

  it('does not log a share change that changed nothing', async () => {
    await call(chartHandler, { method: 'PUT', query: { id: TEST_CHART_ID }, body: { isPublic: false } })   // already private
    await call(shareHandler, { method: 'DELETE', query: { id: TEST_CHART_ID } })                           // no link to revoke
    await call(chartHandler, { method: 'PUT', query: { id: TEST_CHART_ID }, body: { name: 'Renamed' } })   // not a sharing change
    expect(await log()).toHaveLength(0)
  })
})

describe('salary events', () => {
  const putJd = (body: Record<string, unknown>) =>
    call(jdHandler, { method: 'PUT', query: { id: TEST_CHART_ID, nodeId: TEST_NODE_ID }, body })

  it('records THAT a band changed and which parts, never the amounts', async () => {
    expect((await putJd({ salaryBandMin: 123456, salaryBandMax: 234567, salaryCurrency: 'GBP' }))._status).toBe(201)
    const event = await lastEvent()
    expect(event).toMatchObject({ action: 'salary.updated', targetType: 'role', targetId: TEST_NODE_ID })
    expect(event.details).toMatchObject({ roleTitle: 'CTO', chartId: TEST_CHART_ID, changed: 'salaryBandMin,salaryBandMax,salaryCurrency' })

    expect((await putJd({ salaryBandMax: 345678 }))._status).toBe(200)
    const all = JSON.stringify(await log())
    for (const amount of ['123456', '234567', '345678']) expect(all).not.toContain(amount)
    expect((await lastEvent()).details).toMatchObject({ changed: 'salaryBandMax' })
  })

  it('saving the same band again, or editing only the text, logs nothing new', async () => {
    await putJd({ salaryBandMin: 100, salaryBandMax: 200, salaryCurrency: 'USD' })
    const before = (await log()).length
    await putJd({ salaryBandMin: 100, salaryBandMax: 200, salaryCurrency: 'USD' })
    await putJd({ responsibilities: '<p>Lead</p>' })
    expect(await log()).toHaveLength(before)
  })

  it('a refused salary edit (editor) logs nothing', async () => {
    await seedMember('u-ed', 'editor')
    as('u-ed')
    expect((await putJd({ salaryBandMin: 1 }))._status).toBe(403)
    expect(await log()).toHaveLength(0)
  })
})

describe('reading the log', () => {
  async function seedEvents(n: number, workspaceId = TEST_WS_ID) {
    for (let i = 0; i < n; i++) {
      await testDb.insert(schema.auditLog).values({
        id: `ev-${workspaceId}-${i}`, workspaceId, actorUserId: TEST_USER_ID, action: 'member.removed',
        targetType: 'member', targetId: `u-${i}`, details: { email: `p${i}@co.com`, role: 'viewer' },
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
      })
    }
  }

  it('owners and admins can read it; editors, commenters and viewers cannot', async () => {
    await seedMember('u-ad', 'admin')
    await seedMember('u-ed', 'editor')
    await seedMember('u-co', 'commenter')
    await seedMember('u-vi', 'viewer')
    for (const [user, status] of [[TEST_USER_ID, 200], ['u-ad', 200], ['u-ed', 403], ['u-co', 403], ['u-vi', 403]] as const) {
      as(user)
      expect((await call(auditHandler, { method: 'GET' }))._status, user).toBe(status)
    }
  })

  it('shows newest first with the actor resolved, and pages with nextBefore', async () => {
    await seedEvents(5)
    const first = await call(auditHandler, { method: 'GET', query: { limit: '2' } })
    const body = first._body as { events: { id: string; actor: { name: string | null; email: string | null } }[]; nextBefore: string | null }
    expect(body.events.map(e => e.id)).toEqual(['ev-ws-test-4', 'ev-ws-test-3'])
    expect(body.events[0].actor).toMatchObject({ name: 'Test User', email: 'test@example.com' })
    expect(body.nextBefore).not.toBeNull()

    const second = await call(auditHandler, { method: 'GET', query: { limit: '2', before: body.nextBefore! } })
    expect((second._body as { events: { id: string }[] }).events.map(e => e.id)).toEqual(['ev-ws-test-2', 'ev-ws-test-1'])
    const last = await call(auditHandler, { method: 'GET', query: { limit: '2', before: (second._body as { nextBefore: string }).nextBefore } })
    expect(last._body).toMatchObject({ events: [{ id: 'ev-ws-test-0' }], nextBefore: null })
  })

  it('shows only this workspace, even for events from people who have since left', async () => {
    await testDb.insert(schema.workspaces).values({ id: 'ws-other', name: 'Other', ownerId: 'u-x', ownerRole: 'CEO', size: '1-10' })
    await seedEvents(2, 'ws-other')
    await seedEvents(1)
    await testDb.update(schema.auditLog).set({ actorUserId: 'u-gone' }).where(eq(schema.auditLog.workspaceId, TEST_WS_ID))
    const res = await call(auditHandler, { method: 'GET' })
    const events = (res._body as { events: { id: string; actor: { name: string | null; userId: string } }[] }).events
    expect(events).toHaveLength(1)
    expect(events[0].actor).toMatchObject({ userId: 'u-gone', name: null })
  })

  it('CSV download is Enterprise only', async () => {
    await seedEvents(2)
    for (const tier of ['free', 'starter', 'growth'] as const) {
      await setTier(tier)
      const res = await call(auditHandler, { method: 'GET', query: { format: 'csv' } })
      expect(res._status, tier).toBe(402)
      expect(res._body).toMatchObject({ error: 'plan-feature', feature: 'audit-export', requiredTier: 'enterprise' })
    }
    await setTier('enterprise')
    const res = await call(auditHandler, { method: 'GET', query: { format: 'csv' } })
    expect(res._status).toBe(200)
    expect(res._headers['Content-Type']).toContain('text/csv')
    const text = res._written
    expect(text).toContain('Time (UTC)')
    expect(text).toContain('member.removed')
  })

  it('the on-screen log stays readable on every plan (only the download is gated)', async () => {
    await setTier('free')
    expect((await call(auditHandler, { method: 'GET' }))._status).toBe(200)
  })

  it('CSV neutralises spreadsheet formulas in names', async () => {
    await setTier('enterprise')
    await testDb.update(schema.workspaceMembers).set({ name: '=HYPERLINK("http://x")' }).where(eq(schema.workspaceMembers.userId, TEST_USER_ID))
    await seedEvents(1)
    const res = await call(auditHandler, { method: 'GET', query: { format: 'csv' } })
    expect(res._written).toContain(`"'=HYPERLINK(""http://x"")"`)
  })
})
