// Roadmap 5: comments on roles. Who can read and write, threads and replies, resolve and reopen, edit and delete rules,
// mentions (only real members), and exactly who gets an email.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))
vi.mock('../_lib/email', async (orig) => ({
  ...(await orig<typeof import('../_lib/email')>()),
  sendCommentNotification: vi.fn().mockResolvedValue({ sent: false, skipped: true }),
}))

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { requireAuth, requireUser } from '../_lib/auth'
import { sendCommentNotification } from '../_lib/email'
import commentsHandler from '../charts/[id]/comments'
import commentHandler from '../charts/[id]/comments/[commentId]'
import notificationsHandler from '../notifications'
import exportHandler from '../workspace/export'
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
const q = { id: TEST_CHART_ID }
const post = (body: Record<string, unknown>) => call(commentsHandler, { method: 'POST', query: q, body: { nodeId: TEST_NODE_ID, ...body } })
const list = async (nodeId = TEST_NODE_ID) =>
  ((await call(commentsHandler, { method: 'GET', query: { ...q, nodeId } }))._body as { comments: Record<string, unknown>[] }).comments
const item = (commentId: string, method: string, body?: unknown) => call(commentHandler, { method, query: { ...q, commentId }, body })
const idOf = (res: MockRes) => (res._body as { id: string }).id
const emails = () => vi.mocked(sendCommentNotification).mock.calls.map(c => c[0])

beforeAll(async () => { await setupSchema() })
beforeEach(async () => {
  await cleanDb()
  vi.clearAllMocks()
  await seedWorkspace()                              // u-test owns it
  await seedChart()
  await seedNode()                                   // node-test, "CTO"
  await seedMember('u-ad', 'admin', 'ad@co.com')
  await seedMember('u-ed', 'editor', 'ed@co.com')
  await seedMember('u-co', 'commenter', 'co@co.com')
  await seedMember('u-co2', 'commenter', 'co2@co.com')
  await seedMember('u-vi', 'viewer', 'vi@co.com')
  as('u-co')
})

describe('who can read and write', () => {
  it('every member can read; viewers cannot write; commenter and above can', async () => {
    as('u-co')
    expect((await post({ body: 'Hello' }))._status).toBe(201)
    for (const user of [TEST_USER_ID, 'u-ad', 'u-ed', 'u-co2', 'u-vi']) {
      as(user)
      expect((await list()).length, user).toBe(1)
    }
    as('u-vi')
    const refused = await post({ body: 'Let me in' })
    expect(refused._status).toBe(403)
    expect(await list()).toHaveLength(1)
    for (const user of [TEST_USER_ID, 'u-ad', 'u-ed', 'u-co2']) {
      as(user)
      expect((await post({ body: `from ${user}` }))._status, user).toBe(201)
    }
  })

  it('comments of one workspace are invisible to another', async () => {
    await post({ body: 'Secret plan' })
    await testDb.insert(schema.workspaces).values({ id: 'ws-2', name: 'Other', ownerId: 'u-x', ownerRole: 'CEO', size: '1-10' })
    as('u-x', 'ws-2')
    expect((await call(commentsHandler, { method: 'GET', query: { ...q, nodeId: TEST_NODE_ID } }))._status).toBe(404)
    expect((await call(commentsHandler, { method: 'POST', query: q, body: { nodeId: TEST_NODE_ID, body: 'hi' } }))._status).toBe(404)
  })

  it('comments are still allowed when the chart is view-only for plan reasons, and never bump the chart revision', async () => {
    const [before] = await testDb.select({ r: schema.charts.revision }).from(schema.charts)
    await testDb.insert(schema.charts).values([
      { id: 'c2', workspaceId: TEST_WS_ID, name: 'B', ownerId: 'o', creatorId: 'o', version: 1 },
      { id: 'c3', workspaceId: TEST_WS_ID, name: 'C', ownerId: 'o', creatorId: 'o', version: 1 },
    ])                                               // three charts on the Free plan (limit 1): every chart is view-only
    expect((await post({ body: 'Still can discuss' }))._status).toBe(201)
    const [after] = await testDb.select({ r: schema.charts.revision }).from(schema.charts).where(eq(schema.charts.id, TEST_CHART_ID))
    expect(after.r).toBe(before.r)
  })
})

