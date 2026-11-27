import { describe, it, expect } from 'vitest'
import { PLAN_LIMITS, PLAN_PRICES, PAID_FEATURES, TIER_NAME, higherTier, tierHasFeature, type PaidFeature } from '../plans'
import type { PlanTier } from '../../types'

const ORDER: PlanTier[] = ['free', 'starter', 'growth', 'scale', 'enterprise']

describe('plan tiers', () => {
  it('Scale sits between Growth and Enterprise (R-79)', () => {
    expect(higherTier('growth', 'scale')).toBe('scale')
    expect(higherTier('scale', 'enterprise')).toBe('enterprise')
    expect(higherTier('scale', 'starter')).toBe('scale')
  })

  it('every tier gives at least as much room as the one below it', () => {
    const more = (a: number, b: number) => a === -1 || (b !== -1 && a >= b)
    for (let i = 1; i < ORDER.length; i++) {
      const hi = PLAN_LIMITS[ORDER[i]], lo = PLAN_LIMITS[ORDER[i - 1]]
      expect(more(hi.seats, lo.seats)).toBe(true)
      expect(more(hi.maxCharts, lo.maxCharts)).toBe(true)
      expect(more(hi.maxNodesPerChart, lo.maxNodesPerChart)).toBe(true)
      expect(hi.aiDraftsPerMonth).toBeGreaterThanOrEqual(lo.aiDraftsPerMonth)
    }
    // Scale is a real step up from Growth, not the same plan at a higher price.
    expect(PLAN_LIMITS.scale.seats).toBeGreaterThan(PLAN_LIMITS.growth.seats)
    expect(PLAN_LIMITS.scale.maxNodesPerChart).toBeGreaterThan(PLAN_LIMITS.growth.maxNodesPerChart)
  })

  it('Scale has every Growth feature, and Enterprise keeps the audit export', () => {
    for (const f of Object.keys(PAID_FEATURES) as PaidFeature[]) {
      if (tierHasFeature('growth', f)) expect(tierHasFeature('scale', f)).toBe(true)
    }
    expect(tierHasFeature('scale', 'audit-export')).toBe(false)
    expect(tierHasFeature('enterprise', 'audit-export')).toBe(true)
  })

  it('prices go up with the tier, and annual is cheaper than twelve months', () => {
    expect(PLAN_PRICES.scale.monthly).toBeGreaterThan(PLAN_PRICES.growth.monthly)
    for (const p of Object.values(PLAN_PRICES)) expect(p.annual).toBeLessThan(p.monthly * 12)
  })

  it('names every tier', () => {
    expect(ORDER.map(t => TIER_NAME[t])).toEqual(['Free', 'Starter', 'Growth', 'Scale', 'Enterprise'])
  })
})
