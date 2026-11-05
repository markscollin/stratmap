# Billing life-cycle

How StratMap keeps a workspace's plan in step with Stripe (roadmap 1.3 and 1.4).

## Decisions (owner, 2026-11-05)

- **Grace period:** we follow Stripe's retry schedule (Smart Retries). While a renewal is `past_due`, the workspace keeps its
  paid plan and everyone sees a banner. Admins see an **Update payment** button. When Stripe gives up, it cancels the
  subscription or marks it `unpaid`, and the workspace drops to Free. Nothing is deleted.
- **Cancel and downgrade:** these take effect **at the end of the billing period**. Upgrades apply immediately, with proration.
- **Failed-payment email:** StratMap emails owners and admins (through Resend) on the **first** failed renewal attempt
  only. The banner covers later retries.
- **Seats (1.5):** flat tiers with a hard seat cap (Free 3, Starter 5, Growth 10). A seat is a member or a live pending
  invite. The cap is checked on invite, on accept and on resending an expired invite. A downgrade never removes anyone.

## How it works

- **Stripe is the source of truth.** Every handled webhook re-reads the subscription with `stripe.subscriptions.retrieve`
  and mirrors it onto `workspaces` (`syncSubscription` in `api/_lib/billing.ts`). So it doesn't matter if events
  arrive out of order. The tier comes from the subscription's **price id** (the `STRIPE_*_PRICE_ID` env vars), never from
  metadata. An unrecognised price keeps the current tier and reports to Sentry.
- **Status → tier:** `active`, `trialing` and `past_due` get the price's tier. Every other status
  (`unpaid`, `canceled`, `incomplete`, `incomplete_expired`, `paused`) gets Free. On `canceled` and `incomplete_expired`
  we clear `stripe_subscription_id` and keep `stripe_customer_id`, so the portal and a later re-subscribe reuse it.
- **Columns:** `subscription_status`, `plan_expires_at` (end of the paid-through period, or the scheduled cancel date) and
  `cancel_at_period_end`.
- **Effective plan:** `resolvePlanTier()` decides which tier applies. An active admin trial wins. A scheduled cancellation
  more than 2 days past its end date counts as Free, even if the deletion webhook never arrived.
- **Idempotency (1.4):** the webhook claims `event.id` in `stripe_events` before handling it. A duplicate delivery
  returns `{ received: true, duplicate: true }` and does nothing. If handling fails, the claim is released, so Stripe's
  retry runs the event again.
- **Handled events:** `checkout.session.completed`, `customer.subscription.created|updated|deleted|paused|resumed`,
  `invoice.paid` and `invoice.payment_failed`. Other event types are acknowledged and not recorded.
- **Checkout:** if a workspace already has a subscription, Checkout returns a **Customer Portal** URL instead
  (`{ url, portal: true }`), so nobody ends up with two parallel subscriptions. Checkout reuses an existing Stripe customer.
- **Portal:** `POST /api/billing/portal` (admin only) returns to `/settings?tab=billing`. It returns 409 `no-billing-account`
  if the workspace never paid and 503 `billing-unavailable` if Stripe isn't configured.
  To pin a portal configuration, set `STRIPE_PORTAL_CONFIGURATION_ID`.

## Stripe dashboard setup (owner, do this in test mode first, then live)

1. **Webhook endpoint** `https://<domain>/api/webhooks/stripe`. Subscribe it to the eight events listed above.
2. **Customer Portal** (Settings → Billing → Customer portal):
   - Allow updating the payment method, viewing invoices, and cancelling. For cancellation, choose **at end of billing period**.
   - Allow switching plans between the Starter and Growth products (monthly and annual prices).
     Set **downgrades to take effect at the end of the billing period** and **prorate upgrades**.
3. **Subscriptions and emails → Manage failed payments:** turn on Smart Retries. After all retries fail,
   choose **cancel the subscription** or **mark it as unpaid**. Both downgrade to Free.
   You can leave Stripe's own failed-payment emails off, because StratMap sends its own.

## Testing with the Stripe CLI

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
stripe trigger checkout.session.completed
stripe trigger invoice.payment_failed
stripe trigger customer.subscription.deleted
stripe events resend evt_...   # a replay must return { duplicate: true }
```

The automated tests are in `api/__tests__/stripe-webhook.test.ts`, `billing.test.ts` and `billing-portal.test.ts`, plus
`api/__live__/billing.live.test.ts` against Neon.