describe('creating comments', () => {
  it('stores the comment with its author, and returns the author name', async () => {
    const res = await post({ body: '  Is this the right level?  ' })
    expect(res._body).toMatchObject({ body: 'Is this the right level?', authorId: 'u-co', authorName: 'u-co', parentId: null, resolved: false, deleted: false, editedAt: null })
  })

  it.each([
    ['an empty comment', { body: '   ' }],
    ['a comment over 2000 characters', { body: 'x'.repeat(2001) }],
    ['a missing role', { nodeId: undefined, body: 'hi' }],
    ['an unsafe id', { nodeId: '../x', body: 'hi' }],
  ])('rejects %s', async (_n, body) => {
    expect((await call(commentsHandler, { method: 'POST', query: q, body }))._status).toBe(400)
    expect(await testDb.select().from(schema.roleComments)).toHaveLength(0)
  })

  it('accepts exactly 2000 characters', async () => {
    expect((await post({ body: 'x'.repeat(2000) }))._status).toBe(201)
  })

  it('404s for a role that is not on this chart', async () => {
    await testDb.insert(schema.charts).values({ id: 'c2', workspaceId: TEST_WS_ID, name: 'B', ownerId: 'o', creatorId: 'o', version: 1 })
    await testDb.insert(schema.nodes).values({ id: 'n-other', chartId: 'c2', name: 'X', title: 'Y', x: 0, y: 0 })
    expect((await post({ nodeId: 'n-other', body: 'wrong chart' }))._status).toBe(404)
    expect((await post({ nodeId: 'nope', body: 'no such role' }))._status).toBe(404)
  })

  it('replies are one level deep, and must belong to the same role', async () => {
    const top = idOf(await post({ body: 'Top' }))
    const reply = await post({ body: 'Reply', parentId: top })
    expect(reply._status).toBe(201)
    expect(reply._body).toMatchObject({ parentId: top })
    expect((await post({ body: 'Reply to a reply', parentId: idOf(reply) }))._status).toBe(400)
    expect((await post({ body: 'ghost parent', parentId: 'does-not-exist' }))._status).toBe(404)
    await testDb.insert(schema.nodes).values({ id: 'n2', chartId: TEST_CHART_ID, name: 'B', title: 'COO', x: 0, y: 0 })
    expect((await post({ nodeId: 'n2', body: 'Parent is on another role', parentId: top }))._status).toBe(404)
  })

  it('lists a role\'s comments oldest first and only that role\'s', async () => {
    await testDb.insert(schema.nodes).values({ id: 'n2', chartId: TEST_CHART_ID, name: 'B', title: 'COO', x: 0, y: 0 })
    await post({ body: 'first' })
    await post({ nodeId: 'n2', body: 'other role' })
    await post({ body: 'second' })
    expect((await list()).map(c => c.body)).toEqual(['first', 'second'])
    expect((await list('n2')).map(c => c.body)).toEqual(['other role'])
  })

  it('asks for a role when listing', async () => {
    expect((await call(commentsHandler, { method: 'GET', query: q }))._status).toBe(400)
  })

  it('shows "no name" for an author who has left, instead of failing', async () => {
    await post({ body: 'I will leave' })
    await testDb.delete(schema.workspaceMembers).where(eq(schema.workspaceMembers.userId, 'u-co'))
    as(TEST_USER_ID)
    expect((await list())[0]).toMatchObject({ authorId: 'u-co', authorName: null })
  })
})

