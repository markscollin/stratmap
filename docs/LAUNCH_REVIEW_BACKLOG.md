# Launch review backlog (2026-11-13)

Work that came out of the full pre-launch review of commit `b959041`. This is the **live backlog**: the root
`BACKLOG.md` is the historical sprint list, and `docs/ROADMAP_TO_PRODUCTION.md` is the original roadmap (its
still-open items are referenced here by number).

## How to use this file

- Pick the lowest-numbered open item in the highest open priority band. Items inside a band are in suggested order.
- Each item has: the problem, the evidence (file and line at `b959041`; **re-check line numbers before editing**),
  a suggested fix, and what "done" means. The fix is a suggestion: if the code suggests something better, do that
  and note it here.
- **Evidence labels.** *Verified* = the reviewer read the code path end to end. *Reported* = found by a review
  agent and not re-read; confirm it reproduces before fixing. *Unproven* = cannot be settled from the repo
  (needs a deployed function or a dashboard).
- When an item ships: tick it, add the date and a one-line note of what was done, and update `CLAUDE.md` if the
  behaviour it documents changed.
- Every code item needs tests. Run `npm run typecheck`, `npm run lint`, `npm run test:run`, `npm run test:api` and
  `npm run build` before pushing (same as CI). Canvas and flow changes also need `npm run test:e2e:local`.
- Baseline at review time: typecheck clean, lint 0 errors (18 warnings), **614 frontend + 638 API tests** passing,
  build OK. The e2e suite was not run during the review.

Sizes: **S** = under half a day, **M** = one to two days, **L** = three days or more.

## Summary

| ID | Item | Band | Size | Who |
|---|---|---|---|---|
| R-01 | Canvas writes fail silently | P0 | M | code |
| R-02 | Undo and redo never reach the server | P0 | M | code |
| R-03 | Reporting lines made this session cannot be deleted | P0 | S | code |
| R-04 | Legal pages are unfilled templates | P0 | S | owner + code |
| R-05 | Stripe webhook body read is unproven on Vercel | P0 | S | owner + code |
| R-06 | A crashed webhook leaves a customer paid but not upgraded | P0 | M | code |
| R-07 | Growth "unlimited AI" has no cost ceiling | P1 | S | code (+ owner decision) |
| R-08 | Editors can approve and publish charts | P1 | S | code |
| R-09 | Owner email is client-supplied and unverified | P1 | S | code |
| R-10 | "Duplicate chart" creates an empty chart | P1 | S | code |
| R-11 | A failed JD load can overwrite the real JD; false "Saved" | P1 | M | code |
| R-12 | Salary band saves on every keystroke | P1 | S | code |
| R-13 | A transient `/api/workspace` failure misroutes the user | P1 | M | code |
| R-14 | Other optimistic writes with no error handling | P1 | M | code |
| R-15 | No 404 route | P1 | S | code |
| R-16 | Dev bypass and unsigned webhooks fail open without `VERCEL_ENV` | P1 | S | code |
| R-17 | Emails and redirects use the per-deployment URL | P1 | S | code + owner |
| R-18 | Landing and pricing copy promise more than Free delivers | P1 | M | code (+ owner decision) |
| R-19 | Double subscription race at checkout | P1 | S | code |
| R-20 | Checkout button fails silently; fake success without Stripe key | P1 | S | code |
| R-21 | Deleting a workspace forfeits the paid period without warning | P1 | S | code (+ owner decision) |
| R-22 | No reconciliation when a billing webhook is lost | P2 | M | code |
| R-23 | CSP is report-only, has no report endpoint, and lists only Clerk dev hosts | P2 | M | code + owner |
| R-24 | Main bundle is one 1.5 MB chunk | P2 | M | code |
| R-25 | Legacy URL-token share links cannot be revoked | P2 | S | code |
| R-26 | Share API returns node fields by deny-list | P2 | S | code |
| R-27 | `rate_limits` table is never pruned | P2 | S | code |
| R-28 | e2e server binds all interfaces and can use the real database | P2 | S | code |
| R-29 | Stripe ids returned by `POST`/`PUT /api/workspace` | P2 | S | code |
| R-30 | Body-supplied reference ids not checked against the workspace | P2 | S | code |
| R-31 | Client-chosen node ids are global primary keys | P2 | M | code |
| R-32 | Accessibility basics | P2 | L | code |
| R-33 | Small billing and limit gaps | P3 | M | code |
| R-34 | Small client gaps | P3 | S | code |
| R-35 | Split `OrgChart.tsx` and centralise persistence | P3 | L | code |
| R-36 | Dependency audit triage | P3 | S | code |
| R-37 | Server-side JD HTML sanitisation (before any new renderer) | P3 | S | code |
| R-38 | Job descriptions are orphaned (not deleted) when a role is deleted | P2 | S | code |
| O-01 to O-09 | Owner and dashboard actions | — | — | owner |

**Suggested order:** R-03 → R-01 → R-02 (one root cause, do together) → R-06 → R-05 → R-04, then the P1 band.
R-35 becomes much smaller if the persistence layer from R-01 is built first.

---

## P0: launch blockers

### R-01 Canvas writes fail silently
- [x] Done 2026-11-13: `canvasSync.ts` queue + `SaveErrorBanner`; failure stops the queue, read-only until Retry/Reload; 402/403/404 show a message and offer Reload only. Rollback is by Reload (exact, since nothing after the failure is sent), not per-change inverses. Tests: `canvasSync.test.ts`, `SaveErrorBanner.test.tsx`, `tests/e2e/canvas-saves.spec.ts`.

**Problem.** Every canvas write is `api.x(...).catch(err => console.error(...))`. When a save fails (offline,
500, 429, 403, 402), the change stays on screen with no message and is gone on reload. Only a 409
`chart-changed` is surfaced (via `ChartConflictBanner`).

**Evidence (verified).** `src/features/canvas/OrgChart.tsx`: drag save `1038-1040`, connect `1058`, add role
`1108-1113`, edit `1127-1138`, delete `1147`, edge delete by key `895`. Reported, same file: auto-layout `1166`.

