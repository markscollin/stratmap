# Launch roadmap (2026-11-24)

What is left between StratMap and taking real money, in the order to do it. This comes from the full review of
commit `9675937` (security, billing, data integrity, a UX pass in a real browser, and a full build and test run).

**Relationship to the other files.** Items here continue the numbering of `docs/LAUNCH_REVIEW_BACKLOG.md`
(R-01 to R-54 live there; new code items start at **R-55**, new owner decisions at **D-6**, new owner actions at **O-10**).
Owner account work is still listed in `docs/OWNER_CHECKLIST.md`. Tick items **here** as they ship.

## How to use this file

- Work the phases in order; inside a phase, in the order listed. Phase 2 (owner) runs in parallel with everything.
- **Evidence labels.** *Verified* = re-read in the code on 2026-11-24. *Reported* = found by a review agent and not
  re-read; **reproduce it (ideally as a failing test) before fixing**, and if it does not reproduce, say so here and close it.
  *Suspected* = depends on a dashboard or platform setting that cannot be seen from the repo.
- Line numbers are at `9675937`; re-check before editing.
- Every code item needs tests. Before pushing: `npm run typecheck`, `npm run lint`, `npm run test:run`, `npm run test:api`,
  `npm run build`; canvas or flow changes also `npm run test:e2e:local` (in the cloud sandbox add
  `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`).
- When an item ships: tick it, add the date and one line on what was done, and update `CLAUDE.md` if behaviour it
  documents changed (and the "Real test counts" line).
- If an item needs an owner decision (D-x) that has not been made, do not guess: build the part that does not depend on it,
  and leave the question in the item.

**Baseline at review time:** typecheck clean; lint 0 errors, 14 warnings; **992 frontend tests pass (+2 skipped); API 922 pass,
2 FAIL** (R-55); build OK; `npm audit --omit=dev` 0. e2e last recorded 124/124 (not re-run in the review).

**After Phase 0 + 1 (2026-11-24):** typecheck clean; lint 0 errors, 14 warnings; 1,000 frontend (+2 skipped); API 948/948; build OK;
e2e 126/126. Seen in e2e logs, not a test failure and not from these changes (present before them): a `workspaces_pkey` duplicate-key error
and a failed `workspaceDepartmentStore` fetch during `journey.spec.ts`, probably two parallel first requests for the `u-dev` workspace. Worth a look in R-74.

Sizes: **S** under half a day, **M** one to two days, **L** three days or more.

---

## Summary

| Phase | ID | Item | Size | Evidence |
|---|---|---|---|---|
| 0 | R-55 | API suite red: scheduled snapshots ignore the injected clock | S | verified |
| 1 | R-56 | A stranger can capture a new user through a tokenless invite auto-accept | M | verified |
| 1 | R-57 | Dashboard counts only `live` charts, so it reads 0 for most workspaces | S | verified |
| 1 | R-58 | Workspace export can exceed the 4.5 MB response limit | M | verified (code) |
| 1 | R-59 | Import and template chart creation are not atomic on Neon | M | reported |
| 1 | R-60 | Checkout sends no tax settings | S | verified (+ D-6) |
| 1 | R-61 | Stripe ids that Stripe no longer knows break checkout and stall reconciliation | M | reported |
| 2 | O-10 | Clear test-mode Stripe data before going live | S | owner |
| 2 | O-06 | Point-in-time recovery + restore drill (now a launch gate) | S | owner |
| 3 | R-62 | Landing page has no product visual (absorbs R-41) | M | verified |
| 3 | R-63 | Pricing page fixes | S | verified |
| 3 | R-64 | First chart on the canvas: toolbar overlap, unconnected roles, "node" wording | M | verified |
| 3 | R-65 | Role panel shows invented data and is clipped | S | verified |
| 3 | R-66 | Free users see the approval jargon; trial banner on the canvas | S | reported |
| 4 | R-67 | Restoring a version permanently loses comments and job descriptions | M | reported |
| 4 | R-68 | Editors can un-approve or rewrite approved JDs and headcount plans | M | verified (+ D-7) |
| 4 | R-69 | Billing races and lapsed states | M | reported |
| 4 | R-70 | Chart revision is claimed before the write | M | reported |
| 4 | R-71 | Cron duration, function region, cron heartbeat | S | suspected |
| 4 | R-72 | Personal data left behind (audit log, Sentry) | S | verified |
| 4 | R-73 | Missing indexes behind cascades | S | verified |
| 4 | R-74 | Check-then-insert races: invite accept, first JD save, workspace create | M | reported |
| 4 | R-75 | Small hardening | S | reported |
| 4 | R-76 | Auto-layout and PDF are gated in the browser only | S | reported (+ D-9) |
| 5 | R-77 | Keep a chart current: update from a file | L | product |
| 5 | R-78 | First HR-system integration | L | product (+ D-8) |
| 5 | R-79 | A way to buy above Growth | S | product (+ D-10) |
| 5 | R-80 | Onboarding questions that nothing uses | S | verified |

