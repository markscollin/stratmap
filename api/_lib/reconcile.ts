/// <reference types="node" />
import type Stripe from 'stripe'
import { and, asc, eq, isNotNull } from 'drizzle-orm'
import { db } from './db'
import { reportError } from './sentry'
import { syncSubscription } from './billing'
import { workspaces } from '../../src/lib/db/schema'

// R-22: webhooks can be lost (an outage, a bad deploy, a misconfigured endpoint). Every day we re-read each workspace's
// subscription from Stripe and let `syncSubscription` mirror it, so a missed `customer.subscription.deleted` or `updated`
// is repaired within a day instead of never. Stripe stays the source of truth.

/** Subscriptions checked per run. The oldest-synced go first, and a sync (or a failed one) stamps `updated_at`, so every workspace comes round. */
export const RECONCILE_BATCH = 100

export interface ReconcileResult {
  checked: number
  /** The plan, status or link differed from Stripe and was corrected. */
  corrected: number
  failed: number
}

export async function reconcileSubscriptions(stripe: Stripe, limit = RECONCILE_BATCH, deadline = Infinity): Promise<ReconcileResult> {
  const rows = await db
    .select({ id: workspaces.id, subscriptionId: workspaces.stripeSubscriptionId, planTier: workspaces.planTier, status: workspaces.subscriptionStatus })
    .from(workspaces)
    .where(and(isNotNull(workspaces.stripeSubscriptionId)))
    .orderBy(asc(workspaces.updatedAt))
    .limit(limit)

  const out: ReconcileResult = { checked: 0, corrected: 0, failed: 0 }
  for (const row of rows) {
    if (Date.now() > deadline) break // out of time (R-71): the rest are oldest-synced, so they come first tomorrow
    if (!row.subscriptionId) continue
    out.checked++
    try {
      const result = await syncSubscription(stripe, row.subscriptionId)
      if (result && (result.tier !== row.planTier || result.status !== row.status)) {
        out.corrected++
        // Not an error in itself, but it means an event was missed: someone should know the webhook has a hole.
        reportError(new Error(`Billing reconciliation corrected workspace ${row.id}: ${row.planTier}/${row.status ?? 'none'} → ${result.tier}/${result.status}. A Stripe webhook was probably missed.`), { route: 'cron/daily-maintenance', step: 'reconcile' })
      }
    } catch (err) {
      out.failed++
      // Move it to the back of the queue (R-61): a row that always fails used to stay oldest for ever, and 100 of them stopped
      // reconciliation for everyone else.
      await db.update(workspaces).set({ updatedAt: new Date() }).where(eq(workspaces.id, row.id)).catch(() => {})
      reportError(err, { route: 'cron/daily-maintenance', step: 'reconcile', workspaceId: row.id })
    }
  }
  return out
}
