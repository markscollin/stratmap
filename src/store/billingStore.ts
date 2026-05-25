import { create } from 'zustand'
import type { Plan, UsageLimits, PlanTier } from '../types'

const AI_DRAFT_LIMITS: Record<PlanTier, number> = {
  free: 0, starter: 3, growth: -1, enterprise: -1,
}

interface BillingStore {
  plan: Plan
  usage: UsageLimits
  isLoading: boolean

  setPlan: (plan: Plan) => void
  incrementUsage: (key: keyof UsageLimits, amount?: number) => void
  resetMonthlyUsage: () => void
}

const FREE_PLAN: Plan = {
  tier: 'free',
  seats: 3,
  maxCharts: 1,
  maxNodesPerChart: 30,
  billingCycle: null,
  renewsAt: null,
}

const STARTER_PLAN: Plan = {
  tier: 'starter',
  seats: 5,
  maxCharts: 5,
  maxNodesPerChart: 100,
  billingCycle: null,
  renewsAt: null,
}

const GROWTH_PLAN: Plan = {
  tier: 'growth',
  seats: 10,
  maxCharts: -1,
  maxNodesPerChart: 500,
  billingCycle: null,
  renewsAt: null,
}

// -1 means unlimited (see usePlanLimits)
const ENTERPRISE_PLAN: Plan = {
  tier: 'enterprise',
  seats: -1,
  maxCharts: -1,
  maxNodesPerChart: -1,
  billingCycle: null,
  renewsAt: null,
}

// Single source of truth for tier → Plan. Use this everywhere a planTier string
// from the API needs to become a Plan object.
export const PLAN_BY_TIER: Record<PlanTier, Plan> = {
  free: FREE_PLAN,
  starter: STARTER_PLAN,
  growth: GROWTH_PLAN,
  enterprise: ENTERPRISE_PLAN,
}

const DEFAULT_USAGE: UsageLimits = {
  chartsUsed: 0,
  seatsUsed: 1,
  aiDraftsUsed: 0,
  aiDraftsLimit: 0,
}

function loadPlanFromStorage(): Plan {
  try {
    const stored = localStorage.getItem('stratmap_plan')
    return stored ? JSON.parse(stored) : FREE_PLAN
  } catch {
    return FREE_PLAN
  }
}

function loadUsageFromStorage(): UsageLimits {
  try {
    const stored = localStorage.getItem('stratmap_usage')
    return stored ? JSON.parse(stored) : DEFAULT_USAGE
  } catch {
    return DEFAULT_USAGE
  }
}

export const useBillingStore = create<BillingStore>((set) => {
  const initialPlan  = loadPlanFromStorage()
  const initialUsage = { ...loadUsageFromStorage(), aiDraftsLimit: AI_DRAFT_LIMITS[initialPlan.tier] }

  return {
  plan: initialPlan,
  usage: initialUsage,
  isLoading: false,

  setPlan: (plan) => {
    try {
      localStorage.setItem('stratmap_plan', JSON.stringify(plan))
    } catch {
      // localStorage full or unavailable, continue anyway
    }
    set(state => ({ plan, usage: { ...state.usage, aiDraftsLimit: AI_DRAFT_LIMITS[plan.tier] } }))
  },

  incrementUsage: (key, amount = 1) =>
    set((state) => {
      const newUsage = { ...state.usage, [key]: state.usage[key] + amount }
      try {
        localStorage.setItem('stratmap_usage', JSON.stringify(newUsage))
      } catch {
        // localStorage full or unavailable, continue anyway
      }
      return { usage: newUsage }
    }),

  resetMonthlyUsage: () => {
    const resetUsage = { ...DEFAULT_USAGE }
    try {
      localStorage.setItem('stratmap_usage', JSON.stringify(resetUsage))
    } catch {
      // localStorage full or unavailable, continue anyway
    }
    set({ usage: resetUsage })
  },
  }
})

export { FREE_PLAN, STARTER_PLAN, GROWTH_PLAN, ENTERPRISE_PLAN }
