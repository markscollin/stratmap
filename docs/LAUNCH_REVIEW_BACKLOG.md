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
| R-39 | Trial can be farmed once the 30-day erase has run | P3 | S | code |
| R-40 | Nothing warns by email before a trial ends | P2 | M | code |
| R-41 | Landing page has no product screenshot or demo | P2 | S | code + owner |
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
- [x] Done 2026-11-14 (**D-2 decided: Growth 300, Enterprise 1,000, pricing shows the number**): `PLAN_LIMITS` in `plans.ts` is the one source, so the existing atomic monthly claim now stops both with `402 plan-limit` (`limit: 'ai-drafts'`). Also: a per-person burst limit (5 a minute) beside the workspace one (10); `notes` is wrapped in `<context>` markers and labelled as background, not instructions (the model can still be coaxed, but the 2,000-character field is no longer an open prompt); the pricing page, upgrade modal and plan tooltip text read the numbers from `plans.ts`; `canUseAIDrafting` treats every tier as capped (the browser counter is a convenience, the server decides). Tests: `ai-draft.test.ts` (6 new), `usePlanLimits.test.ts`, `PricingRoute.test.tsx`, e2e in `small-fixes.spec.ts`. **Still owed (O-08, owner):** a spend limit and alert in the Anthropic console as the backstop.

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
- [x] Done 2026-11-14: confirmed by reading the code (the load fell back to a blank JD on *any* error). Now: a failed load sets `loadErrors[nodeId]`, the panel shows "Couldn't load this job description" with **Retry** and no editor, and `updateJD`/`setStatus` refuse to write for that role. JD writes go through the **R-01 `saveChange` queue** (in order after the role's own save, which also removes the first-save-before-role-exists race; a failure shows the banner, toast and Retry, and the canvas pauses). `JDEditor`'s label comes from the queue: "Saving…" until the server answered, then "Saved", or "Couldn't save". Unsaved text is flushed on unmount (closing the panel, switching role), `visibilitychange` to hidden and `pagehide`; JD PUTs use `keepalive`. Also gave the panel's close button an accessible name (R-32 item). Tests: `jobDescriptionStoreSync.test.ts`, `JDEditor.test.tsx`, `JDPanelLoadError.test.tsx`, 3 e2e in `canvas-saves.spec.ts`.

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
- [x] Done 2026-11-14: new `SalaryBandEditor` holds the typed text and saves once on blur or Enter (nothing if unchanged); a cleared box sends `null` (the store turns it into undefined locally); a min above the max is refused in the UI and, new, on the server (`400 invalid-salary-band`, checked against the stored other bound too, so a one-bound request cannot cross it); non-numbers are refused with a message. Currency still saves at once. Tests: `SalaryBandEditor.test.tsx`, `jd.test.ts` (4 new), `jobDescriptionStoreSync.test.ts`, e2e in `canvas-saves.spec.ts`.

**Problem (reported).** Typing "120000" sends six PUTs that can land out of order, each adding a
`salary.updated` audit row. Clearing the field sends `undefined`, which JSON drops, so it never clears.

**Evidence.** `src/features/panel/JDPanel.tsx:559`, `569`.

**Suggested fix.** Save on blur or Enter (or debounce and serialise). Send `null` to clear and accept `null` in
the server schema. Validate min ≤ max in the UI before sending.

### R-13 A transient `/api/workspace` failure misroutes the user
- [x] Done 2026-11-14: three outcomes in `UserSync` (`AuthProvider.tsx`): loaded, no workspace, **failed**. Network, 5xx, 408 and 429 failures are retried quietly twice (0.6 s, 1.8 s); then a full-page "Couldn't load your workspace" with **Retry**, and onboarding is never reached on a failure (also not when the invite check itself cannot reach the server, nor when the workspace fetch after accepting an invite fails). A refusal retrying cannot fix (401) is shown at once without retries. **Nothing renders for a signed-in person until the workspace has answered**, which also fixes the "after a hard reload the canvas is briefly view-only and the plan reads as Free" note. `POST /api/workspace` now returns `myPermission` (so an invited viewer is no longer shown as owner) and, as the POST half of **R-29**, no Stripe ids; `OnboardingPage` uses the server's permission. First tests for `AuthProvider` (7). Tests: `AuthProvider.test.tsx`, `workspace.test.ts` (3 new), `OnboardingPage.test.tsx`, `tests/e2e/workspace-load.spec.ts`. R-29's PUT half is still open.

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
- [x] Done 2026-11-14. **Deviation from the brief:** these stores make independent writes, not an ordered chain, so they do **not** use the canvas save queue and banner (that pauses editing and exists because canvas edits depend on each other). They follow the backlog's own pattern (`headcountStore`): put back the exact previous state, and show a toast with the server's sentence (`src/lib/failureMessage.ts`). Done: chart delete (chart returns in its place), chart status change (old status back; `updateChartStatus` now resolves true/false), share toggle (server revoke happens before the chart stops looking public; a failed turn-on leaves it private), templates (edit and delete roll back, add says so), workspace rename, headcount create (the form stays open with what was typed) / update / remove toast, onboarding invitations (a failed send is no longer listed as pending; the toast says to resend from Settings → Members). Chart list: `chartStore.error` and a shared `LoadError` with Retry on the Charts page and the Dashboard, so "couldn't load" no longer reads as "No charts yet" or a page of zeros. **Found on the way and fixed:** a failed chart-list load was retried in a tight loop (`useChartLimit` re-fetched every time `loading` flipped off); it now stops after one failure until Retry. Tests: `optimisticRollback.test.ts`, `failureMessage.test.ts`, `useChartLimitFailure.test.ts`, `DashboardLoadError.test.tsx`, additions to `ChartView.test.tsx` and `OnboardingPage.test.tsx`, `tests/e2e/optimistic-failures.spec.ts`. **Not covered by a test:** the workspace-rename toast (one line in `SettingsView`).

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
- [x] Done 2026-11-14: one rule, `isDevBypassAllowed()` in `api/_lib/devBypass.ts` (`ALLOW_DEV_BYPASS=1` **and** not production/preview), used by `auth.ts` (header and no-key fallback), the Stripe unsigned-event fallback, the fake checkout success (R-20) and `identity.ts` (which now throws instead of inventing an identity). No Clerk key and no flag = 401 with a log line saying what to set. The flag is set by `e2e-server.mjs` and `vitest.api.config.ts`; README and CLAUDE.md say to put it in `.env.local` for `vercel dev` without Clerk keys. Tests: `dev-bypass.test.ts` (new), existing auth/webhook tests still pass. **Owner:** if you run `vercel dev` *without* Clerk keys, add `ALLOW_DEV_BYPASS=1` to `.env.local`; with real Clerk keys nothing changes. Do **not** set it in Vercel.

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
- [x] Code done 2026-11-14; **owner step O-03 remains (set `APP_URL`)**. One pure function, `resolveOrigin()` in `src/lib/siteOrigin.ts`, now serves both the API (`getAppUrl`) and the build (`siteUrl`), so they cannot disagree. **Differs from the suggested fix on purpose:** the order `APP_URL` → `VERCEL_PROJECT_PRODUCTION_URL` → `VERCEL_URL` applies on **production** only. On a **preview**, `VERCEL_URL` comes first: with the suggested order, a test-mode checkout on a preview would redirect to *production* after paying and the R-05 release check could not work. Production with no `APP_URL` logs a loud one-time error. `DEFAULT_SITE_URL` was left alone: `stratmap-seven.vercel.app` is the live production URL today (CLAUDE.md), not an old one; change it when the domain exists. Tests: `siteOrigin.test.ts`, `app-url.test.ts`, existing `seo.test.ts`.

**Problem.** `getAppUrl()` falls back from `APP_URL` to `VERCEL_URL`, the unique deployment hostname. Invite
and comment emails, the checkout success URL and the billing portal return URL then point at
`stratmap-<hash>.vercel.app` (stale code, and no session once Clerk production is tied to the real domain).
`src/lib/seo.ts` already prefers `VERCEL_PROJECT_PRODUCTION_URL`. Also `DEFAULT_SITE_URL` is the old
`stratmap-seven.vercel.app` (`src/lib/seo.ts:12`).

**Evidence (reported).** `api/_lib/url.ts:6-9`; `src/lib/seo.ts:12`, `69`.

**Fix.** Same order in both: `APP_URL` → `VERCEL_PROJECT_PRODUCTION_URL` → `VERCEL_URL`. On production with no
`APP_URL`, log a loud warning. Owner sets `APP_URL` (O-03).

### R-18 Landing and pricing copy promise more than Free delivers
- [x] Done 2026-11-14 except one item (below). **D-3: every new workspace gets a 14-day Growth trial.** It is the existing admin-trial override (`trialPlan` + `trialEndsAt`), set when a person's *first* workspace is created (`POST /api/workspace`; not for someone who has ever owned one, deleted or not, so delete-and-recreate is not a free Growth plan; no migration). Length from `NEW_WORKSPACE_TRIAL_DAYS` (default 14, `0` turns it off; `scripts/e2e-server.mjs` sets 0 so e2e workspaces still start on Free, and `setTrialFor()` grants one). The create and existing-workspace replies now return the effective `planTier`, so the plan applies at once. New `TrialBanner` in `Layout` (days left, the real Free limits that apply afterwards, "nothing is deleted, charts over the limit become view-only", link to plans for admins; hidden once the workspace pays). Copy: Landing says what exists today (import, invite, comment, share link; no "stay in sync", no "collaborative"), tags each feature Free / Starter and up / Growth, and mentions the trial; Pricing FAQ now describes the trial instead of "Free is effectively a trial", the Free card lists the trial, the Growth card lists version history and scenarios, and the Enterprise box drops "dedicated support and compliance" for what exists (no limits on seats, charts or roles per chart, audit-log export). Tests: `workspace.test.ts` (4), `TrialBanner.test.tsx`, `LandingPage.test.tsx`, `PricingRoute.test.tsx`, e2e in `workspace-load.spec.ts`. **Not done:** a real product screenshot or live demo chart above the fold (needs a hosted sample chart's share code and an image; the `/embed/` route is ready for it), and `sales@stratmap.app` still depends on the domain (O-03). **After 14 days a workspace with more than Free allows becomes view-only** (R-01..1.6 rules), which the banner says; consider an email before the trial ends later.

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
- [x] Done 2026-11-14: customer created before Checkout with an idempotency key and saved on the workspace (so two simultaneous Checkouts share one customer); `syncSubscription` cancels and refunds a newer duplicate when the linked subscription is still live (also when found through a later event's metadata), reports it to Sentry, and does nothing destructive if the linked one cannot be checked. Refund goes through `invoicePayments` (this Stripe version has no `invoice.charge`). Tests: `checkout.test.ts`, `stripe-webhook.test.ts` (6 new). **Not proven against real Stripe:** do one test-mode run with two Checkout tabs (add it to the R-05 preview check).

**Problem (reported).** The guard only looks for an already-linked subscription. Two admins (or two tabs) can
both complete Checkout; the second link overwrites the first, which keeps billing and is then ignored.
**Evidence.** `api/checkout.ts:47-49`; `api/_lib/billing.ts:125-135`.
**Fix.** Create or reuse one Stripe customer per workspace before Checkout and pass `customer`, so both sessions
belong to the same customer; in `syncSubscription`, when a workspace already has a different active
subscription, cancel the newer duplicate (with refund) and report it to Sentry. Add a test.

### R-20 Checkout button fails silently; fake success without Stripe key
- [x] Done 2026-11-14: errors show as a toast (server message; a 403 says to ask an admin), non-admins get a disabled "Ask an admin to upgrade" (server still enforces), and the no-key success only exists under the dev bypass (503 `billing-unavailable` elsewhere, reported). Tests: `CheckoutButton.test.tsx`, `checkout.test.ts`, `tests/e2e/billing-checkout.spec.ts`.

**Problem (reported).** `src/features/billing/CheckoutButton.tsx:18-21`: a 403 (editor clicks Upgrade), 400
(missing price env) or 500 just re-enables the button. `api/checkout.ts:29-31`: with `STRIPE_SECRET_KEY` unset
it returns `/billing/success`, so production without the key would show "Welcome to Starter!".
**Fix.** Show the error (for 403: "Ask a workspace admin to upgrade"). Hide or disable Upgrade for non-admins.
Make the demo success path dev-only (same rule as R-16); on a deployed env return 503 and report it.

### R-21 Deleting a workspace forfeits the paid period without warning
- [x] Done 2026-11-14 (**D-4: stop renewal, keep the plan until the period ends**). Delete now calls `subscriptions.update(id, { cancel_at_period_end: true })` instead of cancelling at once: no refund is needed and nothing is forfeited. The workspace keeps its plan, period end and subscription link while hidden; a restore inside the 30 days gives back the same plan until the period ends (it shows "cancels on …"; resume in the portal to keep it). When Stripe ends it, the normal webhook drops the workspace to Free whether or not it was restored. If Stripe cannot be told, nothing is deleted (502, as before); a subscription Stripe no longer has falls back to Free as before. Delete dialog (`DataRightsSection`), the privacy retention text and the member email say it. **After the 30 days the workspace is erased but an annual subscription may still be running to its period end (not billed again).** Tests: `data-rights.test.ts`, `stripe-webhook.test.ts`, `dataRights.test.tsx`, e2e in `small-fixes.spec.ts`. `docs/BILLING.md` updated.

**Problem (reported).** Delete cancels the subscription immediately with no refund, and restore brings the
workspace back on Free. An annual customer who deletes by mistake loses the rest of the year.
**Evidence.** `api/_lib/workspaceLifecycle.ts:23-27`, `58`, `93`. Whether the dialog warns was not checked.
**Fix.** At minimum, say so in the delete dialog (`DataRightsSection`) when the workspace has a paid plan.
**Owner decision:** prorated refund on delete, or cancel at period end and keep the plan through the restore
window. Document the choice in `docs/BILLING.md` and the Terms.

---

## P2: fix soon after launch

### R-22 No reconciliation when a billing webhook is lost
- [x] Done 2026-11-15: new daily job `api/cron/daily-maintenance.ts` (03:41 UTC, same `CRON_SECRET` rule; shared `cronAuthorised` in `api/_lib/cron.ts`) re-reads up to 100 subscriptions a day through `syncSubscription`, oldest-synced first (so everyone comes round), reports every correction to Sentry as a probable missed webhook, and counts failures without stopping. `charge.refunded` and `charge.dispute.created` are now handled events: reported to Sentry and emailed to `BILLING_ALERT_EMAIL` (new optional env var, warned about by `check:env`), amounts and opaque ids only, and **no automatic action** (a refund does not drop the plan; that is a human call). Tests: `daily-maintenance.test.ts`.

**Problem (reported).** The safety net in `resolvePlanTier` covers only `cancelAtPeriodEnd`
(`api/_lib/billing.ts:175-181`). A `past_due` subscription that Stripe later cancels, with the event lost,
stays paid for ever. Refunds and disputes are not handled at all.
**Fix.** A daily cron (`api/cron/`, same `CRON_SECRET` pattern as the purge) that runs `syncSubscription` for
every workspace with a subscription id whose status is not terminal, in small batches. Handle
`charge.refunded` and `charge.dispute.created` at least by reporting to Sentry and emailing the owner address.

### R-23 CSP is report-only, has no report endpoint, and lists only Clerk dev hosts
- [x] Code part done 2026-11-15; **the rest waits for O-01/O-03** (production Clerk hosts need the real domain, then a week of reports, then enforce; steps in `docs/CSP.md`). New `POST /api/csp-report` (public, 30 a minute per address, always 204, accepts both the `report-uri` and the Reporting-API shapes, one trimmed `[csp]` log line each, at most 10 per request; URLs are cut to origin + first path segment so invite tokens and share codes never reach a log). Both copies of the policy now carry `report-uri` and `report-to`, and the blocks have a `Reporting-Endpoints` header. Tests: `csp-report.test.ts`, `vercelRewrites.test.ts` (the two copies differ only in `frame-ancestors`).

**Problem (reported).** `vercel.json:46-47`, `71-72`: no `report-uri`/`report-to`, so the policy neither blocks
nor reports. It allows only `*.clerk.accounts.dev`; production Clerk runs on `clerk.<your-domain>`. API tokens
come from `window.Clerk.session.getToken()` (`src/lib/apiClient.ts:23`), so any future XSS can act as the user.
**Fix.** After O-01 and O-03: add the production Clerk host, add a report endpoint (Sentry's CSP endpoint
works), run report-only for a week, then enforce. Extend `src/lib/__tests__/vercelRewrites.test.ts`.

### R-24 Main bundle is one 1.5 MB chunk
- [x] Done 2026-11-15 (landing target met, share/embed 3.6 kB over): every page is a lazy route (`src/App.tsx`, `PageFallback`; the app shell has its own Suspense so the sidebar stays while a page arrives); TipTap's `JDEditor` loads when a job description opens; `html-to-image` and `jsPDF` load on the first export; `NodeModal`, `HistoryPanel` and `ImportDialog` load when opened. **Before:** one 1,548.5 kB chunk, 469.2 kB gzip, downloaded by every page including landing, share and embed. **After (gzip of the JavaScript each page needs at first load, measured from the build's static import graph):** landing 124.9 kB, pricing 137.6, dashboard 127.7, sign-in 119.2, legal 122.8, **share page 153.6, embed 152.8**, canvas 159.3 (the editor, PDF export and dialogs come later, on demand). The shared entry is 118.9 kB gzip and is framework only (react-dom, react-router, Clerk, Sentry core); getting share/embed under 150 would mean lazy-loading Clerk or Sentry, which was judged not worth the risk before launch. No test needed changing.

