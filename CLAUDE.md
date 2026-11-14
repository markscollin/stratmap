# StratMap — Claude Project Definition

## Project Overview

**StratMap** is a collaborative org chart and people planning tool. Full-stack: React + TypeScript frontend, Vercel Serverless API, Neon Postgres via Drizzle ORM.

**GitHub:** https://github.com/markscollin/stratmap  
**Repo owner:** markscollin (SSH keys already configured)  
**Dev server:** `npm run dev:local` (= `vercel dev`) → http://localhost:3000

---

## Current State (updated 2026-05-24)

The app has been through a "prepare for paid launch" hardening pass. Tests:
**444 frontend + 491 backend = 935 passing** (after Phase 0, migrations, invites, multiple workspaces, removing mock data, paid-feature locks, the billing life-cycle, seat caps and over-limit read-only); `tsc` clean; `lint` 0 errors; build OK.

**Routing changed:** `/` is now the **public marketing landing page**; the authed
Dashboard moved to **`/dashboard`**. Public routes (no auth, no layout): `/`,
`/share/:token`, `/privacy`, `/terms`. These are whitelisted in `AuthProvider`'s
`isPublicPage`.

**Done in code (this pass):**
- **AI drafting is server-side** — `api/ai/draft.ts` streams from a server-only
  `ANTHROPIC_API_KEY` (the old browser `dangerouslyAllowBrowser` client was removed).
  Plan-gated server-side (free → 403).
- **Stripe billing** — `api/checkout.ts`, `api/webhooks/stripe.ts`,
  `api/admin/grant-trial.ts` (admin trial override via `x-admin-secret`). Effective
  plan resolved in `api/workspace.ts` (trial overrides base tier). Fully tested.
- **Auth bypass hardened** — dev bypass (`x-dev-user`) now only works on local/unset
  envs, never on `preview` or `production` (`api/_lib/auth.ts`).
- **Plan tiers centralized** — `PLAN_BY_TIER` + `ENTERPRISE_PLAN` exported from
  `billingStore`; `usePlanLimits` treats `-1` as unlimited.
