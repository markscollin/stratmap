// R-74: check-then-insert races. Each case failed before the fix.
import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
vi.mock('../_lib/auth', () => ({ requireAuth: vi.fn(), requireUser: vi.fn() }))
vi.mock('../_lib/identity', () => ({ getUserIdentity: vi.fn() }))

import { eq } from 'drizzle-orm'
import { requireAuth, requireUser } from '../_lib/auth'
import { getUserIdentity } from '../_lib/identity'
import acceptHandler from '../invites/accept'
import jdHandler from '../charts/[id]/jd/[nodeId]'
import workspaceHandler from '../workspace'
import { setupSchema, cleanDb, seedWorkspace, seedChart, seedNode, seedMember, testDb, TEST_USER_ID, TEST_WS_ID, TEST_CHART_ID, TEST_NODE_ID } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'

type H = (req: never, res: never) => unknown
const call = async (h: H, opts: Parameters<typeof createReq>[0]) => { const res = createRes(); await h(createReq(opts) as never, res as never); return res }
const execSql = (text: string) => (testDb as unknown as { $client: { exec: (t: string) => Promise<unknown> } }).$client.exec(text)

beforeAll(async () => { await setupSchema() })
beforeEach(async () => { await cleanDb(); vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks() })

describe('R-74.1 accepting an invite recounts the seats after joining', () => {
  it('a member who joined in between, filling the last seat, makes this accept a 402 with the invite kept', async () => {
    await seedWorkspace()                                   // Free: 3 seats, the owner is 1
    await seedMember('u-a', 'editor')                       // 2
    await testDb.insert(schema.pendingInvites).values({ id: 'inv', workspaceId: TEST_WS_ID, email: 'new@co.com', permission: 'viewer' })
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u-new' })
    vi.mocked(getUserIdentity).mockResolvedValue({ emails: ['new@co.com'], name: 'New', avatarUrl: null })
    // someone else takes the last seat after this request's check and before its insert
    const realInsert = testDb.insert.bind(testDb)
    let raced = false
    vi.spyOn(testDb, 'insert').mockImplementation(((table: unknown) => {
      if (table === schema.workspaceMembers && !raced) {
        raced = true
        return { values: (v: never) => ({ onConflictDoNothing: async () => {
          await realInsert(schema.workspaceMembers).values({ id: 'wm-rival', workspaceId: TEST_WS_ID, userId: 'u-rival', email: 'r@co.com', permission: 'viewer' })
          return realInsert(table as never).values(v).onConflictDoNothing()
        }, then: undefined }) }
      }
      return realInsert(table as never)
    }) as never)
    const res = await call(acceptHandler as H, { method: 'POST', body: { inviteId: 'inv' } })
    expect(res._status).toBe(402)
    const members = await testDb.select().from(schema.workspaceMembers).where(eq(schema.workspaceMembers.workspaceId, TEST_WS_ID))
    expect(members.map(m => m.userId).sort()).toEqual([TEST_USER_ID, 'u-a', 'u-rival'].sort())
    expect(await testDb.select().from(schema.pendingInvites)).toHaveLength(1)
  })
})

describe('R-74.2 two first saves of a job description', () => {
  it('leave one row, not two', async () => {
    await seedWorkspace(); await seedChart(); await seedNode()
    await testDb.update(schema.workspaces).set({ planTier: 'starter' })
    vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
    const put = (text: string) => call(jdHandler as H, { method: 'PUT', query: { id: TEST_CHART_ID, nodeId: TEST_NODE_ID }, body: { responsibilities: text } })
    const [a, b] = await Promise.all([put('<p>first</p>'), put('<p>second</p>')])
    expect([a._status, b._status].every(s => s === 200 || s === 201)).toBe(true)
    expect(await testDb.select().from(schema.jobDescriptions)).toHaveLength(1)
  })
})

describe('R-74.3 creating a workspace', () => {
  afterEach(async () => { await execSql('DROP TRIGGER IF EXISTS fail_member ON workspace_members') })
  it('a failure adding the owner leaves no workspace behind, and the trial is not used up', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: 'u-founder' })
    vi.mocked(getUserIdentity).mockResolvedValue({ emails: ['f@co.com'], name: 'F', avatarUrl: null })
    await execSql(`
      CREATE OR REPLACE FUNCTION fail_member() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'member insert failed'; END $$;
      CREATE TRIGGER fail_member BEFORE INSERT ON workspace_members FOR EACH STATEMENT EXECUTE FUNCTION fail_member();`)
    const res = await call(workspaceHandler as H, { method: 'POST', body: { name: 'Mine', ownerRole: 'Founder/CEO', size: '1-10' } })
    expect(res._status).toBe(500)
    expect(await testDb.select().from(schema.workspaces).where(eq(schema.workspaces.ownerId, 'u-founder'))).toHaveLength(0)
    expect(await testDb.select().from(schema.trialGrants)).toHaveLength(0)
  })
})

describe('R-74.2 migration 0019', () => {
  it('removes duplicate job descriptions, keeping the newest, before making (chart, role) unique', async () => {
    const fs = await import('node:fs')
    const file = fs.readdirSync('drizzle').find(f => f.startsWith('0019_'))!
    const statements = fs.readFileSync(`drizzle/${file}`, 'utf8').split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)
    await seedWorkspace(); await seedChart(); await seedNode()
    await execSql('DROP INDEX job_descriptions_chart_node_uq')
    const row = (id: string, at: string, text: string) => ({ id, nodeId: TEST_NODE_ID, chartId: TEST_CHART_ID, status: 'draft' as const, responsibilities: text, requirements: '', version: 1, updatedBy: 'u', updatedAt: new Date(at) })
    await testDb.insert(schema.jobDescriptions).values([row('jd-old', '2026-01-01', 'old'), row('jd-new', '2026-02-01', 'new')])
    // the migration as written: the clean-up, then the unique index
    await execSql(statements[0])
    await execSql(statements[1])
    const left = await testDb.select().from(schema.jobDescriptions)
    expect(left.map(j => j.id)).toEqual(['jd-new'])
  })
})
