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

/** How a tier is named on every page and in every server message. */
export const TIER_NAME: Record<PlanTier, string> = {
  free: 'Free', starter: 'Starter', growth: 'Growth', scale: 'Scale', enterprise: 'Enterprise',
}

/**
 * Every new workspace starts with a free trial of a paid plan (launch review R-18, owner decision D-3), so the first minute is not
 * three locked features. It rides on the admin trial override (`trialPlan` + `trialEndsAt`), so nothing else needs to know about it.
 * The API reads the length from NEW_WORKSPACE_TRIAL_DAYS (default below; 0 turns it off, which the e2e server does so tests start on Free).
 */
export const NEW_WORKSPACE_TRIAL_PLAN = 'growth' as const
export const DEFAULT_NEW_WORKSPACE_TRIAL_DAYS = 14

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free:       { seats: 3,  maxCharts: 1,  maxNodesPerChart: 30,  aiDraftsPerMonth: 0 },
  starter:    { seats: 5,  maxCharts: 5,  maxNodesPerChart: 100, aiDraftsPerMonth: 3 },
  growth:     { seats: 10, maxCharts: -1, maxNodesPerChart: 500, aiDraftsPerMonth: 300 },
  // R-79 (owner decision D-10: a self-serve tier above Growth, numbers proposed by the builder): for companies of about 50 to 500.
  scale:      { seats: 25, maxCharts: -1, maxNodesPerChart: 2000, aiDraftsPerMonth: 600 },
  enterprise: { seats: -1, maxCharts: -1, maxNodesPerChart: -1,  aiDraftsPerMonth: 1000 },
}

/** List prices in pounds (the Stripe prices must match: docs/OWNER_CHECKLIST.md, O-04). One place for every page that shows a price. */
export const PLAN_PRICES = {
  starter: { monthly: 18, annual: 180 },
  growth: { monthly: 49, annual: 490 },
  scale: { monthly: 129, annual: 1290 },
} as const

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

export type PaidFeature = 'jd-editor' | 'approval-workflow' | 'pdf-export' | 'ai-drafting' | 'auto-layout' | 'headcount-planning' | 'audit-export' | 'version-history' | 'hr-sync'

export interface FeatureInfo {
  /** Cheapest tier that includes the feature. Scale (R-79) adds room, not features, so no feature starts there. */
  minTier: 'starter' | 'growth' | 'enterprise'
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
    unlocks: 'Draft a job description from a role title in seconds (3 per month on Starter, 300 on Growth).',
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
  'version-history': {
    minTier: 'growth',
    label: 'Version history and scenarios',
    unlocks: 'Save named versions of a chart, compare two versions or a version with today, restore an earlier one, and branch a scenario into a new chart.',
  },
  'hr-sync': {
    minTier: 'growth',
    label: 'BambooHR sync',
    unlocks: 'Connect a chart to BambooHR: review joiners, leavers and moves before they apply, or let a daily sync keep the chart in step.',
  },
  'audit-export': {
    minTier: 'enterprise',
    label: 'Audit log export',
    unlocks: 'Download the full history of member, permission, sharing and salary changes as a CSV for compliance reviews.',
  },
}

const TIER_RANK: Record<PlanTier, number> = { free: 0, starter: 1, growth: 2, scale: 3, enterprise: 4 }

/** The better of two tiers (a trial never lowers what a workspace already pays for). */
export function higherTier(a: PlanTier, b: PlanTier): PlanTier {
  return TIER_RANK[b] > TIER_RANK[a] ? b : a
}

/** True when `tier` includes `feature`. */
export function tierHasFeature(tier: PlanTier, feature: PaidFeature): boolean {
  return TIER_RANK[tier] >= TIER_RANK[PAID_FEATURES[feature].minTier]
}

/** Chart statuses that are part of the approval workflow (moving a chart into them needs the feature). */
export const APPROVAL_CHART_STATUSES = ['review', 'approved', 'rejected', 'live'] as const
