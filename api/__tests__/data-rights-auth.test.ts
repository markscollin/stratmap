// Roadmap 4.2 with the REAL requireAuth/requireUser (dev-bypass identities): a deleted workspace is invisible to
// everyone at once, a new workspace can be created straight away, and a removed member loses access on their next request.
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
vi.mock('../_lib/email', async (orig) => ({
  ...(await orig<typeof import('../_lib/email')>()),
  sendWorkspaceDeleted: vi.fn().mockResolvedValue({ sent: false, skipped: true }),
}))

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import workspaceHandler from '../workspace'
import workspacesHandler from '../workspaces'
import chartsHandler from '../charts/index'
import memberHandler from '../workspace/members/[userId]'
import { setupSchema, cleanDb, testDb } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes, type MockRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'

type Handler = (req: VercelRequest, res: VercelResponse) => unknown
async function call(handler: Handler, opts: Parameters<typeof createReq>[0] & { as: string; ws?: string }): Promise<MockRes> {
  const headers: Record<string, string> = { 'x-dev-user': opts.as, ...(opts.ws ? { 'x-workspace-id': opts.ws } : {}) }
  const res = createRes()
  await handler(createReq({ ...opts, headers }) as never, res as never)
  return res
}

// owner "olive" and editor "ed" in ws-a; ed is also in ws-b (owned by "bo")
async function seed() {
  await testDb.insert(schema.workspaces).values([
    { id: 'ws-a', name: 'Alpha', ownerId: 'dev-olive', ownerRole: 'CEO', size: '1-10' },
    { id: 'ws-b', name: 'Beta', ownerId: 'dev-bo', ownerRole: 'CEO', size: '1-10' },
  ])
  await testDb.insert(schema.workspaceMembers).values([
    { id: 'm1', workspaceId: 'ws-a', userId: 'dev-olive', email: 'olive@e2e.test', permission: 'owner', joinedAt: new Date('2026-01-01') },
    { id: 'm2', workspaceId: 'ws-a', userId: 'dev-ed', email: 'ed@e2e.test', permission: 'editor', joinedAt: new Date('2026-01-02') },
    { id: 'm3', workspaceId: 'ws-b', userId: 'dev-bo', email: 'bo@e2e.test', permission: 'owner', joinedAt: new Date('2026-01-01') },
    { id: 'm4', workspaceId: 'ws-b', userId: 'dev-ed', email: 'ed@e2e.test', permission: 'viewer', joinedAt: new Date('2026-02-01') },
  ])
}

beforeAll(async () => { await setupSchema() })
beforeEach(async () => {
  await cleanDb()
  delete process.env.VERCEL_ENV
  delete process.env.CLERK_SECRET_KEY
  delete process.env.STRIPE_SECRET_KEY
  await seed()
})

describe('a deleted workspace', () => {
  it('is gone for every member at once, and their other workspaces still work', async () => {
    expect((await call(workspaceHandler, { method: 'GET', as: 'ed', ws: 'ws-a' }))._status).toBe(200)

    const del = await call(workspaceHandler, { method: 'DELETE', as: 'olive', ws: 'ws-a', body: { confirmName: 'Alpha' } })
    expect(del._status).toBe(200)

    // Asking for it by id: not a member (the client forgets it and retries).
    for (const user of ['olive', 'ed']) {
      const res = await call(workspaceHandler, { method: 'GET', as: user, ws: 'ws-a' })
      expect([user, res._status, (res._body as { error: string }).error]).toEqual([user, 403, 'not-a-member'])
    }
    // Without asking: ed falls back to Beta; olive has nothing left, so she is sent to onboarding.
    const ed = await call(workspaceHandler, { method: 'GET', as: 'ed' })
    expect(ed._status).toBe(200)
    expect((ed._body as { id: string }).id).toBe('ws-b')
    const olive = await call(workspaceHandler, { method: 'GET', as: 'olive' })
    expect([olive._status, (olive._body as { error: string }).error]).toEqual([404, 'no-workspace'])

    // The switcher list leaves it out.
    const list = await call(workspacesHandler, { method: 'GET', as: 'ed' })
    expect((list._body as { workspaces: { id: string }[] }).workspaces.map(w => w.id)).toEqual(['ws-b'])
  })

  it('writes are refused too, not just reads', async () => {
    await call(workspaceHandler, { method: 'DELETE', as: 'olive', ws: 'ws-a', body: { confirmName: 'Alpha' } })
    const res = await call(chartsHandler, { method: 'POST', as: 'olive', ws: 'ws-a', body: { name: 'Sneaky' } })
    expect(res._status).toBe(403)
    expect(await testDb.select().from(schema.charts)).toHaveLength(0)
  })

  it('the owner can start a new workspace straight away', async () => {
    await call(workspaceHandler, { method: 'DELETE', as: 'olive', ws: 'ws-a', body: { confirmName: 'Alpha' } })
    const res = await call(workspaceHandler, { method: 'POST', as: 'olive', body: { name: 'Fresh start', ownerRole: 'CEO', size: '1-10', email: 'olive@e2e.test' } })
    expect(res._status).toBe(201)
    expect((res._body as { name: string }).name).toBe('Fresh start')
  })

  it('someone whose only workspace was deleted may create a new one; someone with a live one still gets that one', async () => {
    await call(workspaceHandler, { method: 'DELETE', as: 'olive', ws: 'ws-a', body: { confirmName: 'Alpha' } })
    // ed is also in Beta, which is live: the create-workspace guard hands him Beta, as before.
    const guarded = await call(workspaceHandler, { method: 'POST', as: 'ed', body: { name: 'Eds own', ownerRole: 'CEO', size: '1-10' } })
    expect([guarded._status, (guarded._body as { id: string }).id]).toEqual([200, 'ws-b'])
    // Take Beta away: his only membership is the deleted workspace, which no longer counts.
    await testDb.delete(schema.workspaceMembers).where(eq(schema.workspaceMembers.id, 'm4'))
    const created = await call(workspaceHandler, { method: 'POST', as: 'ed', body: { name: 'Eds own', ownerRole: 'CEO', size: '1-10' } })
    expect(created._status).toBe(201)
  })
})

describe('removing a member', () => {
  it('revokes their access on their very next request', async () => {
    expect((await call(workspaceHandler, { method: 'GET', as: 'ed', ws: 'ws-a' }))._status).toBe(200)

    const res = await call(memberHandler, { method: 'DELETE', as: 'olive', ws: 'ws-a', query: { userId: 'dev-ed' } })
    expect(res._status).toBe(204)

    const after = await call(workspaceHandler, { method: 'GET', as: 'ed', ws: 'ws-a' })
    expect([after._status, (after._body as { error: string }).error]).toEqual([403, 'not-a-member'])
    expect((await call(chartsHandler, { method: 'POST', as: 'ed', ws: 'ws-a', body: { name: 'x' } }))._status).toBe(403)
    // ...while their other workspace is untouched.
    expect((await call(workspaceHandler, { method: 'GET', as: 'ed', ws: 'ws-b' }))._status).toBe(200)
  })
})
