// Roadmap 4.2: workspace export, workspace deletion (soft delete, restore, purge), account deletion.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))
vi.mock('../_lib/email', async (orig) => ({
  ...(await orig<typeof import('../_lib/email')>()),
  sendWorkspaceDeleted: vi.fn().mockResolvedValue({ sent: false, skipped: true }),
}))
vi.mock('../_lib/identity', () => ({ getUserIdentity: vi.fn(), deleteUserAccount: vi.fn().mockResolvedValue(undefined) }))
const cancelMock = vi.fn()
vi.mock('stripe', () => ({ default: class { subscriptions = { cancel: cancelMock } } }))

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, sql } from 'drizzle-orm'
import { requireAuth, requireUser } from '../_lib/auth'
import { sendWorkspaceDeleted } from '../_lib/email'
import { deleteUserAccount, getUserIdentity } from '../_lib/identity'
import { RESTORE_DAYS } from '../_lib/workspaceLifecycle'
import workspaceHandler from '../workspace'
import workspacesHandler from '../workspaces'
import restoreHandler from '../workspace/restore'
import exportHandler from '../workspace/export'
import accountHandler from '../account'
import purgeHandler from '../cron/purge-deleted'
import shareHandler from '../share/[code]'
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
const as = (userId: string, workspaceId = TEST_WS_ID) => {
  vi.mocked(requireAuth).mockResolvedValue({ userId, workspaceId })
  vi.mocked(requireUser).mockResolvedValue({ userId })
}
const DAY = 86_400_000
const ago = (days: number) => new Date(Date.now() - days * DAY)
const getWs = async (id = TEST_WS_ID) => (await testDb.select().from(schema.workspaces).where(eq(schema.workspaces.id, id)))[0]
const auditActions = async () => (await testDb.select().from(schema.auditLog)).map(e => e.action)
const del = (body: unknown = { confirmName: 'Test Workspace' }) => call(workspaceHandler, { method: 'DELETE', body })

beforeAll(async () => { await setupSchema() })

beforeEach(async () => {
  await cleanDb()
  vi.clearAllMocks()
  cancelMock.mockReset().mockResolvedValue({})
  vi.mocked(deleteUserAccount).mockResolvedValue(undefined)
  // The sign-in provider's verified addresses for whoever deletes their account (R-09): the person's own, by user id.
  vi.mocked(getUserIdentity).mockImplementation(async (id: string) => ({ emails: id === 'u-ed' ? ['ed@co.com'] : id === TEST_USER_ID ? ['test@example.com'] : [], name: null, avatarUrl: null }))
  process.env.STRIPE_SECRET_KEY = 'sk_test'
  delete process.env.CRON_SECRET
  await seedWorkspace()            // u-test owns ws-test ("Test Workspace")
  await seedChart()
  await seedNode()
  await testDb.update(schema.workspaces).set({ planTier: 'growth', stripeSubscriptionId: 'sub_1', stripeCustomerId: 'cus_1', subscriptionStatus: 'active' })
  as(TEST_USER_ID)
})

