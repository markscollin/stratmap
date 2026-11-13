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
- **Idempotency (1.4, made crash-proof in R-06):** the webhook *claims* `event.id` in `stripe_events` before handling it and
  marks it `processed_at` at the end (`api/_lib/stripeEvents.ts`).
  - Processed already → `{ received: true, duplicate: true }`, nothing is done.
  - Claimed, not processed, **younger than 60 s** → another delivery is working on it: **409** so Stripe retries later.
  - Claimed, not processed, **older than 60 s** (`CLAIM_STALE_MS`) → that delivery crashed or timed out; the next delivery
    **takes the claim over** (compare-and-set, so two retries cannot both win) and handles the event again. Handlers re-read Stripe, so repeating is safe.
  - A handler error makes the claim stale at once, so Stripe's retry does not wait a minute.
  - The failed-payment emails are guarded separately (`emails_sent_at`), so a takeover never sends them twice.
- **A lost checkout event heals itself (R-06):** checkout stamps `workspaceId` on the subscription (`subscription_data.metadata`).
  If an event arrives for a subscription no workspace is linked to, `syncSubscription` finds the workspace from that metadata and links it,
  but only if the workspace has **no** subscription yet, is not deleted, and the subscription is not finished. The tier still comes from the price id.
- **Success page (R-06):** `/billing/success` polls `/api/workspace` for about 10 s. If the plan has not changed it says "Payment received, your plan
  has not updated yet" with a **Check again** button, never "Your upgrade is complete". Set `VITE_SUPPORT_EMAIL` (build time) to show a support address there.
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

## Release check for the webhook body (R-05): run this on a deployed preview

**Why.** Stripe signs the exact bytes it sends, so the webhook must read the raw body. `@vercel/node` reads the whole body to
build `req.body`, then replays it only through `req.on('data'|'end')` (a `for await` over the request gets nothing). The handler
now reads it that way (`api/_lib/rawBody.ts`) and the tests prove it against an emulation of that helper with a real Stripe
signature (`api/__tests__/stripe-raw-body.test.ts`). The old `export const config = { api: { bodyParser: false } }` is Next.js syntax that
`@vercel/node` never reads; it was removed. **What the tests cannot prove is that Vercel's production runtime behaves like the emulation.**
If it does not, every webhook answers 400 and **nobody is upgraded after paying**, so run this once before taking real payments,
and again after any change to `api/webhooks/stripe.ts`, `api/_lib/rawBody.ts` or the `@vercel/node` version.

1. **Preview with test keys.** Deploy a preview (push a branch). In Vercel → Settings → Environment Variables set, for *Preview*:
   `STRIPE_SECRET_KEY` (`sk_test_…`), `STRIPE_STARTER_MONTHLY_PRICE_ID` (a test-mode price) and `DATABASE_URL` (a Neon **dev branch**, never production).
   Leave `STRIPE_WEBHOOK_SECRET` for step 3. Do **not** set `VERCEL_ENV` yourself.
2. **Let Stripe reach the preview.** Previews sit behind Vercel Authentication, which would answer Stripe with 401/403. Either turn off
   Deployment Protection for this one test, or use *Protection Bypass for Automation* and add `?x-vercel-protection-bypass=<secret>` to the endpoint URL in step 3.
3. **Endpoint.** Stripe dashboard (**test mode** switch on) → Developers → Webhooks → *Add endpoint*: `https://<preview-url>/api/webhooks/stripe`, subscribe the
   eight events listed above. Copy its *Signing secret* (`whsec_…`) into the preview's `STRIPE_WEBHOOK_SECRET`, then **redeploy** (env vars only apply to new deployments).
4. **Quick check (1 minute).** Endpoint page → *Send test webhook* → `customer.subscription.updated` → Send. Open the delivery and read the response:
   - `400 {"error":"Invalid signature"}` → wrong `STRIPE_WEBHOOK_SECRET` (step 3), not a code problem.
   - `400 {"error":"Could not read raw body"}` → **the problem this check exists for**: production does not replay the body the way the tests assume. Stop and tell whoever maintains this;
     see "If it fails" below.
   - `200`, or `500 {"error":"Webhook handler failed"}`: **the body and signature passed.** (A 500 can happen here: the dashboard's sample event usually names a subscription that does not exist, so the lookup in Stripe fails *after* verification. Check the log line to be sure it is that and not a body problem.)
5. **Real check (5 minutes).** Sign in to the preview as a test user with a workspace, choose Starter, pay with card `4242 4242 4242 4242` (any future date, any CVC).
   Expect `/billing/success` to say **Welcome to Starter** within about 10 seconds, Settings → Billing to show Starter, and every delivery on the endpoint page to show **200**.
   Also check the function log (Vercel → project → Logs, filter `/api/webhooks/stripe`): there must be no `could not read raw body` or `signature verification failed` line.
6. **Record it.** Tick R-05 in `docs/LAUNCH_REVIEW_BACKLOG.md` with the date, the preview URL and what you saw.
7. **Clean up.** Delete the test endpoint, and remove the preview-only variables if they should not persist.

**If it fails (step 4 shows `Could not read raw body`).** In order of effort: (a) read `req.on('data')` after setting the project env var
`NODEJS_HELPERS=0`; this disables the helpers for the whole project, so every other handler would have to stop using `res.status().json()`, which is why it was not done blind;
(b) switch only this route to the Web-standard signature `export async function POST(request: Request)` and use `await request.text()` (needs the e2e server and tests adapted for that route);
(c) as a stop-gap verify by fetching the event from Stripe (`stripe.events.retrieve(body.id)` and use that object): the event ids are unguessable and every handler already re-reads Stripe, but it is a different security argument from the signature, so it needs the owner's explicit agreement.

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