**Problem (verified from the build).** `dist/assets/index-*.js` is 1,525 kB (463 kB gzipped); the landing,
share and embed pages download the whole app, including TipTap.
**Fix.** `React.lazy` per route in `src/App.tsx` (marketing pages, share/embed, and the app shell as separate
chunks); lazy-load TipTap with the JD panel and the export libraries on first use. Target: landing and share
under 150 kB gzipped of JS. Record before and after here.

### R-25 Legacy URL-token share links cannot be revoked
- [x] Done 2026-11-15: `src/utils/shareLink.ts` (the decoder) is deleted; `SharePage` accepts only server codes (`isShareCode`, `src/lib/shareCode.ts`) and shows 'This link is no longer supported' for anything else, without fetching or decoding. Old URL-token links are therefore dead for good (nothing had generated them for a long time). Tests: `SharePage.test.tsx` (3 new).

**Problem (reported).** `src/pages/SharePage.tsx:27-46` decodes any token longer than 20 characters in the
browser (`src/utils/shareLink.ts:69`). Old links survive `isPublic: false`, and anyone can craft
`/share/<blob>` that shows an arbitrary chart on the StratMap domain.
**Fix.** Remove the decoder and `shareLink.ts`; show "This link is no longer supported". Nothing generates
these links any more. Update `SharePage.test.tsx` and the share-link note in `CLAUDE.md`.