describe('deleting a workspace', () => {
  it('only the owner can, and only by typing the exact name', async () => {
    await seedMember('u-ad', 'admin')
    as('u-ad')
    expect((await del())._status).toBe(403)
    as(TEST_USER_ID)
    const wrong = await del({ confirmName: 'test workspace' })
    expect(wrong._status).toBe(400)
    expect(wrong._body).toMatchObject({ error: 'confirm-name-mismatch' })
    expect((await call(workspaceHandler, { method: 'DELETE', body: {} }))._status).toBe(400)
    expect((await getWs()).deletedAt).toBeNull()
    expect(cancelMock).not.toHaveBeenCalled()
  })

  it('marks it deleted, cancels the subscription, drops invites, tells every member, and logs it', async () => {
    await seedMember('u-ed', 'editor', 'ed@co.com')
    await testDb.insert(schema.pendingInvites).values({ id: 'inv-1', workspaceId: TEST_WS_ID, email: 'new@co.com', permission: 'viewer' })

    const res = await del()
    expect(res._status).toBe(200)

    const ws = await getWs()
    expect(ws.deletedAt).toBeInstanceOf(Date)
    expect(ws.deletedBy).toBe(TEST_USER_ID)
    expect(ws).toMatchObject({ planTier: 'free', stripeSubscriptionId: null, subscriptionStatus: 'canceled' })
    expect(cancelMock).toHaveBeenCalledWith('sub_1')
    expect(await testDb.select().from(schema.pendingInvites)).toHaveLength(0)
    expect(await auditActions()).toContain('workspace.deleted')

    // Everyone is emailed, and only the owner is told they can restore it.
    const mails = vi.mocked(sendWorkspaceDeleted).mock.calls.map(c => c[0])
    expect(mails.map(m => m.to).sort()).toEqual(['ed@co.com', 'test@example.com'])
    expect(mails.find(m => m.to === 'test@example.com')!.isOwner).toBe(true)
    expect(mails.find(m => m.to === 'ed@co.com')!.isOwner).toBe(false)
    const days = (mails[0].eraseOn.getTime() - Date.now()) / DAY
    expect(days).toBeGreaterThan(RESTORE_DAYS - 0.1)
  })

  it('does nothing at all if Stripe cannot cancel (never deleted-but-still-billed)', async () => {
    cancelMock.mockRejectedValueOnce(new Error('stripe down'))
    const res = await del()
    expect(res._status).toBe(502)
    expect(res._body).toMatchObject({ error: 'cancel-failed' })
    const ws = await getWs()
    expect(ws.deletedAt).toBeNull()
    expect(ws.stripeSubscriptionId).toBe('sub_1')
    expect(sendWorkspaceDeleted).not.toHaveBeenCalled()
    expect(await auditActions()).not.toContain('workspace.deleted')
  })

  it('treats an already-cancelled Stripe subscription as cancelled', async () => {
    cancelMock.mockRejectedValueOnce(Object.assign(new Error('gone'), { code: 'resource_missing' }))
    expect((await del())._status).toBe(200)
    expect((await getWs()).deletedAt).not.toBeNull()
  })

  it('works for a Free workspace with no subscription', async () => {
    await testDb.update(schema.workspaces).set({ planTier: 'free', stripeSubscriptionId: null, stripeCustomerId: null, subscriptionStatus: null })
    expect((await del())._status).toBe(200)
    expect(cancelMock).not.toHaveBeenCalled()
  })

  it('its public share links stop working, and work again after a restore', async () => {
    await testDb.update(schema.charts).set({ isPublic: true })
    await testDb.insert(schema.sharedLinks).values({ id: 'code123', chartId: TEST_CHART_ID, createdBy: TEST_USER_ID })
    const open = () => call(shareHandler, { method: 'GET', query: { code: 'code123' } })
    expect((await open())._status).toBe(200)
    await del()
    expect((await open())._status).toBe(404)
    await call(restoreHandler, { method: 'POST', body: { workspaceId: TEST_WS_ID } })
    expect((await open())._status).toBe(200)
  })
})

