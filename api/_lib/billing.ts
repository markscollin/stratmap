/// <reference types="node" />
import type Stripe from 'stripe'
import { and, eq, isNull, lte, or } from 'drizzle-orm'
import { db } from './db'
import { reportError } from './sentry'
import { getAppUrl } from './url'
import { workspaces } from '../../src/lib/db/schema'
import type { PlanTier } from '../../src/types/user'
import { higherTier } from '../../src/lib/plans'

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
/** Statuses that count as a live subscription for Checkout and duplicates (R-69.2): the paid ones. Unpaid, paused and incomplete are lapsed. */
export const LIVE_SUBSCRIPTION_STATUSES: ReadonlySet<string> = PAID_STATUSES
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

/**
 * True when Stripe says the object does not exist (R-61): an id from test mode after the switch to live keys, or a customer or
 * subscription deleted in the dashboard. Such an id will never work again, so it is cleared rather than retried for ever.
 */
export function isStripeMissing(err: unknown): boolean {
  const e = err as { code?: unknown; raw?: { code?: unknown } } | null
  return !!e && (e.code === 'resource_missing' || e.raw?.code === 'resource_missing')
}

/** A subscription Stripe no longer knows: unlink it and drop the workspace to Free (reported, so a human can check). */
async function forgetMissingSubscription(subscriptionId: string): Promise<SyncResult | null> {
  const [ws] = await db.select({ id: workspaces.id, planTier: workspaces.planTier }).from(workspaces)
    .where(eq(workspaces.stripeSubscriptionId, subscriptionId)).limit(1)
  if (!ws) return null
  await db.update(workspaces).set({
    planTier: 'free', subscriptionStatus: null, planExpiresAt: null, cancelAtPeriodEnd: false, stripeSubscriptionId: null, updatedAt: new Date(),
  }).where(and(eq(workspaces.id, ws.id), eq(workspaces.stripeSubscriptionId, subscriptionId)))
  reportError(new Error(`Stripe has no subscription ${subscriptionId} (workspace ${ws.id}, was ${ws.planTier}): unlinked it and moved the workspace to Free. Test-mode id after going live, or deleted in Stripe?`), { route: 'billing.syncSubscription' })
  return { workspaceId: ws.id, previousTier: ws.planTier, tier: 'free', status: 'canceled' }
}