### R-26 Share API returns node fields by deny-list
- [x] Done 2026-11-15 (**D-5: location, startDate and avatarUrl are public**): `api/_lib/sharedFields.ts` holds `SHARED_NODE_FIELDS` and `publicNode()`; the share API sends exactly those fields. `share-fields.test.ts` fails when a `nodes` column is in neither `SHARED_NODE_FIELDS` nor `PRIVATE_NODE_FIELDS`. An expired link now answers the same 404 as private, revoked and unknown ones (it was 410, which revealed that the code had existed); the pages' 410 branches are gone and `SharePage` shows one message for all of them.

**Problem (reported).** `api/share/[code].ts:61` returns every node column except `chartId` (today including
`managerId`, `location`, `startDate`, `avatarUrl`). A future column such as email or notes would be published
automatically. Also `:29-31` answers 410 for an expired link before the `isPublic` check, which reveals that
the code existed.
**Fix.** Select an explicit allow-list of the fields the canvas renders (**owner decision:** should `location`
and `startDate` be public?). Make expired, private and unknown all return the same response. Add a test that
fails when a new `nodes` column appears in the share response without being added to the list.

### R-27 `rate_limits` table is never pruned
- [x] Done 2026-11-15: `rate_limits.window_seconds` (migration 0014, additive) is recorded on every hit so the daily job (`pruneRateLimits`) can tell which windows ended over an hour ago; old rows without it are classified by the size of their window id. A limiter failure (still fails open) is sent to Sentry, sampled at 10%. Tests in `daily-maintenance.test.ts`.

