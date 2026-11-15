import { resolvePlanTier } from './billing'
import type { workspaces } from '../../src/lib/db/schema'

type WorkspaceRow = typeof workspaces.$inferSelect

// The one way a workspace row leaves the server (R-29): GET, POST and PUT /api/workspace all use it. Stripe ids never leave
// (the browser only learns `hasBillingAccount`), the subscription mirror is grouped under `billing`, the plan is the
// effective one (trial and lapsed cancels applied), and the bookkeeping for trial emails stays internal.
export function publicWorkspace(ws: WorkspaceRow) {
  const {
    stripeCustomerId, stripeSubscriptionId: _sub, subscriptionStatus, planExpiresAt, cancelAtPeriodEnd,
    trialWarnedAt: _w, trialEndedNoticeAt: _e,
    ...rest
  } = ws
  return {
    ...rest,
    planTier: resolvePlanTier(ws),
    billing: { status: subscriptionStatus, planExpiresAt, cancelAtPeriodEnd, hasBillingAccount: stripeCustomerId != null },
  }
}
