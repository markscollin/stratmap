import { useCallback } from 'react'
import { useBillingStore } from '../store/billingStore'
import { useChartStore } from '../store/chartStore'
import type { PlanTier } from '../types'

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
      const chart = charts.find((c) => c.id === chartId)
      if (!chart) return false
      return chart.nodes.length >= plan.maxNodesPerChart
    },
    [charts, plan.maxNodesPerChart]
  )

  const isAtSeatLimit = useCallback(() => {
    return usage.seatsUsed >= plan.seats
  }, [plan.seats, usage.seatsUsed])

  const canUseAIDrafting = useCallback(() => {
    if (plan.tier === 'free') return false
    if (plan.tier === 'starter') return usage.aiDraftsUsed < usage.aiDraftsLimit
    return true // growth + enterprise: unlimited
  }, [plan.tier, usage.aiDraftsUsed, usage.aiDraftsLimit])

  const currentTier: PlanTier = plan.tier

  const upgradeRequired = useCallback(
    (feature: string): boolean => {
      const featureMap: Record<string, PlanTier> = {
        'headcount-planning': 'growth',
        'pdf-export': 'starter',
        'auto-layout': 'starter',
        'ai-drafting': 'starter',
        'password-protection': 'starter',
        'share-unlimited': 'growth',
      }
      const requiredTier = featureMap[feature]
      if (!requiredTier) return false
      const tierRank: Record<PlanTier, number> = {
        free: 0,
        starter: 1,
        growth: 2,
        enterprise: 3,
      }
      return tierRank[plan.tier] < tierRank[requiredTier]
    },
    [plan.tier]
  )

  return {
    isAtChartLimit,
    isAtNodeLimit,
    isAtSeatLimit,
    canUseAIDrafting,
    currentTier,
    upgradeRequired,
  }
}