**Problem (reported).** `api/_lib/rateLimit.ts:26-37`: rows keyed by IP are written on every anonymous share,
invite-preview and admin hit and never deleted. The limiter also fails open (`:66-69`), which is acceptable but
should be reported.
**Fix.** Delete expired windows in the daily cron (R-22), and report limiter failures to Sentry (sampled).

### R-28 e2e server binds all interfaces and can use the real database
- [x] Done 2026-11-15: `scripts/e2e-guard.mjs` (`resolveE2eDatabase`) is the only way the suite gets a database: the local emulator (endpoint must be on this machine) or an explicit `E2E_DATABASE_URL` that differs from `DATABASE_URL`; a bare `DATABASE_URL` is refused with a message, in the server, the helpers and the teardown (none of them fall back to it any more). The server listens on `127.0.0.1` only. `npm run test:e2e` is now the emulator run (what CI uses, so the CI job no longer starts its own emulator); `test:e2e:remote` is the old plain `playwright test` for an explicit throwaway Neon branch. Tests: `e2e-guard.test.ts`.

**Problem (reported).** `scripts/e2e-server.mjs:98` listens on every interface; `:16-19` loads `.env.local`
and falls back to `DATABASE_URL`; `:28-29` removes `CLERK_SECRET_KEY` and `VERCEL_ENV`. Plain
`npm run test:e2e` on a machine whose `.env.local` points at production exposes an auth-less owner API to the
network and runs the test teardown against that database.
**Fix.** Bind `127.0.0.1`. Refuse to start with `DATABASE_URL` unless `E2E_DATABASE_URL` is set explicitly or
the emulator is in use. Make `npm run test:e2e` an alias of `test:e2e:local`.