- **Legal + consent** — `/privacy`, `/terms` (`LegalPages.tsx`, template content, needs lawyer review; the owner's facts live in `src/lib/legalDetails.ts`: while any is empty the pages show placeholders and the template banner, `npm run check:legal` fails until all are filled; `SUB_PROCESSORS` (`src/lib/subProcessors.ts`) is checked against `package.json` by a test, update it when an integration is added) + app-wide `CookieConsent` banner.
- **Sentry** — `@sentry/react` init in `main.tsx` (`VITE_SENTRY_DSN`) + ErrorBoundary;
  `api/_lib/sentry.ts` `reportError` wired into checkout/webhook/ai-draft/invites.
- **Email (Resend)** — `api/_lib/email.ts` (graceful no-key fallback) + real
  `POST /api/workspace/invites` (persists `pending_invites`, emails invitees);
  onboarding now sends invites.

**Env vars (all no-op until set):** `ANTHROPIC_API_KEY` (server), `RESEND_API_KEY`
(server) + optional `EMAIL_FROM`, `SENTRY_DSN` (server), `VITE_SENTRY_DSN` (client).
Stripe + Clerk + `ADMIN_SECRET` + `DATABASE_URL` already in `.env.local`.

**Launch gates still requiring YOU (dashboard/ops, not code):** Clerk production keys
(currently `pk_test_`), Vercel Pro upgrade, custom domain. Plus: have the legal page
content reviewed by a lawyer.

**e2e (roadmap 3.3, 2026-11-06):** `npm run test:e2e` runs Playwright against `scripts/e2e-server.mjs`
(Vite in dev-bypass mode plus every `api/**/*.ts` mounted; no Clerk/Stripe/AI/email keys). It uses
`E2E_DATABASE_URL`, else `DATABASE_URL`.
- **Preferred: no database account at all.** `npm run test:e2e:local` (optionally `-- tests/e2e/x.spec.ts`) starts `scripts/neon-http-emulator.mjs`, a PGlite (in-process Postgres) server that speaks Neon's
  HTTP protocol with the real migrations applied, points the app and the test helpers at it (`NEON_HTTP_ENDPOINT`, ignored on production deploys) and removes `DATABASE_URL` from the child's environment so a real database
  can never be reached. **CI does the same**, so the `e2e` job needs **no secret** and never touches a shared database. The emulator is proved against the real Neon driver and the app's Drizzle code by
  `api/__tests__/neon-emulator.test.ts`. In the cloud sandbox add `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium` (the pre-installed Chromium is a different build from the one Playwright 1.60 expects; elsewhere
  `npx playwright install chromium`). Running against a real Neon branch still works: set `E2E_DATABASE_URL` (and run `npm run db:migrate` against it first), but prefer the emulator.
- **Multi-identity dev bypass:** `X-Dev-User: true` is still `u-dev`/`ws-dev`. Any other slug (`alice`) is user
  `dev-alice`, email `alice@e2e.test`, with no workspace until onboarding. Client: `localStorage['stratmap_dev_user']`
  (`src/lib/devIdentity.ts`); a named identity goes through the same `UserSync` flow as Clerk users. Refused on
  preview/production like the rest of the bypass.
- Invite mail is appended to `E2E_EMAIL_OUTBOX` (JSON lines) when `RESEND_API_KEY` is unset. Tests use
  `testUser()` (unique per run) and `global-teardown.ts` deletes the run's workspaces.
- CI job `e2e` runs against the local emulator (no secret; it used to need `E2E_DATABASE_URL`, whose password Neon started rejecting on 2026-11-07). Not covered: Clerk sign-up UI, Stripe checkout.
- **The emulator is a test tool, not a database server:** one connection, requests run one at a time, no authentication, 127.0.0.1 only, in-memory. It returns values as raw Postgres text exactly like Neon, so keep new SQL ordinary Postgres; if a query behaves differently on real Neon, add a case to `neon-emulator.test.ts`.

**Done:** Stripe webhook idempotency (`stripe_events`), shipped with the billing life-cycle (see below).

---

## Launch review backlog (2026-11-13)

**Start here for what to work on next:** `docs/LAUNCH_REVIEW_BACKLOG.md`. It lists every open issue from the full pre-launch review
(ids `R-01`… for code, `O-01`… for owner/dashboard actions, `D-1`… for decisions the owner must make), each with evidence, a suggested fix
and what "done" means. Tick items there as they ship. The root `BACKLOG.md` is historical.
- **Known broken until fixed:** nothing from the P0 band. R-04 needs the owner's legal facts and R-05 a deployed-preview check (both below).
- Real test counts: **726 frontend (+2 skipped launch-gate) + 733 API**, 85 e2e, after the P0 band R-01 to R-06 plus R-08, R-09, R-10, R-15 (614 + 638 + 74 at the review). The counts elsewhere in this file are older.

### Canvas persistence (R-01 + R-03, 2026-11-13)
- **Every canvas write goes through `src/features/canvas/canvasSync.ts`** (`saveNewRole`, `saveRoleEdit`, `saveRoleDelete`, `saveNewLine`, `saveLineDelete`, `savePositions`, all built on `saveChange`). Do not call `api.*` for chart content from `OrgChart.tsx`.
  Writes to one chart run one at a time in the order made. The first failure **stops the queue**; `useCanvasSave().failure` says what and why, `CanvasView` makes the canvas read-only and `SaveErrorBanner` offers **Retry**
  (only for offline, 5xx, 429, 408) and **Reload** (discards the unsaved change; an exact rollback because nothing after the failure was sent). A 409 `chart-changed` only stops the queue (the conflict banner explains). `beforeunload` warns while writes are pending.
- **Ids are made on the client** (`newId('n'|'e')` = prefix + `crypto.randomUUID()`), and `addEdge` returns the edge so the same id is saved. The server accepts an optional `id` on `POST /edges`; the same edge sent again returns 200 (a retry
  after a lost reply is safe, no revision bump), an id used by anything else is `409 id-taken`. `POST /nodes` with an existing id in the same chart also returns 200; in another chart `409 id-taken`.
- `useCanvasState` keeps `nodesRef`/`edgesRef` updated synchronously; `undo()`/`redo()` return `{from, to}` (or null).

### Undo/redo are saved, and deleted roles can be restored (R-02, 2026-11-13; owner decision D-1: soft-delete window)
- `OrgChart.handleUndo/handleRedo` pass the step to `saveHistoryStep()` (`canvasSync.ts`), which sends `diffCanvas(from, to)` (`canvasDiff.ts`, pure) through the same queue: lines and roles removed, roles brought back, changed fields, lines back (same ids), positions.
- **Deleted roles are kept 3 days** (`TRASH_DAYS` in `api/_lib/nodeTrash.ts`, table `deleted_nodes`, migration 0012; cascades with the chart). `DELETE /api/charts/:id/nodes/:nodeId` copies the role, its comments and its lines there, then removes them
  (it now also removes the role's reporting lines; they used to be left dangling). `POST /api/charts/:id/nodes/:nodeId/restore` (editor, plan checks like adding a role, structural: bumps and checks the revision) puts them back; 200 `alreadyThere` if the role exists,
  404 `nothing-to-restore` if there is no copy (the client then creates the role afresh: no comments). A line is restored only if the role at its other end still exists. Nothing else reads the table, so no query needs a "not deleted" filter.
- Expired copies go in the daily `purge-deleted` job and whenever a role in that chart is deleted. **Privacy:** deleted roles, comments and job descriptions live 3 days after delete (the privacy text says so).
- `chartRevision.ts` knows `POST …/nodes/:id/restore` is a structural write (queued, revision header). **Job descriptions (R-38, 2026-11-13):** delete also removes the role's `job_descriptions` rows in the same atomic batch and keeps them in the `deleted_nodes` copy (`DeletedNodeData.jobDescriptions`, optional so older copies still restore); restore re-inserts them. The first save of a JD for a role that is not in the chart is `404 Role not found` (a late autosave cannot orphan one). The daily purge also erases orphans older than a day (`purgeOrphanJobDescriptions`, reported as `orphanJds`); no migration.
- Gotcha fixed: the canvas keyboard-shortcut effect must list `readOnly` in its dependencies, or after a hard reload (page starts view-only) Cmd+Z and Delete stay dead.

### Also shipped 2026-11-13 (R-08, R-09, R-10, R-15)
- **Chart status rule (R-08):** `statusChangeNeedsAdmin(from, to)` in `src/lib/chartStatus.ts`. Entering approved/rejected/live, or leaving approved/live, is admin-only on the server (`PUT` and `POST /api/charts`); editors keep draft, editing, review, archived. A test compares it with `STATUS_ACTIONS` in `statusMeta.tsx`; change both together.
- **Verified identity (R-09):** `POST /api/workspace` ignores any email or name in the body and uses `getUserIdentity()`; `deleteAccount` uses only the person's verified addresses. Never store or act on an email the browser sent.
- **Duplicate chart (R-10):** `POST /api/charts/:id/duplicate` (server-side copy via `captureChart` + `branchSnapshot`). Do not rebuild it from the chart list, which holds counts, not roles.
- **404 (R-15):** `src/lib/routes.ts` has `KNOWN_ROUTES` (must match the `<Route path>`s in `App.tsx`; a test checks) and `pageAccess()`, which `AuthProvider` uses; an unknown URL is open and shows `NotFoundPage`. **Adding a page means adding it to `KNOWN_ROUTES`.**

## Phase 0 security pass (2026-11-05)

See `docs/ROADMAP_TO_PRODUCTION.md` for the full roadmap. Phase 0 added:
- **Server-side roles**: `api/_lib/access.ts` (`requireRole`, `ROLE_RANK`). Every
  mutating route checks the caller's role. viewer/commenter = read-only; editor = content
  (charts, nodes, edges, JDs, templates, headcount, departments, share links, AI);
  admin = members, invites, salary, approvals, chart delete, workspace rename, billing.
  You can only manage or grant roles *below* your own, and nobody can grant `owner`.
- **Salary bands** are redacted from JD responses for non-admins (`api/charts/[id]/jd/[nodeId].ts`).
- **Plan limits are enforced on the server.** The single source of truth is `src/lib/plans.ts`
  (shared with `billingStore`). Going over a limit returns `402 { error: 'plan-limit', limit, max, message }`.
- **AI quota**: `ai_usage` table, atomic per-month claim in `api/ai/draft.ts`. Caps live in `PLAN_LIMITS` (`src/lib/plans.ts`): Starter 3, **Growth 300, Enterprise 1,000** a month (R-07, owner decision D-2: nothing is unlimited); the pricing copy reads them from there. Burst limits: 10/min per workspace and 5/min per person. The free-text `notes` go into the prompt between `<context>` markers. The model is
  configurable via `ANTHROPIC_MODEL`.
- **Validation**: zod schemas in `api/_lib/schemas.ts`, applied via `parseBody()`. Unknown keys are stripped.
- **Rate limiting**: `api/_lib/rateLimit.ts` (Postgres `rate_limits` table, fails open).
- **Share links** only resolve while `charts.isPublic` is true; codes are 16 chars.
- Security headers in `vercel.json` (CSP is Report-Only for now).
- Tests: `api/__tests__/security.test.ts`. Use `seedMember(userId, role)` to test roles.
- Verified against a Neon dev branch with `npm run test:live` (`api/__live__/`).

## Invites (roadmap 1.1, 2026-11-05)

- **Invite link:** each invite email links to `/invite/<token>` (`src/pages/InvitePage.tsx`, public). The token is random. Only its
  SHA-256 is stored (`pending_invites.token_hash`). Links are single-use and expire after 7 days (`api/_lib/inviteTokens.ts`).
- **API:**
  - `GET /api/invites/:token` — public preview.
  - `POST /api/invites/accept` — `{token?}`. Requires a **verified** Clerk email matching the invite (`api/_lib/identity.ts`).
  - `GET`/`POST /api/workspace/invites` — list / create.
  - `POST`/`DELETE /api/workspace/invites/:id` — resend / revoke.
- **Auto-accept on sign-in:** `AuthProvider` accepts a pending invite (token remembered in sessionStorage, else matched by
  email) *before* redirecting to onboarding. It also sets the user's permission from `/api/workspace` (`myPermission`).
- **Several workspaces per user** (roadmap 1.2): accepting an invite adds a membership; the client then switches to that workspace.
- **Tests:** `api/__tests__/invite-accept.test.ts`, `api/__live__/invites.live.test.ts`, `src/pages/__tests__/InvitePage.test.tsx`,
  `SettingsMembers.test.tsx`.

## Multiple workspaces (roadmap 1.2, 2026-11-05)

- **Server:** `requireAuth` reads `X-Workspace-Id` and resolves the caller's membership *in that workspace* (role included).
  Not a member → `403 not-a-member`. No header → the first workspace joined. Every route keeps using `auth.workspaceId`,
  so nothing else needs to know. `GET /api/workspaces` (`requireUser`) lists the user's workspaces with each plan and role.
- **Plans are per workspace.** Limits, features and billing all follow the selected workspace.
- **Client:** `src/lib/workspaceSelection.ts` remembers the choice in `localStorage`. `apiClient` sends the header, and on
  `not-a-member` forgets it and retries once. `switchWorkspace(id)` reloads the app so every store starts clean.
  The switcher is `WorkspaceSwitcher` at the top of the sidebar.
- **Decided (owner): one owned workspace per user.** Other workspaces are joined by invite only; `POST /api/workspace`
  returns the one the user already has. This stops users stacking Free workspaces. Don't change it without asking.
  If it's ever needed: the first workspace can be Free, and every additional one must be paid (create → checkout).

## Paid features (2026-11-05)

`PAID_FEATURES` in `src/lib/plans.ts` is the single list of paid features. Starter unlocks job descriptions,
approval workflows, PDF export, AI drafting and auto-layout. Growth unlocks headcount planning. Each entry has the
tier that unlocks it and the copy saying what it does. The list drives four places:
- **API:** `requireFeature()` in `api/_lib/access.ts` returns `402 { error: 'plan-feature', feature, requiredTier, message }`.
  It guards JD writes, JD approval statuses, chart statuses `review`/`approved`/`rejected`/`live`, and headcount-plan
  writes. Reads stay open, so a workspace that downgrades can still see its JDs and plans.
- **UI:** `usePlanLimits().hasFeature()`, plus `LockedFeatureCard`, `PlanBadge` and `FeatureUpgradeModal` from
  `src/components/ui/FeatureLock.tsx`.
- **Pricing page:** the plan cards.
- **Upgrade modal:** the feature description it shows.

To lock a new feature, add it to `PAID_FEATURES` and guard both the API route and the UI.

## Billing life-cycle (roadmap 1.3 + 1.4, 2026-11-05)

See `docs/BILLING.md`. Summary:
- **Stripe is the source of truth.** `syncSubscription()` in `api/_lib/billing.ts` re-reads the subscription and sets
  `planTier`, `subscriptionStatus`, `planExpiresAt` and `cancelAtPeriodEnd`. The tier comes from the price id, never from metadata.
- `past_due` keeps the plan and shows a banner (`PaymentBanner` in `Layout`). `unpaid` and `canceled` drop to Free. Cancels take effect at the end of the period.
- **Effective plan:** always use `resolvePlanTier()` (trial override plus the lapsed-cancel safety net). `getEffectivePlan()` and `GET /api/workspace` both use it.
- `GET /api/workspace` returns `billing: { status, planExpiresAt, cancelAtPeriodEnd, hasBillingAccount }` and never returns Stripe ids.
  The client keeps it in `useBillingStore().subscription`.
- **Webhook body (R-05):** `api/_lib/rawBody.ts` reads the raw bytes via `req.on('data'|'end')` (what `@vercel/node`'s helper replays); never use `for await` over the request, and `config.api.bodyParser` is a Next.js thing that does nothing here. **A deployed-preview check is still owed** (`docs/BILLING.md`, "Release check"): until it is done assume nothing about production.
- `POST /api/billing/portal` (admin) opens the Customer Portal (`ManageBillingButton`). Checkout sends existing subscribers there.
- **Idempotency:** `stripe_events` dedups webhook deliveries and survives a crash (R-06, `api/_lib/stripeEvents.ts`): a claim is marked `processed_at` when done; an unfinished claim older than 60 s is taken over by the next delivery, a fresh one answers 409.
  A failed-payment email goes to owners and admins on the first attempt only (`emails_sent_at` stops a takeover re-sending it). `syncSubscription` links an unlinked workspace from the subscription's `workspaceId` metadata, so a lost checkout event heals on the next event. `/billing/success` says "Payment received" (not "complete") if the plan has not changed after polling; `VITE_SUPPORT_EMAIL` adds a mailto there.
- **Seats (1.5):** flat tiers with a hard cap (`PLAN_LIMITS[tier].seats`). A seat is a member or a live pending invite (`getSeatUsage()`).
  The cap is checked on invite, on accept and on resending an expired invite. Going over returns `402 plan-limit` with `limit: 'seats'`. Nobody is ever removed.

## Over the limit after a downgrade (roadmap 1.6, 2026-11-05)

Nothing is ever deleted. Tests: `api/__tests__/over-limit.test.ts`, `src/features/billing/__tests__/ChartLimitBanner.test.tsx`.
- **More charts than the plan allows:** every chart is view-only. `requireChartsEditable()` (api/_lib/access.ts) returns
  `402 { error: 'plan-frozen', limit: 'charts', count, max }`. Call it after `requireRole()` on any new chart-content write.
  Allowed while frozen: viewing, deleting a chart, `isPublic: false`, revoking a share link.
- **More roles on a chart than allowed:** only adding is blocked (the existing node-create limit). Edit, move, connect and delete still work.
- **Client:** `useChartLimit()` gives `{ count, max, atLimit, frozen }` from the real chart list. `ChartLimitBanner` sits in `Layout`.
  `CanvasView` and `JDPanel` go read-only when `frozen`.

## No mock data in production (roadmap 1.7 + 1.8, 2026-11-05)

`src/data/mock*` is for tests and dev only. Nothing in `src/pages` or `src/features` may import it.
New-chart content comes from `src/lib/chartTemplates.ts`.

## Import people (roadmap 2.1, 2026-11-06)

- **Flow:** `src/features/import/ImportDialog.tsx` — file → map columns → review (dry run) → import. Opened from the Charts page
  (always a new chart) and the canvas toolbar (add to this chart, or a new chart). Parsing is client-side
  (`src/lib/readSheetFile.ts`: papaparse for CSV, `read-excel-file` for `.xlsx`, loaded on demand). All rules live in the
  pure `src/lib/importOrg.ts` (`guessMapping`, `buildImportPlan`, `buildTemplateCsv`), which is what the tests cover.
- **Rules (owner-decided):** a row needs a name *or* a title; a blank name is an open role (`name = title`, status `open`).
  "Reports to" resolves by **ID column, then email, then full name** (open roles can't be found by name). Errors block the
  whole import: unknown/ambiguous manager, duplicate ID, self-report, loop, plan limit. Warnings don't (missing title, odd date,
  unknown role type, over-long text is shortened). Free to use; plan chart/role limits apply, all or nothing.
- **API:** `POST /api/charts/:id/import` `{ nodes, edges, departments }` (editor, `requireChartsEditable`, node limit; reuses
  same-named departments, remaps ids, drops references outside the payload). A new chart goes through `POST /api/charts`.
  Inserts are chunked (`api/_lib/chunk.ts`) because one statement can't bind more than ~65k parameters.
- **Canvas:** `CanvasView` reloads the chart after an append import; the canvas `key` changes only then, once the *new* data has arrived
  (changing it earlier remounts with stale nodes).
- **Tests:** `src/lib/__tests__/importOrg.test.ts`, `readSheetFile.test.ts` (real `.xlsx` fixture), `ImportDialog.test.tsx`,
  `api/__tests__/import.test.ts`, `tests/e2e/import.spec.ts`.

## Export (roadmap 2.2, 2026-11-06)

- **Chart CSV:** canvas Export menu → "Export as CSV" (free). `buildChartCsv()` in `src/lib/exportOrg.ts`, built in the browser from
  the canvas state. It is also an import file: it writes every column the importer reads, including `X`/`Y` and `Department colour`,
  so export → import keeps the shape. If every imported row has X and Y they are used instead of auto-layout (exact in a new chart;
  moved next to the existing roles when appending). `src/lib/__tests__/exportOrg.test.ts` proves the round trip, including a
  byte-identical second export.
- **Reporting lines come from edges** (what is drawn). `OrgNode.managerId` is only set by the node modal and the importer; the Connect
  tool draws edges and does not update it. A role with several incoming edges exports the first; the toast says how many.
- **CSV safety (`src/lib/csvSafe.ts`):** `toCsv` prefixes text cells that start with `= + - @ \t \r` with `'`, and import calls
  `unguardCell` on every cell. Numbers are not guarded. Files start with a BOM. Use `toCsv`/`downloadText` for any new export.
- **Headcount CSV:** "Export CSV" on the Headcount page writes the plans shown (selected year and chart filter). It is a read, so it
  stays available when editing is locked by plan or role. Open roles without a role type come back from import as "new headcount".

## Edit conflicts (roadmap 2.4, 2026-11-06)

- **Server:** `charts.revision` (new column, migration 0005; separate from the user-visible `version` pill) goes up by one on every
  *structural* edit: node create/edit/delete, edge create/delete, import, chart rename or status change. `claimRevision()` in
  `api/_lib/revision.ts` checks and bumps in one conditional UPDATE and is called last, after validation, role and plan checks. A client
  sends the revision it last saw in `X-Chart-Revision`; a mismatch is `409 { error: 'chart-changed', revision }`. No header means no check
  (scripts, old clients) but it still bumps. Every structural response carries the new `X-Chart-Revision`; `GET /api/charts/:id` returns `revision`.
- **Not counted (owner-decided):** moving boxes (`PUT /nodes`, bulk positions) and turning sharing on/off never conflict and never bump.
- **Client:** `src/lib/chartRevision.ts` + `apiClient`. Structural writes to one chart are sent one at a time (the canvas fires a node and its
  edge back to back, and each needs the revision the previous one returned). On `chart-changed` the chart is flagged, nothing more is sent,
  and `ChartConflictBanner` shows "changed elsewhere, last edit not saved" with Reload; `CanvasView` goes read-only until the reload succeeds.
  Auto-reload-and-replay was rejected for now (belongs with real-time collaboration).
- **Tests:** `api/__tests__/revision.test.ts`, `src/lib/__tests__/chartRevision.test.ts`, `ChartConflictBanner.test.tsx`, `tests/e2e/conflict.spec.ts`.

## Product analytics (roadmap 2.3, 2026-11-06)

- **Owner-decided:** server-side only (no analytics script ever loads in the browser); only for people who clicked **Accept all** in the
  cookie banner; opaque ids only (user id, workspace id as a PostHog group, plan tier, counts; never email, names, chart/role names or salary).
- **Consent plumbing:** `src/lib/consent.ts` reads the banner's choice; `apiClient` adds `X-Analytics-Consent: 1` to every request only after
  "Accept all". The server checks it per request (`hasAnalyticsConsent(req)` in `api/_lib/analytics.ts`). Choosing "Necessary only" later stops it at once.
- **`track(event, {userId, workspaceId, consent, props})`** posts to `${POSTHOG_HOST ?? https://eu.i.posthog.com}/capture/` with plain `fetch` (no SDK), 1.5 s
  timeout, never throws, no-op without `POSTHOG_KEY`. Each milestone has a deterministic event uuid (`eventUuid`), so PostHog dedups repeats.
- **Funnel events (the 7):** `signed_up` (browser calls `POST /api/analytics/signed-up` the first time a signed-in person has no workspace; Clerk owns
  sign-up so this is the earliest the server can see them), `workspace_created` (`POST /api/workspace`), `first_chart_created` (chart count was 0),
  `ten_roles_reached` (a role add or an import takes a chart from <10 to ≥10; template seeding does not count), `invite_sent`, `share_enabled`
  (a share link is created), `upgraded` (Stripe webhook; checkout stores `analyticsUser` in session metadata only with consent, since the webhook has no browser).
- **Env (server, no `VITE_`):** `POSTHOG_KEY` (project API key), optional `POSTHOG_HOST` (US: `https://us.i.posthog.com`). Build the funnel in PostHog on the 7 events in order.
- **Legal:** the `/privacy` cookies section describes this; it still needs the lawyer review.
- **Tests:** `api/__tests__/analytics.test.ts`, `src/lib/__tests__/consent.test.ts`.

## SEO, link previews and branding (roadmap 2.5 + 2.6, 2026-11-06)

- **Page metadata:** `index.html` has a `<!--seo:start-->…<!--seo:end-->` block. `src/lib/seo.ts` (pure, no DOM) renders it. The Vite plugin
  `seoFiles()` in `vite.config.ts` runs after the build and writes one HTML file per public page (`/`, `/pricing/`, `/privacy/`, `/terms/`) with its
  own title, description, canonical and Open Graph/Twitter tags, plus `app.html` (the **noindex** shell every app route is served from),
  `sitemap.xml` and `robots.txt`. It is head-only prerendering (owner-decided): the body is still rendered by React.
- **Site URL:** `siteUrl()` uses `APP_URL`, else `VERCEL_PROJECT_PRODUCTION_URL`, else `VERCEL_URL`, else the `*.vercel.app` default. **Set `APP_URL` to the
  custom domain when there is one** (canonical, `og:url`, `og:image`, sitemap all follow it).
- **OG image:** `public/og-image.png` (1200×630), regenerated from `scripts/og/og.html` with `node scripts/og/make-og.mjs`.
- **robots.txt blocks the app but NOT `/share/`**: Slack/X/LinkedIn bots obey robots.txt and must read the preview. Share pages are kept out of search with `noindex` instead.
- **Rewrites (`vercel.json`):** `/share/:code` → `api/share-page.ts`; everything else that isn't `/api/`, `/assets/` or a file (has a dot) → `/app.html`.
  Real files (`/pricing/index.html`, assets) win first. The function bundles `dist/app.html` (`includeFiles`) and falls back to fetching it from the deployment.
- **Share previews (`api/share-page.ts`):** the chart name and role count only (owner-decided); never people, titles or salaries. Private, revoked, expired,
  unknown, rate-limited and legacy-token links all get the same generic preview. Everything is HTML-escaped (`escapeHtml`). Always `noindex`, `no-store`.
- **`/pricing` is public:** `PricingRoute` shows the plans in the marketing layout (`PublicNav`) to visitors (every CTA → `/sign-up`, no "Current plan") and the in-app
  layout with real checkout to signed-in people. `AuthProvider` treats it as an *optional-auth* page: no sign-in redirect, but a signed-in person's workspace and plan still load.
- **Watermark (2.6):** `showsBranding(tier)` in `src/lib/plans.ts` (Free only). `exportAsPNG(…, { watermark })` draws "Made with StratMap" into the pixels
  (`drawWatermark`). `GET /api/share/:code` returns a `branding` boolean (never the plan); `SharePage` shows the "Made with StratMap" pill only when true (Privacy/Terms stay),
  and passes it to `OrgChart` as `brandExports`. PDF is paid-only and CSV is data, so neither is marked. It is client-side, so it can be bypassed by a determined user.
- **Not verifiable locally:** the Vercel rewrites and `includeFiles` only run on Vercel. After the first deploy: open `/charts/x` directly (should load the app),
  and paste a share link into Slack (should unfurl with the name and role count).
- **Tests:** `src/lib/__tests__/seo.test.ts`, `vercelRewrites.test.ts`, `src/utils/__tests__/export.test.ts`, `src/pages/__tests__/SharePage.test.tsx`, `PricingRoute.test.tsx`,
  `api/__tests__/share-page.test.ts`, `share-branding.test.ts`, `tests/e2e/seo-branding.spec.ts`.

## Onboarding, sample chart and checklist (roadmap 2.7, 2026-11-06)

- **Sample chart (owner-decided: opt-in, marked, easy to delete):** `charts.is_sample` (migration 0006). Created from empty states ("Try a sample chart" on the
  Dashboard and the Charts page) via `createSampleChart()` in `chartStore` (the 5-role `quickstart` template, name `Sample org chart`). Rules, all server-side in
  `POST /api/charts`: a sample is **free and never counts toward the plan's chart limit** (`getChartUsage`, the limit check, `useChartLimit`, `usePlanLimits` and the "n of 1
  chart" label all use `countOwnCharts`), **at most one per workspace** (`409 sample-exists`), and **at most `MAX_SAMPLE_NODES` (20) roles** (`400 sample-too-large`), so it
  can't be used to dodge the plan. Samples never fire `first_chart_created` or `ten_roles_reached`. UI: a "Sample" badge on the card and `SampleChartBanner` on the canvas
  ("This is sample data", delete in two clicks for admins; others are told to ask an admin).
- **Checklist:** `GET /api/workspace/onboarding` (any member) returns `{ steps: { chart, invite, share }, complete, dismissed }`, ticked from real data, never clicks:
  `chart` = a non-sample chart with at least 3 roles (so a template or Quick start chart counts), `invite` = another member or any invite row, `share` = any share link.
  `PUT` (admin) dismisses it for the whole workspace (`workspaces.onboarding_dismissed_at`). `OnboardingChecklist` sits on the Dashboard for people who can edit, and hides
  itself when complete or dismissed.
- **Empty states:** a workspace with no chart sees `DashboardEmpty` (create / import / sample) instead of zero KPIs; the Charts page empty state offers the same three;
  an empty canvas shows `EmptyCanvasCard` (add first role / import). `/charts?new=1` and `/charts?import=1` open those dialogs (used by the empty Dashboard).
- **Tests:** `api/__tests__/onboarding.test.ts`, `src/features/onboarding/__tests__/onboarding.test.tsx`, additions to `ChartView.test.tsx`, `tests/e2e/onboarding.spec.ts`.

## Mobile (roadmap 2.8, 2026-11-06)

- **Phone = under 768px** (`useIsPhone()` / `PHONE_QUERY` in `src/hooks/useMediaQuery.ts`; false when `matchMedia` is missing, e.g. jsdom — tests use `src/test/matchMedia.ts`).
  All styling is inline, so responsive pages branch on `useIsPhone()`, not CSS media queries.
- **Drawer:** on a phone `Layout` drops the sidebar; `TopNav` shows a menu button that opens `Sidebar drawer` (always full labels) over a backdrop. It closes on navigation, backdrop,
  Escape and when the screen grows. `uiStore.mobileNavOpen`. Pages that are built for desktops (`/roles`, `/headcount`, `/settings`) show a dismissible `DesktopHint`.
- **Canvas (owner-decided: phones view-only, tablets can edit):** `CanvasView` forces `readOnly` on a phone and says so ("View only on phones"); from 768px up editing is unchanged.
  The header sits above the canvas on phones instead of floating over the toolbar, and the conflict/sample banners go in flow. One finger on empty canvas pans (touch or any read-only
  canvas, no Pan tool needed) and two fingers pinch-zoom (`src/features/canvas/pinch.ts`, pure and tested; pointers are tracked in the capture phase so it works over nodes).
  The container has `touch-action: none`. **Bug fixed on the way:** the first fit-to-view ran with a default 1100×600 size before the real size was measured, which put the chart
  off-screen on a phone; it now waits for the first `ResizeObserver` measurement.
- **Share page** on a phone: title above, footer below, canvas between (nothing floats over the chart). **Dashboard** KPIs go 2-up and the sections stack; **Charts** library
  and search fit. Roles, Headcount and Settings only scroll (not reflowed).
- **Tests:** `src/hooks/__tests__/useMediaQuery.test.tsx`, `src/components/layout/__tests__/Layout.test.tsx`, `src/features/canvas/__tests__/pinch.test.ts`,
  `src/pages/__tests__/CanvasView.test.tsx`, phone cases in `SharePage.test.tsx`, `tests/e2e/mobile.spec.ts` (real touch pan and pinch through CDP, no sideways scroll, tablet keeps editing).

## Performance on big charts (roadmap 3.4, 2026-11-06)

- **Measured** with `tests/e2e/performance.spec.ts` (builds a 1,000-role chart through the API on an Enterprise workspace via `setPlanFor()` in `tests/e2e/helpers.ts`, then
  measures in a real browser; the numbers are printed as `[perf] …`). Before: opens in 2.5 s with all 1,000 cards in the DOM, dragging p95 frame 167 ms (worst 367 ms, about 6 fps).
  After, same machine: opens in about 1.6 to 2.1 s (mostly the fetch from the remote Neon database), dragging p95 16.8 ms at the zoomed-out view and 16.7 ms zoomed in (60 fps).
- **Canvas** (`src/features/canvas/viewport.ts`, pure and tested): above 300 roles (`VIRTUALIZE_ABOVE`) only roles whose card is near the screen are rendered
  (`visibleNodeIds`, with a 240 px margin so panning never shows a blank edge), and a reporting line is drawn when its bounding box touches the view (`edgeInView`, so a long line
  that crosses the screen between two off-screen roles still shows). Below 40% zoom (`CHIP_BELOW_SCALE`) a big chart draws `NodeChip` (one empty element, coloured by department) and
  `EdgeLine` (a plain path) instead of full cards, because a card is a few unreadable pixels there. The selected and connecting role are always rendered. **Exports render everything**
  (`exportOverflow`). `NodeChip` and `EdgeLine` are memoised with id-taking handlers, so a drag re-renders one chip and its lines, not all of them. The minimap's dots are memoised too.
- **Fewer saves:** a drag sends only the roles that moved (`movedPositions` against `syncedPositions`, updated after each successful save), not the whole chart.
- **Server:** `PUT /api/charts/:id/nodes` (bulk positions) is one `UPDATE … FROM (VALUES …)` scoped to the chart, instead of one UPDATE per role. Ids are still validated
  (safe charset), ids from another chart match nothing, and it does not bump `revision`. Note: **a single multi-thousand-row INSERT breaks the in-memory test database**
  (about 15 bound parameters per node row, 65k limit): use `chunk()` from `api/_lib/chunk.ts`, as the import route does.
- **Small fixes on the way:** the zoom buttons now have accessible names ("Zoom in", "Zoom out", "Fit to view"); `NodeCard` has `data-testid="node-card"`.
- **Tests:** `src/features/canvas/__tests__/viewport.test.ts`, `api/__tests__/positions.test.ts`, `tests/e2e/performance.spec.ts` (bounds are loose for CI: open under 6 s, drag p95 under 120 ms).

## Monitoring (roadmap 3.9, 2026-11-06)

- **`GET /api/health`** (`api/health.ts`): public and read-only; 200 `{status:'ok'}` when the database answers `select 1`, 503 `{status:'degraded'}` when it errors or takes over 3 s. It never
  says why (the reason goes to the logs as `[health] database check failed: …`). `HEAD` works. Tests: `api/__tests__/health.test.ts`, `tests/e2e/health.spec.ts`.
- **`docs/MONITORING.md`** is the owner's step-by-step: Sentry DSNs (`VITE_SENTRY_DSN` is build-time) and alert rules, two uptime monitors (`/` and `/api/health`), a status page, Stripe
  webhook failure emails, how to prove an alert reaches a phone, and a runbook for a red health check. Each health check wakes Neon's compute, so poll every 3 to 5 minutes, not seconds.
- The uptime monitors, alert channels and status page are **dashboard actions**, not code.

## Consent and AI disclosure (roadmap 4.5 + 4.3, 2026-11-06)

- **Nothing third-party loads before the cookie banner is answered.** Fonts are bundled (`@fontsource-variable/dm-sans`, `@fontsource/jetbrains-mono`, imported in
  `src/styles/fonts.css`; the family is `'DM Sans Variable'`, JetBrains Mono keeps its name), so there is no request to Google Fonts and the CSP no longer allows it. Do not add a
  CDN stylesheet, script or font to `index.html` or the CSS. `src/lib/__tests__/monitoring.test.ts` fails if one appears.
- **Sentry (`src/lib/monitoring.ts`):** crash reports go to everyone (running the service), but `sendDefaultPii: false` and only the error integrations are installed: no Replay, tracing or
  feedback. If replay is ever added, start it only after `hasAnalyticsConsent()`. Analytics is server-side and already consent-gated (2.3).
- **AI disclosure (4.3):** the AI draft panel says the role title, department, tone and notes go to Anthropic and nothing else (no names, emails, salaries). `api/__tests__/ai-draft.test.ts` proves
  the prompt holds only those fields; keep it that way if the prompt changes, and update the disclosure text with it.

## Audit log (roadmap 4.4, 2026-11-06)

- **Table `audit_log`** (migration 0007, append-only, cascades with the workspace): `actor_user_id`, `action`, `target_type`, `target_id`, small `details` jsonb, `created_at`.
  Write with `logAudit()` from `api/_lib/audit.ts`, **after** the change succeeded. It is best-effort: a failed write is logged to the server console and never fails the action.
  A refused or no-op change logs nothing.
- **Recorded:** `member.joined` (invite accepted; the joiner is the actor), `member.role_changed`, `member.removed`, `invite.sent` / `resent` / `revoked`, `share.link_created` /
  `link_revoked`, `share.public_on` / `public_off` (only when the value actually changes), `salary.updated`. To log a new kind of event add it to `AuditAction`, call `logAudit`, and add a line
  in `src/lib/auditText.ts`.
- **Owner-decided: never salary amounts.** `salary.updated` stores only the role title and which parts changed (`changed: 'salaryBandMin,salaryBandMax'`). `details` must never hold amounts,
  invite tokens or other secrets; `api/__tests__/audit.test.ts` checks both. Emails (member/invitee) are stored in `details` because the member row is gone after a removal.
- **Reading:** `GET /api/workspace/audit?limit&before` (owner/admin, newest first, `nextBefore` cursor, readable on every plan). `?format=csv` needs the Enterprise feature `audit-export`
  (in `PAID_FEATURES`; 402 `plan-feature` otherwise) and goes through `toCsv` (formula-safe). Actors are resolved from current members; someone who left shows as "A former member".
- **UI:** Settings → **Activity** tab, shown to owner/admin only (`ActivityTab`). Non-Enterprise plans see a `LockedFeatureCard` instead of the export button. `api.getText()` is the client helper for text downloads.
- **Also:** the pure CSV functions moved to `src/lib/csvText.ts` (no browser types, so `api/` can import them); `csvSafe.ts` re-exports them and keeps `downloadText`.
- **Not logged yet:** workspace rename, chart delete, billing changes, anything in 4.2 (workspace/account deletion should log when it is built).
- **Tests:** `api/__tests__/audit.test.ts`, `src/lib/__tests__/auditText.test.ts`, `src/features/audit/__tests__/ActivityTab.test.tsx`, `tests/e2e/audit.spec.ts`.

## Data rights (roadmap 4.2, 2026-11-06)

All rules live in `api/_lib/workspaceLifecycle.ts`; tests are `api/__tests__/data-rights.test.ts` (auth mocked) and `data-rights-auth.test.ts` (**real** `requireAuth`, which is what proves the hiding).
- **Delete workspace = soft delete (owner-decided).** `DELETE /api/workspace {confirmName}` (owner only, name must match exactly) sets `workspaces.deletedAt/deletedBy` (migration 0008), cancels the Stripe
  subscription **first** (if Stripe fails the call is a 502 and nothing is deleted, so a deleted workspace is never still billed), puts the plan on Free, drops pending invites, logs `workspace.deleted`
  and emails every member (`sendWorkspaceDeleted`). `resolveWorkspace` in `api/_lib/auth.ts` joins on `deletedAt IS NULL`, so **every** route stops seeing it at once; the public share routes
  (`api/share/[code].ts`, `api/share-page.ts`) check it too. A new route that reads workspaces without going through `requireAuth` must check `deletedAt` itself.
- **Restore:** `POST /api/workspace/restore {workspaceId}` (`requireUser`; only the owner, within `RESTORE_DAYS` = 30, and refused with 409 `owns-another-workspace` if they own a live one: one owned workspace per user).
  It comes back on Free (the subscription is gone). `GET /api/workspaces` returns `deleted: [{id,name,eraseOn}]` for the owner; `DeletedWorkspaceNotice` shows it on onboarding and in Settings → General.
  Owners may create a new workspace straight after deleting (the create guard in `POST /api/workspace` ignores deleted ones).
- **Purge:** `GET /api/cron/purge-deleted` (Vercel cron, daily 03:17 UTC, `vercel.json` "crons"; it also erases expired deleted-role copies, R-02) needs `Authorization: Bearer $CRON_SECRET`; **without `CRON_SECRET` set it returns 503 and does nothing**. It deletes workspaces deleted more
  than 30 days ago; every table cascades from `workspaces`, and a test proves no row is left. When you add a table with a `workspace_id`, give it `onDelete: 'cascade'` and add it to the purge test's `seedEverything`.
- **Account deletion:** `DELETE /api/account {confirm:'DELETE'}` (`requireUser`). **Owner-decided: an owned workspace is deleted with the account** (soft delete, members emailed). Their memberships elsewhere are removed
  (logged as `member.left`, with no personal data), their email is removed from every audit log row, pending invites to their email are deleted, then the Clerk user is deleted **last** (`deleteUserAccount` in
  `api/_lib/identity.ts`; a failure is a 502 and a retry finishes the job). Known consequence: the owner can no longer sign in, so they cannot restore a workspace deleted this way; it is erased after 30 days.
  Authored-content ids (`charts.ownerId`, `updatedBy`) are opaque ids and stay; PostHog and Stripe's own records (invoices) are not touched.
- **Export:** `GET /api/workspace/export` (owner/admin, free, 10 per hour per workspace) is one JSON file (workspace, members, invites, departments, charts with roles/lines/JDs incl. salary bands, templates, headcount plans,
  activity log; **never** Stripe ids, invite token hashes or share codes). `?format=csv` is every role of every chart in the importer's column layout plus a leading `Chart` column, with IDs prefixed by the chart's position so
  they stay unique (`buildWorkspaceRolesCsv` in `src/lib/exportOrg.ts`). Each export is logged as `workspace.exported`.
- **Member removal** was already immediate (membership is looked up on every request); `data-rights-auth.test.ts` now proves it.
- **UI:** `DataRightsSection` (Settings → General): export buttons for admins, "Delete workspace" for the owner (type the name), "Delete my account" for everyone (type DELETE). `useSignOut` is the shared sign-out hook (TopNav uses it too).
- **Owner action:** set `CRON_SECRET` in Vercel (any long random string) or the purge never runs and deleted workspaces are kept forever.
- **Not built:** "leave this workspace" for a member who keeps their account; ownership transfer.

## Headcount cost modelling (roadmap 5, 2026-11-06)

Salary range per planned hire → budget by quarter. Part of Growth-plan headcount planning (no new `PAID_FEATURES` entry). Owner decisions are the comments at the top of `src/lib/headcountBudget.ts`:
- **Cost source:** `headcount_plans.salary_min / salary_max / salary_currency` (migration 0009, whole units per year, 3-letter code). A plan without them is "no cost yet": listed under the budget and left out of the totals.
- **Timing:** a hire starts at the **start** of its target quarter and costs ¼ of the yearly pay in that quarter and every later quarter *of that year* (Q2 hire → Q2+Q3+Q4 = ¾). The full-year **run-rate** is shown too.
  Expected = middle of the range (one bound alone counts as both). The budget covers hires *targeted in the chosen year*; earlier years are **not** carried over (so next year's view understates payroll for hires made this year).
- **Currency:** totals per currency, never converted (`USD 90,000` and `GBP 80,000` are separate tables).
- **Access:** owner/admin only, same rule as job-description salary bands. `GET /api/headcount` leaves the three fields out entirely (not even null) for editors/viewers; creating or editing a salary as an editor is `403 forbidden`;
  the PUT/POST replies are redacted too. Editors still manage the plans themselves. Planned, approved and filled hires all count (the board's year and chart filter apply).
- **Server:** zod rejects a min above max, negatives, fractions, > 100,000,000, and a currency that is not 3 letters (upper-cased); a PUT that sends only one bound is checked against the stored value. Salary changes are logged as
  `headcount.salary_updated` (plan title and *which* fields changed, never amounts). The workspace export (owner/admin) includes the salaries.
- **UI:** `BudgetPanel` (`src/features/headcount/`) above the board for admins, with a "Budget CSV" (`buildBudgetCsv`); salary fields in `HireForm` for admins only (the last currency is remembered in localStorage); the range on each card.
  The existing headcount CSV does **not** include salaries.
- **Tests:** `src/lib/__tests__/headcountBudget.test.ts`, `api/__tests__/headcount-salary.test.ts`, `src/pages/__tests__/HeadcountBudget.test.tsx`, `tests/e2e/headcount-budget.spec.ts` (includes an invited editor who never receives the fields).

## Comments on roles (roadmap 5, 2026-11-07)

Discussion threads on a role (a node), in a **Comments** tab of the role's side panel. Owner decisions are below; tests are `api/__tests__/comments.test.ts` (44), `src/lib/__tests__/comments.test.ts`, `src/features/comments/__tests__/`,
`src/features/panel/__tests__/JDPanelComments.test.tsx`, `src/pages/__tests__/SettingsNotifications.test.tsx` and `tests/e2e/comments.spec.ts` (owner + commenter + viewer, with the real emails).
- **Free on every plan** (no `PAID_FEATURES` entry). This is what the `commenter` role finally does: **commenter and above can write; every member (viewers too) can read.** (The Phase 0 note "viewer/commenter = read-only" no longer holds for comments only.)
- **Tables (migration 0010):** `role_comments` (workspace, chart and role all cascade, so comments go with them; `parent_id` self-references; `mentions text[]` of member ids; `deleted_at`, `resolved_at/by`) and `user_notification_prefs`
  (per person, not per workspace: `comment_emails`, default on, no row = default).
- **API:** `GET /api/charts/:id/comments?nodeId=` (a role's comments, oldest first) and `?counts=1` (open threads per role for the canvas badges); `POST` `{nodeId, body, parentId?, mentions?}` (rate limited, 30/min/user);
  `PUT /…/comments/:commentId` `{body}` (**author only**: not even an owner can rewrite someone's words) **or** `{resolved}` (any commenter+, top-level only); `DELETE` (author always, even if later moved to read-only; owner/admin any).
  `GET`/`PUT /api/notifications` `{comments: boolean}` for the email switch.
- **Threads:** one level of replies (a reply to a reply is a 400). Only top-level comments resolve; a reply to a resolved thread **reopens** it. Deleting a comment that has replies keeps a **"deleted" shell** (text really cleared); when its last
  reply goes the shell goes too; otherwise the row is removed. Max 2000 characters. Comments are discussion, not content: they **never bump `charts.revision`** and still work on a chart that is view-only because of the plan.
- **Mentions:** the client sends member ids it picked from the `@` list (`src/lib/comments.ts`: `activeMentionQuery`, `mentionIds`); the server **keeps only real members of the workspace**, never the author, once each. A name typed without picking is not a mention.
- **Email (owner-decided: mentions and replies):** `notifyAboutComment()` in `api/_lib/comments.ts` emails whoever is @mentioned and the author of the comment replied to; never the author, never a non-member, never someone who switched it off in
  Settings → Notifications, and **once per person** (a mention wins over a reply). An edit emails only people *newly* mentioned. Best-effort: a failed email never fails the comment. The comment text is HTML-escaped. The link is
  `/charts/<id>?role=<nodeId>&tab=comments`; `OrgChart` reads it once on mount (`src/features/comments/deepLink.ts`), selects the role and opens the tab.
- **UI:** `CommentsTab` (compose with `@` picker, reply, resolve/reopen, edit, delete with a confirm, resolved threads folded away). A failed post/reply/edit **keeps the text**. A small count badge on the role card (`NodeCard commentCount`, left out of
  PNG exports via `data-export-ignore`) comes from `CanvasView`, which refetches it when a comment changes. The panel is now 380px (was 320) so four tabs fit. Public share pages have no comments (no `commentCounts`, so no tab).
- **Settings → Notifications:** only **New comments** is real now (saved per person). The other three switches (approvals, JD status, invitations) are still pictures that send no email; remove or wire them before advertising them.
- **Data rights:** the workspace export includes `comments`; deleting an account removes the person's `user_notification_prefs` row but their comments stay with the workspace under an opaque id (the UI shows "A former member"); the purge test covers `role_comments`.
- **Not built:** comments on a whole chart, attachments, reactions, an in-app inbox/notification bell, per-chart mute, and comment emails for chart-level discussion.

## Small follow-ups (2026-11-10)

- **Leave a workspace:** `POST /api/workspace/leave` (any non-owner member; owner gets `403 owner-cannot-leave`; logs `member.left` with the role only). UI: Settings → General → "Leave workspace…" (`DataRightsSection`). Ownership transfer is still not built.
- **Budget across years:** `buildBudget(plans, year, { carryOver })`. A checkbox in `BudgetPanel` ("Include hires from earlier years (a full year each)") counts hires targeted in earlier years as a full year. Off by default (the original owner rule).
- **Notifications tab:** only the real "New comments" switch remains; the three fake switches were removed.

## Version history and scenarios (Phase 5, 2026-11-10)

Growth feature (`'version-history'` in `PAID_FEATURES`). Tests: `api/__tests__/snapshots.test.ts`, `src/lib/__tests__/snapshotDiff.test.ts`, `src/features/history/__tests__/HistoryPanel.test.tsx`, `src/features/canvas/__tests__/OrgChartReadOnly.test.tsx`, `tests/e2e/history.spec.ts`.
- **Table `chart_snapshots`** (migration 0011, cascades with workspace and chart): `name`, `kind` (`manual`|`auto`), `created_by`, `node_count`, `edge_count`, `data` jsonb (`SnapshotData`: roles, reporting lines, departments only; **never comments or job descriptions**, so a restore cannot lose a discussion or a JD).
- **API:** `GET/POST /api/charts/:id/snapshots` (list has no data; POST = editor + feature, rate limited 20/min, max 50 manual → `409 snapshot-limit`), `GET/DELETE .../snapshots/:snapshotId` (delete = author or admin; **deleting needs no feature**, so a downgraded workspace can tidy up and can still read), `POST .../restore` and `POST .../branch` (editor + feature + `requireChartsEditable`; node-limit and, for branch, chart-limit checks → 402).
- **Restore** is a diff, not a wipe: roles in the version are upserted (same id keeps its comments and JD), roles not in it are deleted, lines and departments are replaced, all in one atomic batch (`runAtomically` in `api/_lib/atomic.ts` uses `db.batch` on Neon, `transaction` on PGlite). It first takes an **automatic** version ("Before restoring “name”", the newest 20 are kept), so a restore is always undoable by restoring that. It claims the chart revision (a stale `X-Chart-Revision` is a 409 `chart-changed`) and logs `chart.restored`.
- **Branch** (scenario): creates a new chart (fresh ids) from a version, default name `<chart> (<version>)`; logs `chart.branched`. Compare in the UI is a pure `diffSnapshots` (added, removed, changed fields, headcount by department) between two versions or a version and today.
- **UI:** History button in the canvas toolbar (`HistoryPanel`). Viewers can open it and compare but not save/restore (server agrees). Non-Growth workspaces see `LockedFeatureCard`.
- **Bug fixed on the way:** on a read-only canvas the pan handler captured the pointer on mouse-down and swallowed clicks on toolbar buttons (viewers could not open Export or History). `handleCanvasPointerDown` now ignores presses on buttons, links, inputs, dialogs, `[data-export-ignore]` and `[data-canvas-overlay]`.
- **Not built:** automatic versions on a schedule, version-to-version merge, per-role history, restoring comments/JDs.

## Embeds (Phase 5, 2026-11-10)

- **`/embed/:code`** (`src/pages/EmbedPage.tsx`, public route) shows a shared chart read-only, with no toolbar. It uses the same public share code, so turning sharing off or revoking the link empties every embed ("This chart is no longer shared"). Short codes only (never legacy URL tokens). The "Made with StratMap" pill shows on Free only, like share pages.
- **Framing:** `vercel.json` now has two header blocks. Everything except `/embed/*` keeps `X-Frame-Options: DENY` and `frame-ancestors 'none'` (source `/((?!embed/).*)`); `/embed/*` drops X-Frame-Options, uses `frame-ancestors *` and adds `X-Robots-Tag: noindex`. `src/lib/__tests__/vercelRewrites.test.ts` checks both sides. **Not verifiable locally** (headers only run on Vercel): after deploy, embed a chart in a Notion page and check `/share/x` still refuses to be framed.
- **UI:** Share settings has "Copy embed code" (an `<iframe>` snippet) once a chart is public.
- **Not built:** Slack integration (needs a Slack app), per-embed settings (theme, hide names).

## Migrations (roadmap 3.2, 2026-11-05)

Schema changes are versioned SQL in `drizzle/`, and production deploys apply them automatically
(`vercel.json` buildCommand → `npm run vercel-build` → build, then `scripts/migrate.mjs --deploy`).
Workflow: edit `src/lib/db/schema.ts` → `npm run db:generate` → review and commit the SQL.
**Never `drizzle-kit push` against production.**

**CI (roadmap 3.1):** `.github/workflows/ci.yml` runs `typecheck` (app + `api/` via `tsconfig.api.json`),
lint, `test:run`, `test:api` and build on every PR and push to `main`. Run them locally before pushing. Migrations must be additive (expand/contract),
because they run while the old code is still live. Full details are in `docs/MIGRATIONS.md`.

---

## Repository Access

✅ **SSH is configured and working.** All git operations (push, pull, commit) work automatically without tokens or credential sharing. Your SSH private key is on your local machine at `~/.ssh/`; git uses it automatically.

Use standard git commands:
```bash
git status
git add .
git commit -m "message"
git push
git pull
```

---

## Project Structure

```
src/
├── components/       # Reusable UI components
├── data/            # Mock data (mockOrg, mockNodes, mockJDs)
├── features/        # Feature-specific code
│   ├── auth/        # Clerk + dev-bypass auth
│   ├── billing/     # CheckoutButton (Stripe)
│   ├── canvas/      # Org chart canvas (OrgChart.tsx, useCanvasState.ts)
│   ├── jd/          # JD editor + AI drafting (JDEditor, AIJDDraft)
│   ├── nodes/       # Node card + modal (NodeCard, NodeModal)
│   └── panel/       # JD slide-out panel (JDPanel.tsx)
├── hooks/           # usePermission, usePlanLimits
├── pages/           # Page components (Dashboard, ChartView, CanvasView, etc.)
├── store/           # Zustand stores (chartStore, billingStore, jobDescriptionStore, templateStore, etc.)
├── styles/          # Global CSS (globals.css with CSS custom properties for theming)
├── types/           # TypeScript types (chart.ts, user.ts, jd.ts)
├── utils/           # layout.ts (auto-layout algorithm)
├── App.tsx          # Router setup
└── main.tsx         # Entry point
```

---

## Key Technologies

- **React 18** + **TypeScript** (strict mode)
- **Vite** + **vitest/config** (dev server, build, tests)
- **React Router v6** (navigation)
- **Zustand** (state management, localStorage persistence)
- **Tailwind CSS** + `@tailwindcss/vite` (styling)
- **CSS custom properties** (theming: dark by default, light mode via `data-theme='light'`)
- **Lucide React** (icons)
- **TipTap 3** (rich text editor)
- **Clerk** (auth) + dev-bypass mode (no Clerk key needed in dev)
- **Anthropic SDK** (AI JD drafting — server-side via `api/ai/draft.ts`; requires `ANTHROPIC_API_KEY` in `.env.local`/Vercel env. Never use a `VITE_` prefix — that would bundle the key into the public client.)
- **Vercel Serverless Functions** (`api/` directory, `@vercel/node`)
- **Neon Postgres** (`@neondatabase/serverless`) + **Drizzle ORM** (`drizzle-orm`, `drizzle-kit`)
- **PGlite** (`@electric-sql/pglite`) — in-process Postgres for backend tests

---

## What's Complete (Sprints 1–8 + Backend Phase 2)

### Sprints 1–2: Canvas + Node Management ✅
- Draggable nodes, SVG edges, zoom/pan, minimap, fit-to-view
- Add/Edit/Delete node modals with full form
- Connect tool (2-click edge drawing), edge deletion
- Undo/redo history (Cmd+Z / Cmd+Shift+Z)
- Edge guards: self-connections, duplicates, circular reporting
- Status badges (OPEN, PLANNED, BACKFILL) + ★ NEW badge
- Department colour coding
- Spotlight search (Cmd+K): people, charts, pages
- Chart creation with templates (Blank, Startup, Scale-up, Hiring plan)

### Sprint 3: Auth + Workspace + Permissions ✅
- Clerk integration with dev-bypass mode (`IS_DEV_BYPASS` auto-detected)
- Onboarding: 2-step flow (workspace + invite up to 5 members)
- Quick-start option: creates 5-node starter chart directly from onboarding
- Permission gating: 5-tier hierarchy (owner > admin > editor > commenter > viewer)
- Dev tools: `__devTools.setPermission(role)` in browser console

### Sprint 4: Billing + Limits + Pricing ✅
- Billing store (Zustand): Free/Starter/Growth/Enterprise tiers
- `usePlanLimits` hook: chart/node/seat limits, feature gates, `upgradeRequired(feature)`
- UpgradeModal: tier comparison, pricing, navigates to /pricing
- Pricing page (/pricing): plan cards, monthly/annual toggle, FAQ, enterprise CTA. Only advertise features that exist (roadmap 1.7).
- Checkout flow (demo-ready): Stripe Payment Link compatible
- Dev tools: `__devTools.setPlan('free'|'starter'|'growth')` in browser console

### Sprint 5: JD Editor with Rich Text ✅
- JDEditor (TipTap): Bold, Italic, H2, H3, BulletList, OrderedList, auto-save (1s debounce)
- jobDescriptionStore: per-node JD state, version bumping, localStorage persistence
- Full approval workflow: draft → in-review → approved → published → hired
- Status badge + version display (v1, v2…) in JD panel

### Sprint 8: PNG/PDF Export + Bug Fixes ✅ (2026-05-15)
- **Export**: Download icon in canvas toolbar → dropdown (Export as PNG / Export as PDF)
  - `src/utils/export.ts`: `html-to-image` (SVG foreignObject) + `jsPDF`
  - Before capture: `scale=1` + `overflow:visible` set via React state (not DOM mutation) — avoids ResizeObserver → fitToView override
  - UI chrome excluded via `data-export-ignore` on toolbar, minimap, zoom controls, panels, modals
  - `chartName` prop on OrgChart used as filename slug
- **Q3 Hiring Plan**: populated 31 nodes/30 edges in mock data (was `nodes:[]`, causing blank canvas)
- **NodeModal scroll**: `onWheel={e.stopPropagation()}` on scroll container — canvas non-passive wheel listener was intercepting modal scroll

### Sprint 6: AI JD Drafting + Template Library ✅ Code Complete, ⚠️ Not E2E Tested
- AIJDDraft: Anthropic streaming (claude-sonnet-4-6), tone selector, ghostPulse animation, cancel support
- Dev session limit: 10 AI drafts/session via `sessionStorage` (prevents token burn)
- templateStore: CRUD with localStorage, seeded from mockRoleTemplates
- RolesView: full template management UI (create/edit/duplicate/delete)
- JDPanel: inline template picker + AI draft button gated by plan tier
- **⚠️ Requires `ANTHROPIC_API_KEY=sk-ant-...` (server-side, no `VITE_` prefix) in `.env.local` for AI drafting to work**
- User has Anthropic account + $21 payment — verify billing balance at console.anthropic.com before testing

### Sprint 7: Auto-layout + Role Types + Launch Polish ✅
- **Auto-layout** (`src/utils/layout.ts`): Reingold-Tilford hierarchical algorithm
  - 120px vertical gap, 260px center-to-center horizontal, subtrees centred
  - Handles multiple roots, circular refs, isolated nodes
  - LayoutGrid toolbar button: locked for Free (UpgradeModal), Starter+ runs layout + fit + toast
  - 80% node warning: amber banner when free-tier node count ≥ 80% of limit
- **Role types**: `RoleType = 'existing' | 'new-headcount' | 'backfill' | 'contractor' | 'tbd'`
  - NodeModal: role type segmented selector (5 options with colour dots)
  - NodeCard: pill badge row for non-existing types (NEW HC, BACKFILL, CONTRACT, TBD)
  - JDPanel Overview: "Role type" field in key-value list
  - Dashboard: "By role type" breakdown with coloured pill counts
- **Page titles**: `document.title` set on all main pages (Dashboard, ChartView, CanvasView dynamic, RolesView, PricingPage, OnboardingPage)

### Backend Phase 2: API + Auth + Persistence ✅ (2026-05-19)
- Vercel Serverless API: `api/workspace.ts`, `api/charts/index.ts`, `api/charts/[id].ts`, nodes, edges, JD
- `api/_lib/auth.ts` — `requireAuth` (JWT + workspace lookup) + `requireUser` (JWT only, for onboarding)
- Dev bypass: absent `CLERK_SECRET_KEY` or `x-dev-user: true` header → `u-dev`/`ws-dev` identity
- `src/lib/apiClient.ts` — typed fetch wrapper (Clerk Bearer token or dev bypass header)
- All stores and pages wired to real API — data persists across reloads
- SPA routing: Vercel `rewrites` in `vercel.json` (see "SEO, previews and branding"); the old `public/404.html` redirect hack is gone
- 111 backend tests using PGlite (`npm run test:api`)
- Schema: `src/lib/db/schema.ts`; migrations in `drizzle/` (see `docs/MIGRATIONS.md`)
  - Tables: workspaces, workspaceMembers, pendingInvites, workspaceDepartments, charts, departments, nodes, edges, jobDescriptions, roleTemplates, headcountPlans, **sharedLinks** (new)
  - `charts` table has `isPublic boolean NOT NULL DEFAULT false` (new)

**Key files:**
- `src/utils/layout.ts` — auto-layout algorithm
- `src/types/chart.ts` — OrgNode, RoleType, OrgChart (inc. `isPublic`), all chart types
- `src/features/canvas/OrgChart.tsx` — main canvas (toolbar incl. `ShareSettingsBtn`, modals, JD panel)
- `src/features/canvas/useCanvasState.ts` — canvas state + history + applyLayout
- `src/features/nodes/NodeCard.tsx` — node card with role type badges
- `src/features/nodes/NodeModal.tsx` — add/edit modal with role type selector
- `src/features/panel/JDPanel.tsx` — JD panel with template picker, AI draft, editable salary band
- `src/features/jd/AIJDDraft.tsx` — AI draft UI; streams from `/api/ai/draft` (no SDK in the browser)
- `api/ai/draft.ts` — server-side Anthropic streaming route (plan-gated, reads `ANTHROPIC_API_KEY`)
- `src/store/chartStore.ts` — chart CRUD + `updateChartPublic(id, isPublic)`
- `src/store/templateStore.ts` — template CRUD + seeding
- `src/store/billingStore.ts` — plan tier + usage + AI draft limits
- `src/hooks/usePlanLimits.ts` — feature gates + upgrade detection
- `src/pages/Dashboard.tsx` — dashboard with API-backed role type breakdown
- `src/pages/SharePage.tsx` — public share view; detects short codes vs legacy URL tokens
- `api/charts/[id]/share.ts` — POST (create link), DELETE (revoke)
- `api/share/[code].ts` — GET (public, no auth) returns chart snapshot
- `src/pages/PricingPage.tsx` — pricing cards + FAQ
- `src/lib/chartTemplates.ts` — new-chart templates (Startup, Scale-up, Hiring plan, onboarding quick start)
- `api/roles/search.ts` — role search across the workspace's charts (Roles → Find roles)
- `src/pages/OnboardingPage.tsx` — 2-step onboarding + quick-start chart

---

## What's Not Done (Next Priorities)

1. ~~**JD store API sync**~~ ✅ Done (2026-05-20)
2. ~~**Template store API sync**~~ ✅ Done (2026-05-20)
3. **Sprint 6 end-to-end verification** — verify Anthropic billing, add `ANTHROPIC_API_KEY` (server-side) to Vercel env, test AI drafting in production
4. ~~**Share Link (basic)**~~ ✅ Done (2026-05-20) — URL-encoded snapshot via `src/utils/shareLink.ts` + `/share/:token` route + `SharePage.tsx`
5. **Stripe webhooks** — handle payment completion + automatic plan upgrade [Phase 1 launch gate]
6. ~~**Filter tool**~~ ✅ Done (2026-05-20) — dept/status/role-type filter panel with opacity dimming on canvas
7. ~~**Salary band**~~ ✅ Done (2026-05-20) — editable min/max/currency inputs for admin/owner in JDPanel OverviewTab; locked for others
8. ~~**Headcount forecasting**~~ ✅ Done (2026-05-20) — full kanban HeadcountView, workspace departments, API routes, stores, 111 backend tests total
9. ~~**Dashboard KPIs**~~ ✅ Done (2026-05-20) — `roleTypeBreakdown` from stats API; RoleTypeBreakdown widget reads live data
10. ~~**Share Settings Panel**~~ ✅ Done (2026-05-20) — `ShareSettingsBtn` in toolbar, Private/Public toggle, blue icon when public, `isPublic` column on charts
11. ~~**Live Shared Links**~~ ✅ Done (2026-05-20) — `shared_links` table, `api/charts/[id]/share.ts`, `api/share/[code].ts`, SharePage detects short codes vs legacy tokens

---

## Commercial Launch Roadmap

**Direction:** Go straight to paid. No waitlist. Launch with all tiers live (Free, Starter, Growth, Enterprise). Friends and early adopters receive access via Stripe promotion codes or admin-granted trial overrides — not a separate product mode.

---

### Phase 1: Critical Blockers — must all land before launch

> **Status (2026-05-25):** Code is done for #1 (Stripe webhooks + checkout + admin
> trial), #3 (Resend email + invites), and #6 (legal pages + cookie consent + landing).
> Remaining are dashboard/ops actions only the owner can do: **#2 Clerk production keys,
> #4 Vercel Pro, #5 custom domain** — plus a lawyer review of the legal page content.
> See the "Current State" section at the top for the full picture.

#### 1. Stripe Webhooks (highest priority)
Handle payment completion → automatic plan upgrade.
- New API route: `POST /api/webhooks/stripe` — verify `Stripe-Signature` header, handle `checkout.session.completed` event
- On success: update `workspaces.planTier` to the purchased tier, store `stripeCustomerId` and `stripeSubscriptionId`
- Requires `STRIPE_WEBHOOK_SECRET` env var (from Stripe dashboard → Webhooks)
- Test locally: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
- Schema changes needed: add `stripe_customer_id`, `stripe_subscription_id`, `plan_expires_at` to `workspaces` table

#### 2. Clerk Production Instance
Current key is `pk_test_` — test-mode Clerk sessions are not production-safe.
- Create a Clerk production application in Clerk dashboard
- Swap `VITE_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` to production keys in Vercel env
- Enable Google OAuth in the Clerk production app
- Verify sign-up → onboarding → workspace creation flow end-to-end

#### 3. Email Provider (Resend)
No transactional email is wired. Blocks: workspace invites, billing receipts.
- Install: `npm install resend`
- Add `RESEND_API_KEY` to Vercel env
- Emails needed at launch: workspace invite (magic link), billing confirmation
- Create `api/_lib/email.ts` — thin wrapper around Resend SDK
- View-only external-viewer invite flow unblocked once email is live

#### 4. Vercel Pro Upgrade
Current plan is Hobby — Vercel ToS prohibits commercial use on Hobby.
- Upgrade to Pro ($20/mo) in Vercel billing settings
- No code changes required

#### 5. Custom Domain
Currently `stratmap-seven.vercel.app` — not suitable for a commercial product.
- Purchase domain (e.g. `stratmap.app`)
- Add to Vercel project → Domains
- Update all hardcoded URLs (share links, OG tags, email templates)

#### 6. Legal Pages
Required before charging users, especially EU (GDPR).
- `/privacy` — Privacy Policy
- `/terms` — Terms of Service
- Cookie consent banner (required for EU)
- Add links to these in the footer of SharePage, PricingPage, OnboardingPage

---

### Friend & Early Adopter Access

Two mechanisms — choose based on situation:

**A. Stripe Promotion Codes (preferred for paying customers)**
Stripe natively supports coupons and promotion codes:
- Create a coupon in Stripe dashboard (e.g. `100% off for 3 months`, `50% off forever`)
- Generate promotion codes from that coupon (e.g. `EARLYBIRD`, `FRIEND2026`)
- Add `allowPromotionCodes: true` to Stripe checkout session creation in `CheckoutButton.tsx`
- User enters the code at Stripe checkout — no backend code needed

**B. Admin Trial Override (for gifted/comped access)**
For friends who shouldn't go through Stripe at all:
- Add `trial_plan` (`planTier`) and `trial_ends_at` (`timestamp`) columns to `workspaces` table
- In `api/_lib/auth.ts` `requireAuth`, resolve effective plan: if `trial_ends_at > now()`, use `trial_plan`, else use `plan_tier`
- New internal API route: `POST /api/admin/grant-trial` — protected by a `ADMIN_SECRET` env var header, sets `trial_plan` + `trial_ends_at` on a workspace
- This lets you curl/Postman a workspace into Growth for 90 days without touching Stripe

Both mechanisms work independently and can coexist.

---

### Phase 2: Pre-Launch Polish (after Phase 1 is live)

| Item | Notes |
|---|---|
| AI drafting e2e | Add `ANTHROPIC_API_KEY` (server-side) to Vercel env; verify streaming works in production build |
| Free tier PNG watermark | Add "Made with StratMap" overlay to PNG export when plan = free |
| Landing/marketing page | Public `/` (currently redirects to sign-in). Needs value prop, screenshot/demo, pricing link, CTA |
| Error monitoring | Sentry — catch production errors. Add `SENTRY_DSN` to Vercel env |
| Soft launch checklist | Run through BACKLOG.md checklist: OAuth, mobile sidebar, Playwright e2e clean pass |
| Stripe live mode | Swap from Stripe test keys to live keys in Vercel env |

---

### Phase 3: Post-Launch Growth (roadmap, not launch blockers)

- **Real-time collaboration** — Growth plan feature, currently unbuilt. Likely needs Liveblocks or PartyKit (WebSockets).
- **Comments** — commenter permission role exists in schema but feature not built
- **View-only external-viewer role** — requires email provider (Phase 1) + `isExternal` flag on `workspaceMembers`
- **HRIS integrations** — Rippling, BambooHR, Workday. Enterprise upsell.
- **SSO / SAML** — Enterprise tier gate; use WorkOS or BoxyHQ
- **Audit log** — Enterprise compliance requirement
- **Mobile canvas** — read-only at minimum; editing stays desktop-only

---

---

## Common Commands

```bash
# Install dependencies (first time only)
npm install

# Start dev server (Vite + Vercel API functions together)
npm run dev:local   # → http://localhost:3000

# Type check (app + API) — same as CI
npm run typecheck

# Run frontend tests (watch mode)
npm test

# Run frontend tests once (CI)
npm run test:run       # 293 tests

# Run backend API tests
npm run test:api       # 407 tests (PGlite, no network)

# Run all tests
npm run test:all       # 700 tests total

# Live smoke tests against DATABASE_URL (Neon dev branch only!)
npm run test:live

# Build for production
npm run build

# Schema changes — generate a migration after editing src/lib/db/schema.ts
npm run db:generate
# Apply migrations to DATABASE_URL by hand (production deploys do this automatically)
npm run db:migrate

# Git workflow
git add -p            # stage selectively
git commit -m "message"
git push
```

---

## Testing

**Two test suites:**

| Suite | Config | Environment | Count | Command |
|---|---|---|---|---|
| Frontend | `vite.config.ts` | jsdom | 143 | `npm run test:run` |
| Backend API | `vitest.api.config.ts` | node | 143 | `npm run test:api` |

Frontend tests: Vitest + RTL, co-located `__tests__/` folders in `src/`. Reset Zustand stores in `beforeEach` with `useXxxStore.setState({})`. Use `vi.useFakeTimers()` for timers.

Backend tests: PGlite (in-process Postgres) via `drizzle-orm/pglite`. Helpers in `api/__tests__/helpers/`. Mock `../../src/lib/db/index` and `../_lib/auth` in each test file. See `testing_strategy` memory for the full pattern.

---

## Design System

All colours use CSS custom properties (never hardcoded hex). See `src/styles/globals.css`:

**Dark theme (default):**
```css
--bg: #060D18
--surface: #0D1B2A
--brand: #0EA5E9
--text: #F0F6FF
--muted: #94A3B8
--dim: #475569
--warn: amber
--success: green
--purple: #8B5CF6
--danger: red
```

**Light theme** (`data-theme='light'`): inverts backgrounds, adjusts text/accent colours.

Font: **DM Sans** (400–800 weight) + **JetBrains Mono** (code)

---

## Deployment

✅ **Vercel is live and auto-deploys from main branch.**
- Production URL: https://stratmap-seven.vercel.app
- GitHub integration: every push to `main` triggers deployment

---

## Notes for Future Sessions

- **Do not commit** until user confirms features are working — per project git policy
- **SSH auth** — No token setup needed. Just run `git` commands directly.
- **Dev server** — `npm run dev:local` (vercel dev, port 3000). Vite alone (`npm run dev`) works for frontend-only but API calls will fail.
- **Canvas data is API-backed** — charts, nodes, edges all persist via Neon Postgres. No more mock data resets on reload.
- **TypeScript** — Use `npx tsc -p tsconfig.app.json --noEmit` (not `npx tsc --noEmit`) for accurate error checking
- **Execution preference** — Execute code changes directly. Only ask for confirmation on risky/destructive operations.
- **Dev tools** — In browser console:
  - `__devTools.setPermission('admin'|'editor'|'viewer'|...)` — test permission levels
  - `__devTools.setPlan('free'|'starter'|'growth')` — test billing tiers
- **Auth in dev** — `CLERK_SECRET_KEY` in `.env.local` enables real Clerk auth. Without it, all API requests fall back to `u-dev`/`ws-dev` identity.
- **Sprint 6 AI drafting** — Runs server-side via `api/ai/draft.ts` (plan-gated, streams). Add `ANTHROPIC_API_KEY=sk-ant-...` (server-side, no `VITE_` prefix) to `.env.local`/Vercel after verifying billing balance at console.anthropic.com
- **Schema changes** — Edit `src/lib/db/schema.ts`, run `npm run db:generate`, and commit the SQL. Production deploys apply it. `npm run db:migrate` applies it to a dev DB.
- **Share links** — `isPublic` on charts controls the toggle; `shared_links` table stores the short code. `api/share/[code].ts` is public (no auth). `SharePage` handles both 10-char short codes and legacy URL tokens.
- **Salary band** — Stored on `job_descriptions` table (`salary_band_min`, `salary_band_max`, `salary_currency`). Visible/editable only to `admin`/`owner` permission in JDPanel OverviewTab. Locked placeholder shown to others.
- **PGlite test schema** — Built from the real migrations in `drizzle/` (`setupSchema()` runs the drizzle migrator). Nothing to keep in sync by hand; `api/__tests__/migrations.test.ts` fails if `schema.ts` has changes with no migration.
