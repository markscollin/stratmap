import { vi, describe, it, expect, afterEach } from 'vitest'

// billing.ts imports the db module; these are pure-function tests, so use the test db.
vi.mock('../../src/lib/db/index', async () => {
  const { testDb } = await import('./helpers/db')
  return { db: testDb }
})

import { resolvePlanTier, tierForSubscription, periodEnd, LAPSED_CANCEL_GRACE_MS, type PlanFields } from '../_lib/billing'
import type Stripe from 'stripe'

const NOW = new Date('2026-11-05T12:00:00Z')
const base: PlanFields = { planTier: 'growth', trialPlan: null, trialEndsAt: null, cancelAtPeriodEnd: false, planExpiresAt: null }

function sub(status: string, prices: string[], over: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: 'sub_1', status, cancel_at: null, cancel_at_period_end: false,
    items: { data: prices.map(id => ({ price: { id }, current_period_end: 1_900_000_000 })) },
    ...over,
  } as unknown as Stripe.Subscription
}

afterEach(() => {
  delete process.env.STRIPE_STARTER_MONTHLY_PRICE_ID
  delete process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID
})

describe('resolvePlanTier', () => {
  it('returns the Stripe tier by default', () => {
    expect(resolvePlanTier(base, NOW)).toBe('growth')
  })

  it('lets an active admin trial override the Stripe tier', () => {
    expect(resolvePlanTier({ ...base, planTier: 'free', trialPlan: 'starter', trialEndsAt: new Date(NOW.getTime() + 1000) }, NOW)).toBe('starter')
    expect(resolvePlanTier({ ...base, planTier: 'free', trialPlan: 'starter', trialEndsAt: new Date(NOW.getTime() - 1000) }, NOW)).toBe('free')
  })

  it('keeps a scheduled cancellation on the paid tier until shortly after it ends', () => {
    const justEnded = { ...base, cancelAtPeriodEnd: true, planExpiresAt: new Date(NOW.getTime() - 1000) }
    expect(resolvePlanTier(justEnded, NOW)).toBe('growth')
  })

  it('falls back to free if the deletion webhook never arrived', () => {
    const lapsed = { ...base, cancelAtPeriodEnd: true, planExpiresAt: new Date(NOW.getTime() - LAPSED_CANCEL_GRACE_MS - 1000) }
    expect(resolvePlanTier(lapsed, NOW)).toBe('free')
  })

  it('does not expire a renewing subscription on its period end', () => {
    const renewing = { ...base, planExpiresAt: new Date(NOW.getTime() - LAPSED_CANCEL_GRACE_MS - 1000) }
    expect(resolvePlanTier(renewing, NOW)).toBe('growth')
  })
})

describe('tierForSubscription', () => {
  it('maps prices to tiers and picks the highest', () => {
    process.env.STRIPE_STARTER_MONTHLY_PRICE_ID = 'p_s'
    process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID = 'p_g'
    expect(tierForSubscription(sub('active', ['p_s']))).toBe('starter')
    expect(tierForSubscription(sub('trialing', ['p_s', 'p_g']))).toBe('growth')
    expect(tierForSubscription(sub('past_due', ['p_g']))).toBe('growth')
  })

  it('is free for statuses that do not pay', () => {
    process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID = 'p_g'
    for (const status of ['unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'paused']) {
      expect(tierForSubscription(sub(status, ['p_g']))).toBe('free')
    }
  })

  it('returns null for an unknown price', () => {
    expect(tierForSubscription(sub('active', ['p_unknown']))).toBeNull()
  })
})

describe('periodEnd', () => {
  it('prefers cancel_at, then the item period, then the legacy field', () => {
    expect(periodEnd(sub('active', ['p'], { cancel_at: 1_800_000_000 }))?.getTime()).toBe(1_800_000_000_000)
    expect(periodEnd(sub('active', ['p']))?.getTime()).toBe(1_900_000_000_000)
    expect(periodEnd(sub('active', [], { current_period_end: 1_700_000_000 }))?.getTime()).toBe(1_700_000_000_000)
    expect(periodEnd(sub('active', []))).toBeNull()
  })
})