describe('restoring a workspace', () => {
  async function deleted(daysAgo = 1) {
    await del()
    await testDb.update(schema.workspaces).set({ deletedAt: ago(daysAgo) }).where(eq(schema.workspaces.id, TEST_WS_ID))
  }
  const restore = (id = TEST_WS_ID) => call(restoreHandler, { method: 'POST', body: { workspaceId: id } })

  it('the owner gets it back, with all its data, on the Free plan', async () => {
    await deleted()
    expect((await restore())._status).toBe(200)
    const ws = await getWs()
    expect(ws).toMatchObject({ deletedAt: null, deletedBy: null, planTier: 'free' })
    expect(await testDb.select().from(schema.nodes)).toHaveLength(1)
    expect(await auditActions()).toContain('workspace.restored')
  })

  it('nobody else can restore it, and a live workspace cannot be "restored"', async () => {
    await seedMember('u-ad', 'admin')
    await deleted()
    as('u-ad')
    expect((await restore())._status).toBe(404)
    as(TEST_USER_ID)
    await restore()
    expect((await restore())._status).toBe(404) // already live
  })

  it('is refused after 30 days', async () => {
    await deleted(RESTORE_DAYS + 1)
    const res = await restore()
    expect(res._status).toBe(410)
    expect(res._body).toMatchObject({ error: 'expired' })
    expect((await getWs()).deletedAt).not.toBeNull()
  })

  it('is refused if the owner has since created another workspace (one per user)', async () => {
    await deleted()
    await testDb.insert(schema.workspaces).values({ id: 'ws-new', name: 'Fresh', ownerId: TEST_USER_ID, ownerRole: 'CEO', size: '1-10' })
    const res = await restore()
    expect(res._status).toBe(409)
    expect(res._body).toMatchObject({ error: 'owns-another-workspace' })
    expect((await getWs()).deletedAt).not.toBeNull()
  })

  it('/api/workspaces lists restorable workspaces for the owner only, until they expire', async () => {
    await seedMember('u-ed', 'editor')
    await deleted(2)
    as(TEST_USER_ID)
    const mine = (await call(workspacesHandler, { method: 'GET' }))._body as { workspaces: unknown[]; deleted: { id: string; eraseOn: string }[] }
    expect(mine.workspaces).toHaveLength(0)
    expect(mine.deleted).toHaveLength(1)
    expect(mine.deleted[0].id).toBe(TEST_WS_ID)
    expect(new Date(mine.deleted[0].eraseOn).getTime()).toBeGreaterThan(Date.now())
    as('u-ed')
    expect(((await call(workspacesHandler, { method: 'GET' }))._body as { deleted: unknown[] }).deleted).toHaveLength(0)
    as(TEST_USER_ID)
    await testDb.update(schema.workspaces).set({ deletedAt: ago(RESTORE_DAYS + 1) })
    expect(((await call(workspacesHandler, { method: 'GET' }))._body as { deleted: unknown[] }).deleted).toHaveLength(0)
  })
})

