/// <reference types="node" />
import type Stripe from 'stripe'
import { eq } from 'drizzle-orm'
import { db } from './db'
import { reportError } from './sentry'
import { getAppUrl } from './url'
import { workspaces } from '../../src/lib/db/schema'
import type { PlanTier } from '../../src/types/user'

// Billing life-cycle (roadmap 1.3). Stripe is the source of truth: every webhook
// re-reads the subscription from Stripe and mirrors it onto the workspace, so
// out-of-order or replayed events always converge on Stripe's current state.

export type PaidTier = Exclude<PlanTier, 'free' | 'enterprise'>
export type BillingCycle = 'monthly' | 'annual'

// Price ids are read at call time (not module load) so they follow the current
// environment and stay testable.
function priceIds(): Record<PaidTier, Record<BillingCycle, string | undefined>> {
  return {
    starter: {
      monthly: process.env.STRIPE_STARTER_MONTHLY_PRICE_ID || undefined,
      annual:  process.env.STRIPE_STARTER_ANNUAL_PRICE_ID || undefined,
    },
    growth: {
      monthly: process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID || undefined,
      annual:  process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID || undefined,
    },
  }
}

export function priceIdFor(tier: PaidTier, cycle: BillingCycle): string | undefined {
  return priceIds()[tier]?.[cycle]
}

/** The tier a Stripe price unlocks, or null for a price we don't recognise. */
export function tierForPriceId(priceId: string): PaidTier | null {
  for (const [tier, cycles] of Object.entries(priceIds()) as [PaidTier, Record<BillingCycle, string | undefined>][]) {
    if (cycles.monthly === priceId || cycles.annual === priceId) return tier
  }
  return null
}

// Statuses that keep the paid plan. past_due is the grace period: Stripe is
// retrying the card (Smart Retries) and the workspace keeps its plan with a
// banner. When Stripe gives up it cancels the subscription or marks it unpaid,
// and the workspace drops to Free.
const PAID_STATUSES = new Set<Stripe.Subscription.Status>(['active', 'trialing', 'past_due'])
// Statuses Stripe never leaves. The subscription is gone, so we forget its id.
const TERMINAL_STATUSES = new Set<Stripe.Subscription.Status>(['canceled', 'incomplete_expired'])

const TIER_RANK: Record<PaidTier, number> = { starter: 1, growth: 2 }

/**
 * The tier a subscription grants: Free unless it is in a paid status, else the
 * highest tier among its prices. null means a paid status with no price we
 * recognise (misconfigured env), in which case the caller keeps the current tier.
 */
export function tierForSubscription(sub: Stripe.Subscription): PlanTier | null {
  if (!PAID_STATUSES.has(sub.status)) return 'free'
  let best: PaidTier | null = null
  for (const item of sub.items?.data ?? []) {
    const tier = item.price?.id ? tierForPriceId(item.price.id) : null
    if (tier && (!best || TIER_RANK[tier] > TIER_RANK[best])) best = tier
  }
  return best
}

/** When the paid-through period ends (or the scheduled cancellation date). */
export function periodEnd(sub: Stripe.Subscription): Date | null {
  if (sub.cancel_at) return new Date(sub.cancel_at * 1000)
  // Since API 2025-03-31 the period lives on each item; older payloads had it on the subscription.
  const itemEnds = (sub.items?.data ?? []).map(i => i.current_period_end).filter((n): n is number => typeof n === 'number')
  const legacy = (sub as unknown as { current_period_end?: number }).current_period_end
  const end = itemEnds.length ? Math.max(...itemEnds) : legacy
  return end ? new Date(end * 1000) : null
}

function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null
  return typeof ref === 'string' ? ref : ref.id
}

export interface SyncResult {
  workspaceId: string
  previousTier: PlanTier
  tier: PlanTier
  status: Stripe.Subscription.Status
}