describe('mentions and emails', () => {
  it('keeps only real members, never yourself, once each', async () => {
    const res = await post({ body: '@Ed @Ed @Stranger @me', mentions: ['u-ed', 'u-ed', 'u-stranger', 'u-co'] })
    expect((res._body as { mentions: string[] }).mentions).toEqual(['u-ed'])
  })

  it('a mention emails that person, once, with the text and a link to the role', async () => {
    await post({ body: 'Can you check this, @Ed?', mentions: ['u-ed'] })
    expect(emails()).toHaveLength(1)
    expect(emails()[0]).toMatchObject({ to: 'ed@co.com', reason: 'mention', roleTitle: 'CTO', chartName: 'Test Chart', body: 'Can you check this, @Ed?' })
    expect(emails()[0].url).toContain(`/charts/${TEST_CHART_ID}?role=${TEST_NODE_ID}&tab=comments`)
  })

  it('a viewer can be mentioned and is emailed; a non-member never is', async () => {
    await post({ body: 'FYI', mentions: ['u-vi', 'u-stranger'] })
    expect(emails().map(e => e.to)).toEqual(['vi@co.com'])
  })

  it('a reply emails the author of the comment replied to', async () => {
    const top = idOf(await post({ body: 'Top' }))
    as('u-co2')
    await post({ body: 'Reply', parentId: top })
    expect(emails()).toHaveLength(1)
    expect(emails()[0]).toMatchObject({ to: 'co@co.com', reason: 'reply' })
  })

  it('replying to your own comment emails nobody', async () => {
    const top = idOf(await post({ body: 'Top' }))
    await post({ body: 'Me again', parentId: top })
    expect(emails()).toHaveLength(0)
  })

  it('a person who is both mentioned and replied to gets one email, as a mention', async () => {
    const top = idOf(await post({ body: 'Top' }))
    as('u-co2')
    await post({ body: '@Co hello', parentId: top, mentions: ['u-co'] })
    expect(emails()).toHaveLength(1)
    expect(emails()[0]).toMatchObject({ to: 'co@co.com', reason: 'mention' })
  })

  it('someone who switched comment emails off is not emailed, but still sees the comment', async () => {
    await testDb.insert(schema.userNotificationPrefs).values({ userId: 'u-ed', commentEmails: false })
    await post({ body: '@Ed @Admin', mentions: ['u-ed', 'u-ad'] })
    expect(emails().map(e => e.to)).toEqual(['ad@co.com'])
    expect((await list())[0].mentions).toEqual(['u-ed', 'u-ad'])
  })

  it('a failing email never fails the comment', async () => {
    vi.mocked(sendCommentNotification).mockRejectedValueOnce(new Error('resend down'))
    expect((await post({ body: '@Ed', mentions: ['u-ed'] }))._status).toBe(201)
    expect(await list()).toHaveLength(1)
  })

  it('no emails for a plain comment', async () => {
    await post({ body: 'Just a note' })
    expect(emails()).toHaveLength(0)
  })

  it('the email text is HTML-escaped', async () => {
    const { readFileSync, mkdtempSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { sendCommentNotification: real } = await vi.importActual<typeof import('../_lib/email')>('../_lib/email')
    const dir = mkdtempSync(join(tmpdir(), 'mail-'))
    process.env.E2E_EMAIL_OUTBOX = join(dir, 'outbox.jsonl')
    delete process.env.RESEND_API_KEY
    try {
      await real({ to: 'a@co.com', reason: 'mention', authorName: '<b>Eve</b>', workspaceName: 'W', chartName: 'C', roleTitle: 'R', body: '<script>alert(1)</script>', url: 'https://x/y?a=1&b=2' })
      const mail = JSON.parse(readFileSync(process.env.E2E_EMAIL_OUTBOX, 'utf8').trim()) as { html: string }
      expect(mail.html).not.toContain('<script>')
      expect(mail.html).not.toContain('<b>Eve</b>')
      expect(mail.html).toContain('&lt;script&gt;')
    } finally {
      delete process.env.E2E_EMAIL_OUTBOX
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('resolve and reopen', () => {
  it('a commenter resolves and reopens a thread; a viewer cannot', async () => {
    const top = idOf(await post({ body: 'Top' }))
    as('u-vi')
    expect((await item(top, 'PUT', { resolved: true }))._status).toBe(403)
    as('u-co2')
    const done = await item(top, 'PUT', { resolved: true })
    expect(done._body).toMatchObject({ resolved: true, resolvedBy: 'u-co2' })
    const again = await item(top, 'PUT', { resolved: false })
    expect(again._body).toMatchObject({ resolved: false, resolvedBy: null })
  })

  it('only the first comment of a thread can be resolved', async () => {
    const top = idOf(await post({ body: 'Top' }))
    const reply = idOf(await post({ body: 'Reply', parentId: top }))
    expect((await item(reply, 'PUT', { resolved: true }))._status).toBe(400)
  })

  it('a reply to a resolved thread reopens it', async () => {
    const top = idOf(await post({ body: 'Top' }))
    await item(top, 'PUT', { resolved: true })
    await post({ body: 'Wait, one more thing', parentId: top })
    expect((await list())[0]).toMatchObject({ resolved: false })
  })

  it('open threads per role feed the canvas badges: resolved and replies do not count', async () => {
    await testDb.insert(schema.nodes).values({ id: 'n2', chartId: TEST_CHART_ID, name: 'B', title: 'COO', x: 0, y: 0 })
    const a = idOf(await post({ body: 'A' }))
    await post({ body: 'A reply', parentId: a })
    await post({ body: 'B' })
    const c = idOf(await post({ nodeId: 'n2', body: 'C' }))
    const d = idOf(await post({ nodeId: 'n2', body: 'D' }))
    await item(d, 'PUT', { resolved: true })
    const counts = (await call(commentsHandler, { method: 'GET', query: { ...q, counts: '1' } }))._body
    expect(counts).toEqual({ counts: { [TEST_NODE_ID]: 2, n2: 1 } })
    await item(c, 'PUT', { resolved: true })
    expect(((await call(commentsHandler, { method: 'GET', query: { ...q, counts: '1' } }))._body as { counts: Record<string, number> }).counts).toEqual({ [TEST_NODE_ID]: 2 })
  })

  it('PUT needs exactly one of body or resolved', async () => {
    const top = idOf(await post({ body: 'Top' }))
    expect((await item(top, 'PUT', {}))._status).toBe(400)
    expect((await item(top, 'PUT', { body: 'x', resolved: true }))._status).toBe(400)
  })
})

describe('editing', () => {
  it('only the author can edit, and it shows as edited', async () => {
    const id = idOf(await post({ body: 'Typo hree' }))
    const res = await item(id, 'PUT', { body: 'Typo here' })
    expect(res._status).toBe(200)
    expect(res._body).toMatchObject({ body: 'Typo here' })
    expect((res._body as { editedAt: string | null }).editedAt).not.toBeNull()
    for (const user of ['u-co2', 'u-ad', TEST_USER_ID]) {        // not even an admin or the owner may rewrite someone's words
      as(user)
      expect((await item(id, 'PUT', { body: 'Hacked' }))._status, user).toBe(403)
    }
    expect((await list())[0].body).toBe('Typo here')
  })

  it('an author who was moved to a read-only role can no longer edit', async () => {
    const id = idOf(await post({ body: 'Mine' }))
    await testDb.update(schema.workspaceMembers).set({ permission: 'viewer' }).where(eq(schema.workspaceMembers.userId, 'u-co'))
    expect((await item(id, 'PUT', { body: 'Changed' }))._status).toBe(403)
  })

  it('an edit that adds a mention emails only the newly mentioned person', async () => {
    const id = idOf(await post({ body: '@Ed look', mentions: ['u-ed'] }))
    vi.mocked(sendCommentNotification).mockClear()
    await item(id, 'PUT', { body: '@Ed @Admin look', mentions: ['u-ed', 'u-ad'] })
    expect(emails().map(e => e.to)).toEqual(['ad@co.com'])
  })

  it('a deleted comment cannot be edited', async () => {
    const top = idOf(await post({ body: 'Top' }))
    await post({ body: 'Reply', parentId: top })
    await item(top, 'DELETE')
    expect((await item(top, 'PUT', { body: 'Back from the dead' }))._status).toBe(404)
  })
})

describe('deleting', () => {
  it('authors delete their own comments, even after being moved to a read-only role', async () => {
    const id = idOf(await post({ body: 'Oops' }))
    await testDb.update(schema.workspaceMembers).set({ permission: 'viewer' }).where(eq(schema.workspaceMembers.userId, 'u-co'))
    expect((await item(id, 'DELETE'))._status).toBe(204)
    expect(await list()).toHaveLength(0)
  })

  it('other commenters and editors cannot delete it; owners and admins can (moderation)', async () => {
    const id = idOf(await post({ body: 'Rude' }))
    for (const user of ['u-co2', 'u-ed', 'u-vi']) {
      as(user)
      expect((await item(id, 'DELETE'))._status, user).toBe(403)
    }
    expect(await list()).toHaveLength(1)
    as('u-ad')
    expect((await item(id, 'DELETE'))._status).toBe(204)
    const again = idOf(await (async () => { as('u-co'); return post({ body: 'Rude again' }) })())
    as(TEST_USER_ID)
    expect((await item(again, 'DELETE'))._status).toBe(204)
  })

  it('deleting a comment that has replies keeps a deleted shell, so the thread survives', async () => {
    const top = idOf(await post({ body: 'Top with secrets', mentions: ['u-ed'] }))
    await post({ body: 'Reply', parentId: top })
    await item(top, 'DELETE')
    const comments = await list()
    expect(comments).toHaveLength(2)
    expect(comments[0]).toMatchObject({ id: top, deleted: true, body: '', mentions: [] })
    expect(JSON.stringify(await testDb.select().from(schema.roleComments))).not.toContain('secrets')   // the text is really gone
  })

  it('when the last reply of a deleted shell goes, the shell goes too', async () => {
    const top = idOf(await post({ body: 'Top' }))
    const r1 = idOf(await post({ body: 'R1', parentId: top }))
    const r2 = idOf(await post({ body: 'R2', parentId: top }))
    await item(top, 'DELETE')
    await item(r1, 'DELETE')
    expect(await list()).toHaveLength(2)                                  // shell + R2
    await item(r2, 'DELETE')
    expect(await list()).toHaveLength(0)
  })

  it('deleting a reply leaves a live thread alone', async () => {
    const top = idOf(await post({ body: 'Top' }))
    const reply = idOf(await post({ body: 'Reply', parentId: top }))
    await item(reply, 'DELETE')
    expect((await list()).map(c => c.body)).toEqual(['Top'])
  })

  it('404s for a comment that is not on this chart', async () => {
    expect((await item('nope', 'DELETE'))._status).toBe(404)
  })
})

describe('lifecycle', () => {
  it('comments disappear with their role', async () => {
    await post({ body: 'About this role' })
    await testDb.delete(schema.nodes).where(eq(schema.nodes.id, TEST_NODE_ID))
    expect(await testDb.select().from(schema.roleComments)).toHaveLength(0)
  })

  it('the workspace export carries the comments', async () => {
    await post({ body: 'Keep this' })
    as(TEST_USER_ID)
    const res = await call(exportHandler, { method: 'GET' })
    expect(JSON.parse(res._written).comments).toEqual([expect.objectContaining({ body: 'Keep this', nodeId: TEST_NODE_ID, authorId: 'u-co' })])
  })
})

describe('GET/PUT /api/notifications', () => {
  const get = () => call(notificationsHandler, { method: 'GET' })
  const put = (body: unknown) => call(notificationsHandler, { method: 'PUT', body })

  it('comment emails are on by default, and the choice is remembered per person', async () => {
    expect((await get())._body).toEqual({ comments: true })
    expect((await put({ comments: false }))._body).toEqual({ comments: false })
    expect((await get())._body).toEqual({ comments: false })
    as('u-ed')
    expect((await get())._body).toEqual({ comments: true })
    as('u-co')
    await put({ comments: true })
    expect((await get())._body).toEqual({ comments: true })
  })

  it('rejects anything but a yes or no', async () => {
    expect((await put({ comments: 'no' }))._status).toBe(400)
    expect((await put({}))._status).toBe(400)
  })

  it('a muted person really stops getting comment emails', async () => {
    as('u-ed')
    await put({ comments: false })
    as('u-co')
    await post({ body: '@Ed', mentions: ['u-ed'] })
    expect(emails()).toHaveLength(0)
  })
})