describe('the daily purge', () => {
  const run = (auth?: string) => call(purgeHandler, { method: 'GET', headers: auth ? { authorization: auth } : {} })

  async function seedEverything(wsId: string) {
    const chart = `chart-${wsId}`
    await testDb.insert(schema.workspaces).values({ id: wsId, name: wsId, ownerId: `owner-${wsId}`, ownerRole: 'CEO', size: '1-10' })
    await testDb.insert(schema.workspaceMembers).values({ id: `m-${wsId}`, workspaceId: wsId, userId: `owner-${wsId}`, email: `${wsId}@co.com`, permission: 'owner' })
    await testDb.insert(schema.pendingInvites).values({ id: `i-${wsId}`, workspaceId: wsId, email: 'x@co.com', permission: 'viewer' })
    await testDb.insert(schema.workspaceDepartments).values({ id: `wd-${wsId}`, workspaceId: wsId, name: 'Eng', colour: '#000' })
    await testDb.insert(schema.charts).values({ id: chart, workspaceId: wsId, name: 'C', ownerId: 'o', creatorId: 'o', version: 1 })
    await testDb.insert(schema.departments).values({ id: `d-${wsId}`, chartId: chart, name: 'Eng', colour: '#000' })
    await testDb.insert(schema.nodes).values([{ id: `n1-${wsId}`, chartId: chart, name: 'A', title: 'T', x: 0, y: 0 }, { id: `n2-${wsId}`, chartId: chart, name: 'B', title: 'T', x: 0, y: 0 }])
    await testDb.insert(schema.edges).values({ id: `e-${wsId}`, chartId: chart, sourceId: `n1-${wsId}`, targetId: `n2-${wsId}` })
    await testDb.insert(schema.jobDescriptions).values({ id: `j-${wsId}`, nodeId: `n1-${wsId}`, chartId: chart, status: 'draft', responsibilities: '', requirements: '', version: 1, updatedBy: 'o', salaryBandMin: 1, salaryBandMax: 2 })
    await testDb.insert(schema.roleTemplates).values({ id: `t-${wsId}`, workspaceId: wsId, title: 'T', department: 'Eng', createdBy: 'o', updatedBy: 'o' })
    await testDb.insert(schema.headcountPlans).values({ id: `h-${wsId}`, workspaceId: wsId, title: 'Hire', roleType: 'new-headcount', targetQuarter: '2026-Q2', createdBy: 'o' })
    await testDb.insert(schema.sharedLinks).values({ id: `s-${wsId}`, chartId: chart, createdBy: 'o' })
    await testDb.insert(schema.chartSnapshots).values({ id: `v-${wsId}`, workspaceId: wsId, chartId: chart, name: 'v1', createdBy: 'o', nodeCount: 2, edgeCount: 1, data: { nodes: [], edges: [], departments: [] } })
    await testDb.insert(schema.roleComments).values({ id: `c-${wsId}`, workspaceId: wsId, chartId: chart, nodeId: `n1-${wsId}`, authorId: 'o', body: 'Discuss' })
    await testDb.insert(schema.deletedNodes).values({ id: `dn-${wsId}`, chartId: chart, nodeId: `gone-${wsId}`, deletedBy: 'o', data: { node: {} as never, comments: [], edges: [] } })
    await testDb.insert(schema.aiUsage).values({ workspaceId: wsId, period: '2026-11', count: 1 })
    await testDb.insert(schema.auditLog).values({ id: `a-${wsId}`, workspaceId: wsId, actorUserId: 'o', action: 'member.removed', targetType: 'member', details: { email: 'gone@co.com' } })
  }
  const rowsOf = async (wsId: string) => {
    const q = async (table: string, col: string, val: string) =>
      Number((await testDb.execute(sql.raw(`select count(*)::int as n from ${table} where ${col} = '${val}'`))).rows[0].n)
    const chart = `chart-${wsId}`
    return {
      workspaces: await q('workspaces', 'id', wsId), members: await q('workspace_members', 'workspace_id', wsId),
      invites: await q('pending_invites', 'workspace_id', wsId), wsDepts: await q('workspace_departments', 'workspace_id', wsId),
      charts: await q('charts', 'id', chart), depts: await q('departments', 'chart_id', chart), nodes: await q('nodes', 'chart_id', chart),
      edges: await q('edges', 'chart_id', chart), jds: await q('job_descriptions', 'chart_id', chart),
      templates: await q('role_templates', 'workspace_id', wsId), plans: await q('headcount_plans', 'workspace_id', wsId), links: await q('shared_links', 'chart_id', chart),
      usage: await q('ai_usage', 'workspace_id', wsId), comments: await q('role_comments', 'workspace_id', wsId), versions: await q('chart_snapshots', 'workspace_id', wsId), trash: await q('deleted_nodes', 'chart_id', chart), audit: await q('audit_log', 'workspace_id', wsId),
    }
  }

  it('refuses to run without CRON_SECRET, and without the right secret', async () => {
    expect((await run('Bearer anything'))._status).toBe(503)
    process.env.CRON_SECRET = 'cron-secret'
    expect((await run())._status).toBe(401)
    expect((await run('Bearer wrong'))._status).toBe(401)
    expect((await run('cron-secret'))._status).toBe(401)
  })

  it('erases a workspace deleted over 30 days ago, completely, and leaves everyone else alone', async () => {
    process.env.CRON_SECRET = 'cron-secret'
    await seedEverything('ws-old')
    await seedEverything('ws-recent')
    await seedEverything('ws-live')
    await testDb.update(schema.workspaces).set({ deletedAt: ago(RESTORE_DAYS + 1) }).where(eq(schema.workspaces.id, 'ws-old'))
    await testDb.update(schema.workspaces).set({ deletedAt: ago(RESTORE_DAYS - 1) }).where(eq(schema.workspaces.id, 'ws-recent'))

    const res = await run('Bearer cron-secret')
    expect(res._status).toBe(200)
    expect(res._body).toEqual({ purged: 1, trashPurged: 0 })

    expect(Object.values(await rowsOf('ws-old')).every(n => n === 0), JSON.stringify(await rowsOf('ws-old'))).toBe(true)
    for (const kept of ['ws-recent', 'ws-live']) {
      expect(Object.values(await rowsOf(kept)).every(n => n >= 1), kept).toBe(true)
    }
    expect((await run('Bearer cron-secret'))._body).toEqual({ purged: 0, trashPurged: 0 })
  })
})