### R-29 Stripe ids returned by `POST`/`PUT /api/workspace`
- [x] Done 2026-11-15 (the PUT half and the shared serializer): `api/_lib/publicWorkspace.ts` is the one way a workspace leaves `/api/workspace`; GET, POST (both replies) and PUT use it. Stripe ids never leave, the subscription mirror is grouped under `billing`, the plan is the effective one, and the new trial-email stamps stay internal. PUT used to return the raw row. Tests: `workspace.test.ts` (3 new, all three methods).

**Problem (verified for POST).** When the caller already has a workspace, POST returns the full row
(`api/workspace.ts:65-71`), including `stripeCustomerId` and `stripeSubscriptionId`; any member can call it.
PUT does the same for admins (`:104-110`, reported). GET strips them.
**Fix.** One `publicWorkspace(row)` serializer used by all three methods; a test asserts no key starting with
`stripe` in any response from this route.

### R-30 Body-supplied reference ids not checked against the workspace
- [x] Done 2026-11-15: `api/_lib/references.ts`: `checkRoleReferences` (a role's department must be one of the workspace's or this chart's own, its manager a role in this chart) and `checkHeadcountReferences` (department and chart of this workspace) answer 400 `invalid-reference` with the field. **On an edit a value that did not change is not checked again**, otherwise a role whose old manager was deleted could never be edited. Template seeding (`POST /api/charts`) drops, rather than refuses, a workspace-department link that is not the workspace's (as snapshots already did). The headcount list join now also requires the department to belong to the workspace. The job-description `nodeId` check was already added by R-38. Tests: `references.test.ts` (7).

**Problem (reported; low risk, ids are unguessable UUIDs).** Headcount `departmentId`/`chartId`
(`api/headcount.ts:65,68`, `api/headcount/[id].ts:45,48`), and the list joins `workspace_departments` by id
only (`headcount.ts:42`). Same pattern: node `departmentId`/`managerId` (`api/charts/[id]/nodes.ts:47-50`,
`nodes/[nodeId].ts:35-38`), `templateDepts.workspaceDepartmentId` (`api/charts/index.ts:101`), and the JD
`nodeId`, which is not checked to exist in the chart (`api/charts/[id]/jd/[nodeId].ts:120-133`).
**Fix.** A small helper in `api/_lib/access.ts` that confirms an id belongs to the workspace (or chart) and
returns 400 otherwise; add the workspace condition to the headcount join.

### R-31 Client-chosen node ids are global primary keys
- [x] Done 2026-11-15 for the short-term fix, which is all the backlog asked for now: UUID ids and the clean 409 `id-taken` shipped with R-01/R-03; new here: a restore of a version no longer skips or fails on a role, line or department whose id another chart has taken in the meantime (`freeSquattedIds` in `api/_lib/snapshots.ts` gives it a fresh id, with managers, departments and line ends following; only its comments and job description, keyed by the old id, stay behind). **Not done on purpose:** composite uniqueness on `(chart_id, id)`, which needs its own expand/contract migration and a look at every id reference; do it only if squatting becomes a real concern. Test: `snapshots.test.ts`.

**Problem (reported).** Node ids are `n-${Date.now()}` (`src/features/canvas/useCanvasState.ts:88`) and are the
table's primary key across all workspaces (`api/charts/[id]/nodes.ts:47-50`). Two people adding a role in the
same millisecond anywhere collide (a silent 500 today, see R-01). Share pages disclose ids, so a deleted role's
id can be squatted, which makes a later snapshot restore skip that role (`api/_lib/snapshots.ts:88-97`).
**Fix.** Short term: generate ids with `crypto.randomUUID()` on the client and return a clean 409 on collision.
Longer term: composite uniqueness on `(chart_id, id)`; this needs an expand/contract migration and a look at
every foreign key to `nodes.id`, so plan it separately.

### R-32 Accessibility basics
- [x] Items 1 to 3 done 2026-11-15. **Item 4 done 2026-11-15:** every role card is `role="button"` with `tabIndex=0` and a spoken name ("Bo, CTO, reports to Ada, 2 direct reports"); Tab walks the roles in reading order (the DOM is drawn top-to-bottom then left-to-right, except on charts over 300 roles, which keep their own order so a drag does not re-sort 1,000 cards); Enter or Space opens the role's panel (never toggles it shut) or finishes a Connect; F2 edits; Up = manager, Down = leftmost direct report, Left/Right = neighbour under the same manager (top-level roles are peers); a role off screen is panned into view (`panToReveal`, only for keyboard focus, never for a mouse click) and focused with `preventScroll`. Pure logic in `src/features/canvas/keyboardNav.ts`. **Not covered:** zoomed-out big charts draw plain chips (`NodeChip`), which are not focusable. Side effect for tests: a card is now a button, so e2e pickers that look for a manager by name must be scoped to the dialog (three specs fixed). (1) `src/components/ui/Dialog.tsx` + `useDialog.ts`: `role="dialog"`, `aria-modal`, an accessible name, focus moves in (a `data-autofocus` element, else the first field), Tab and Shift+Tab stay inside, Escape closes only the top-most dialog and does not reach the canvas's window shortcuts, focus returns to what had it, and a press that starts inside and ends on the backdrop (selecting text) no longer closes it. `NodeModal`, `UpgradeModal` and `Spotlight` use `Dialog`; `JDPanel` (a slide-out beside a canvas people keep using) uses `useDialog` **non-modal**: it takes focus itself (not its first field), answers Escape only while focus is inside, and is `inert` while closed so Tab cannot walk into an off-screen panel. Also fixed on the way: the upgrade dialog's close button was positioned against the screen, not the dialog. (2) 13 icon-only buttons had no name (toast dismiss, template list, chart menu, search clear, department delete, year arrows, remove invite, close buttons); the toolbar's `ToolBtn` had only a `title` and now also an `aria-label` and `aria-pressed`. Two scanners keep it that way: `src/test/iconButtonNames.test.ts` reads every component with the TypeScript parser, and `src/test/accessibleNames.test.tsx` renders the canvas and dialogs and computes each control's name the way a browser does; that second one also found that **the role form's inputs had no labels** (the `<label>` was not tied to its input) and the "New role" switch had no name, both fixed (`useId` in `Field`; the switch is `role="switch"`). (3) `--dim` was 2.1 to 2.6:1; now `#7A8CA3` on dark and `#5B6B82` on light, and light `--muted` went from `#64748B` (4.2:1 on the page background) to `#475569`, so text, muted and dim are all at least 4.5:1 on bg, surface and raised in both themes (`src/styles/__tests__/contrast.test.ts`). Adds `dom-accessibility-api` as an explicit dev dependency (it was only a transitive one).

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

### R-39 Trial can be farmed once the 30-day erase has run
- [x] Done 2026-11-15. Migration 0016 (`trial_grants`, additive). Tests in `workspace.test.ts` (5 new), `data-rights.test.ts`, `member-unique.test.ts` (backfill).
- New table `trial_grants(user_id pk, granted_at)`: an opaque account id and a date, no email, no workspace link, so the purge does not touch it. `POST /api/workspace` claims it with one `INSERT … ON CONFLICT DO NOTHING RETURNING` (which also closes a two-requests-at-once race that the old read-then-write check had), and only the winner gets the trial. If the workspace insert then fails, the claim is released, so an error never costs someone their trial. With `NEW_WORKSPACE_TRIAL_DAYS=0` nothing is recorded.
- **The migration backfills every current workspace owner**, so today's rule ("never owned a workspace") keeps holding after their workspace is erased.
- **Account deletion removes the row** (`deleteUserAccount` path) and the privacy text (section 4) says what is kept and why. **Limit that remains, by design:** someone who deletes their *account* and signs up again gets a new account id and a new trial; closing that needs the email address, which is worse for privacy and was not asked for.

### R-40 Nothing warns by email before a trial ends
- [x] Done 2026-11-15: the daily job emails owners and admins once 3 days before `trialEndsAt` and once after it ended (not for trials over a week old, paying or deleted workspaces), with the real Free limits from `plans.ts` and the pricing link; stamps `trial_warned_at` / `trial_ended_notice_at` (migration 0014) and `grant-trial` clears them so a new trial warns again. A failed address is reported and does not repeat the notice. Tests in `daily-maintenance.test.ts`.

**Problem.** The trial banner says what happens when 14 days end, but only to people who open the app. A workspace that is over the Free limits at that moment turns view-only without a message in their inbox.
**Suggested fix.** In the daily cron (same `CRON_SECRET` pattern as the purge), email owners and admins 3 days before `trialEndsAt` and on the day it ends, once each (a `trial_notified_at` column, additive migration). Include the Free limits and the link to /pricing. Skip workspaces that already pay.

### R-41 Landing page has no product screenshot or demo
- [ ] Open (left over from R-18)

**Problem.** The landing page is copy only. The backlog asked for a real screenshot or a live read-only demo chart above the fold.
**Suggested fix.** Create a public sample chart in a StratMap-owned workspace and embed it with `/embed/<code>` in an iframe on `/` (the route and its framing headers already exist), or ship a screenshot taken from the e2e browser. Needs the owner's say on which chart to show. Also `sales@stratmap.app` depends on O-03.

### R-38 Job descriptions are orphaned when a role is deleted
- [x] Done 2026-11-13: delete removes the JD rows in the same atomic batch and keeps them in the 3-day `deleted_nodes` copy (jsonb, so **no migration**; the old copies restore fine without them); restore puts them back with real dates. A first JD save for a role that is not in the chart is now 404, so a late autosave cannot orphan one. Existing orphans: **not a one-off migration** (the backlog's suggestion) but the daily purge, which also catches future ones, and only touches rows older than a day so a JD written just before its role finished saving is safe. Privacy text mentions the JD. Tests: `node-trash.test.ts` (6 new), e2e in `canvas-saves.spec.ts`.

**Problem (found 2026-11-13 while building R-02).** `job_descriptions.node_id` has no foreign key (`schema.ts`), so deleting a role leaves its JD row behind, salary band included, forever. Nothing shows it, but it is personal/compensation data that outlives the role, it is still in any query that selects by chart, and a later role that reuses the id (undo does) silently re-attaches it.

**Suggested fix.** On `DELETE /nodes/:id`, put the JD in the `deleted_nodes` copy and delete it in the same atomic batch; `restore` re-inserts it. Add a one-off migration/cleanup that deletes JD rows whose node no longer exists. Mention the 3-day copy in the privacy text (R-04): deleted roles, their comments and JD are kept for 3 days so Undo works.

**Done when.** Delete → no `job_descriptions` row for that role; undo brings the JD back; a test proves a purge leaves none.

### R-33 Small billing and limit gaps
- [x] Done 2026-11-15 (one item accepted, one narrowed). Tests: `billing.test.ts`, `limits-race.test.ts`, `member-unique.test.ts`, `invite-hardening.test.ts`.
- **Trial vs paid:** `resolvePlanTier` now returns the *higher* of an active trial and the paid tier (`higherTier` in `plans.ts`); a lapsed cancel still counts as Free, so a trial can lift it.
- **Role limit race:** the add-role route counts again after the insert and takes its own row back out if the chart is over the limit (so parallel requests at the edge may all be refused rather than one accepted; Retry then works). **Narrowed:** the import route is still check-then-insert (it adds many rows in chunks, so a post-check could not roll back cleanly); an import racing another add can overshoot by one import.
- **Sample chart:** `MAX_SAMPLE_NODES` (20) is enforced on add-role (with the same post-check) and on import, `400 sample-too-large`.
- **`pdf-export` and `auto-layout` are client-only gates: accepted**, there is no server route to guard (they run in the browser on data the person can already read).
- **Unique index** `workspace_members_workspace_user_uq` (migration 0015). The migration first removes existing duplicates, keeping the highest role, then the earliest join, then the lowest id. The invite-accept insert uses `onConflictDoNothing`. Seat cap, chart count, one-sample and one-owned-workspace remain check-then-insert (accepted: the worst case is one extra seat or chart, never a data leak).
- **Invites by a departed member** are revoked and logged (`invite.revoked`, `reason: 'inviter-left'`) when the member is removed, leaves, or deletes their account (`revokeInvitesSentBy`).
- **Invite email:** the subject is fixed text ("You've been invited to a workspace on StratMap"), so neither the inviter nor the workspace can put their words in it; they stay in the (escaped) body. Free workspaces get 3 invite requests an hour, paid ones 10.
- **`sendBillingReceipt`** was unwired and unescaped: deleted.

### R-34 Small client gaps
- [x] Done 2026-11-15. Tests: `uiStoreTheme.test.ts`, `signOutCleanup.test.ts`, `buildChecks.test.ts`, `TopNav.test.tsx`, `OnboardingPage.test.tsx` (2 new), `tests/e2e/client-gaps.spec.ts`.
- **Theme** is saved (`stratmap_theme`) and applied when the store loads, so a saved light theme does not flash dark.
- **Sign-out** (`clearAccountBrowserState`, `src/lib/signOutCleanup.ts`) resets the in-memory plan, trial and subscription to Free and removes `stratmap_plan`, `stratmap_usage`, `stratmap_workspace`, `stratmap_workspace_id` and the remembered invite token. Theme, cookie choice and hint dismissals stay (they belong to the browser).
- **Onboarding** finishes once: a ref guard plus disabled buttons ("Setting up…"); after a failure the buttons work again.
- **Production build** fails on Vercel (`VERCEL_ENV=production`) without a Clerk publishable key, with a placeholder, or with a value that is not `pk_test_`/`pk_live_` (`src/lib/buildChecks.ts`, run by a Vite plugin). Test keys are still allowed until O-01. Previews, CI and local builds are unchecked.
- **Lint warnings:** 15 → 14. Reviewed each: the `set-state-in-effect`, `static-components` and "refs during render" ones are React Compiler style rules on patterns that are correct (reset a form when a prop changes, fetch once on mount) and are left; `SettingsView`'s missing `wName` dependency is deliberate (adding it would refill the field the moment someone clears it); `SharePage`'s title effect now depends on `data` (fixed).
- **Found on the way (R-32 follow-up, fixed):** the top bar's theme and search icon buttons had no accessible name (the R-32 scanner reads `<button>` literals and missed a button built inside a helper component), the avatar that signs you out was a clickable `div` with no keyboard access, and the bell did nothing at all. Buttons are named, the avatar is a real button, the bell is removed (there is no inbox to open). `TopNav.test.tsx` renders the real bar and checks every button's computed name.
- `CLAUDE.md` counts: refreshed in the closing step of this session.

### R-35 Split `OrgChart.tsx` and centralise persistence
- [ ] Open

`src/features/canvas/OrgChart.tsx` is 1,483 lines holding the toolbar, share panel, pointer handling and all
persistence. After R-01 moves persistence out, split the rest: toolbar, share settings, keyboard shortcuts and
pointer/gesture handling into their own files. No behaviour change; the existing tests and e2e are the guard.

### R-36 Dependency audit triage
- [x] Done 2026-11-15. **`npm audit --omit=dev`: 62 advisories (1 critical, 17 high) → 0.** Tests: `src/lib/__tests__/dependencies.test.ts`.
- **`npm audit fix` itself crashes** here (`Cannot read properties of null (reading 'edgesOut')`, an npm bug triggered by the TipTap peer pins), so the backlog's suggestion could not be followed as written. Done by hand instead:
  1. **`@vercel/node` moved to devDependencies.** Every import of it in `api/` and `src/` is `import type`; Vercel builds the functions with its own copy. This alone removed the critical `tar` advisory and the other build-tool chains (`undici`, `path-to-regexp`, `@vercel/build-utils`, 40-odd more). A test fails if a runtime import of it ever appears.
  2. **`npm update`** of the packages that do ship to browsers or run in functions: `react-router`/`react-router-dom` (high: CSRF/open redirect in features this app does not use, but cheap to close), `prosemirror-view` (**high: XSS in paste handling**, used by the JD editor), `dompurify` via jsPDF, `js-cookie` via Clerk, the OpenTelemetry packages under `@sentry/node`, `minimatch`, `brace-expansion`.
  3. **TipTap 3.23.4 → 3.34.0** (`@tiptap/core` high: prototype-key handling in `mergeAttributes`). npm would not move one package at a time (stale optional peer pins in the lock file), so the `@tiptap/*` lock entries were dropped and re-resolved together; a test requires all `@tiptap/*` versions to match. JD editor tests and e2e pass.
- **What is left (`npm audit` including dev): 33, all dev-only** (`vite` dev-server advisories, `vitest`, `esbuild` under `drizzle-kit`, and `@vercel/node`'s own tree). None of it is installed in the functions' runtime or in the browser bundle. `vite`/`vitest` major upgrades are not worth the risk before launch; Dependabot will propose them.
- **Dependabot** (`.github/dependabot.yml`): weekly, grouped (TipTap, Clerk, Sentry, test tools, everything else minor/patch), plus GitHub Actions. Security advisories open their own pull requests. Needs "Dependabot alerts/security updates" switched on in the repo settings (owner action, one click).
- Also fixed on the way: `tests/e2e/performance.spec.ts` assumed the first card on screen is "Person 0". The server lists roles in storage order, which changes after earlier specs delete rows, so the "only the moved role changed" case failed in full runs (never alone). It now asserts that exactly one role moved.

### R-37 Server-side JD HTML sanitisation (before any new renderer)
- [x] Done 2026-11-15. Tests: `api/__tests__/sanitize-html.test.ts` (12), `src/features/jd/__tests__/sanitizeRoundTrip.test.ts` (9, real TipTap).
- `api/_lib/sanitizeHtml.ts` (`sanitize-html`, a parser-based allow-list; not a hand-written regex) cleans JD and template text on write. It is applied in the zod schema (`LongText` in `schemas.ts`), so every route that takes `responsibilities` or `requirements` (JD update, template create/update) gets it and a new route using the schema gets it too.
- **Allow-list = what TipTap 3's StarterKit writes:** `p br hr h1-h6 strong b em i s u code pre blockquote ul ol li a`; `href` (http, https, mailto only; `javascript:`, `data:`, `file:`, protocol-relative are dropped, the text stays), `rel` forced to `noopener noreferrer nofollow`, `target` only `_blank`, `ol start`, and a `language-xxx` class on `code`. Everything else is removed; the content of `script`/`style` goes with the tag.
- **The round trip is tested with the real editor:** each kind of document the editor can write (headings, marks, nested lists, quotes, code with a language, links, line breaks, entities) is run through the sanitiser and reopened; the editor's JSON must be identical. A TipTap upgrade that starts writing a new element fails that test instead of silently losing formatting. Known cosmetic difference: the library writes `<br />` and `<hr />`; TipTap reads both.
- **Existing rows are not rewritten** (no migration). They were written by a browser running TipTap, and the only renderer is still TipTap. Any new renderer must clean on read too, or the rows must be run through `sanitizeRichText` once first.

---

## Owner and dashboard actions (not code)

**Start with `docs/OWNER_CHECKLIST.md`**: every action below in one prioritised list, with two helper scripts (`npm run check:env`, `npm run check:webhook`) that do the checking for you (added 2026-11-14).

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
| D-3 | New-workspace trial (14 days of Growth?) or a small Free allowance of paid features | R-18 (**decided 2026-11-14: 14-day Growth trial for every new workspace**) |
| D-4 | Delete a paid workspace: prorated refund, or keep the plan until period end | R-21 (**decided 2026-11-14: stop renewal, keep the plan until period end, also through a restore**) |
| D-5 | Which role fields a public share link may show (`location`, `startDate`, `avatarUrl`) | R-26 (**decided 2026-11-14: all three may be shown**) |

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
