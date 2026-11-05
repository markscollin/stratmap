import { create } from 'zustand'
import type { Plan, UsageLimits, PlanTier } from '../types'
import { PLAN_LIMITS } from '../lib/plans'

const AI_DRAFT_LIMITS: Record<PlanTier, number> = {
  free:       PLAN_LIMITS.free.aiDraftsPerMonth,
  starter:    PLAN_LIMITS.starter.aiDraftsPerMonth,
  growth:     PLAN_LIMITS.growth.aiDraftsPerMonth,
  enterprise: PLAN_LIMITS.enterprise.aiDraftsPerMonth,
}

function planFor(tier: PlanTier): Plan {
  const { seats, maxCharts, maxNodesPerChart } = PLAN_LIMITS[tier]
  return { tier, seats, maxCharts, maxNodesPerChart, billingCycle: null, renewsAt: null }
}

interface BillingStore {
  plan: Plan
  usage: UsageLimits
  isLoading: boolean

  setPlan: (plan: Plan) => void
  incrementUsage: (key: keyof UsageLimits, amount?: number) => void
  resetMonthlyUsage: () => void
}

// Limits come from src/lib/plans.ts, which the API also uses for enforcement.
// -1 means unlimited (see usePlanLimits).
const FREE_PLAN: Plan = planFor('free')
const STARTER_PLAN: Plan = planFor('starter')
const GROWTH_PLAN: Plan = planFor('growth')
const ENTERPRISE_PLAN: Plan = planFor('enterprise')

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