describe('deleting an account', () => {
  const remove = (body: unknown = { confirm: 'DELETE' }) => call(accountHandler, { method: 'DELETE', body })

  it('needs the word DELETE', async () => {
    expect((await remove({}))._status).toBe(400)
    expect((await remove({ confirm: 'delete' }))._status).toBe(400)
    expect(deleteUserAccount).not.toHaveBeenCalled()
  })

  it('a member leaves every workspace, their email is scrubbed from activity logs, and their sign-in is deleted', async () => {
    await seedMember('u-ed', 'editor', 'ed@co.com')
    await testDb.insert(schema.workspaces).values({ id: 'ws-2', name: 'Second', ownerId: 'u-boss', ownerRole: 'CEO', size: '1-10' })
    await testDb.insert(schema.workspaceMembers).values([
      { id: 'm2-boss', workspaceId: 'ws-2', userId: 'u-boss', email: 'boss@co.com', permission: 'owner' },
      { id: 'm2-ed', workspaceId: 'ws-2', userId: 'u-ed', email: 'ED@co.com', permission: 'viewer' },
    ])
    await testDb.insert(schema.pendingInvites).values({ id: 'inv-ed', workspaceId: 'ws-2', email: 'ed@co.com', permission: 'viewer', invitedBy: 'u-boss' })
    await testDb.insert(schema.auditLog).values([
      { id: 'a1', workspaceId: TEST_WS_ID, actorUserId: TEST_USER_ID, action: 'member.role_changed', targetType: 'member', targetId: 'u-ed', details: { email: 'ed@co.com', from: 'viewer', to: 'editor' } },
      { id: 'a2', workspaceId: 'ws-2', actorUserId: 'u-boss', action: 'invite.sent', targetType: 'invite', targetId: 'inv-ed', details: { email: 'Ed@co.com', role: 'viewer' } },
      { id: 'a3', workspaceId: TEST_WS_ID, actorUserId: TEST_USER_ID, action: 'invite.sent', targetType: 'invite', targetId: 'inv-x', details: { email: 'someone-else@co.com', role: 'viewer' } },
    ])
    as('u-ed')

    const res = await remove()
    expect(res._status).toBe(200)
    expect(res._body).toMatchObject({ deleted: true, workspacesDeleted: 0, membershipsRemoved: 2 })
    expect(deleteUserAccount).toHaveBeenCalledWith('u-ed')

    expect(await testDb.select().from(schema.workspaceMembers).where(eq(schema.workspaceMembers.userId, 'u-ed'))).toHaveLength(0)
    expect(await testDb.select().from(schema.pendingInvites)).toHaveLength(0)
    // The workspaces live on, with their other members.
    expect((await getWs()).deletedAt).toBeNull()
    expect(await testDb.select().from(schema.workspaceMembers).where(eq(schema.workspaceMembers.userId, TEST_USER_ID))).toHaveLength(1)

    const logs = await testDb.select().from(schema.auditLog)
    expect(JSON.stringify(logs)).not.toMatch(/ed@co\.com/i)
    expect(logs.find(e => e.id === 'a3')!.details).toMatchObject({ email: 'someone-else@co.com' })   // other people's emails stay
    expect(logs.filter(e => e.action === 'member.left').map(e => e.workspaceId).sort()).toEqual(['ws-2', TEST_WS_ID])
  })

  // Launch review R-09: the address on a member row was typed by the browser, so it must not decide whose invites go.
  it('cannot remove invites or log entries addressed to someone else, even if a member row claims that address', async () => {
    await seedMember('u-mallory', 'editor', 'victim@co.com')                 // Mallory told the server her email was the victim's
    vi.mocked(getUserIdentity).mockResolvedValue({ emails: ['mallory@real.test'], name: null, avatarUrl: null })
    await testDb.insert(schema.pendingInvites).values([
      { id: 'inv-victim', workspaceId: TEST_WS_ID, email: 'victim@co.com', permission: 'viewer', invitedBy: TEST_USER_ID },
      { id: 'inv-mallory', workspaceId: TEST_WS_ID, email: 'mallory@real.test', permission: 'viewer', invitedBy: TEST_USER_ID },
    ])
    await testDb.insert(schema.auditLog).values([
      { id: 'log-victim', workspaceId: TEST_WS_ID, actorUserId: TEST_USER_ID, action: 'invite.sent', targetType: 'invite', targetId: 'inv-victim', details: { email: 'victim@co.com', role: 'viewer' } },
      { id: 'log-mallory', workspaceId: TEST_WS_ID, actorUserId: TEST_USER_ID, action: 'invite.sent', targetType: 'invite', targetId: 'inv-mallory', details: { email: 'mallory@real.test', role: 'viewer' } },
    ])
    as('u-mallory')
    expect((await remove())._status).toBe(200)
    expect((await testDb.select().from(schema.pendingInvites)).map(i => i.id)).toEqual(['inv-victim'])
    const logs = await testDb.select().from(schema.auditLog)
    expect(logs.find(l => l.id === 'log-victim')!.details).toMatchObject({ email: 'victim@co.com' })
    expect(logs.find(l => l.id === 'log-mallory')!.details).not.toHaveProperty('email')
  })

  it('if the sign-in provider cannot say who this is, nothing is changed and a retry works', async () => {
    vi.mocked(getUserIdentity).mockRejectedValueOnce(new Error('clerk down'))
    expect((await remove())._status).toBe(502)
    expect((await getWs()).deletedAt).toBeNull()
    expect(await testDb.select().from(schema.workspaceMembers).where(eq(schema.workspaceMembers.userId, TEST_USER_ID))).toHaveLength(1)
    expect(deleteUserAccount).not.toHaveBeenCalled()
    expect((await remove())._status).toBe(200)
  })

  it('an owner takes their workspace with them (soft delete, Stripe cancelled, members emailed)', async () => {
    await seedMember('u-ed', 'editor', 'ed@co.com')
    const res = await remove()
    expect(res._status).toBe(200)
    expect(res._body).toMatchObject({ workspacesDeleted: 1 })
    expect((await getWs()).deletedAt).not.toBeNull()
    expect(cancelMock).toHaveBeenCalledWith('sub_1')
    expect(vi.mocked(sendWorkspaceDeleted).mock.calls.map(c => c[0].to).sort()).toEqual(['ed@co.com', 'test@example.com'])
    expect(deleteUserAccount).toHaveBeenCalledWith(TEST_USER_ID)
    expect(await testDb.select().from(schema.workspaceMembers).where(eq(schema.workspaceMembers.userId, TEST_USER_ID))).toHaveLength(0)
  })

  it('if Stripe fails nothing is deleted at all, and the sign-in account stays', async () => {
    cancelMock.mockRejectedValueOnce(new Error('stripe down'))
    expect((await remove())._status).toBe(502)
    expect((await getWs()).deletedAt).toBeNull()
    expect(await testDb.select().from(schema.workspaceMembers).where(eq(schema.workspaceMembers.userId, TEST_USER_ID))).toHaveLength(1)
    expect(deleteUserAccount).not.toHaveBeenCalled()
  })

  it('if the sign-in provider fails, a retry finishes the job', async () => {
    vi.mocked(deleteUserAccount).mockRejectedValueOnce(new Error('clerk down'))
    expect((await remove())._status).toBe(502)
    expect((await remove())._status).toBe(200)
    expect(deleteUserAccount).toHaveBeenCalledTimes(2)
    expect((await getWs()).deletedAt).not.toBeNull()
  })
})