/** A customer Stripe deleted (`customer.deleted`) or no longer knows: forget it, so the next Checkout makes a new one (R-61). */
export async function forgetCustomer(customerId: string): Promise<void> {
  await db.update(workspaces).set({ stripeCustomerId: null, updatedAt: new Date() }).where(eq(workspaces.stripeCustomerId, customerId))
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
  opts: { workspaceId?: string; readAt?: Date; retried?: boolean } = {},
): Promise<SyncResult | null> {
  // When this request read Stripe (R-69.4): stored with the result, so an older read arriving late never overwrites a newer one.
  const readAt = opts.readAt ?? new Date()
  let sub: Stripe.Subscription
  try {
    sub = await stripe.subscriptions.retrieve(subscriptionId)
  } catch (err) {
    // Gone for good (R-61): before this, the throw left a dead id on the workspace for ever: paid plan kept, Checkout broken,
    // and the daily reconciliation stuck on the same rows.
    if (isStripeMissing(err)) return forgetMissingSubscription(subscriptionId)
    throw err
  }

  const cols = { id: workspaces.id, planTier: workspaces.planTier, stripeSubscriptionId: workspaces.stripeSubscriptionId, deletedAt: workspaces.deletedAt }
  let [ws] = await db
    .select(cols)
    .from(workspaces)
    .where(opts.workspaceId ? eq(workspaces.id, opts.workspaceId) : eq(workspaces.stripeSubscriptionId, sub.id))
    .limit(1)

  // Self-heal (R-06): if the checkout event was lost, any later event for this subscription can still find its workspace,
  // because checkout stamped our workspace id on the subscription itself (`subscription_data.metadata`). Metadata is only
  // used to FIND the workspace, never to decide the tier (that comes from the price id). It never replaces another
  // subscription (a second live one is a duplicate, handled just below), and a finished subscription links nothing.
  if (!ws && !opts.workspaceId && !TERMINAL_STATUSES.has(sub.status)) {
    const fromMetadata = sub.metadata?.workspaceId
    if (fromMetadata) {
      const [candidate] = await db.select(cols).from(workspaces).where(eq(workspaces.id, fromMetadata)).limit(1)
      if (candidate && !candidate.deletedAt) {
        ws = candidate
        if (!candidate.stripeSubscriptionId) console.warn(`[stripe] linked workspace ${ws.id} to subscription ${sub.id} from subscription metadata (checkout event was missed)`)
      }
    }
  }
  if (!ws) {
    console.warn(`[stripe] no workspace for subscription ${sub.id}`)
    return null
  }

  // R-69.5: a Checkout opened before the workspace was deleted can complete after. Never link a new subscription to a deleted
  // workspace (it would renew for something nobody can open): cancel and refund it, and tell a human.
  if (ws.deletedAt && ws.stripeSubscriptionId !== sub.id && !TERMINAL_STATUSES.has(sub.status)) {
    reportError(new Error(`Subscription ${sub.id} arrived for deleted workspace ${ws.id}: cancelled and refunded, not linked`), { route: 'billing.syncSubscription' })
    await cancelAndRefund(stripe, sub)
    return null
  }

  // Two Checkouts for one workspace (two admins, two tabs) can both be paid (R-19). The first one linked keeps the
  // workspace; the newer one is a duplicate, so it is cancelled and its payment refunded rather than billed for ever.
  if (!TERMINAL_STATUSES.has(sub.status) && ws.stripeSubscriptionId && ws.stripeSubscriptionId !== sub.id) {
    let current: Stripe.Subscription | null = null
    let linkedGone = false
    try { current = await stripe.subscriptions.retrieve(ws.stripeSubscriptionId) } catch (err) {
      // Stripe has no such subscription (R-61): it is finished, so this one replaces it, below.
      if (isStripeMissing(err)) linkedGone = true
      // Otherwise we cannot tell whether the linked one is still live: touch nothing, and ask a human to look.
      else reportError(err, { route: 'billing.syncSubscription', note: `could not check ${ws.stripeSubscriptionId} before deciding about ${sub.id}` })
    }
    if (current && PAID_STATUSES.has(current.status)) {
      // The linked one is live (active, trialing or past due): this one is the duplicate.
      await cancelDuplicateSubscription(stripe, sub, ws.id)
      return { workspaceId: ws.id, previousTier: ws.planTier, tier: ws.planTier, status: sub.status }
    }
    if (!current && !linkedGone) return { workspaceId: ws.id, previousTier: ws.planTier, tier: ws.planTier, status: sub.status }
    // R-69.2: a linked subscription that lapsed (unpaid, paused, incomplete) is not live: the new one replaces it, and the old one
    // is cancelled (no refund: it did not take money for this period) so it cannot come back to life and bill twice.
    if (current && !TERMINAL_STATUSES.has(current.status)) {
      await stripe.subscriptions.cancel(current.id).catch(err => reportError(err, { route: 'billing.syncSubscription', note: `could not cancel lapsed ${current!.id} replaced by ${sub.id}` }))
    }
    // The linked subscription is finished (or lapsed, or unknown to Stripe): this one replaces it, below.
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

  // Written only if nothing changed underneath us (R-69.1, R-69.4): the link is still the one we read, and no newer Stripe read
  // has been stored since. Two subscriptions racing for one unlinked workspace can then not both "win".
  const written = await db.update(workspaces)
    .set({
      planTier: tier,
      subscriptionStatus: sub.status,
      planExpiresAt: terminal ? null : periodEnd(sub),
      cancelAtPeriodEnd: !terminal && (sub.cancel_at_period_end || sub.cancel_at != null),
      stripeCustomerId: idOf(sub.customer),
      stripeSubscriptionId: terminal ? null : sub.id,
      billingSyncedAt: readAt,
      updatedAt: new Date(),
    })
    .where(and(
      eq(workspaces.id, ws.id),
      ws.stripeSubscriptionId ? eq(workspaces.stripeSubscriptionId, ws.stripeSubscriptionId) : isNull(workspaces.stripeSubscriptionId),
      or(isNull(workspaces.billingSyncedAt), lte(workspaces.billingSyncedAt, readAt)),
    ))
    .returning({ id: workspaces.id })

  if (written.length === 0) {
    const [now] = await db.select({ link: workspaces.stripeSubscriptionId, syncedAt: workspaces.billingSyncedAt, planTier: workspaces.planTier })
      .from(workspaces).where(eq(workspaces.id, ws.id)).limit(1)
    if (!now) return null
    // Another subscription was linked meanwhile: decide again against it (once), which makes one of the two the duplicate.
    if (now.link !== ws.stripeSubscriptionId) {
      if (!opts.retried) return syncSubscription(stripe, subscriptionId, { ...opts, readAt: undefined, retried: true })
    } else {
      // Same link, but a newer read of it is already stored: ours is stale, keep theirs.
      return { workspaceId: ws.id, previousTier: ws.planTier, tier: now.planTier, status: sub.status }
    }
    reportError(new Error(`Could not settle subscription ${sub.id} for workspace ${ws.id} after a retry`), { route: 'billing.syncSubscription' })
    return null
  }

  return { workspaceId: ws.id, previousTier: ws.planTier, tier, status: sub.status }
}

/**
 * Cancels a duplicate subscription and refunds what it charged (R-19). Cancel first so it can never bill again; the refund
 * is best-effort and a failure is reported to Sentry for a human to finish (the money is the one thing code must not guess at).
 */
export async function cancelDuplicateSubscription(stripe: Stripe, sub: Stripe.Subscription, workspaceId: string): Promise<void> {
  reportError(new Error(`Duplicate subscription ${sub.id} for workspace ${workspaceId}: cancelling and refunding it`), { route: 'billing.syncSubscription' })
  await cancelAndRefund(stripe, sub)
}

/** Cancels a subscription so it can never bill again, then refunds what it charged (best-effort; a failed refund is reported for a human). */
export async function cancelAndRefund(stripe: Stripe, sub: Stripe.Subscription): Promise<void> {
  await stripe.subscriptions.cancel(sub.id)
  try {
    const invoiceId = typeof sub.latest_invoice === 'string' ? sub.latest_invoice : sub.latest_invoice?.id
    if (!invoiceId) return
    const payments = await stripe.invoicePayments.list({ invoice: invoiceId, status: 'paid' })
    for (const p of payments.data) {
      const pi = p.payment.type === 'payment_intent' ? p.payment.payment_intent : null
      const piId = typeof pi === 'string' ? pi : pi?.id
      if (piId) await stripe.refunds.create({ payment_intent: piId }, { idempotencyKey: `refund-dup-${sub.id}-${piId}` })
    }
  } catch (err) {
    reportError(err, { route: 'billing.syncSubscription', note: `refund of subscription ${sub.id} failed: refund it by hand in the Stripe dashboard` })
  }
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
  const lapsed = !!(ws.cancelAtPeriodEnd && ws.planExpiresAt && ws.planExpiresAt.getTime() + LAPSED_CANCEL_GRACE_MS < now.getTime())
  const paid: PlanTier = lapsed ? 'free' : ws.planTier
  // An active trial can raise the plan, never lower it: a Growth subscriber granted a Starter trial stays on Growth (R-33).
  if (ws.trialPlan && ws.trialEndsAt && ws.trialEndsAt > now) return higherTier(paid, ws.trialPlan)
  return paid
}
