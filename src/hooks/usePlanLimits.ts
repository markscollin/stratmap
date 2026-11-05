import { useCallback } from 'react'
import { useBillingStore } from '../store/billingStore'
import { useChartStore } from '../store/chartStore'
import type { PlanTier } from '../types'
import { PAID_FEATURES, tierHasFeature, type PaidFeature } from '../lib/plans'

export function usePlanLimits() {
  const plan = useBillingStore((state) => state.plan)
  const usage = useBillingStore((state) => state.usage)
  const charts = useChartStore((state) => state.charts)

  const isAtChartLimit = useCallback(() => {
    if (plan.maxCharts === -1) return false
    return usage.chartsUsed >= plan.maxCharts
  }, [plan.maxCharts, usage.chartsUsed])

  const isAtNodeLimit = useCallback(
    (chartId: string) => {
      if (plan.maxNodesPerChart === -1) return false
      const chart = charts.find((c) => c.id === chartId)
      if (!chart) return false
      return chart.nodes.length >= plan.maxNodesPerChart
    },
    [charts, plan.maxNodesPerChart]
  )

  const isAtSeatLimit = useCallback(() => {
    if (plan.seats === -1) return false
    return usage.seatsUsed >= plan.seats
  }, [plan.seats, usage.seatsUsed])

  const canUseAIDrafting = useCallback(() => {
    if (plan.tier === 'free') return false
    if (plan.tier === 'starter') return usage.aiDraftsUsed < usage.aiDraftsLimit
    return true // growth + enterprise: unlimited
  }, [plan.tier, usage.aiDraftsUsed, usage.aiDraftsLimit])

  const currentTier: PlanTier = plan.tier

  /** True when the plan includes a paid feature (see PAID_FEATURES in src/lib/plans.ts). */
  const hasFeature = useCallback(
    (feature: PaidFeature): boolean => tierHasFeature(plan.tier, feature),
    [plan.tier]
  )

  /** True when using `feature` needs an upgrade. Unknown names are never locked. */
  const upgradeRequired = useCallback(
    (feature: string): boolean => feature in PAID_FEATURES && !tierHasFeature(plan.tier, feature as PaidFeature),
    [plan.tier]
  )

  return {
    isAtChartLimit,
    isAtNodeLimit,
    isAtSeatLimit,
    canUseAIDrafting,
    currentTier,
    hasFeature,
    upgradeRequired,
  }
}
