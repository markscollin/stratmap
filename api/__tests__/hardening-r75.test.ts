// R-75: small hardening. Identity, token audience, colours, public photos and restoring a role whose id was taken.
import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})

import { eq } from 'drizzle-orm'
import { getUserIdentity } from '../_lib/identity'
import { authorizedParties } from '../_lib/auth'
import { DepartmentCreate, NodeCreate } from '../_lib/schemas'
import { publicNode, isPublicAvatar } from '../_lib/sharedFields'
import { setupSchema, cleanDb, seedWorkspace, seedChart, seedNode, testDb, TEST_USER_ID, TEST_WS_ID, TEST_CHART_ID, TEST_NODE_ID } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'

const saved = { ...process.env }
afterEach(() => { process.env = { ...saved } })

describe('dev identities (R-75)', () => {
  it('a dev- user id gets an invented identity only while the dev bypass is allowed', async () => {
    process.env.ALLOW_DEV_BYPASS = '1'
    expect((await getUserIdentity('dev-alice')).emails).toEqual(['alice@e2e.test'])
    delete process.env.ALLOW_DEV_BYPASS
    process.env.VERCEL_ENV = 'production'
    await expect(getUserIdentity('dev-alice')).rejects.toThrow()
  })
})

describe('session token audience (R-75)', () => {
  it('uses CLERK_AUTHORIZED_PARTIES, else APP_URL on production, else no check', () => {
    delete process.env.CLERK_AUTHORIZED_PARTIES; delete process.env.APP_URL; delete process.env.VERCEL_ENV
    expect(authorizedParties()).toBeUndefined()
    process.env.APP_URL = 'https://stratmap.example.com/'
    expect(authorizedParties()).toBeUndefined() // not production
    process.env.VERCEL_ENV = 'production'
    expect(authorizedParties()).toEqual(['https://stratmap.example.com'])
    process.env.CLERK_AUTHORIZED_PARTIES = 'https://a.example.com, https://b.example.com/'
    expect(authorizedParties()).toEqual(['https://a.example.com', 'https://b.example.com'])
  })
})

describe('colours and photos (R-75)', () => {
  it('a department colour must be #RRGGBB', () => {
    expect(DepartmentCreate.safeParse({ name: 'Eng', colour: '#0EA5E9' }).success).toBe(true)
    for (const bad of ['red', '#abc', 'url(https://x)', '#0EA5E9; background: red', 'var(--brand)']) {
      expect(DepartmentCreate.safeParse({ name: 'Eng', colour: bad }).success, bad).toBe(false)
    }
  })
  it('a role photo must be an https address', () => {
    const base = { name: 'A', title: 'B', x: 0, y: 0 }
    expect(NodeCreate.safeParse({ ...base, avatarUrl: 'https://img.clerk.com/x.png' }).success).toBe(true)
    expect(NodeCreate.safeParse({ ...base, avatarUrl: 'http://tracker.example/pixel.gif' }).success).toBe(false)
    expect(NodeCreate.safeParse({ ...base, avatarUrl: 'javascript:alert(1)' }).success).toBe(false)
  })
  it('public pages show photos only from the sign-in provider and common photo hosts', () => {
    expect(isPublicAvatar('https://img.clerk.com/abc')).toBe(true)
    expect(isPublicAvatar('https://tracker.example/pixel.gif')).toBe(false)
    const row = { id: 'n', chartId: 'c', name: 'A', title: 'B', avatarUrl: 'https://tracker.example/me.png' } as never
    expect(publicNode(row).avatarUrl).toBeNull()
  })
})

describe('restoring a role whose id another chart has taken (R-75)', () => {
  beforeAll(async () => { await setupSchema() })
  beforeEach(async () => { await cleanDb(); await seedWorkspace(); await seedChart(); await seedNode() })
  it('comes back under a fresh id with its comments, instead of failing', async () => {
    vi.doMock('../_lib/auth', async (orig) => ({ ...(await orig<typeof import('../_lib/auth')>()), requireAuth: vi.fn().mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID }) }))
    const del = (await import('../charts/[id]/nodes/[nodeId]')).default
    const restore = (await import('../charts/[id]/nodes/[nodeId]/restore')).default
    await testDb.update(schema.workspaces).set({ planTier: 'growth' })
    await testDb.insert(schema.roleComments).values({ id: 'c1', workspaceId: TEST_WS_ID, chartId: TEST_CHART_ID, nodeId: TEST_NODE_ID, authorId: TEST_USER_ID, body: 'keep me', mentions: [] })
    const run = async (h: (q: never, r: never) => unknown, method: string) => { const res = createRes(); await h(createReq({ method, query: { id: TEST_CHART_ID, nodeId: TEST_NODE_ID } }) as never, res as never); return res }
    expect((await run(del as never, 'DELETE'))._status).toBe(204)
    // someone else's chart now uses that id
    await testDb.insert(schema.charts).values({ id: 'chart-x', workspaceId: TEST_WS_ID, name: 'X', version: 1, ownerId: TEST_USER_ID, creatorId: TEST_USER_ID })
    await testDb.insert(schema.nodes).values({ id: TEST_NODE_ID, chartId: 'chart-x', name: 'Squatter', title: 'S', x: 0, y: 0 })
    const res = await run(restore as never, 'POST')
    expect(res._status).toBe(201)
    const body = res._body as { id: string; rekeyed?: boolean }
    expect(body.rekeyed).toBe(true)
    expect(body.id).not.toBe(TEST_NODE_ID)
    const [back] = await testDb.select().from(schema.nodes).where(eq(schema.nodes.id, body.id))
    expect(back).toMatchObject({ chartId: TEST_CHART_ID, name: 'Alice' })
    const comments = await testDb.select().from(schema.roleComments).where(eq(schema.roleComments.nodeId, body.id))
    expect(comments.map(c => c.body)).toEqual(['keep me'])
    vi.doUnmock('../_lib/auth')
  })
})