describe('workspace export', () => {
  const get = (format?: string) => call(exportHandler, { method: 'GET', query: format ? { format } : {} })

  async function seedSecond() {
    await testDb.insert(schema.charts).values({ id: 'chart-2', workspaceId: TEST_WS_ID, name: 'Second chart', ownerId: TEST_USER_ID, creatorId: TEST_USER_ID, version: 1 })
    await testDb.insert(schema.nodes).values([
      { id: 'n-boss', chartId: 'chart-2', name: '=HYPERLINK("http://x")', title: 'Head', x: 0, y: 0 },
      { id: 'n-rep', chartId: 'chart-2', name: 'Rep', title: 'Analyst', x: 0, y: 100 },
    ])
    await testDb.insert(schema.edges).values({ id: 'e-2', chartId: 'chart-2', sourceId: 'n-boss', targetId: 'n-rep' })
  }

  it('owners and admins only', async () => {
    await seedMember('u-ad', 'admin')
    await seedMember('u-ed', 'editor')
    for (const [user, status] of [[TEST_USER_ID, 200], ['u-ad', 200], ['u-ed', 403]] as const) {
      as(user)
      expect((await get())._status, user).toBe(status)
    }
  })

  it('the JSON has everything, including salary bands, and nothing secret', async () => {
    await testDb.insert(schema.jobDescriptions).values({ id: 'jd1', nodeId: TEST_NODE_ID, chartId: TEST_CHART_ID, status: 'draft', responsibilities: '<p>Lead</p>', requirements: '', version: 1, updatedBy: TEST_USER_ID, salaryBandMin: 100000, salaryBandMax: 200000, salaryCurrency: 'USD' })
    await testDb.insert(schema.pendingInvites).values({ id: 'inv-1', workspaceId: TEST_WS_ID, email: 'new@co.com', permission: 'viewer', tokenHash: 'SECRETHASH' })
    await testDb.insert(schema.sharedLinks).values({ id: 'SECRETCODE', chartId: TEST_CHART_ID, createdBy: TEST_USER_ID })
    await seedSecond()

    const res = await get()
    expect(res._headers['Content-Type']).toContain('application/json')
    expect(res._headers['Content-Disposition']).toContain('attachment')
    const data = JSON.parse(res._written)
    expect(data.format).toBe('stratmap-workspace-export/1')
    expect(data.workspace.name).toBe('Test Workspace')
    expect(data.members).toHaveLength(1)
    expect(data.invites[0].email).toBe('new@co.com')
    expect(data.charts).toHaveLength(2)
    const first = data.charts.find((c: { id: string }) => c.id === TEST_CHART_ID)
    expect(first.nodes[0].title).toBe('CTO')
    expect(first.jobDescriptions[0]).toMatchObject({ salaryBandMin: 100000, salaryBandMax: 200000, salaryCurrency: 'USD' })
    expect(data.charts.find((c: { id: string }) => c.id === 'chart-2').edges).toHaveLength(1)

    for (const secret of ['SECRETHASH', 'SECRETCODE', 'cus_1', 'sub_1', 'stripe']) expect(res._written).not.toContain(secret)
  })

  it('never includes another workspace\'s data', async () => {
    await testDb.insert(schema.workspaces).values({ id: 'ws-2', name: 'Other', ownerId: 'u-x', ownerRole: 'CEO', size: '1-10' })
    await testDb.insert(schema.charts).values({ id: 'chart-other', workspaceId: 'ws-2', name: 'NotYours', ownerId: 'u-x', creatorId: 'u-x', version: 1 })
    const res = await get()
    expect(res._written).not.toContain('NotYours')
    expect((await get('csv'))._written).not.toContain('NotYours')
  })

  it('the roles CSV lists every role of every chart with unique, linked IDs, and guards formulas', async () => {
    await seedSecond()
    const res = await get('csv')
    expect(res._headers['Content-Type']).toContain('text/csv')
    const lines = res._written.replace(/^\uFEFF/, '').trim().split('\r\n')
    expect(lines[0]).toBe('Chart,ID,Name,Title,Department,Reports to,Location,Start date,Role type,Status,Employment type,X,Y,Department colour')
    expect(lines).toHaveLength(1 + 1 + 2)                       // header + 1 role in chart 1 + 2 in chart 2
    const rows = lines.slice(1).map(l => l.split(','))
    const ids = rows.map(r => r[1])
    expect(new Set(ids).size).toBe(ids.length)
    const rep = rows.find(r => r[3] === 'Analyst')!
    expect(rep[5]).toBe(rows.find(r => r[3] === 'Head')![1])    // Reports to points at the boss's unique ID
    expect(res._written).toContain(`'=HYPERLINK`)               // formula guard
  })

  it('records that an export happened', async () => {
    await get()
    await get('csv')
    const events = (await testDb.select().from(schema.auditLog)).filter(e => e.action === 'workspace.exported')
    expect(events.map(e => e.details)).toEqual([{ format: 'json' }, { format: 'csv' }])
  })
})
