import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

vi.mock('../_lib/auth', () => ({
  requireAuth: vi.fn(),
  requireUser: vi.fn(),
}))

const sessionCreate = vi.fn()
vi.mock('stripe', () => ({
  default: class {
    checkout = { sessions: { create: sessionCreate } }
  },
}))

import { requireAuth } from '../_lib/auth'
import handler from '../checkout'
import { createReq } from './helpers/req'
import { createRes } from './helpers/res'
import { TEST_USER_ID, TEST_WS_ID } from './helpers/db'

const PRICE_ENV = [
  'STRIPE_SECRET_KEY',
  'STRIPE_STARTER_MONTHLY_PRICE_ID',
  'STRIPE_STARTER_ANNUAL_PRICE_ID',
  'STRIPE_GROWTH_MONTHLY_PRICE_ID',
  'STRIPE_GROWTH_ANNUAL_PRICE_ID',
]

beforeEach(() => {
  vi.mocked(requireAuth).mockResolvedValue({ userId: TEST_USER_ID, workspaceId: TEST_WS_ID })
  sessionCreate.mockReset().mockResolvedValue({ url: 'https://checkout.stripe.test/abc' })
  PRICE_ENV.forEach(k => delete process.env[k])
})

afterEach(() => { PRICE_ENV.forEach(k => delete process.env[k]) })

describe('POST /api/checkout', () => {
  it('returns 405 for non-POST methods', async () => {
    const res = createRes()
    await handler(createReq({ method: 'GET' }) as never, res as never)
    expect(res._status).toBe(405)
  })

  it('returns 400 when tier or billingCycle is missing', async () => {
    const res = createRes()
    await handler(createReq({ method: 'POST', body: { tier: 'starter' } }) as never, res as never)
    expect(res._status).toBe(400)
  })

  it('short-circuits to the success page in dev mode (no Stripe key)', async () => {
    const res = createRes()
    await handler(createReq({ method: 'POST', body: { tier: 'starter', billingCycle: 'monthly' } }) as never, res as never)
    const body = res._body as { url: string }
    expect(body.url).toBe('/billing/success?plan=starter')
    expect(sessionCreate).not.toHaveBeenCalled()
  })

  it('returns 400 when no price is configured for the tier/cycle', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    const res = createRes()
    await handler(createReq({ method: 'POST', body: { tier: 'starter', billingCycle: 'monthly' } }) as never, res as never)
    expect(res._status).toBe(400)
  })

  it('creates a Stripe checkout session and returns its url', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.STRIPE_STARTER_MONTHLY_PRICE_ID = 'price_starter_monthly'
    const res = createRes()
    await handler(createReq({ method: 'POST', body: { tier: 'starter', billingCycle: 'monthly' } }) as never, res as never)

    expect(sessionCreate).toHaveBeenCalledTimes(1)
    const arg = sessionCreate.mock.calls[0][0]
    expect(arg.metadata).toEqual({ workspaceId: TEST_WS_ID, planTier: 'starter' })
    expect(arg.allow_promotion_codes).toBe(true)
    const body = res._body as { url: string }
    expect(body.url).toBe('https://checkout.stripe.test/abc')
  })
})
