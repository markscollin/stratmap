import { describe, it, expect, beforeEach } from 'vitest'
import { useBillingStore, FREE_PLAN, STARTER_PLAN, GROWTH_PLAN } from '../billingStore'

describe('billingStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useBillingStore.setState({
      plan: FREE_PLAN,
      usage: { chartsUsed: 0, seatsUsed: 1, aiDraftsUsed: 0, aiDraftsLimit: 0 },
      isLoading: false,
    })
  })

  it('loads with default free plan', () => {
    const store = useBillingStore.getState()
    expect(store.plan.tier).toBe('free')
    expect(store.usage.chartsUsed).toBe(0)
  })

  it('setPlan updates plan and persists to localStorage', () => {
    const store = useBillingStore.getState()
    store.setPlan(STARTER_PLAN)
    expect(useBillingStore.getState().plan.tier).toBe('starter')
    expect(localStorage.getItem('stratmap_plan')).toBeTruthy()
  })

  it('incrementUsage updates usage', () => {
    const store = useBillingStore.getState()
    store.incrementUsage('chartsUsed')
    expect(useBillingStore.getState().usage.chartsUsed).toBe(1)
  })

  it('incrementUsage can increment by custom amount', () => {
    const store = useBillingStore.getState()
    store.incrementUsage('seatsUsed', 3)
    expect(useBillingStore.getState().usage.seatsUsed).toBe(4)
  })

  it('resetMonthlyUsage resets to defaults', () => {
    const store = useBillingStore.getState()
    store.incrementUsage('aiDraftsUsed', 5)
    store.incrementUsage('chartsUsed', 3)
    store.resetMonthlyUsage()
    expect(useBillingStore.getState().usage.aiDraftsUsed).toBe(0)
    expect(useBillingStore.getState().usage.chartsUsed).toBe(0)
  })

  it('plan constants have correct tier names and limits', () => {
    expect(FREE_PLAN.tier).toBe('free')
    expect(FREE_PLAN.maxCharts).toBe(1)
    expect(FREE_PLAN.maxNodesPerChart).toBe(30)

    expect(STARTER_PLAN.tier).toBe('starter')
    expect(STARTER_PLAN.maxCharts).toBe(5)
    expect(STARTER_PLAN.maxNodesPerChart).toBe(100)

    expect(GROWTH_PLAN.tier).toBe('growth')
    expect(GROWTH_PLAN.maxCharts).toBe(-1)
    expect(GROWTH_PLAN.maxNodesPerChart).toBe(500)
  })
})
