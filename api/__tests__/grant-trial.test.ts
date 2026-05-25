import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})

import handler from '../admin/grant-trial'
import { setupSchema, cleanDb, seedWorkspace, testDb, TEST_WS_ID } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'
import { eq } from 'drizzle-orm'

const SECRET = 'test-admin-secret'

beforeAll(async () => { await setupSchema() })

beforeEach(async () => {
  await cleanDb()
  await seedWorkspace()
  process.env.ADMIN_SECRET = SECRET
})

afterEach(() => { delete process.env.ADMIN_SECRET })

const authHeader = { 'x-admin-secret': SECRET }

describe('POST /api/admin/grant-trial', () => {
  it('returns 405 for non-POST methods', async () => {
    const res = createRes()
    await handler(createReq({ method: 'GET', headers: authHeader }) as never, res as never)
    expect(res._status).toBe(405)
  })

  it('returns 401 when the admin secret is missing', async () => {
    const res = createRes()
    await handler(createReq({ method: 'POST', body: {} }) as never, res as never)
    expect(res._status).toBe(401)
  })

  it('returns 401 when the admin secret is wrong', async () => {
    const res = createRes()
    await handler(createReq({ method: 'POST', headers: { 'x-admin-secret': 'nope' }, body: {} }) as never, res as never)
    expect(res._status).toBe(401)
  })

  it('returns 400 when workspaceId or planTier is missing', async () => {
    const res = createRes()
    await handler(createReq({ method: 'POST', headers: authHeader, body: { workspaceId: TEST_WS_ID } }) as never, res as never)
    expect(res._status).toBe(400)
  })

  it('returns 400 for an invalid planTier', async () => {
    const res = createRes()
    await handler(
      createReq({ method: 'POST', headers: authHeader, body: { workspaceId: TEST_WS_ID, planTier: 'free' } }) as never,
      res as never,
    )
    expect(res._status).toBe(400)
  })

  it('returns 404 when the workspace does not exist', async () => {
    const res = createRes()
    await handler(
      createReq({ method: 'POST', headers: authHeader, body: { workspaceId: 'ws-missing', planTier: 'growth' } }) as never,
      res as never,
    )
    expect(res._status).toBe(404)
  })

  it('grants a trial and persists trialPlan + trialEndsAt', async () => {
    const res = createRes()
    await handler(
      createReq({ method: 'POST', headers: authHeader, body: { workspaceId: TEST_WS_ID, planTier: 'growth', days: 30 } }) as never,
      res as never,
    )
    expect(res._status).toBe(200)
    const body = res._body as { trialPlan: string; trialEndsAt: string }
    expect(body.trialPlan).toBe('growth')

    const [ws] = await testDb.select().from(schema.workspaces).where(eq(schema.workspaces.id, TEST_WS_ID))
    expect(ws.trialPlan).toBe('growth')
    expect(ws.trialEndsAt).toBeTruthy()
  })
})
