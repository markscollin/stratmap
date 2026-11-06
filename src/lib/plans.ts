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

/**
 * Free workspaces carry a "Made with StratMap" mark on PNG exports and on public share pages
 * (roadmap 2.6). Every paid tier is without it. PDF is already paid-only and CSV is data, so
 * neither is marked.
 */
export function showsBranding(tier: PlanTier): boolean {
  return tier === 'free'
}

/** True when `count` items already exist and adding `adding` more stays within `limit`. */
export function fitsLimit(limit: number, count: number, adding = 1): boolean {
  return limit === UNLIMITED || count + adding <= limit
}

// ─── Paid features ───────────────────────────────────────────────────────────
//
// Features that need a paid plan, the cheapest tier that unlocks each, and how
// we describe them. Used by the API (enforcement), the lock UI and UpgradeModal
// (copy) and the pricing page, so all of them agree on what is locked.

export type PaidFeature = 'jd-editor' | 'approval-workflow' | 'pdf-export' | 'ai-drafting' | 'auto-layout' | 'headcount-planning'

export interface FeatureInfo {
  /** Cheapest tier that includes the feature. */
  minTier: Exclude<PlanTier, 'free'>
  label: string
  /** One sentence on what the user gets by upgrading. */
  unlocks: string
}

export const PAID_FEATURES: Record<PaidFeature, FeatureInfo> = {
  'jd-editor': {
    minTier: 'starter',
    label: 'Job descriptions',
    unlocks: 'Write a versioned job description for every role on your chart, right next to the role.',
  },
  'approval-workflow': {
    minTier: 'starter',
    label: 'Approval workflows',
    unlocks: 'Submit charts and job descriptions for review, and have admins approve and publish them.',
  },
  'pdf-export': {
    minTier: 'starter',
    label: 'PDF export',
    unlocks: 'Download print-ready PDFs of your org charts for board packs and planning docs.',
  },
  'ai-drafting': {
    minTier: 'starter',
    label: 'AI job description drafting',
    unlocks: 'Draft a job description from a role title in seconds (3 per month on Starter, unlimited on Growth).',
  },
  'auto-layout': {
    minTier: 'starter',
    label: 'Auto-layout',
    unlocks: 'Tidy any chart into a clean reporting tree with one click.',
  },
  'headcount-planning': {
    minTier: 'growth',
    label: 'Headcount planning',
    unlocks: 'Plan hires quarter by quarter on a board linked to your charts and departments, with admin approval.',
  },
}

const TIER_RANK: Record<PlanTier, number> = { free: 0, starter: 1, growth: 2, enterprise: 3 }

/** True when `tier` includes `feature`. */
export function tierHasFeature(tier: PlanTier, feature: PaidFeature): boolean {
  return TIER_RANK[tier] >= TIER_RANK[PAID_FEATURES[feature].minTier]
}

/** Chart statuses that are part of the approval workflow (moving a chart into them needs the feature). */
export const APPROVAL_CHART_STATUSES = ['review', 'approved', 'rejected', 'live'] as const
