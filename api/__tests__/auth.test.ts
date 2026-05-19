import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})

// Mock Clerk backend — requireAuth/requireUser do a dynamic import of it
vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn(),
}))

import { verifyToken } from '@clerk/backend'
import { requireAuth, requireUser } from '../_lib/auth'
import { setupSchema, cleanDb, seedWorkspace, testDb, TEST_USER_ID, TEST_WS_ID } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'

const DEV_USER_ID = 'u-dev'
const DEV_WS_ID = 'ws-dev'

beforeAll(async () => { await setupSchema() })

beforeEach(async () => {
  await cleanDb()
  delete process.env.CLERK_SECRET_KEY
  delete process.env.VERCEL_ENV
  vi.mocked(verifyToken).mockReset()
})

describe('requireUser', () => {
  it('returns dev identity when x-dev-user header is set outside production', async () => {
    const req = createReq({ headers: { 'x-dev-user': 'true' } })
    const res = createRes()
    const result = await requireUser(req as never, res as never)
    expect(result).toEqual({ userId: DEV_USER_ID })
  })

  it('returns dev identity when CLERK_SECRET_KEY is absent outside production', async () => {
    const req = createReq()
    const res = createRes()
    const result = await requireUser(req as never, res as never)
    expect(result).toEqual({ userId: DEV_USER_ID })
  })

  it('returns 401 when auth header is missing in production', async () => {
    process.env.VERCEL_ENV = 'production'
    process.env.CLERK_SECRET_KEY = 'sk_live_test'
    const req = createReq()
    const res = createRes()
    const result = await requireUser(req as never, res as never)
    expect(result).toBeNull()
    expect(res._status).toBe(401)
  })

  it('verifies token and returns userId on success', async () => {
    process.env.CLERK_SECRET_KEY = 'sk_test_key'
    vi.mocked(verifyToken).mockResolvedValue({ sub: 'clerk-user-123' } as never)
    const req = createReq({ headers: { authorization: 'Bearer valid-token' } })
    const res = createRes()
    const result = await requireUser(req as never, res as never)
    expect(result).toEqual({ userId: 'clerk-user-123' })
  })

  it('returns 401 when token verification fails', async () => {
    process.env.CLERK_SECRET_KEY = 'sk_test_key'
    vi.mocked(verifyToken).mockRejectedValue(new Error('bad token'))
    const req = createReq({ headers: { authorization: 'Bearer bad-token' } })
    const res = createRes()
    const result = await requireUser(req as never, res as never)
    expect(result).toBeNull()
    expect(res._status).toBe(401)
  })
})

describe('requireAuth', () => {
  it('returns dev identity and creates dev workspace when x-dev-user header is set', async () => {
    const req = createReq({ headers: { 'x-dev-user': 'true' } })
    const res = createRes()
    const result = await requireAuth(req as never, res as never)
    expect(result).toEqual({ userId: DEV_USER_ID, workspaceId: DEV_WS_ID })
    // Dev workspace must be created in DB
    const ws = await testDb.select().from(schema.workspaces)
    expect(ws.some(w => w.id === DEV_WS_ID)).toBe(true)
  })

  it('dev workspace creation is idempotent — calling twice does not throw', async () => {
    const req = createReq({ headers: { 'x-dev-user': 'true' } })
    const res = createRes()
    await requireAuth(req as never, res as never)
    // Second call: workspace already exists, should not throw
    const res2 = createRes()
    const result2 = await requireAuth(req as never, res2 as never)
    expect(result2).toEqual({ userId: DEV_USER_ID, workspaceId: DEV_WS_ID })
  })

  it('returns 401 when auth header is missing in production', async () => {
    process.env.VERCEL_ENV = 'production'
    process.env.CLERK_SECRET_KEY = 'sk_live_test'
    const req = createReq()
    const res = createRes()
    const result = await requireAuth(req as never, res as never)
    expect(result).toBeNull()
    expect(res._status).toBe(401)
  })

  it('returns 404 with no-workspace error when user has no membership', async () => {
    process.env.CLERK_SECRET_KEY = 'sk_test_key'
    vi.mocked(verifyToken).mockResolvedValue({ sub: 'clerk-new-user' } as never)
    const req = createReq({ headers: { authorization: 'Bearer token' } })
    const res = createRes()
    const result = await requireAuth(req as never, res as never)
    expect(result).toBeNull()
    expect(res._status).toBe(404)
    expect((res._body as { error: string }).error).toBe('no-workspace')
  })

  it('returns auth context with workspaceId when user has membership', async () => {
    await seedWorkspace()
    process.env.CLERK_SECRET_KEY = 'sk_test_key'
    vi.mocked(verifyToken).mockResolvedValue({ sub: TEST_USER_ID } as never)
    const req = createReq({ headers: { authorization: 'Bearer token' } })
    const res = createRes()
    const result = await requireAuth(req as never, res as never)
    expect(result).toEqual({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
  })

  it('does not apply dev bypass in production even with x-dev-user header', async () => {
    process.env.VERCEL_ENV = 'production'
    process.env.CLERK_SECRET_KEY = 'sk_live_test'
    const req = createReq({ headers: { 'x-dev-user': 'true' } })
    const res = createRes()
    const result = await requireAuth(req as never, res as never)
    // Falls through to normal auth (no Bearer → 401)
    expect(result).toBeNull()
    expect(res._status).toBe(401)
  })
})
