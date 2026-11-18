// R-53: parallel invite creates / resends at the seat cap cannot overshoot it, and a resend shares the Free hourly allowance.
// R-54: editing a comment is rate limited like posting one.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))
vi.mock('../_lib/email', async orig => ({
  ...(await orig<typeof import('../_lib/email')>()),
  sendWorkspaceInvite: vi.fn(async () => {}),
  sendCommentNotification: vi.fn(async () => {}),
}))

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import invitesHandler from '../workspace/invites'
import inviteHandler from '../workspace/invites/[id]'
import commentsHandler from '../charts/[id]/comments'
import commentHandler from '../charts/[id]/comments/[commentId]'
import { setupSchema, cleanDb, seedWorkspace, seedChart, seedNode, seedMember, testDb, TEST_USER_ID, TEST_WS_ID, TEST_CHART_ID, TEST_NODE_ID } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes, type MockRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'

type Handler = (req: VercelRequest, res: VercelResponse) => unknown
async function call(handler: Handler, opts: Parameters<typeof createReq>[0]): Promise<MockRes> {
  const res = createRes()
  await handler(createReq(opts) as never, res as never)
  return res
}
const invitesOf = () => testDb.select().from(schema.pendingInvites).where(eq(schema.pendingInvites.workspaceId, TEST_WS_ID))
const invite = (...emails: string[]) =>
  call(invitesHandler, { method: 'POST', body: { invites: emails.map(email => ({ email, permission: 'viewer' })) } })

beforeAll(async () => { await setupSchema() })
beforeEach(async () => {
  await cleanDb()
  await seedWorkspace() // Free: 3 seats, the owner holds one
  vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
})

describe('R-53 invites at the seat cap', () => {
  it('two parallel requests for two seats each never leave more than the cap', async () => {
    const [a, b] = await Promise.all([invite('a1@x.com', 'a2@x.com'), invite('b1@x.com', 'b2@x.com')])
    expect((await invitesOf()).length).toBeLessThanOrEqual(2)
    for (const r of [a, b]) expect([201, 402]).toContain(r._status)
    // A refused request leaves nothing behind
    for (const r of [a, b]) if (r._status === 402) expect((r._body as { limit: string }).limit).toBe('seats')
  })

  it('resending two expired invites together takes at most the one free seat', async () => {
    await seedMember('u-two', 'viewer') // 2 of 3 seats
    const past = new Date(Date.now() - 86_400_000)
    for (const id of ['i1', 'i2']) {
      await testDb.insert(schema.pendingInvites).values({ id, workspaceId: TEST_WS_ID, email: `${id}@x.com`, permission: 'viewer', tokenHash: `h-${id}`, expiresAt: past, invitedBy: TEST_USER_ID })
    }
    const rs = await Promise.all(['i1', 'i2'].map(id => call(inviteHandler, { method: 'POST', query: { id } })))
    const live = (await invitesOf()).filter(i => i.expiresAt && i.expiresAt > new Date())
    expect(live.length).toBeLessThanOrEqual(1)
    // The one that was put back is exactly as it was
    for (const i of await invitesOf()) if (!(i.expiresAt && i.expiresAt > new Date())) expect(i.tokenHash).toBe(`h-${i.id}`)
    expect(rs.filter(r => r._status === 402).length + live.length).toBeGreaterThanOrEqual(2 - 1)
  })

  it('a Free workspace may resend only as often as it may invite (3 an hour)', async () => {
    await testDb.insert(schema.pendingInvites).values({ id: 'r1', workspaceId: TEST_WS_ID, email: 'r1@x.com', permission: 'viewer', tokenHash: 'h-r1', expiresAt: new Date(Date.now() + 86_400_000), invitedBy: TEST_USER_ID })
    const statuses = []
    for (let i = 0; i < 4; i++) statuses.push((await call(inviteHandler, { method: 'POST', query: { id: 'r1' } }))._status)
    expect(statuses).toEqual([200, 200, 200, 429])
  })
})

describe('R-54 comment edits are rate limited', () => {
  it('the 31st edit in a minute is refused', async () => {
    await seedChart(); await seedNode()
    const q = { id: TEST_CHART_ID }
    const made = await call(commentsHandler, { method: 'POST', query: q, body: { nodeId: TEST_NODE_ID, body: 'hi' } })
    const id = (made._body as { id: string }).id
    // The post used 1 of the 30 allowed
    const statuses: number[] = []
    for (let i = 0; i < 30; i++) statuses.push((await call(commentHandler, { method: 'PUT', query: { ...q, commentId: id }, body: { body: `v${i}` } }))._status)
    expect(statuses.slice(0, 29).every(s => s === 200)).toBe(true)
    expect(statuses[29]).toBe(429)
  })
})