/**
 * Mirrors a subscription onto its workspace. Pass `workspaceId` when the link is
 * being made (checkout); otherwise the workspace is found by subscription id, so
 * events for an old or unknown subscription change nothing.
 */
export async function syncSubscription(
  stripe: Stripe,
  subscriptionId: string,
  opts: { workspaceId?: string } = {},
): Promise<SyncResult | null> {
  const sub = await stripe.subscriptions.retrieve(subscriptionId)

  const [ws] = await db
    .select({ id: workspaces.id, planTier: workspaces.planTier, stripeSubscriptionId: workspaces.stripeSubscriptionId })
    .from(workspaces)
    .where(opts.workspaceId ? eq(workspaces.id, opts.workspaceId) : eq(workspaces.stripeSubscriptionId, sub.id))
    .limit(1)
  if (!ws) {
    console.warn(`[stripe] no workspace for subscription ${sub.id}`)
    return null
  }

  let tier = tierForSubscription(sub)
  if (tier === null) {
    reportError(new Error(`Unrecognised Stripe price on subscription ${sub.id}`), { route: 'billing.syncSubscription' })
    tier = ws.planTier
  }

  const terminal = TERMINAL_STATUSES.has(sub.status)
  // A checkout that is replaced by a newer one must not clobber the newer link.
  if (terminal && ws.stripeSubscriptionId && ws.stripeSubscriptionId !== sub.id) {
    return { workspaceId: ws.id, previousTier: ws.planTier, tier: ws.planTier, status: sub.status }
  }

  await db.update(workspaces)
    .set({
      planTier: tier,
      subscriptionStatus: sub.status,
      planExpiresAt: terminal ? null : periodEnd(sub),
      cancelAtPeriodEnd: !terminal && (sub.cancel_at_period_end || sub.cancel_at != null),
      stripeCustomerId: idOf(sub.customer),
      stripeSubscriptionId: terminal ? null : sub.id,
      updatedAt: new Date(),
    })
    .where(eq(workspaces.id, ws.id))

  return { workspaceId: ws.id, previousTier: ws.planTier, tier, status: sub.status }
}

/** The subscription an invoice belongs to (new and old API shapes), if any. */
export function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const fromParent = idOf(invoice.parent?.subscription_details?.subscription ?? null)
  if (fromParent) return fromParent
  return idOf((invoice as unknown as { subscription?: string | { id: string } | null }).subscription ?? null)
}

/** A Customer Portal session that returns to Settings → Billing. */
export async function createPortalSession(stripe: Stripe, customerId: string): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${getAppUrl()}/settings?tab=billing`,
    ...(process.env.STRIPE_PORTAL_CONFIGURATION_ID ? { configuration: process.env.STRIPE_PORTAL_CONFIGURATION_ID } : {}),
  })
  return session.url
}

// ─── Effective plan ──────────────────────────────────────────────────────────

/** How long after a scheduled cancellation we stop trusting the paid tier if the deletion webhook never arrived. */
export const LAPSED_CANCEL_GRACE_MS = 2 * 24 * 60 * 60 * 1000

export interface PlanFields {
  planTier: PlanTier
  trialPlan: PlanTier | null
  trialEndsAt: Date | null
  cancelAtPeriodEnd: boolean
  planExpiresAt: Date | null
}

/**
 * The tier the workspace gets right now: an active admin trial overrides the
 * Stripe tier. A cancellation whose end date passed more than two days ago
 * counts as Free even if Stripe's deletion webhook was lost.
 */
export function resolvePlanTier(ws: PlanFields, now = new Date()): PlanTier {
  if (ws.trialPlan && ws.trialEndsAt && ws.trialEndsAt > now) return ws.trialPlan
  if (ws.cancelAtPeriodEnd && ws.planExpiresAt && ws.planExpiresAt.getTime() + LAPSED_CANCEL_GRACE_MS < now.getTime()) {
    return 'free'
  }
  return ws.planTier
}
