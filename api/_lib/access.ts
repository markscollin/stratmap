import type { VercelResponse } from '@vercel/node'
import { and, count, eq, gt, isNull, or } from 'drizzle-orm'
import { db } from './db'
import { workspaces, workspaceMembers, pendingInvites, charts, permissionEnum } from '../../src/lib/db/schema'
import { PLAN_LIMITS, PAID_FEATURES, tierHasFeature, type PlanLimits, type PaidFeature } from '../../src/lib/plans'
import type { AuthContext } from './auth'
import { resolvePlanTier } from './billing'

// ─── Roles ───────────────────────────────────────────────────────────────────
//
// Server-side role matrix (mirrors usePermission on the client):
//   viewer / commenter → read only
//   editor             → charts, nodes, edges, JDs (non-salary), templates,
//                        headcount, departments, share links, AI drafts
//   admin              → members, invites, salary bands, approvals, chart
//                        deletion, workspace settings, billing
//   owner              → everything; cannot be modified by anyone else

export type Permission = (typeof permissionEnum.enumValues)[number]
export type PlanTier = keyof typeof PLAN_LIMITS

export const ROLE_RANK: Record<Permission, number> = {
  owner: 5,
  admin: 4,
  editor: 3,
  commenter: 2,
  viewer: 1,
}

export function atLeast(current: Permission, required: Permission): boolean {
  return ROLE_RANK[current] >= ROLE_RANK[required]
}

/** The caller's role in their workspace. Uses the value requireAuth resolved when present. */
export async function getPermission(auth: AuthContext): Promise<Permission | null> {
  if (auth.permission) return auth.permission
  const [member] = await db
    .select({ permission: workspaceMembers.permission })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, auth.workspaceId), eq(workspaceMembers.userId, auth.userId)))
    .limit(1)
  return member?.permission ?? null
}

/**
 * Sends 403 unless the caller holds at least `required`. Returns the caller's
 * permission when allowed, or null (response already sent) when not.
 */
export async function requireRole(
  auth: AuthContext,
  res: VercelResponse,
  required: Permission,
): Promise<Permission | null> {
  const permission = await getPermission(auth)
  if (!permission || !atLeast(permission, required)) {
    res.status(403).json({ error: 'forbidden', required })
    return null
  }
  return permission
}

// ─── Plans ───────────────────────────────────────────────────────────────────

export interface EffectivePlan {
  tier: PlanTier
  limits: PlanLimits
}

/** Resolves the workspace's effective plan (see resolvePlanTier in ./billing). */
export async function getEffectivePlan(workspaceId: string): Promise<EffectivePlan | null> {
  const [ws] = await db
    .select({
      planTier: workspaces.planTier,
      trialPlan: workspaces.trialPlan,
      trialEndsAt: workspaces.trialEndsAt,
      cancelAtPeriodEnd: workspaces.cancelAtPeriodEnd,
      planExpiresAt: workspaces.planExpiresAt,
    })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1)
  if (!ws) return null
  const tier = resolvePlanTier(ws)
  return { tier, limits: PLAN_LIMITS[tier] }
}

// ─── Seats (roadmap 1.5: flat tiers with a hard cap) ─────────────────────────
//
// A seat is a member or a live (unexpired) pending invite. People who only view a
// public share link never take a seat. Over the cap after a downgrade, nobody is
// removed: the workspace just can't add anyone until it is back under.

export interface SeatUsage {
  members: number
  /** Unexpired pending invites. */
  invites: number
}

export async function getSeatUsage(workspaceId: string): Promise<SeatUsage> {
  const [[{ value: members }], [{ value: invites }]] = await Promise.all([
    db.select({ value: count() }).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId)),
    db.select({ value: count() }).from(pendingInvites).where(and(
      eq(pendingInvites.workspaceId, workspaceId),
      or(isNull(pendingInvites.expiresAt), gt(pendingInvites.expiresAt, new Date())),
    )),
  ])
  return { members, invites }
}

// ─── Over the chart limit after a downgrade (roadmap 1.6) ────────────────────
//
// Owner decision: when a workspace has more charts than its plan allows, EVERY
// chart is view-only until it deletes charts down to the limit or upgrades.
// Nothing is deleted for it. Deleting a chart and making a chart private stay
// allowed, since those are how you get back under the limit or lock things down.

export interface ChartUsage {
  count: number
  max: number
  /** True when the workspace has more charts than its plan allows. */
  frozen: boolean
}

export async function getChartUsage(workspaceId: string, plan?: EffectivePlan | null): Promise<ChartUsage | null> {
  const p = plan ?? await getEffectivePlan(workspaceId)
  if (!p) return null
  // Sample charts (roadmap 2.7) are free: they never count toward the limit.
  const [{ value }] = await db.select({ value: count() }).from(charts)
    .where(and(eq(charts.workspaceId, workspaceId), eq(charts.isSample, false)))
  const max = p.limits.maxCharts
  return { count: value, max, frozen: max !== -1 && value > max }
}

/**
 * Sends 402 { error: 'plan-frozen' } when the workspace is over its chart limit,
 * so chart content can't change. Returns true when edits are allowed.
 */
export async function requireChartsEditable(workspaceId: string, res: VercelResponse): Promise<boolean> {
  const plan = await getEffectivePlan(workspaceId)
  const usage = await getChartUsage(workspaceId, plan)
  if (!plan || !usage || !usage.frozen) return true
  const extra = usage.count - usage.max
  res.status(402).json({
    error: 'plan-frozen',
    limit: 'charts',
    count: usage.count,
    max: usage.max,
    tier: plan.tier,
    message: `Your ${plan.tier} plan allows ${usage.max} chart${usage.max === 1 ? '' : 's'} and this workspace has ${usage.count}. `
      + `All charts are view-only until you delete ${extra} chart${extra === 1 ? '' : 's'} or upgrade.`,
  })
  return false
}

export type LimitName = 'charts' | 'nodes' | 'seats' | 'ai-drafts'

const LIMIT_LABEL: Record<LimitName, string> = {
  charts: 'charts',
  nodes: 'roles per chart',
  seats: 'seats',
  'ai-drafts': 'AI drafts per month',
}

/** 402 Payment Required — the client shows the upgrade prompt. */
export function sendPlanLimit(res: VercelResponse, limit: LimitName, plan: EffectivePlan, max: number) {
  return res.status(402).json({
    error: 'plan-limit',
    limit,
    max,
    tier: plan.tier,
    message: `Your ${plan.tier} plan allows up to ${max} ${LIMIT_LABEL[limit]}. Upgrade to add more.`,
  })
}

/**
 * Sends 402 { error: 'plan-feature' } unless the workspace's effective plan
 * includes `feature`. Returns true when allowed.
 */
export async function requireFeature(workspaceId: string, res: VercelResponse, feature: PaidFeature): Promise<boolean> {
  const plan = await getEffectivePlan(workspaceId)
  if (plan && tierHasFeature(plan.tier, feature)) return true
  const info = PAID_FEATURES[feature]
  res.status(402).json({
    error: 'plan-feature',
    feature,
    requiredTier: info.minTier,
    tier: plan?.tier ?? 'free',
    message: `${info.label} ${info.label.endsWith('s') ? 'are' : 'is'} available on the ${info.minTier === 'starter' ? 'Starter' : 'Growth'} plan and above. ${info.unlocks}`,
  })
  return false
}
