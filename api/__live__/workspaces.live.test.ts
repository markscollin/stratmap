// Roadmap 1.2 against a real Neon database: a user in two workspaces picks one with
// X-Workspace-Id (membership checked on the neon-http driver), and GET /api/workspaces
// lists both. Clerk is mocked; everything else is real.
// Run: DATABASE_URL=<dev branch url> npm run test:live
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest'

vi.mock('@clerk/backend', () => ({ verifyToken: vi.fn() }))

import { inArray } from 'drizzle-orm'
import { verifyToken } from '@clerk/backend'
import { db } from '../_lib/db'
import { requireAuth } from '../_lib/auth'
import * as schema from '../../src/lib/db/schema'
import workspacesHandler from '../workspaces'
import { createReq } from '../__tests__/helpers/req'
import { createRes } from '../__tests__/helpers/res'

const RUN = `live-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const USER = `u-${RUN}`
const WS = [`ws-a-${RUN}`, `ws-b-${RUN}`, `ws-c-${RUN}`]

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for live tests')
if (process.env.VERCEL_ENV === 'production') throw new Error('Refusing to run live tests against production')

let savedKey: string | undefined

beforeAll(async () => {
  savedKey = process.env.CLERK_SECRET_KEY
  process.env.CLERK_SECRET_KEY = 'sk_test_live'
  vi.mocked(verifyToken).mockResolvedValue({ sub: USER } as never)
  await db.insert(schema.workspaces).values(WS.map((id, i) => ({ id, name: `Live ${i}`, ownerId: 'x', ownerRole: 'Founder/CEO', size: '1-10' })))
  await db.insert(schema.workspaceMembers).values([
    { id: `m-a-${RUN}`, workspaceId: WS[0], userId: USER, email: 'l@example.test', permission: 'owner', joinedAt: new Date('2026-01-01') },
    { id: `m-b-${RUN}`, workspaceId: WS[1], userId: USER, email: 'l@example.test', permission: 'viewer', joinedAt: new Date('2026-02-01') },
  ])
})

afterAll(async () => {
  await db.delete(schema.workspaces).where(inArray(schema.workspaces.id, WS))
  if (savedKey === undefined) delete process.env.CLERK_SECRET_KEY
  else process.env.CLERK_SECRET_KEY = savedKey
})

async function auth(headers: Record<string, string> = {}) {
  const res = createRes()
  const ctx = await requireAuth(createReq({ headers: { authorization: 'Bearer t', ...headers } }) as never, res as never)
  return { ctx, res }
}

describe('multiple workspaces on Neon', () => {
  it('picks the workspace from X-Workspace-Id, falls back to the first joined, refuses non-members', async () => {
    expect((await auth({ 'x-workspace-id': WS[1] })).ctx).toEqual({ userId: USER, workspaceId: WS[1], permission: 'viewer' })
    expect((await auth()).ctx).toEqual({ userId: USER, workspaceId: WS[0], permission: 'owner' })
    const denied = await auth({ 'x-workspace-id': WS[2] })
    expect(denied.ctx).toBeNull()
    expect(denied.res._status).toBe(403)
  })

  it('lists both workspaces', async () => {
    const res = createRes()
    await workspacesHandler(createReq({ method: 'GET', headers: { authorization: 'Bearer t' } }) as never, res as never)
    expect((res._body as { workspaces: { id: string }[] }).workspaces.map(w => w.id)).toEqual([WS[0], WS[1]])
  })
})
