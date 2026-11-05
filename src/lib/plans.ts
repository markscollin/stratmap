import type { PlanTier } from '../types/user'

// Single source of truth for plan limits. Imported by the client (billingStore,
// usePlanLimits) AND by the API (api/_lib/access.ts), so the limits shown in the
// UI are the limits the server enforces. Keep this file dependency-free.
//
// -1 means unlimited.

export interface PlanLimits {
  seats: number
  maxCharts: number
  maxNodesPerChart: number
  /** AI JD drafts per calendar month (UTC). */
  aiDraftsPerMonth: number
}

export const UNLIMITED = -1

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free:       { seats: 3,  maxCharts: 1,  maxNodesPerChart: 30,  aiDraftsPerMonth: 0 },
  starter:    { seats: 5,  maxCharts: 5,  maxNodesPerChart: 100, aiDraftsPerMonth: 3 },
  growth:     { seats: 10, maxCharts: -1, maxNodesPerChart: 500, aiDraftsPerMonth: -1 },
  enterprise: { seats: -1, maxCharts: -1, maxNodesPerChart: -1,  aiDraftsPerMonth: -1 },
}

/** True when `count` items already exist and adding `adding` more stays within `limit`. */
export function fitsLimit(limit: number, count: number, adding = 1): boolean {
  return limit === UNLIMITED || count + adding <= limit
}