**Suggested fix.**
1. Build one canvas persistence module (for example `src/features/canvas/canvasSync.ts`) that owns every
   chart-content write. All handlers in `OrgChart.tsx` call it instead of `api` directly.
2. On failure: show an error toast that names the action ("Couldn't save the new role"), and put the canvas in
   a visible "unsaved changes" state with **Retry** and **Reload**. The simplest safe behaviour is the one
   already used for conflicts: stop sending further writes, go read-only, offer Reload. Rolling back the single
   change is better UX but optional for launch.
3. Treat 402 (`plan-limit`, `plan-frozen`, `plan-feature`) and 403 specially: show the server's `message`, and
   roll the local change back, since a retry will never succeed.
4. Keep using the per-chart write queue in `src/lib/chartRevision.ts`; do not bypass it.

**Done when.** With the API forced to fail, each of add, edit, delete, connect, disconnect, drag and auto-layout
shows a visible error and the user cannot keep editing a chart that is not being saved. Unit tests cover the
sync module; one e2e test (`tests/e2e/`) blocks the route with `page.route` and asserts the message.

### R-02 Undo and redo never reach the server
- [x] Done 2026-11-13. **D-1 decided by the owner: soft-delete window.** Built as a *trash table*, not a `deleted_at` flag (the backlog's option (a) would have meant a "not deleted" filter in about 15 queries): `DELETE /nodes/:id` first copies the role, its comments and its lines into `deleted_nodes` (migration 0012, 3-day window, `TRASH_DAYS`), then `POST /nodes/:id/restore` puts them back; undo/redo diff the canvas (`canvasDiff.ts`) and send the difference through the R-01 queue (`saveHistoryStep`). Expired copies are erased by the daily purge job and whenever a role in that chart is deleted. Also fixed on the way: deleting a role left its reporting lines dangling on the server; Cmd/Ctrl+Shift+Z never matched (`e.key` is `Z`); the keyboard-shortcut effect missed `readOnly` in its dependencies, so after a hard reload Cmd+Z and Delete were dead until something else re-registered the handler. Tests: `api/__tests__/node-trash.test.ts`, `canvasDiff.test.ts`, `canvasSync.test.ts`, e2e delete/add/edit → undo → reload (+ redo, + failed undo).

**Problem.** `undo` and `redo` only call `setNodes`/`setEdges`. Deleting a role and pressing Cmd+Z brings it
back on screen, but the server has already deleted it, with its job description and comments (they cascade).
Later edits to that role return 404 silently. Undoing an add leaves the role on the server.

**Evidence (verified).** `src/features/canvas/useCanvasState.ts:56-74`; wired at `OrgChart.tsx:890-891`.

**Suggested fix.** After an undo or redo, diff the state before and after and send the difference through the
R-01 sync module: roles added back → `POST nodes` (same id), roles removed → `DELETE`, changed fields → `PUT`,
moved → bulk positions, edges added/removed → `POST`/`DELETE` (needs R-03 first). Decide and document one rule
for the unrecoverable part: **undoing a delete cannot bring back the JD or comments.** Options, in order of
preference: (a) make role delete a soft delete on the server for a short window so undo restores everything;
(b) keep hard delete, and warn in the delete confirm that the JD and comments go for good and undo restores
the role only. Owner should choose; (b) is the smaller change.

**Done when.** Delete → undo → reload shows the role. Add → undo → reload does not. Edit → undo → reload shows
the old value. An e2e test covers all three.

### R-03 Reporting lines made this session cannot be deleted
- [x] Done 2026-11-13: client `crypto.randomUUID()` ids saved as given (`EdgeCreate.id`); same-id retry returns 200, other-chart id 409 `id-taken`. Role ids switched from `n-<timestamp>` to UUIDs too (part of R-31). Tests: `api/__tests__/edges.test.ts`, `nodes.test.ts`, e2e re-parent.

**Problem.** The client invents the edge id (`e-<source>-<target>-<timestamp>`); the server ignores it and
stores its own UUID; the client throws the response away. Any later delete of that line (Delete key, or changing
"Reports to" in the role modal) sends the local id, which matches nothing. After a reload the role reports to
both the old and the new manager.

**Evidence (verified).** Client id: `src/features/canvas/useCanvasState.ts:129`. Server id:
`api/charts/[id]/edges.ts:44` (`crypto.randomUUID()`). Delete by id only: `api/charts/[id]/edges/[edgeId].ts:29`.
Discarded responses: `OrgChart.tsx:1058`, `1110`, `1136`.

**Suggested fix.** Smallest correct change: let the client supply the id. Add an optional `id` to `EdgeCreate`
in `api/_lib/schemas.ts` (same safe charset as node ids, bounded length), use it in the insert when present,
and generate ids on the client with `crypto.randomUUID()`. Send the same id in all three POST call sites. The
insert must stay scoped so an id that already exists in another chart is a clean 409, not a 500. (Alternative:
replace the local id with the one in the response; this is racier because a delete can be issued before the
POST returns.)

**Done when.** `api/__tests__` covers create-with-id and the collision case; an e2e test adds a role under A,
re-parents it to B, reloads, and finds exactly one incoming line.

### R-04 Legal pages are unfilled templates
- [ ] Code done 2026-11-13; **blocked on the owner's facts**. The owner fills in `src/lib/legalDetails.ts` (company name, address, privacy and legal emails, governing law, refund policy, last-updated date). While any field is empty the pages keep their `[placeholders]` and the "Template notice" banner; when all are filled both disappear by themselves. `npm run check:legal` fails until then (add it to CI once filled). Also done: the sub-processor list now names all eight (Clerk, Neon, Vercel, Stripe, Resend, Anthropic, Sentry, PostHog) with what each receives, and a test checks it against `package.json`; the 3-day copy of a deleted role is in the retention text; governing-law and refund wording added to the Terms; `lastUpdated` bumped. Still needed: a lawyer's review (O-05). Tests: `src/pages/__tests__/LegalPages.test.tsx`, `LegalLaunchGate.test.tsx`.

**Problem.** `/privacy` and `/terms` show a "Template notice … not legal advice" banner and bracketed
placeholders. Anyone about to pay sees this.

**Evidence (verified).** `src/pages/LegalPages.tsx`: banner `25`; `[Company Legal Name]` `59`, `130`, `165`;
`[privacy@yourdomain]` `104`, `120`; `[legal@yourdomain]` `176`. Reported: `LAST_UPDATED` (`:4`) is stale; the
sub-processor list (`:82-84`) omits PostHog and Sentry although PostHog is named at `:114`; no governing law,
company address or refund terms.

**Needs from the owner.** Legal entity name and address, contact addresses, governing law, refund policy, and a
lawyer's review of the final text (O-05).

**Code part.** Replace placeholders, remove the banner, list every sub-processor actually used (Clerk, Neon,
Vercel, Stripe, Resend, Anthropic, Sentry, PostHog), bump `LAST_UPDATED`. Add a test in
`src/pages/__tests__/` that fails if the rendered pages contain `[` … `]` placeholders or "Template notice".

### R-05 Stripe webhook body read is unproven on Vercel
- [ ] Code done 2026-11-13, **deployed check still owed (owner, 5 minutes: `docs/BILLING.md` "Release check for the webhook body")**. The suggested `config = { helpers: false }` was NOT used: `config` in `@vercel/node` is the *builder* config (vercel.json), not an in-file export, so that line would have done nothing. Instead: `api/_lib/rawBody.ts` reads the body through `req.on('data'|'end')` (the only way `@vercel/node`'s helper replays it; a `for await` loop gets nothing), with a 2 s guard against a hang; the Next.js `bodyParser` export was removed; tests run the real handler with a real Stripe signature behind an emulation of the helper (`api/__tests__/stripe-raw-body.test.ts`). Still unproven: that Vercel's production runtime replays the body like the dev helper.

**Problem.** `export const config = { api: { bodyParser: false } }` is Next.js syntax. `@vercel/node` only
honours `helpers: false` (or `NODEJS_HELPERS=0`). Its dev server reads the whole body before the handler runs,
which is why the handler has a dev-only fallback. If production also drains the stream, every webhook returns
400 "Could not read raw body": it fails closed, but nobody is upgraded after paying.

**Evidence.** `api/webhooks/stripe.ts:13`, `15-21`, `40-60` (verified). Runtime switch:
`node_modules/@vercel/node/dist/index.js:99895`; dev server drain: `dist/dev-server.mjs:1081-1088` (verified).
Production behaviour: **unproven**.

**Steps.**
1. Owner or session with Vercel access: deploy to a preview with Stripe **test-mode** keys and
   `STRIPE_WEBHOOK_SECRET`, send a test event (`stripe trigger checkout.session.completed` to the deployed
   URL), and read the function log. Record the result here.
2. If it fails, or to be safe either way: read the raw body in a way that does not depend on the helper
   (try `config = { helpers: false }` on this route; the handler then cannot use `res.json`/`res.status`
   helpers, so switch it to plain `res.statusCode`/`res.end`).
3. Add the check to `docs/BILLING.md` as a release step for any change to this file.

**Done when.** A signed test event against a deployed function returns 200 and upgrades a test workspace.

### R-06 A crashed webhook leaves a customer paid but not upgraded
- [x] Done 2026-11-13: `stripe_events.processed_at` + `emails_sent_at` (migration 0013, backfills old rows); a stale (over 60 s) unprocessed claim is taken over, a fresh one answers 409, a handler error releases at once; `syncSubscription` links a workspace from subscription metadata when no workspace is linked (checkout already set it, so no checkout change was needed); `BillingSuccessPage` no longer claims success when polling runs out. Not done: a support address (set `VITE_SUPPORT_EMAIL`; none exists in the repo). Tests: `api/__tests__/stripe-webhook.test.ts`, `src/pages/__tests__/BillingSuccessPage.test.tsx`. R-22 (reconciliation of a lost *later* event) is still open.

**Problem.** The event id is inserted into `stripe_events` before processing and removed only in `catch`. If
the function times out or is killed mid-handler, the row stays, and every Stripe retry is answered
`duplicate: true`. `checkout.session.completed` is the only event that links a workspace to its subscription,
so nothing later repairs it. The same stuck claim on `customer.subscription.deleted` leaves a workspace on a
paid plan for free.

**Evidence.** `api/webhooks/stripe.ts:66-82` (verified). Link-on-checkout-only and the success page that says
"Your upgrade is complete" after polling fails: `api/_lib/billing.ts:106`,
`src/pages/BillingSuccessPage.tsx:28-36,58-62` (reported).

**Suggested fix.**
1. Give `stripe_events` a state: add `processed_at timestamp` (nullable; additive migration). Claim = insert
   with `processed_at` null. Success = set it. A delivery that finds a row with `processed_at` null **older than
   about 60 seconds** takes the claim over and processes again (handlers already re-read Stripe, so repeating
   is safe; the payment-failed email needs its own "sent" guard so it is not sent twice).
2. Make later events able to self-heal: put `workspaceId` in the **subscription** metadata at checkout
   (`subscription_data.metadata`), and let `syncSubscription` find the workspace from it when no workspace is
   linked yet. The tier must still come from the price id, never metadata.
3. `BillingSuccessPage`: when polling runs out, say "Payment received, your plan will update shortly" and give
   a support contact, instead of claiming the upgrade is complete.

**Done when.** `api/__tests__` has: stale unprocessed claim is retried; fresh claim is still deduplicated;
`invoice.paid` alone (no checkout event) links and upgrades the workspace. See also R-22.

---

## P1: fix before launch

### R-07 Growth "unlimited AI" has no cost ceiling
- [ ] Open

**Problem.** The free-text `notes` field (up to 2,000 characters) goes straight into the prompt, so it can be
used as a general-purpose model. Growth and Enterprise have no monthly limit; the only cap is 10 requests a
minute per workspace, about 432,000 calls a month. One £49 customer, or a comped trial, could cost thousands.

**Evidence (verified).** `api/ai/draft.ts:22-25`, `70`, `74-87`; `MAX_TOKENS = 1024`. Limits in `src/lib/plans.ts`.

**Suggested fix.** Replace "unlimited" with a high fair-use number (**owner decision**; suggestion: Growth 300
a month, Enterprise 1,000) in `plans.ts`, which the existing atomic claim then enforces. Add a per-user burst
limit alongside the workspace one. Update pricing copy to "300 AI drafts a month" or "fair use applies".
Optional: tighten the prompt so `notes` is clearly delimited as context.

**Done when.** `api/__tests__/ai-draft.test.ts` proves a Growth workspace is stopped at its cap with
`402 plan-limit`.

### R-08 Editors can approve and publish charts
- [x] Done 2026-11-13: `src/lib/chartStatus.ts` (`statusChangeNeedsAdmin`): entering approved/rejected/live, and leaving approved/live, needs admin; applied to `PUT /api/charts/:id` and `POST /api/charts`. **Did not** copy the backlog's "mirror the UI's transition graph on the server": the bug is the editor escalation, a strict graph only adds breakage risk (admins and scripts legitimately jump states). A test ties the server rule to the UI's `STATUS_ACTIONS` so they cannot drift. Tests: `security.test.ts` (new role-matrix rows + a describe), `src/lib/__tests__/chartStatus.test.ts`.

**Problem.** `PUT /api/charts/:id` needs only `editor` and accepts any `status`, including `approved` and
`live`. The UI and `CLAUDE.md` say approvals are admin-only. JD and headcount approvals are gated correctly.

**Evidence (verified).** `api/charts/[id].ts:44-70`. Reported: same on create, `api/charts/index.ts:36-42`; UI
rule in `src/constants/statusMeta.tsx:25-30`.

**Suggested fix.** Require `admin` when the new status is `approved`, `rejected` or `live` (and for leaving
`live`); editors keep `draft`, `review` and `archived`. Mirror the UI's allowed transitions on the server
rather than accepting any jump. Apply the same rule to `POST /api/charts`.

**Done when.** `api/__tests__/security.test.ts` has editor → `live` = 403 and admin → `live` = 200.

### R-09 Owner email is client-supplied and unverified
- [x] Done 2026-11-13: `POST /api/workspace` takes email and name from `getUserIdentity()` (503 `identity-unavailable` if the provider cannot be asked; the body fields are gone from the schema). `deleteAccount` removes invites and log entries only for the person's **verified** addresses, asked first so an outage changes nothing. Tests in `workspace.test.ts`, `data-rights.test.ts`. **Still owed (owner/ops):** existing `workspace_members.email` rows were written from the browser; check them against Clerk before launch (`select user_id, email from workspace_members`), they still receive workspace-deleted and comment emails.

**Problem.** `POST /api/workspace` stores `body.email` as given. `deleteAccount` then deletes every pending
invite for that email **in every workspace** and strips it from every audit log. A throwaway account can cancel
anyone's invites. The address also receives workspace-deleted and comment emails, so it is a small mail relay.

**Evidence (verified).** `api/workspace.ts:85-86`; `api/_lib/schemas.ts:168`;
`api/_lib/workspaceLifecycle.ts:119`, `135-141`.

**Suggested fix.** Take email and name from `getUserIdentity()` (`api/_lib/identity.ts`), as invite accept does,
and ignore the body fields (keep them in the schema only for the dev bypass, where identity is synthetic). In
`deleteAccount`, use the verified identity email instead of member rows. Consider a one-off check of existing
`workspace_members.email` values against Clerk before launch (few rows today).

**Done when.** A test shows a body email that differs from the identity is ignored, and that deleting an
account cannot remove invites addressed to a different email.

### R-10 "Duplicate chart" creates an empty chart
- [x] Done 2026-11-13: new `POST /api/charts/:id/duplicate` (editor, chart and role limits, free on every plan) built on `captureChart` + `branchSnapshot`; the copy is a private draft with fresh ids, no JDs/comments/share links; `duplicateChart` in `chartStore` calls it and shows the plan-limit message. Tests: `api/__tests__/duplicate.test.ts` (5 roles → 5 roles and 4 lines), `src/store/__tests__/chartStore.test.ts`, `tests/e2e/small-fixes.spec.ts`.

**Problem.** The chart list stores `nodes: []`, `edges: []`, `departments: []` for every chart, and
`duplicateChart` copies those. The result is an empty "X (copy)", which on Free uses the only chart slot.

**Evidence (verified).** `src/store/chartStore.ts:40-57`, `141-151`. Call site reported at
`src/pages/ChartView.tsx:183`.

**Suggested fix.** Fetch the full chart (`GET /api/charts/:id`) before copying, with fresh ids for roles, lines
and departments. Better: a server route `POST /api/charts/:id/duplicate` reusing the branch logic in
`api/_lib/snapshots.ts`, which already handles fresh ids and limits. Show the plan-limit message if refused.

**Done when.** A test duplicates a 5-role chart and the copy has 5 roles and 4 lines.

### R-11 A failed JD load can overwrite the real JD; false "Saved"
- [ ] Open

**Problem (reported; confirm first).** `initJD` falls back to a blank JD on any error, so a failed load shows
an empty editor; typing then autosaves over the stored text. `updateJD` failures are swallowed, yet the editor
shows "Saved" before the request is sent. There is no flush on unmount or tab close, so text typed in the last
second is lost.

**Evidence.** `src/store/jobDescriptionStore.ts:67-70`, `80-82`; `src/features/jd/JDEditor.tsx:35-40`.

**Suggested fix.** Distinguish "not found" (404 → blank default is correct) from "failed" (show an error with
Retry and keep the editor disabled). Make the status honest: "Saving…" → "Saved" on success → "Couldn't save"
with retry on failure. Flush the pending save on unmount, on role switch and on `visibilitychange`/`pagehide`
(use `fetch` with `keepalive`).

**Done when.** Tests cover: failed load never issues a PUT; failed save shows the error state; unmount within
the debounce window still sends the save.

### R-12 Salary band saves on every keystroke
- [ ] Open

**Problem (reported).** Typing "120000" sends six PUTs that can land out of order, each adding a
`salary.updated` audit row. Clearing the field sends `undefined`, which JSON drops, so it never clears.

**Evidence.** `src/features/panel/JDPanel.tsx:559`, `569`.

**Suggested fix.** Save on blur or Enter (or debounce and serialise). Send `null` to clear and accept `null` in
the server schema. Validate min ≤ max in the UI before sending.

### R-13 A transient `/api/workspace` failure misroutes the user
- [ ] Open

**Problem (reported).** Any error other than `no-workspace` is treated as "resolved". A new browser is sent to
onboarding and asked to create a workspace; the POST returns the existing one, the typed name is discarded, and
`OnboardingPage` sets `permission: 'owner'` locally even for an invited viewer. A returning browser gets stale
state with permission stuck at `viewer`.

**Also seen (2026-11-13).** After a hard reload the canvas is view-only until `/api/workspace` answers (permission starts as `viewer`, and the plan as Free, which can read as "over the chart limit" for a moment). The Cmd+Z/Delete handler used to keep that stale state; that is fixed, the underlying load-state design is not.

**Evidence.** `src/features/auth/AuthProvider.tsx:98-101`, `127-131`, `176-178`; `src/pages/OnboardingPage.tsx:88`;
`api/workspace.ts:57-71`.

**Suggested fix.** Three explicit outcomes: loaded, no workspace, **failed**. On failed, show a full-page
"Couldn't load your workspace" with Retry (retry automatically once or twice first); never redirect to
onboarding. In onboarding, take the permission from the server response, not a constant.

### R-14 Other optimistic writes with no error handling
- [ ] Open

**Problem (reported).** Same pattern as R-01 outside the canvas:
- chart delete and status change, no rollback: `src/store/chartStore.ts:109-116`, `127-129`
- templates: `src/store/templateStore.ts:66-68`, `80-82`, `91-93`
- workspace rename: `src/pages/SettingsView.tsx:108-109`
- headcount create result ignored: `src/pages/HeadcountView.tsx:699`
- onboarding invites logged only, while the store lists them as pending: `src/pages/OnboardingPage.tsx:94-95`
- share toggle flips `isPublic` first and has no `catch`: `src/features/canvas/OrgChart.tsx:317-329`,
  `chartStore.ts:132-138`
- a failed chart list shows "No charts yet" or zero KPIs instead of an error: `chartStore.ts:59-60`,
  `src/pages/ChartView.tsx:494-500`

**Suggested fix.** Copy what `src/store/headcountStore.ts:106-121` already does (refetch to roll back) and add
an error toast. Add an `error` field to `chartStore` and an error state with Retry to the Charts page and
Dashboard, so "failed to load" never looks like "empty".

### R-15 No 404 route
- [x] Done 2026-11-13: `NotFoundPage` on `path="*"`; `src/lib/routes.ts` (`KNOWN_ROUTES`, `isKnownPath`, `pageAccess`) now decides how `AuthProvider` treats a URL and treats an unknown URL as open, so a signed-out visitor sees the 404 instead of being bounced to sign-in. A test fails if `App.tsx` and `KNOWN_ROUTES` drift. Tests: `routes.test.ts`, `NotFoundPage.test.tsx`, e2e.

**Problem (reported).** `src/App.tsx:27-57` has no `path="*"`; an unknown URL renders a blank page.
**Fix.** Add a NotFound page (link to Dashboard when signed in, to `/` otherwise) and add the path to
`AuthProvider`'s public handling so it does not bounce to sign-in. Test in `src/pages/__tests__/`.

### R-16 Dev bypass and unsigned webhooks fail open without `VERCEL_ENV`
- [ ] Open

**Problem.** The `x-dev-user` bypass is honoured whenever `VERCEL_ENV` is neither `production` nor `preview`,
including unset. The Stripe webhook accepts unsigned bodies on the same condition. Safe on Vercel today; open
on any other host, or if system env vars stop reaching the runtime.

**Evidence.** `api/_lib/auth.ts:23-26`, `77-78`, `109-115` (reported); `api/webhooks/stripe.ts:49-57` (verified).

**Suggested fix.** Positive opt-in: require `ALLOW_DEV_BYPASS=1` **and** a non-deployed env. Set it in
`.env.local` guidance, `scripts/e2e-server.mjs`, `scripts/e2e-local.mjs` and the test setup. Use the same flag
for the unsigned-webhook fallback. Update `CLAUDE.md` (the dev-bypass notes) and `README.md`.

**Done when.** Tests: bypass refused when the flag is absent even with `VERCEL_ENV` unset; the e2e suite still
passes.

### R-17 Emails and redirects use the per-deployment URL
- [ ] Open

**Problem.** `getAppUrl()` falls back from `APP_URL` to `VERCEL_URL`, the unique deployment hostname. Invite
and comment emails, the checkout success URL and the billing portal return URL then point at
`stratmap-<hash>.vercel.app` (stale code, and no session once Clerk production is tied to the real domain).
`src/lib/seo.ts` already prefers `VERCEL_PROJECT_PRODUCTION_URL`. Also `DEFAULT_SITE_URL` is the old
`stratmap-seven.vercel.app` (`src/lib/seo.ts:12`).

**Evidence (reported).** `api/_lib/url.ts:6-9`; `src/lib/seo.ts:12`, `69`.

**Fix.** Same order in both: `APP_URL` → `VERCEL_PROJECT_PRODUCTION_URL` → `VERCEL_URL`. On production with no
`APP_URL`, log a loud warning. Owner sets `APP_URL` (O-03).

### R-18 Landing and pricing copy promise more than Free delivers
- [ ] Open

**Problem (reported).** `src/pages/LandingPage.tsx`: "The collaborative org chart…" (`:38`) and "stay in sync
as your company changes" (`:11`), but there is no real-time editing or HRIS sync. The JD workflow with AI
(`:16`, Starter) and headcount forecasting (`:21`, Growth) are not marked as paid. No screenshot or demo.
`PricingPage.tsx`: the FAQ calls Free "effectively a trial" although Free locks JDs, AI, auto-layout, PDF and
headcount; `mailto:sales@stratmap.app` (`:276`) depends on a domain not yet bought; the Enterprise box promises
"dedicated support, and compliance needs" (`:271`); the Growth card omits version history, which exists.

**Suggested fix.**
- Copy: say what it does today (share, comment, invite, conflict-safe editing); mark paid features with the
  plan badge; add version history and scenarios to the Growth card.
- Add a real product screenshot or a live read-only demo chart above the fold (an `/embed/` of a sample chart
  is nearly free to build).
- **Owner decision:** the first-run experience hits three locks in the first minute. Options: a 14-day full
  trial for new workspaces (the trial override already exists: `trial_plan`, `trial_ends_at`), or let Free
  create a small number of JDs. Decide, then update `plans.ts` and the FAQ to match.

### R-19 Double subscription race at checkout
- [ ] Open

**Problem (reported).** The guard only looks for an already-linked subscription. Two admins (or two tabs) can
both complete Checkout; the second link overwrites the first, which keeps billing and is then ignored.
**Evidence.** `api/checkout.ts:47-49`; `api/_lib/billing.ts:125-135`.
**Fix.** Create or reuse one Stripe customer per workspace before Checkout and pass `customer`, so both sessions
belong to the same customer; in `syncSubscription`, when a workspace already has a different active
subscription, cancel the newer duplicate (with refund) and report it to Sentry. Add a test.

### R-20 Checkout button fails silently; fake success without Stripe key
- [ ] Open

**Problem (reported).** `src/features/billing/CheckoutButton.tsx:18-21`: a 403 (editor clicks Upgrade), 400
(missing price env) or 500 just re-enables the button. `api/checkout.ts:29-31`: with `STRIPE_SECRET_KEY` unset
it returns `/billing/success`, so production without the key would show "Welcome to Starter!".
**Fix.** Show the error (for 403: "Ask a workspace admin to upgrade"). Hide or disable Upgrade for non-admins.
Make the demo success path dev-only (same rule as R-16); on a deployed env return 503 and report it.

### R-21 Deleting a workspace forfeits the paid period without warning
- [ ] Open

**Problem (reported).** Delete cancels the subscription immediately with no refund, and restore brings the
workspace back on Free. An annual customer who deletes by mistake loses the rest of the year.
**Evidence.** `api/_lib/workspaceLifecycle.ts:23-27`, `58`, `93`. Whether the dialog warns was not checked.
**Fix.** At minimum, say so in the delete dialog (`DataRightsSection`) when the workspace has a paid plan.
**Owner decision:** prorated refund on delete, or cancel at period end and keep the plan through the restore
window. Document the choice in `docs/BILLING.md` and the Terms.

---

## P2: fix soon after launch

### R-22 No reconciliation when a billing webhook is lost
- [ ] Open

**Problem (reported).** The safety net in `resolvePlanTier` covers only `cancelAtPeriodEnd`
(`api/_lib/billing.ts:175-181`). A `past_due` subscription that Stripe later cancels, with the event lost,
stays paid for ever. Refunds and disputes are not handled at all.
**Fix.** A daily cron (`api/cron/`, same `CRON_SECRET` pattern as the purge) that runs `syncSubscription` for
every workspace with a subscription id whose status is not terminal, in small batches. Handle
`charge.refunded` and `charge.dispute.created` at least by reporting to Sentry and emailing the owner address.

### R-23 CSP is report-only, has no report endpoint, and lists only Clerk dev hosts
- [ ] Open

**Problem (reported).** `vercel.json:46-47`, `71-72`: no `report-uri`/`report-to`, so the policy neither blocks
nor reports. It allows only `*.clerk.accounts.dev`; production Clerk runs on `clerk.<your-domain>`. API tokens
come from `window.Clerk.session.getToken()` (`src/lib/apiClient.ts:23`), so any future XSS can act as the user.
**Fix.** After O-01 and O-03: add the production Clerk host, add a report endpoint (Sentry's CSP endpoint
works), run report-only for a week, then enforce. Extend `src/lib/__tests__/vercelRewrites.test.ts`.

### R-24 Main bundle is one 1.5 MB chunk
- [ ] Open

**Problem (verified from the build).** `dist/assets/index-*.js` is 1,525 kB (463 kB gzipped); the landing,
share and embed pages download the whole app, including TipTap.
**Fix.** `React.lazy` per route in `src/App.tsx` (marketing pages, share/embed, and the app shell as separate
chunks); lazy-load TipTap with the JD panel and the export libraries on first use. Target: landing and share
under 150 kB gzipped of JS. Record before and after here.

### R-25 Legacy URL-token share links cannot be revoked
- [ ] Open

**Problem (reported).** `src/pages/SharePage.tsx:27-46` decodes any token longer than 20 characters in the
browser (`src/utils/shareLink.ts:69`). Old links survive `isPublic: false`, and anyone can craft
`/share/<blob>` that shows an arbitrary chart on the StratMap domain.
**Fix.** Remove the decoder and `shareLink.ts`; show "This link is no longer supported". Nothing generates
these links any more. Update `SharePage.test.tsx` and the share-link note in `CLAUDE.md`.

### R-26 Share API returns node fields by deny-list
- [ ] Open

**Problem (reported).** `api/share/[code].ts:61` returns every node column except `chartId` (today including
`managerId`, `location`, `startDate`, `avatarUrl`). A future column such as email or notes would be published
automatically. Also `:29-31` answers 410 for an expired link before the `isPublic` check, which reveals that
the code existed.
**Fix.** Select an explicit allow-list of the fields the canvas renders (**owner decision:** should `location`
and `startDate` be public?). Make expired, private and unknown all return the same response. Add a test that
fails when a new `nodes` column appears in the share response without being added to the list.

### R-27 `rate_limits` table is never pruned
- [ ] Open

**Problem (reported).** `api/_lib/rateLimit.ts:26-37`: rows keyed by IP are written on every anonymous share,
invite-preview and admin hit and never deleted. The limiter also fails open (`:66-69`), which is acceptable but
should be reported.
**Fix.** Delete expired windows in the daily cron (R-22), and report limiter failures to Sentry (sampled).

### R-28 e2e server binds all interfaces and can use the real database
- [ ] Open

**Problem (reported).** `scripts/e2e-server.mjs:98` listens on every interface; `:16-19` loads `.env.local`
and falls back to `DATABASE_URL`; `:28-29` removes `CLERK_SECRET_KEY` and `VERCEL_ENV`. Plain
`npm run test:e2e` on a machine whose `.env.local` points at production exposes an auth-less owner API to the
network and runs the test teardown against that database.
**Fix.** Bind `127.0.0.1`. Refuse to start with `DATABASE_URL` unless `E2E_DATABASE_URL` is set explicitly or
the emulator is in use. Make `npm run test:e2e` an alias of `test:e2e:local`.

### R-29 Stripe ids returned by `POST`/`PUT /api/workspace`
- [ ] Open

**Problem (verified for POST).** When the caller already has a workspace, POST returns the full row
(`api/workspace.ts:65-71`), including `stripeCustomerId` and `stripeSubscriptionId`; any member can call it.
PUT does the same for admins (`:104-110`, reported). GET strips them.
**Fix.** One `publicWorkspace(row)` serializer used by all three methods; a test asserts no key starting with
`stripe` in any response from this route.

### R-30 Body-supplied reference ids not checked against the workspace
- [ ] Open

**Problem (reported; low risk, ids are unguessable UUIDs).** Headcount `departmentId`/`chartId`
(`api/headcount.ts:65,68`, `api/headcount/[id].ts:45,48`), and the list joins `workspace_departments` by id
only (`headcount.ts:42`). Same pattern: node `departmentId`/`managerId` (`api/charts/[id]/nodes.ts:47-50`,
`nodes/[nodeId].ts:35-38`), `templateDepts.workspaceDepartmentId` (`api/charts/index.ts:101`), and the JD
`nodeId`, which is not checked to exist in the chart (`api/charts/[id]/jd/[nodeId].ts:120-133`).
**Fix.** A small helper in `api/_lib/access.ts` that confirms an id belongs to the workspace (or chart) and
returns 400 otherwise; add the workspace condition to the headcount join.

### R-31 Client-chosen node ids are global primary keys
- [ ] Open

**Problem (reported).** Node ids are `n-${Date.now()}` (`src/features/canvas/useCanvasState.ts:88`) and are the
table's primary key across all workspaces (`api/charts/[id]/nodes.ts:47-50`). Two people adding a role in the
same millisecond anywhere collide (a silent 500 today, see R-01). Share pages disclose ids, so a deleted role's
id can be squatted, which makes a later snapshot restore skip that role (`api/_lib/snapshots.ts:88-97`).
**Fix.** Short term: generate ids with `crypto.randomUUID()` on the client and return a clean 409 on collision.
Longer term: composite uniqueness on `(chart_id, id)`; this needs an expand/contract migration and a look at
every foreign key to `nodes.id`, so plan it separately.

### R-32 Accessibility basics
- [ ] Open

**Problem (reported).** `NodeModal`, `JDPanel`, `UpgradeModal` and `Spotlight` have no `role="dialog"`,
`aria-modal` or focus trap. `NodeCard` has no `tabIndex` or key handler, so the canvas is mouse-only. Several
toolbar buttons in `OrgChart.tsx` have no accessible name. `--dim` text fails contrast (about 2.5:1 on the dark
background, about 2.6:1 in light mode) and is used at 10 to 11px.
**Fix, in order.** (1) One shared `Dialog` component with focus trap, Escape and focus restore; move the four
onto it. (2) Accessible names on every icon button (a test can scan for unnamed buttons). (3) Raise `--dim` to
at least 4.5:1 in both themes in `src/styles/globals.css`. (4) Keyboard on the canvas: Tab between roles, Enter
to open, arrow keys along reporting lines. Items 1 to 3 are the launch-relevant part; 4 can follow.

---

## P3: later and housekeeping

### R-38 Job descriptions are orphaned when a role is deleted
- [ ] Open

**Problem (found 2026-11-13 while building R-02).** `job_descriptions.node_id` has no foreign key (`schema.ts`), so deleting a role leaves its JD row behind, salary band included, forever. Nothing shows it, but it is personal/compensation data that outlives the role, it is still in any query that selects by chart, and a later role that reuses the id (undo does) silently re-attaches it.

**Suggested fix.** On `DELETE /nodes/:id`, put the JD in the `deleted_nodes` copy and delete it in the same atomic batch; `restore` re-inserts it. Add a one-off migration/cleanup that deletes JD rows whose node no longer exists. Mention the 3-day copy in the privacy text (R-04): deleted roles, their comments and JD are kept for 3 days so Undo works.

**Done when.** Delete → no `job_descriptions` row for that role; undo brings the JD back; a test proves a purge leaves none.

### R-33 Small billing and limit gaps
- [ ] Open (all reported)
- An active trial wins even when it is **lower** than the paid tier (`api/_lib/billing.ts:176`): take the higher.
- The role limit is count-then-insert, so parallel POSTs can exceed it (`api/charts/[id]/nodes.ts:36-42`).
- The sample chart is capped at 20 roles only at creation and can then grow to the plan limit
  (`api/charts/index.ts:53-63`): enforce `MAX_SAMPLE_NODES` on node create and import for sample charts.
- `pdf-export` and `auto-layout` are client-only gates. Accepted for now (no server route exists); note it.
- Seat cap on accept, chart count, one-sample and one-owned-workspace are check-then-insert; there is no unique
  index on `workspace_members(workspace_id, user_id)`. Add the unique index (check for duplicates first).
- Pending invites created by an admin who is later removed stay valid for 7 days: revoke on removal, or accept
  and document.
- Invite emails carry the workspace name to arbitrary addresses (`api/_lib/email.ts:62`,
  `api/workspace/invites.ts:45`): a phishing-text vector from the sending domain. Consider a lower hourly cap
  for Free workspaces and a neutral subject line.
- `sendBillingReceipt` interpolates unescaped values (`api/_lib/email.ts:85-93`); unwired today. Escape it or
  delete it.

### R-34 Small client gaps
- [ ] Open (all reported)
- Theme choice is not persisted (`src/store/uiStore.ts:18`, `27-35`).
- Sign-out leaves `stratmap_plan`, `stratmap_usage` and `stratmap_workspace_id` in localStorage
  (`src/store/userStore.ts:50-53`, `src/store/billingStore.ts:56-73`): clear them in `useSignOut`.
- Onboarding buttons have no busy guard (`src/pages/OnboardingPage.tsx:66`): a double click creates twice.
- A production build without `VITE_CLERK_PUBLISHABLE_KEY` runs as a mock owner in the browser
  (`src/features/auth/useAuth.ts:5`); the server refuses it, but the build should fail instead. Add a check in
  `vite.config.ts` for production builds on Vercel.
- 18 lint warnings, mostly suppressed or missing effect dependencies: review each (`OrgChart.tsx:830`, `880`,
  `1141` are suppressed with `eslint-disable`).
- `CLAUDE.md` test counts and the "Common Commands" table are stale (it says 935, 700 and 143 in different
  places; the real figure is 614 + 638).

### R-35 Split `OrgChart.tsx` and centralise persistence
- [ ] Open

`src/features/canvas/OrgChart.tsx` is 1,483 lines holding the toolbar, share panel, pointer handling and all
persistence. After R-01 moves persistence out, split the rest: toolbar, share settings, keyboard shortcuts and
pointer/gesture handling into their own files. No behaviour change; the existing tests and e2e are the guard.

### R-36 Dependency audit triage
- [ ] Open

`npm audit --omit=dev` reported 62 advisories (1 critical in `tar`, 17 high). The ones inspected sit under
`@vercel/node`'s build tooling, not in code that serves requests, but the list was **not fully triaged**. Run
`npm audit fix` (no `--force`), re-run all checks, and list anything left that is reachable at runtime.
Consider moving `@vercel/node` to `devDependencies` if only its types are used. Add Dependabot or Renovate.

### R-37 Server-side JD HTML sanitisation (before any new renderer)
- [ ] Open

JD and template HTML is stored unsanitised (`api/_lib/schemas.ts:23`). It is safe today only because the single
renderer is TipTap, whose schema drops scripts and event handlers (`src/features/jd/JDEditor.tsx:22-29`).
**Before** rendering JD content anywhere else (email, PDF, share page, export), sanitise on write with an
allow-list matching the TipTap schema. Add a test with `<img onerror>` and `<script>` payloads.

---

## Owner and dashboard actions (not code)

- [ ] **O-01 Clerk production instance** (roadmap 3.5): `pk_live_` keys in Vercel, Google OAuth enabled, then
  run sign-up → onboarding → invite end to end. Unblocks R-23.
- [ ] **O-02 Vercel Pro** (roadmap Phase 1 #4): Hobby does not allow commercial use.
- [ ] **O-03 Custom domain and `APP_URL`** (roadmap 3.6): buy the domain, add it in Vercel, set `APP_URL`, set
  up SPF/DKIM/DMARC for Resend, and create the `sales@`, `privacy@` and `legal@` mailboxes the pages link to.
- [ ] **O-04 Stripe live mode** (roadmap 3.7): live keys, live price ids, live webhook endpoint, Stripe Tax.
  Check the prices on the pricing page (£18/£180, £49/£490) against the Stripe price objects. Do R-05 in test
  mode first.
- [ ] **O-05 Lawyer review** of `/privacy` and `/terms` once R-04 has real details.
- [ ] **O-06 Data safety** (roadmap 3.8, still open): Neon point-in-time recovery, one documented restore drill,
  and a **separate database for Preview deployments**. Today a preview deployment appears to run unreviewed
  branch code against the production database (`docs/MIGRATIONS.md:33-36`; confirm in Vercel → Environment
  Variables that `DATABASE_URL` differs between Production and Preview).
- [ ] **O-07 Vercel env check:** "Automatically expose System Environment Variables" is on (so `VERCEL_ENV`
  reaches functions; see R-16), and `CRON_SECRET`, `ADMIN_SECRET` (long and random), `STRIPE_WEBHOOK_SECRET`,
  `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `SENTRY_DSN`, `VITE_SENTRY_DSN` are set for Production.
- [ ] **O-08 Monitoring and support** (roadmap 3.9, 3.10): Sentry alerts, two uptime monitors, status page,
  a support address or widget. Set a spend limit and alert in the Anthropic console (backstop for R-07).
- [ ] **O-09 Branch protection** on `main` requiring the CI `check` status (roadmap 3.1 leftover).

## Decisions needed from the owner

| # | Decision | Blocks |
|---|---|---|
| D-1 | Undo of a role delete: soft-delete window, or warn that the JD and comments are gone | R-02 (**decided 2026-11-13: soft-delete window**) |
| D-2 | Monthly AI cap for Growth and Enterprise, and the wording on the pricing page | R-07 |
| D-3 | New-workspace trial (14 days of Growth?) or a small Free allowance of paid features | R-18 |
| D-4 | Delete a paid workspace: prorated refund, or keep the plan until period end | R-21 |
| D-5 | Which role fields a public share link may show (`location`, `startDate`, `avatarUrl`) | R-26 |

## Reviewed and found sound (do not redo)

Recorded so a later session does not spend time re-auditing these, and does not break them:
- **Tenant isolation:** every chart-scoped handler loads the chart by `(id, workspaceId)` first; child queries
  are scoped by `chartId`; workspace routes filter on `auth.workspaceId`. No cross-tenant read or write found.
- **Roles:** every mutating route has `requireRole` or an author check (the one gap is R-08). Member management
  cannot touch self, the owner or equal/higher ranks.
- **Salary redaction:** no leak through JD, headcount, snapshots, role search, chart GET, share or audit.
- **Invites:** 256-bit tokens stored as SHA-256, single use, 7-day expiry, verified-email match.
- **Billing design:** workspace id from server auth, tier from the price id, every handler re-reads Stripe, so
  event order does not matter. Admin and cron secrets are compared in constant time; the cron refuses to run
  without `CRON_SECRET`.
- **Soft delete:** `requireAuth` and both public share routes check `deletedAt`.
- **Injection:** no `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `sql.raw` in `src/` or `api/`; every body
  goes through zod; the bulk positions update is parameterised. CSV export is formula-safe.
- **Hygiene:** no secrets or build output tracked in git; no source maps shipped; `__devTools` is dev-only; no
  fabricated social proof anywhere; pricing advertises only features that exist.
