import type { VercelResponse } from '@vercel/node'
import { and, eq } from 'drizzle-orm'
import { db } from './db'
import { workspaces, workspaceMembers, permissionEnum } from '../../src/lib/db/schema'
import { PLAN_LIMITS, type PlanLimits } from '../../src/lib/plans'
import type { AuthContext } from './auth'

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

/** Resolves the workspace's effective plan — an active admin trial overrides the Stripe tier. */
export async function getEffectivePlan(workspaceId: string): Promise<EffectivePlan | null> {
  const [ws] = await db
    .select({ planTier: workspaces.planTier, trialPlan: workspaces.trialPlan, trialEndsAt: workspaces.trialEndsAt })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1)
  if (!ws) return null
  const trialActive = ws.trialPlan && ws.trialEndsAt && ws.trialEndsAt > new Date()
  const tier = (trialActive ? ws.trialPlan! : ws.planTier) as PlanTier
  return { tier, limits: PLAN_LIMITS[tier] }
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
