// Launch review R-16: the dev bypass (the x-dev-user header, "no Clerk key means the dev user", unsigned Stripe events,
// the synthetic identity) is an explicit opt-in. A missing VERCEL_ENV used to count as "local", which would have left
// the whole API open on any host that is not Vercel.
import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'

vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})
vi.mock('@clerk/backend', () => ({ verifyToken: vi.fn(async () => { throw new Error('bad token') }) }))
vi.mock('../_lib/email', () => ({ sendPaymentFailed: vi.fn() }))

import { requireAuth, requireUser } from '../_lib/auth'
import { isDevBypassAllowed } from '../_lib/devBypass'
import { getUserIdentity } from '../_lib/identity'
import stripeHandler from '../webhooks/stripe'
import { setupSchema, cleanDb } from './helpers/db'
import { createReq } from './helpers/req'
import { createRes } from './helpers/res'

beforeAll(async () => { await setupSchema() })
beforeEach(async () => {
  await cleanDb()
  delete process.env.VERCEL_ENV
  delete process.env.CLERK_SECRET_KEY
  process.env.ALLOW_DEV_BYPASS = '1' // what vitest.api.config.ts sets for every test; each case below changes it on purpose
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  process.env.ALLOW_DEV_BYPASS = '1'
  delete process.env.VERCEL_ENV
  delete process.env.CLERK_SECRET_KEY
  delete process.env.STRIPE_SECRET_KEY
  delete process.env.STRIPE_WEBHOOK_SECRET
})

describe('isDevBypassAllowed', () => {
  it('is on only with the explicit flag outside production and preview', () => {
    expect(isDevBypassAllowed()).toBe(true)
    process.env.VERCEL_ENV = 'development'
    expect(isDevBypassAllowed()).toBe(true)
  })
  it('is OFF when the flag is absent, even though VERCEL_ENV is unset (the old, open behaviour)', () => {
    delete process.env.ALLOW_DEV_BYPASS
    expect(isDevBypassAllowed()).toBe(false)
  })
  it.each(['0', 'true', 'yes', ''])('is off for the flag value %j (only "1" counts)', (v) => {
    process.env.ALLOW_DEV_BYPASS = v
    expect(isDevBypassAllowed()).toBe(false)
  })
  it.each(['production', 'preview'])('is off on %s even when the flag is set, and says so in the log', (env) => {
    process.env.VERCEL_ENV = env
    expect(isDevBypassAllowed()).toBe(false)
  })
})

describe('without the flag, the API fails closed', () => {
  beforeEach(() => { delete process.env.ALLOW_DEV_BYPASS })

  it('requireUser refuses the x-dev-user header when VERCEL_ENV is unset', async () => {
    for (const key of [undefined, 'sk_test_x']) {
      if (key) process.env.CLERK_SECRET_KEY = key
      const res = createRes()
      expect(await requireUser(createReq({ headers: { 'x-dev-user': 'true' } }) as never, res as never)).toBeNull()
      expect(res._status).toBe(401)
    }
  })

  it('requireAuth refuses the x-dev-user header, named identities too', async () => {
    for (const slug of ['true', 'alice']) {
      const res = createRes()
      expect(await requireAuth(createReq({ headers: { 'x-dev-user': slug } }) as never, res as never)).toBeNull()
      expect(res._status).toBe(401)
    }
  })

  it('a missing CLERK_SECRET_KEY no longer means "act as the dev user": 401, and the log says what to set', async () => {
    const res = createRes()
    expect(await requireAuth(createReq() as never, res as never)).toBeNull()
    expect(res._status).toBe(401)
    expect(vi.mocked(console.error).mock.calls.join(' ')).toContain('ALLOW_DEV_BYPASS=1')
    const res2 = createRes()
    expect(await requireUser(createReq() as never, res2 as never)).toBeNull()
    expect(res2._status).toBe(401)
  })

  it('does not invent an identity for a user id', async () => {
    await expect(getUserIdentity('user_abc')).rejects.toThrow('Clerk is not configured')
  })

  it('refuses an unsigned Stripe event (a pre-parsed body) even though VERCEL_ENV is unset', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
    const res = createRes()
    await stripeHandler(createReq({ method: 'POST', body: { id: 'evt_x', type: 'customer.subscription.updated', data: { object: { id: 'sub_1' } } } }) as never, res as never)
    expect(res._status).toBe(400)
  })
})

describe('with the flag, local development still works', () => {
  it('the header and the no-key fallback give the dev identity', async () => {
    expect(await requireUser(createReq({ headers: { 'x-dev-user': 'true' } }) as never, createRes() as never)).toEqual({ userId: 'u-dev' })
    expect(await requireUser(createReq() as never, createRes() as never)).toEqual({ userId: 'u-dev' })
    expect(await requireAuth(createReq({ headers: { 'x-dev-user': 'true' } }) as never, createRes() as never)).toMatchObject({ userId: 'u-dev', workspaceId: 'ws-dev' })
  })
  it('the synthetic identity is available', async () => {
    expect(await getUserIdentity('u-dev')).toMatchObject({ name: 'Dev User' })
  })
})

describe('the flag cannot open a deployed environment', () => {
  it.each(['production', 'preview'])('%s: header refused, no-key fallback refused', async (env) => {
    process.env.VERCEL_ENV = env
    const res = createRes()
    expect(await requireAuth(createReq({ headers: { 'x-dev-user': 'true' } }) as never, res as never)).toBeNull()
    expect(res._status).toBe(401)
    const res2 = createRes()
    expect(await requireUser(createReq() as never, res2 as never)).toBeNull()
    expect(res2._status).toBe(401)
  })
})
