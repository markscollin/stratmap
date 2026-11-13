import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})

vi.mock('../_lib/auth', () => ({
  requireAuth: vi.fn(),
  requireUser: vi.fn(),
}))

vi.mock('../_lib/identity', () => ({ getUserIdentity: vi.fn(), deleteUserAccount: vi.fn() }))

import { requireAuth, requireUser } from '../_lib/auth'
import { getUserIdentity } from '../_lib/identity'
import handler from '../workspace'
import { setupSchema, cleanDb, seedWorkspace, testDb, TEST_USER_ID, TEST_WS_ID } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'
import { eq } from 'drizzle-orm'

beforeAll(async () => { await setupSchema() })

beforeEach(async () => {
  await cleanDb()
  vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
  vi.mocked(requireUser).mockResolvedValue({ userId: TEST_USER_ID })
  vi.mocked(getUserIdentity).mockResolvedValue({ emails: ['verified@co.com'], name: 'Verified Person', avatarUrl: null })
})

describe('GET /api/workspace', () => {
  it('returns workspace with members', async () => {
    await seedWorkspace()
    const res = createRes()
    await handler(createReq() as never, res as never)
    expect(res._status).toBe(200)
    const body = res._body as { id: string; members: unknown[] }
    expect(body.id).toBe(TEST_WS_ID)
    expect(body.members).toHaveLength(1)
  })

  it('returns 404 when workspace does not exist', async () => {
    const res = createRes()
    await handler(createReq() as never, res as never)
    expect(res._status).toBe(404)
  })

  it('returns 405 for unsupported methods', async () => {
    await seedWorkspace()
    const res = createRes()
    await handler(createReq({ method: 'PATCH' }) as never, res as never)
    expect(res._status).toBe(405)
  })

  it('returns subscription state and keeps Stripe ids server-side', async () => {
    await seedWorkspace()
    const end = new Date('2030-03-17T00:00:00Z')
    await testDb.update(schema.workspaces)
      .set({ planTier: 'starter', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', subscriptionStatus: 'past_due', planExpiresAt: end, cancelAtPeriodEnd: true })
      .where(eq(schema.workspaces.id, TEST_WS_ID))
    const res = createRes()
    await handler(createReq() as never, res as never)
    const body = res._body as Record<string, unknown>
    expect(body.planTier).toBe('starter')
    expect(body.billing).toEqual({ status: 'past_due', planExpiresAt: end, cancelAtPeriodEnd: true, hasBillingAccount: true })
    expect(body).not.toHaveProperty('stripeCustomerId')
    expect(body).not.toHaveProperty('stripeSubscriptionId')
  })

  it('resolves an active admin trial as the effective planTier', async () => {
    await seedWorkspace()
    const future = new Date()
    future.setDate(future.getDate() + 30)
    await testDb.update(schema.workspaces)
      .set({ planTier: 'free', trialPlan: 'growth', trialEndsAt: future })
      .where(eq(schema.workspaces.id, TEST_WS_ID))

    const res = createRes()
    await handler(createReq() as never, res as never)
    expect((res._body as { planTier: string }).planTier).toBe('growth')
  })

  it('falls back to the base planTier when the trial has expired', async () => {
    await seedWorkspace()
    const past = new Date()
    past.setDate(past.getDate() - 1)
    await testDb.update(schema.workspaces)
      .set({ planTier: 'starter', trialPlan: 'growth', trialEndsAt: past })
      .where(eq(schema.workspaces.id, TEST_WS_ID))

    const res = createRes()
    await handler(createReq() as never, res as never)
    expect((res._body as { planTier: string }).planTier).toBe('starter')
  })
})

describe('POST /api/workspace', () => {
  it('creates a workspace and returns 201', async () => {
    const res = createRes()
    await handler(
      createReq({ method: 'POST', body: { name: 'Acme', ownerRole: 'Founder/CEO', size: '11-50' } }) as never,
      res as never,
    )
    expect(res._status).toBe(201)
    const body = res._body as { name: string }
    expect(body.name).toBe('Acme')
  })

  it('seeds the owner as a workspace member', async () => {
    const res = createRes()
    await handler(
      createReq({ method: 'POST', body: { name: 'Acme', ownerRole: 'Founder/CEO', size: '11-50' } }) as never,
      res as never,
    )
    const members = await testDb.select().from(schema.workspaceMembers).where(eq(schema.workspaceMembers.userId, TEST_USER_ID))
    expect(members).toHaveLength(1)
    expect(members[0].permission).toBe('owner')
  })

  // Launch review R-09: the owner's email and name come from the sign-in provider, never from the request.
  it('stores the verified email and name from the sign-in provider, ignoring what the body claims', async () => {
    const res = createRes()
    await handler(
      createReq({ method: 'POST', body: { name: 'Acme', ownerRole: 'Founder/CEO', size: '11-50', email: 'ceo@victim-company.com', userName: 'Someone Else' } }) as never,
      res as never,
    )
    expect(res._status).toBe(201)
    const [member] = await testDb.select().from(schema.workspaceMembers).where(eq(schema.workspaceMembers.userId, TEST_USER_ID))
    expect(member.email).toBe('verified@co.com')
    expect(member.name).toBe('Verified Person')
    expect(JSON.stringify(await testDb.select().from(schema.workspaceMembers))).not.toContain('victim-company')
  })

  it('stores no email at all when the provider has no verified address (never the claimed one)', async () => {
    vi.mocked(getUserIdentity).mockResolvedValue({ emails: [], name: null, avatarUrl: null })
    await handler(createReq({ method: 'POST', body: { name: 'Acme', ownerRole: 'CEO', size: '1-10', email: 'x@y.com' } }) as never, createRes() as never)
    const [member] = await testDb.select().from(schema.workspaceMembers).where(eq(schema.workspaceMembers.userId, TEST_USER_ID))
    expect(member.email).toBe('')
  })

  it('if the sign-in provider cannot be asked, no workspace is created and the client is told to retry', async () => {
    vi.mocked(getUserIdentity).mockRejectedValue(new Error('clerk down'))
    const res = createRes()
    await handler(createReq({ method: 'POST', body: { name: 'Acme', ownerRole: 'CEO', size: '1-10' } }) as never, res as never)
    expect(res._status).toBe(503)
    expect((res._body as { error: string }).error).toBe('identity-unavailable')
    expect(await testDb.select().from(schema.workspaces)).toHaveLength(0)
  })

  it('returns 400 when required fields are missing', async () => {
    const res = createRes()
    await handler(
      createReq({ method: 'POST', body: { name: 'Acme' } }) as never,
      res as never,
    )
    expect(res._status).toBe(400)
  })

  it('is idempotent — returns existing workspace when user already has one', async () => {
    await seedWorkspace()
    const res = createRes()
    await handler(
      createReq({ method: 'POST', body: { name: 'Another', ownerRole: 'Founder/CEO', size: '1-10' } }) as never,
      res as never,
    )
    // Returns 200 (not 201) with the original workspace
    expect(res._status).toBe(200)
    const body = res._body as { name: string }
    expect(body.name).toBe('Test Workspace')
  })
})