---

## Phase 0: green CI (do first, today)

### R-55 API suite red: scheduled snapshots ignore the injected clock
- [x] **Done 2026-11-24.** `resolvePlanTier(r, now)`, and `saveSnapshot` takes an optional `createdAt` that the daily job sets to `now` (the
  14-vs-11 failure was the 20-hour gap check comparing the injected `now` with a real-clock `created_at`). New tests run the job with the
  system clock moved a month forward and back. Other `now`-taking functions in `api/` (`restoreWorkspace`, `purgeExpiredWorkspaces`,
  `claimEvent`, `sendTrialNotices`) were checked: none passes the clock on to something that ignores it. API 926/926.
- **Problem.** `takeScheduledSnapshots(now)` takes a clock for testability, but `api/_lib/scheduledSnapshots.ts:50` calls
  `resolvePlanTier(r)` without `now`, so the trial check uses the real date. The test pins `T0 = 2026-11-19`; it passed the day it was
  written and fails since. Two failures in `api/__tests__/scheduled-snapshots.test.ts` ("a trial counts as the plan…" and "keeps only the
  newest 14 daily versions…"). Production behaviour is right (`now` defaults to the real date), but **CI is red, so a protected `main` cannot deploy**.
- **Fix.** Pass `now` to `resolvePlanTier`. Then find out why the second test fails (11 versions instead of 14): look for any other
  `new Date()` / `defaultNow()` in the path (`saveSnapshot` pruning, "changed since the latest version" comparing a real-clock
  `charts.updatedAt` with the injected `now`). Every comparison in the job must use the injected clock.
- **Also.** Grep `api/` for other functions that take `now` and call something that does not get it.
- **Done when** `npm run test:api` is 924/924 and stays green if run with the system clock moved a month forward (e.g. `vi.setSystemTime` in a new test).

---

## Phase 1: launch blockers in code

### R-56 A stranger can capture a new user through a tokenless invite auto-accept
- [x] **Done 2026-11-24.** `POST /api/invites/accept` takes `{ token }` (the link) or `{ inviteId }` (an explicit pick); with neither it is
  400 `invite-choice-required`. `AuthProvider` accepts only a remembered link token. Onboarding shows `PendingInvitesChoice`
  (`GET /api/invites/mine`: workspace, inviter name + email, role) with Accept / Decline (`POST /api/invites/decline`, deletes the invite,
  audit `invite.declined`) above "create your own". `POST /api/workspace` now returns an existing workspace only if the person **owns**
  a live one. Tests: `invite-accept.test.ts`, `workspace.test.ts`, `AuthProvider.test.tsx`, `PendingInvitesChoice.test.tsx`, `tests/e2e/invite-choice.spec.ts`.
- **Problem (verified).** When a signed-in person has no workspace, `UserSync` (`src/features/auth/AuthProvider.tsx:181-196`) calls
  `POST /api/invites/accept` with no token, without asking. The server (`api/invites/accept.ts:59-67`) then joins them to the **newest
  unexpired invite sent to any of their verified emails**. Anyone can make a Free workspace named "VictimCo", invite `cfo@victimco.com`
  as admin, and resend at will to stay newest (`api/workspace/invites/[id].ts` POST bumps `sentAt`). When the CFO signs up on their own,
  they land in the attacker's workspace, never see onboarding, and whatever they enter (salaries too) is the attacker's. `POST /api/workspace`
  then returns that membership instead of creating their own workspace (`api/workspace.ts:52-63`), so they cannot even start fresh.
- **Fix.**
  1. Auto-accept **only with a token** (they clicked the link in the email).
  2. Without a token: if invites exist for their email, show them on a choose screen ("You've been invited to X by Y — Accept / Decline /
     Create my own workspace"), with the inviting workspace's name and the inviter's email. Decline deletes that invite (log it).
  3. The create guard in `POST /api/workspace` checks **owned** workspaces, not memberships (one *owned* workspace per user is the rule).
- **Done when** a tokenless sign-in with a pending invite never joins anything without a click; tests in `invite-accept.test.ts`,
  `AuthProvider.test.tsx`, and an e2e (invited user signs up without the link, sees the choice, declines, onboards their own workspace).

### R-57 Dashboard counts only `live` charts
- [x] **Done 2026-11-24.** `GET /api/workspace/stats` counts the live charts when there are any, otherwise every chart that is not archived
  and not the sample, and returns `scope` (`live`|`all`) and `chartCount`; the KPI cards say "active roles across 1 chart" / "in 2 live
  charts" (`src/lib/statsScope.ts`). Also fixed on the way: a role on a blank chart that uses a workspace department directly now counts in
  that department. Tests: `workspace-stats.test.ts`, `statsScope.test.ts`, `DashboardLoadError.test.tsx`.
- **Problem (verified).** `api/workspace/stats.ts:14-35` counts headcount, open roles and departments over charts with
  `status = 'live'` only. Going live needs the approval workflow (Starter+) and an admin, so on Free and for most new paid users
  "Org Health" reads 0 right after they build a chart (UX screenshot: a 3-role chart, dashboard all zeros, checklist says "chart built").
- **Fix.** Decide the rule in code, not in copy: count every non-archived, non-sample chart, or the live charts if any exist and otherwise
  all non-archived ones; label the figure honestly ("Across 3 charts" / "Across live charts"). Keep the "Live org charts" KPI as is.
- **Done when** a Free user who builds a 3-role chart sees 3 on the dashboard; API and Dashboard tests cover both cases.

### R-58 Workspace export can exceed the response limit
- [x] **Done 2026-11-24.** The JSON export is written chart by chart (`res.write`, a streamed reply), each chart's rows read in their own
  queries, not pretty-printed, and versions are listed **without** their contents: name, kind, date, author, counts and a `dataUrl`
  (the existing `GET /api/charts/:id/snapshots/:snapshotId`, readable by any member). Format is now `stratmap-workspace-export/2`.
  Test: 20 charts × 300 roles × 84 versions exports under 4 MB (`data-rights.test.ts`). **To check on a preview:** Vercel documents no
  4.5 MB cap for streamed replies; confirm a large export downloads there (not verifiable locally).
  **Follow-up (2026-11-24):** the per-version `dataUrl` links were a poor answer for a data export (they need a signed-in session, so
  they are useless once someone has left). Replaced by a downloadable file per chart with every version's contents
  (`?format=versions&chartId=`, format `stratmap-chart-versions/1`, own 60/hour limit), offered in Settings → General → Export as a
  chart picker + "Version history (JSON)" (`VersionHistoryDownload`). The main export lists `versionsFile` per chart.
- **Problem (verified in code; size not measured).** `api/workspace/export.ts:101` puts every chart version's full `data`
  (`chartVersions`) into one body, pretty-printed (`:106`, `JSON.stringify(body, null, 2)`). Each chart can keep 50 manual + 20 automatic
  + 14 daily versions. Vercel caps a function response at 4.5 MB, and the Neon HTTP driver caps a query response too. The data export
  (a GDPR right) fails for exactly the bigger customers.
- **Fix.** Drop the pretty-print. Export version **metadata** only (name, kind, date, author, counts) by default; offer the version data
  per chart (existing `GET .../snapshots/:id`) or as a second download. If the body can still be large, stream it or build it as a zip.
  Read snapshots in pages, not one query. Add a test that seeds a large workspace and asserts the body stays under ~4 MB.
- **Done when** the export of a workspace with 20 charts × 84 versions × 300 roles succeeds and is under the limit.

### R-59 Import and template chart creation are not atomic on Neon
- [x] **Done 2026-11-24.** Reproduced first (a trigger that makes the edge insert fail left the roles, departments and a bumped revision).
  `POST /api/charts/:id/import` is now ONE `runAtomically` batch: revision claim first (it locks the chart row, so a second import waits),
  departments, role and line chunks, then the plan/sample recount as a **guard statement** that fails the batch when over (no insert-then-take-back).
  Guards (`guardStatement`, `revisionClaimStatement`, `guardFailure` in `api/_lib/revision.ts`) fail with a cast error whose text names the reason.
  `POST /api/charts` inserts the chart, departments, roles and lines in one batch (the R-50 recount stays a single cascading delete).
  Tests: `import.test.ts` (PGlite) and `neon-emulator.test.ts` (the real Neon driver: a failed guard rolls back the batch).
- **Problem (reported).** `api/charts/[id]/import.ts:60-110`: the revision is claimed, then departments, node chunks and edge chunks are
  separate `await db.insert` calls; the R-44 take-back is several separate deletes. A failure or timeout part-way leaves a half-imported
  chart with a bumped revision, breaking the owner rule "all or nothing". `api/charts/index.ts:77-138` (template seeding) has the same shape.
- **Fix.** Build every insert (already chunked) into one `runAtomically` batch, as `branchSnapshot` does. On Neon `db.batch` is one
  transaction; nothing may read a result between statements. Do the limit recount in the same batch if possible (a conditional
  `INSERT … SELECT … WHERE (count) <= max`), or keep recount-and-take-back but as one batch.
- **Done when** a test that makes the edge insert fail leaves no roles, departments or revision bump behind (on PGlite and, in
  `neon-emulator.test.ts`, through the Neon driver).

### R-60 Checkout sends no tax settings
- [x] **Done 2026-11-24.** Checkout always sends `billing_address_collection: 'required'`, `tax_id_collection`
  and `customer_update: { address, name: 'auto' }`; `automatic_tax` is on only with `STRIPE_AUTOMATIC_TAX=1` (`checkoutTaxParams` in
  `api/checkout.ts`, `checkout.test.ts`; `check:env` knows the variable). `docs/BILLING.md` (setup step 4) and `OWNER_CHECKLIST.md` say
  what to switch on and in which order. **D-6 (2026-11-25): not a blocker.** The VAT wording is one switch, `PRICE_TAX_MODE` in `src/lib/taxDetails.ts`: `null` (now) says
  nothing, `'inclusive'` / `'exclusive'` puts the matching line under the plan cards. Turning tax on later is configuration only (that switch,
  the Stripe prices' tax behaviour, Stripe Tax, `STRIPE_AUTOMATIC_TAX=1`).
- **Problem (verified).** `api/checkout.ts` (around `:73-86`) has `allow_promotion_codes` but no `automatic_tax`,
  `billing_address_collection`, `tax_id_collection` or `customer_update`. Turning Stripe Tax on in the dashboard does nothing unless the
  session asks for it. The customer is created before Checkout with no address, so it also needs `customer_update: { address: 'auto', name: 'auto' }`.
- **Needs D-6.** Build it behind `STRIPE_AUTOMATIC_TAX=1` so the owner can switch it on once registered; collect a billing address and tax id
  either way (needed for UK/EU B2B invoices). Prices: decide whether £18/£49 are tax-inclusive (Stripe price `tax_behavior`) and say so on the pricing page.
- **Done when** the checkout session parameters are covered by `checkout.test.ts`, and `docs/BILLING.md` + `OWNER_CHECKLIST.md` say what to switch on.

### R-61 Stripe ids that Stripe no longer knows break checkout and stall reconciliation
- [x] **Done 2026-11-24.** Reproduced: a `resource_missing` throw left the paid tier, broke Checkout and kept the row first in the reconcile
  queue. Now `isStripeMissing` + `forgetMissingSubscription` in `api/_lib/billing.ts` unlink the subscription and drop to Free (Sentry);
  the duplicate check treats a missing linked subscription as finished; reconcile bumps `updated_at` on failure; the webhook handles
  `customer.deleted`; Checkout syncs a linked subscription first and replaces a missing/deleted customer. Tests: `checkout.test.ts`,
  `daily-maintenance.test.ts`, `stripe-webhook.test.ts`. O-10 (clearing test-mode ids before going live) is still the clean way.
- **Problem (reported).** `syncSubscription` (`api/_lib/billing.ts:~102`) throws on `stripe.subscriptions.retrieve` before writing.
  Workspaces carrying ids from **test mode** (or a deleted customer/subscription) after the switch to live keys therefore: keep their paid
  `planTier` forever (only `cancelAtPeriodEnd` drops a plan, `resolvePlanTier` `:231`); get a 500 at checkout (`checkout.ts:52` sends anyone
  with a subscription id to the Portal; `:59` reuses a stale `stripeCustomerId`); and sit at the head of the daily reconcile queue forever
  (`api/_lib/reconcile.ts:28` orders by `updatedAt`, a failed row is never touched), so 100 of them stop reconciliation for everyone.
- **Fix.** Treat Stripe `resource_missing` as terminal: clear the dead ids and drop to Free (report to Sentry). In reconcile, bump a
  `billing_checked_at` (or `updatedAt`) on failure too, so the queue moves. Handle `customer.deleted` (clear the customer id). In checkout,
  if the stored customer is gone, make a new one.
- **Done when** tests cover a missing subscription, a missing customer, and a reconcile batch where the first rows always fail.

---

## Phase 2: owner actions (in parallel; nobody else can do these)

Everything in `docs/OWNER_CHECKLIST.md` section A still stands: legal facts (R-04; `/privacy` and `/terms` currently show
"[Company Legal Name]" and the template banner), webhook check on a preview (R-05), a real payment test, Clerk production (O-01),
domain + `APP_URL` + email DNS (O-03), Vercel Pro (O-02), Stripe live (O-04), production env check (O-07). Two changes:

- [ ] **O-10 Clear test-mode Stripe data before going live.** Before the first live key goes into Production, run (on the production DB, after a backup)
  a one-off that nulls `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `plan_expires_at`, `cancel_at_period_end` and resets
  `plan_tier` to `'free'` on every workspace whose ids came from test mode (all of them, if production has only ever used test keys). R-61 makes the
  app survive missing ids, but this is the clean way. *Code helper wanted:* a script `scripts/clear-test-billing.mjs` with a dry-run that prints counts only.
- [ ] **O-06 is now a launch gate**, not "recommended": point-in-time recovery on, one restore drill into a scratch branch, and Preview deployments on a
  different `DATABASE_URL` from Production. It is the only recovery for a deleted chart or a bad migration.

---

## Phase 3: conversion and first-run UX (before launch)

### R-62 Landing page has no product visual (absorbs R-41)
- [x] **Done 2026-11-25.** Owner picked: the Scale-up template with made-up names, as a picture. `npm run make:landing-images`
  (`tests/e2e/landing-images.spec.ts`, skipped in normal runs) builds that chart in the real app, shares it and screenshots the read-only
  `/embed` view, controls hidden and cropped, into `public/landing/chart-{dark,light}.png` (~100 kB each); the page shows the one for the
  current theme (`.theme-dark-only` / `.theme-light-only` in `globals.css`), captioned "Example chart. The names are made up."; on a phone it
  keeps a readable width and scrolls sideways, starting at the middle. Added "How it works" (import → arrange → share and plan), a pricing
  teaser and five FAQ entries (free plan, trial end, getting data out, who sees salaries, where data is kept: no region claimed). Prices now
  live in `PLAN_PRICES` (`plans.ts`) and every number on the page comes from there or `PLAN_LIMITS`. "Not a slide that goes stale" and
  "living document" are gone until R-77. Landing chunk 3.6 kB gzip. Tests: `LandingPage.test.tsx`.
- **Problem (verified).** `src/pages/LandingPage.tsx` is 89 lines: headline, two buttons, three text cards, footer. No screenshot, no demo,
  no pricing teaser, no FAQ. For a canvas product this is the biggest conversion leak. Also: "One living chart, not a slide that goes stale" is a
  promise the product does not keep without R-77/R-78; soften it until then.
- **Fix.** A real chart image in the hero (light and dark, made from a template chart via the existing export, or a live read-only embed of a
  public sample chart through `/embed/:code`), a "how it works" strip (import → arrange → share/plan), a pricing teaser linking to `/pricing`,
  and 4–6 FAQ entries (data location, export/leaving, security, trial). No invented testimonials or logos. Keep the landing bundle budget (R-24).
- **Needs** the owner to approve the visual (old R-41 question).

### R-63 Pricing page fixes
- [x] **Done 2026-11-25.** "Talk to sales" uses `SALES_EMAIL` (`VITE_SALES_EMAIL`, else `VITE_SUPPORT_EMAIL`; hidden with neither, never
  `sales@stratmap.app`; `check:env` knows it). "Most popular" removed. Starter says "Everything in Free, plus", Growth "Everything in Starter,
  plus". Every limit and price comes from `PLAN_LIMITS` / `PLAN_PRICES` (the upgrade modal too), cards say "roles" not "nodes", and "2 months
  free" is worked out from the prices. Signed in: the plan you are on says "Current plan" (paid ones used to offer to buy themselves again), and
  on a paid plan the Free card says to cancel in Settings → Billing instead of a dead button. VAT: `PRICE_TAX_MODE` (R-60). Tests:
  `PricingRoute.test.tsx`, `PricingSalesEmail.test.tsx`.
- (verified) `src/pages/PricingPage.tsx`:
  - `:279` "Talk to sales" is `mailto:sales@stratmap.app`, a domain not owned. Read it from config (`VITE_SALES_EMAIL`, falling back to the support email); hide the CTA if neither is set.
  - `:188` "Most popular" on Starter before any customers. Remove (or "Recommended").
  - The Growth card does not say it includes everything in Starter; add "Everything in Starter, plus".
  - Plan numbers in card copy are typed by hand; read seats/charts/roles from `PLAN_LIMITS` like the AI numbers already are, and add a test.
  - Signed in on a paid plan, the Free card shows a disabled "Get started free"; show nothing or "Downgrade via Manage billing".
  - ~~Say whether prices include VAT~~ handled by `PRICE_TAX_MODE` (R-60); nothing to do here.

### R-64 First chart on the canvas
- [x] **Done 2026-11-25.** Reproduced at 1280 px (toolbar over the name, "Add node" wrapping). The desktop canvas now has one header row
  (`canvas-header` in `CanvasView`): back, name (ellipsis + tooltip), status, version, and the toolbar portalled into a slot on the right
  (`OrgChart toolbarSlot` → `Toolbar slot`); it wraps instead of overlapping. Share/embed pages keep the floating toolbar. "Add role" defaults
  **Reports to** to the selected role, else the chart's one top role (`defaultReportsTo`), the side panel has "Add direct report", and a role
  with a manager is placed in the row under them next to their other reports (`placeUnderManager`, `src/features/canvas/addRole.ts`).
  Fit-to-view never goes below 80% on a chart of 12 roles or fewer (`fitScale`). "node" → "role" everywhere a person reads it ("None (top of
  the chart)"). The minimap was already coloured by department (R-48); it is now shown from 20 roles up. Tests: `addRole.test.ts`,
  `OrgChartAddRole.test.tsx`, `CanvasView.test.tsx`, `tests/e2e/first-chart.spec.ts`; e2e helpers now always choose "Reports to"
  (`data-testid="reports-to"`).
- (verified from the UX run, screenshot evidence) Each of these is small; together they are the first five minutes:
  - The floating toolbar covers the status pill next to the chart name at 1366 px ("Dr…"). Lay the header and toolbar out so neither overlaps (test at 1280 and 1366).
  - "Reports to" defaults to "None (root node)", so adding a CEO, CTO and Head of People gives three unconnected boxes in a column. When a role is
    selected, "Add role" should default **Reports to** to it (and offer "Add direct report" on the selected card); with no selection and an existing
    single root, default to that root.
  - After adding, the zoom was 58% and the text unreadable: do not zoom out below ~80% to fit a small chart.
  - Wording: `NodeModal.tsx:438,445,583` and the toolbar say "Add node" / "Create node"; everything else says "role". Use "Add role" / "Create role" (update `NodeModal.test.tsx`).
  - The minimap shows bare grey blocks; colour them by department like `NodeChip`, or hide the minimap under ~20 roles.

### R-65 Role panel shows invented data and is clipped
- [ ] (verified) `src/features/panel/JDPanel.tsx:183` shows `node.location ?? 'Remote / Hybrid'`: every role without a location claims to be remote/hybrid.
  Show nothing (or "Location not set") instead. At 1366 px the fourth tab is cut to "Commen…" and Overview runs off the right edge. Salary inputs show
  `0` as placeholder (use "Min"/"Max"); the currency defaults to USD while the product prices in GBP (default to the workspace's last-used, else GBP).

### R-66 Free users see the approval jargon; trial banner on the canvas
- [ ] (reported) The empty Charts page shows an "Approval cycle" strip (`src/pages/ChartView.tsx:32-52`) with seven states Free users cannot use: show it
  only when the workspace has `approval-workflow`, or collapse it into a one-line "Approvals: Starter and up". The trial banner (~60 px) shows on every page
  including the canvas and cannot be dismissed: let it be dismissed per day, and on the canvas show a compact version. Also: the headcount filter label reads
  "Charts All"; the public share page says "View only" twice; check the welcome toast uses the person's name with real Clerk, not the user id.

---

## Phase 4: first 30 days after launch

### R-67 Restoring a version permanently loses comments and job descriptions
- [ ] (reported) `api/_lib/snapshots.ts:109-125`: roles not in the version are deleted; their comments cascade away at once (`role_comments.node_id`) and are not
  copied to `deleted_nodes`; their JDs are orphaned and the daily `purgeOrphanJobDescriptions` erases them (it checks the JD's `updated_at`, usually old).
  So undoing a mistaken restore brings the roles back without their discussions or JDs. **Fix:** in the same batch, copy each removed role (with comments,
  lines, JDs) into `deleted_nodes`, exactly like a role delete, and on restore-of-the-auto-version bring them back; or at minimum keep the orphan purge off a chart's
  JDs for 30 days after a restore. **Done when** restore A → restore "Before restoring A" gives back comments and JDs (test).

### R-68 Editors can un-approve or rewrite approved JDs and headcount plans
- [ ] (verified for JDs) `api/charts/[id]/jd/[nodeId].ts:24,95` checks only the status being moved **to**: an editor can move an approved/published/hired JD back
  to draft, or rewrite its text while it stays approved. `api/headcount/[id].ts:~40`: only `→ approved` is restricted; editors can move approved plans back, edit
  them, or delete them. Approvals are a paid feature; as built they are advisory. **Needs D-7.** Suggested: leaving an approved state needs admin, and an editor's
  content edit of an approved item sets it back to `in-review` (with a notice in the UI). Mirror the R-08 pattern (one pure rule shared by UI and API, tested together).

### R-69 Billing races and lapsed states
- [ ] (reported; reproduce each with a test first) in `api/_lib/billing.ts` and `api/checkout.ts`:
  1. Duplicate-subscription handling (R-19) writes the link with an unconditional `UPDATE … WHERE id` after reading it earlier (`~:159-169`). With parallel
     webhooks for two subscriptions, both can be cancelled and refunded. Use compare-and-set: `WHERE stripe_subscription_id IS NULL OR stripe_subscription_id = :id`.
  2. `unpaid`, `paused` and `incomplete` count as live (`~:51,138`): a lapsed customer cannot buy again through Checkout, and a new subscription would be refunded as a duplicate.
     Treat them as finished for the purpose of checkout and duplicates.
  3. Restoring a deleted paid workspace does not undo `cancel_at_period_end` (`api/_lib/workspaceLifecycle.ts:~101`). Undo it on restore (or ask in the restore UI).
  4. Out-of-order webhook syncs can write stale state; compare Stripe's object `created`/event time or always re-read and write only if newer.
  5. `checkout.session.completed` links a workspace that was deleted after checkout opened (`~:108`): check `deletedAt`, and refund or flag.
  6. A won chargeback / full refund keeps the plan; at least make `BILLING_ALERT_EMAIL` a launch env var in `check:env`.
  - Owner side: set the Customer Portal to charge upgrades immediately (`always_invoice`), and restrict promotion codes to the intended coupons.

### R-70 Chart revision is claimed before the write
- [ ] (reported) `claimRevision` commits N+1, then the handler writes in a separate call (`api/charts/[id]/nodes/[nodeId].ts:~52-78`, `restore.ts:~56`, `import.ts:~60`).
  A read between them gets N+1 with old data and its next edit passes the check (e.g. a line to a role being deleted; edges have no FK to nodes). A lost reply to a
  DELETE/PUT makes Retry hit a false `409 chart-changed`. **Fix:** put the conditional revision update in the same `runAtomically` batch as the write (fail the batch
  when it matches 0 rows), and make DELETE/PUT idempotent before the claim, as POST already is.

### R-71 Cron duration, function region, cron heartbeat
- [ ] (suspected) `vercel.json` sets no `maxDuration` for `api/cron/*` and no `regions`. The daily job does up to 100 Stripe calls, 200 chart snapshots and emails in one
  run; a timeout skips the later steps every day and Vercel crons do not retry. With no region pinned near Neon, every API request's 6–10 sequential queries cross regions.
  **Fix:** `maxDuration` for the cron functions, `regions` matching the Neon region, and a heartbeat (Sentry Cron Monitors or an uptime "heartbeat" URL hit at the end of
  each run) in `docs/MONITORING.md`, which should also stop saying Sentry starts statically in `main.tsx`.

### R-72 Personal data left behind
- [ ] (verified) `api/workspace/transfer-ownership.ts:65` stores `previousOwnerEmail` in audit `details`, but account deletion only strips the key `email`
  (`api/_lib/workspaceLifecycle.ts:153,157`). Strip every `*Email` key (or store the email only under `email`). (Reported) `api/_lib/invites.ts:~45` sends the
  invitee's address to Sentry when an invite email fails; send the invite id instead. Add both to `audit.test.ts` / a Sentry PII test.

### R-73 Missing indexes behind cascades
- [ ] (verified for the first) `role_comments` is indexed on `(chart_id, node_id)` and `workspace_id` only (`schema.ts:317-318`): deleting a role cascades on `node_id` and
  scans the table. Also reported unindexed: `role_comments.parent_id`, `departments.workspace_department_id`, `headcount_plans.chart_id`, `pending_invites.invited_by`,
  `chart_snapshots.workspace_id`. Add them (small tables today, so a normal migration is fine). Note for later: `scripts/migrate.mjs` runs each migration in a transaction, so
  `CREATE INDEX CONCURRENTLY` is impossible; add a "no-transaction" marker before any table is big.

### R-74 Check-then-insert races
- [ ] (reported) (1) `api/invites/accept.ts:~76-110` checks seats then inserts, with no recount, against the rule in `CLAUDE.md`; recount and take back like invite create.
  (2) `job_descriptions` has a non-unique `(chart_id, node_id)` index (`schema.ts:176`): two first autosaves can both insert; make it unique (dedupe first, keep newest)
  and upsert. (3) `api/workspace.ts:~98-115`: workspace insert and owner-member insert are separate; a failure between leaves an orphan the user owns; put them in one batch.

### R-75 Small hardening
- [ ] (reported) `api/_lib/identity.ts:17-21` gives any `dev-…` user id a synthetic identity without `isDevBypassAllowed()`: gate it. `api/_lib/auth.ts` `verifyToken`
  without `authorizedParties`: pass the production origin(s) once O-01/O-03 are done. `api/charts/[id]/nodes/[nodeId]/restore.ts:58` plain insert: re-key on an id clash
  like `freeSquattedIds`. `avatarUrl` (any URL) and department `colour` (any 50 chars): restrict colour to a hex/token pattern; consider proxying or restricting avatar hosts
  on public share/embed pages (they leak viewers' IPs). `/api/health`: light rate limit (each hit wakes Neon).

### R-76 Auto-layout and PDF are gated in the browser only
- [ ] (reported) Auto-layout just saves positions through `PUT /nodes`; PDF is drawn in the browser. A determined Free user can get both. **Needs D-9**; if accepted, write it
  down in `CLAUDE.md` next to the watermark note and close.

---

## Phase 5: the product bets (why customers stay or leave)

### R-77 Keep a chart current: update from a file
- [ ] The import only adds roles or makes a new chart. Customers' people data lives elsewhere and changes weekly; without a way to re-sync, the chart goes stale, which is the
  exact problem the landing page says StratMap solves. Build "Update from file": re-upload the same CSV/XLSX (or a new export from the HR system), match rows to roles by the
  ID column (then email), and show a diff (joiners, leavers, moves, title changes) to accept before applying, through the same atomic path as R-59. Positions of unchanged roles stay.
  Reuse `importOrg.ts`'s mapping and rules. This is cheaper than an integration and covers every HR system.

### R-78 First HR-system integration
- [ ] After R-77. **Needs D-8** (which system first). Read-only sync on a schedule into a chart, using the R-77 diff engine; secrets in env/Vercel, not the DB, or encrypted.
  Probably an Enterprise or Growth add-on.

### R-79 A way to buy above Growth
- [ ] Growth stops at 10 seats and 500 roles; above it there is only "Talk to sales". **Needs D-10.** Either a self-serve "Scale" tier in `PLAN_LIMITS`/Stripe, or seat/role
  add-ons on Growth. Code is small once decided (plans, pricing page, checkout price ids, `check:env`).

### R-80 Onboarding questions that nothing uses
- [ ] (verified by the UX run) "Your role" and "Company size" are asked and stored but unused. Either use them (e.g. company size picks the starter template and the default zoom;
  send them to analytics only with consent) or drop the step.

---

## Decisions wanted from the owner

| ID | Question | Blocks |
|---|---|---|
| D-6 | ~~VAT~~ Answered 2026-11-25: not a blocker; built and switched off (`PRICE_TAX_MODE`, `STRIPE_AUTOMATIC_TAX`). | — |
| D-7 | May an editor take a JD or headcount plan out of "approved"? Does an editor's content edit of an approved item send it back to review? | R-68 |
| D-8 | Which HR system first (e.g. HiBob, BambooHR, Personio, Rippling)? Which plan gets it? | R-78 |
| D-9 | Is it acceptable that auto-layout and PDF export can be bypassed by a determined Free user? | R-76 |
| D-10 | What does a 50–500 person company buy: a "Scale" tier (price?) or add-ons? | R-79 |
| R-41 | Which chart (or image) should the landing page show? | R-62 |

---

## What the review found solid (do not "fix" these)

- No cross-workspace access: every chart route checks the chart belongs to `auth.workspaceId` before anything else; salary data never reaches non-admins (JDs, headcount,
  replies, snapshots, search, exports).
- Webhook idempotency survives crashes; the plan tier always comes from the Stripe price id; Stripe ids never leave the server.
- Canvas save queue: ordered, stops at the first failure, exact rollback on Reload; client-made ids make retries safe.
- Recount-after-insert for charts, roles, imports and invites; the migration runner (advisory lock, per-migration transaction, schema check).
- Honest copy: no invented testimonials, logos or numbers.

---

## Starting a work session on this roadmap

Paste this as the first message of a new Claude Code session (edit the phase line to move on):

```text
We're working through docs/LAUNCH_ROADMAP.md for StratMap. If that file is missing from your checkout, run
`git fetch origin claude/magical-cannon-a545tb && git merge --no-edit FETCH_HEAD` first.

1. Read CLAUDE.md and docs/LAUNCH_ROADMAP.md in full ("How to use this file" is the working agreement).
2. Run the baseline: npm run typecheck, npm run lint, npm run test:run, npm run test:api, npm run build. Tell me the counts.
3. Work Phase 0, then Phase 1, in the order listed (R-55 → R-61). For each item:
   - Re-read the code it points at. For items marked "reported", reproduce it first, ideally as a failing test; if it does not
     reproduce, say so in the roadmap and move on.
   - Fix it with tests. If it needs an owner decision (D-x) I haven't made, build only the part that doesn't depend on it and ask me.
   - Run all five checks again (plus npm run test:e2e:local with PW_CHROMIUM_PATH=/opt/pw-browsers/chromium if a flow or the canvas changed).
   - Tick the item in docs/LAUNCH_ROADMAP.md with the date and one line on what was done; update CLAUDE.md where behaviour changed.
   - Commit that item on its own (I authorise commits for roadmap items, overriding the "do not commit" note in CLAUDE.md) and push to your session branch.
4. Don't open a pull request unless I ask. If you run out of Phase 1 items, start Phase 3 only after checking with me.
5. Finish with: what shipped, test counts, what's left, and any decisions you need from me.
```
