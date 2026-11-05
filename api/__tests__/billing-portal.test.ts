import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})

vi.mock('../_lib/auth', () => ({
  requireAuth: vi.fn(),
  requireUser: vi.fn(),
}))

const portalCreate = vi.fn()
vi.mock('stripe', () => ({
  default: class {
    billingPortal = { sessions: { create: portalCreate } }
  },
}))

import { requireAuth } from '../_lib/auth'
import handler from '../billing/portal'
import { setupSchema, cleanDb, seedWorkspace, seedMember, testDb, TEST_USER_ID, TEST_WS_ID } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes } from './helpers/res'
import * as schema from '../../src/lib/db/schema'
import { eq } from 'drizzle-orm'

beforeAll(async () => { await setupSchema() })

beforeEach(async () => {
  await cleanDb()
  await seedWorkspace()
  vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
  portalCreate.mockReset().mockResolvedValue({ url: 'https://billing.stripe.test/portal' })
  process.env.STRIPE_SECRET_KEY = 'sk_test'
  process.env.APP_URL = 'https://app.test'
})

afterEach(() => {
  delete process.env.STRIPE_SECRET_KEY
  delete process.env.APP_URL
  delete process.env.STRIPE_PORTAL_CONFIGURATION_ID
})

async function post() {
  const res = createRes()
  await handler(createReq({ method: 'POST', body: {} }) as never, res as never)
  return res
}

async function giveCustomer() {
  await testDb.update(schema.workspaces).set({ stripeCustomerId: 'cus_1' }).where(eq(schema.workspaces.id, TEST_WS_ID))
}

describe('POST /api/billing/portal', () => {
  it('returns 405 for non-POST methods', async () => {
    const res = createRes()
    await handler(createReq({ method: 'GET' }) as never, res as never)
    expect(res._status).toBe(405)
  })

  it('is admin-only', async () => {
    await giveCustomer()
    await seedMember('u-editor', 'editor')
    vi.mocked(requireAuth).mockResolvedValue({ userId: 'u-editor', workspaceId: TEST_WS_ID })
    const res = await post()
    expect(res._status).toBe(403)
    expect(portalCreate).not.toHaveBeenCalled()
  })

  it('returns 409 when the workspace has never paid', async () => {
    const res = await post()
    expect(res._status).toBe(409)
    expect((res._body as { error: string }).error).toBe('no-billing-account')
  })

  it('returns 503 when Stripe is not configured', async () => {
    delete process.env.STRIPE_SECRET_KEY
    const res = await post()
    expect(res._status).toBe(503)
  })

  it('opens a portal session that returns to Settings → Billing', async () => {
    await giveCustomer()
    const res = await post()
    expect(res._body).toEqual({ url: 'https://billing.stripe.test/portal' })
    expect(portalCreate).toHaveBeenCalledWith({ customer: 'cus_1', return_url: 'https://app.test/settings?tab=billing' })
  })

  it('uses a named portal configuration when set', async () => {
    await giveCustomer()
    process.env.STRIPE_PORTAL_CONFIGURATION_ID = 'bpc_1'
    await post()
    expect(portalCreate.mock.calls[0][0].configuration).toBe('bpc_1')
  })
})
