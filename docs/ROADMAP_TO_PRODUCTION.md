# StratMap: Product Review & Roadmap to Production

*Review date: 2026-11-04. Based on a read of the codebase at commit `80e4cb3`.*

---

## 1. Product Review

### Strengths

| # | Strength | Why it matters commercially |
|---|---|---|
| S1 | **Planning, not just org charts.** Role types (new headcount, backfill, contractor, TBD), OPEN/PLANNED statuses, a headcount kanban, and per-role JDs with an approval workflow (draft → in-review → approved → published → hired). | Most org-chart tools only show the current org. Planning the *future* org is what Founders, CFOs and Heads of People will pay for. |
| S2 | **JDs and AI drafting built into the chart.** You can go from "we need a role here" to a drafted, versioned, approved JD without leaving the canvas. AI runs server-side and only paid plans can use it. | A good upgrade hook that competitors don't have, and it saves time you can see. |
| S3 | **A polished canvas.** Drag, connect, undo/redo, auto-layout (Reingold-Tilford), minimap, filters, Cmd+K search, PNG/PDF export, light and dark themes, consistent design tokens. | Makes a good first impression in demos and trials. |
| S4 | **Billing is already built.** Stripe Checkout, promotion codes, webhooks, admin trial override, and plan tiers defined in one place. | You can go straight to paid without a waitlist. |
| S5 | **A modern, cheap stack.** Vercel serverless + Neon + Drizzle. Hosting costs almost nothing until you have real traffic. | Good margins at low volume. One person can run it. |
| S6 | **A strong test base.** 286 unit/API tests, a real Postgres (PGlite) in API tests, `tsc` strict mode, lint clean. | Changes are cheap and safe. The security fixes below can be made with confidence. |
| S7 | **Some launch groundwork is done.** Legal pages, cookie consent, Sentry, Resend email, and a marketing landing page. | Several of the usual "last 10%" items already exist. |

### Weaknesses

The weaknesses are grouped by risk. **W1–W6 are blockers.** Each one is either a security hole or a broken core promise, and they are *not* in the existing CLAUDE.md launch list.

#### 🔴 Security & data integrity (blockers)

- **W1. No server-side permission checks.** The 5-tier role model (owner > admin > editor > commenter > viewer) is only enforced in the UI. Every API route checks that you belong to the workspace and nothing more. A *viewer* can call the API directly to:
  - change any member's permission or remove members (`api/workspace/members/[userId].ts`)
  - create, edit or delete charts, nodes, edges, JDs and templates
  - create or revoke public share links
  - invite people. `normalizePermission` in `api/workspace/invites.ts` even accepts `'owner'` as an invite role.
- **W2. Salary data leaks to all members.** Salary bands are "admin/owner only" in the UI, but `GET /api/charts/:id/jd/:nodeId` returns the whole row, `salary_band_*` included, to any member. For an HR product this is the issue most likely to lose a customer's trust.
- **W3. Plan limits are not enforced on the server.** Chart, node and seat limits live only in `usePlanLimits` on the client. A free user can call the API directly to get unlimited usage. The AI draft quota is also client-side only (a comment in `api/ai/draft.ts` says so), so a Starter user can run unlimited Anthropic calls on your bill.
- **W4. Public sharing has loose edges.**
  - `GET /api/share/:code` never checks `charts.isPublic`, so a link keeps working after the chart is set to Private (unless the link is also revoked).
  - Share codes are 10 hex characters with no rate limit.
  - Legacy URL-encoded `/share/:token` snapshots can't be revoked at all.
- **W5. Mass assignment and missing validation.**
  - `POST /api/charts/:id/nodes` spreads `req.body` straight into the insert, so the client chooses its own IDs and fields.
  - Template seeding in `api/charts/index.ts` spreads client-supplied rows.
  - No route validates its input against a schema (e.g. zod), and there's no size limit on any request body.
- **W6. No rate limiting** on any route: AI, share lookup, invites (which send email, so they can be used for spam) or the admin endpoint. `grant-trial` compares the secret with `!==` instead of a constant-time comparison.

#### 🔴 Broken core promises (blockers)

- **W7. Invites don't work end to end.** `pending_invites` rows are written and an email goes out. But nothing ever *reads* those rows. An invited user signs up, `requireAuth` finds no membership, and they're sent to onboarding to create their *own* workspace. Collaboration is the main reason a team buys this product (and seats are what you charge for), and it's currently broken.
- **W8. A user can belong to only one workspace.** `requireAuth` takes the first membership row (`.limit(1)`). Consultants, agencies and anyone invited to a second company will hit this.
- **W9. Billing life-cycle gaps.**
  - No handling of `invoice.payment_failed` or `past_due`/`unpaid` statuses. A failed card keeps the paid plan forever.
  - `checkout.session.completed` trusts `metadata.planTier` instead of deriving the tier from the price.
  - No Stripe Customer Portal, so users can't cancel, change card or download invoices. That's a legal requirement in several places and a guaranteed support burden.
  - Seats are advertised (3/5/10), but checkout always uses `quantity: 1` and there's no seat counting.
  - No handling for going over limits after a downgrade (e.g. 40 nodes on a 25-node plan).
- **W10. Fake social proof.** The pricing page says "Trusted by teams at Acme Corp, Lumen Labs, Orbit HQ, Starfall, NovaTech." Showing made-up customer logos to paying customers is misleading and a consumer-protection risk. Remove it until you have real customers.

#### 🟠 Product gaps that will hurt conversion

- **W11. No data import.** Real customers have 30–500 people in a spreadsheet or HRIS. Without CSV import, setup means typing every person in by hand, and most trials will stop at that step.
- **W12. No real-time collaboration, comments or activity history.** Growth is sold partly on collaboration. Two people editing the same chart will overwrite each other (last write wins, no conflict detection). The `commenter` role exists but there's nothing to comment on.
- **W13. Leftover mock data in production paths.** `mockDepartments` is used for chart creation (`ChartView.tsx`), the share fallback (`SharePage.tsx`), `CanvasView` and onboarding. `RolesView` imports `mockRoleSearchResults`. Customers will see departments they never created.
- **W14. No account or data lifecycle.** No workspace deletion, account deletion, data export (GDPR Art. 15/17/20) or member offboarding flow. Enterprise buyers will also ask for an audit log. Beyond the share-link snapshot there's no chart version history.
- **W15. Weak positioning and SEO.** It's an SPA with a `404.html` redirect hack. `index.html` has no meta description or OG/Twitter tags. Shared links will unfurl with no preview, which wastes your main viral loop.

#### 🟡 Engineering & operations

- **W16. No CI.** There is no `.github/workflows`. Nothing stops a red build or failing tests from reaching `main`, which auto-deploys to production.
- **W17. Schema changes use `drizzle-kit push` against prod.** There's no versioned migration workflow, and the test schema (`api/__tests__/helpers/db.ts`) is a hand-kept copy that will drift. There are no table indexes beyond primary keys (`workspace_members.user_id`, `nodes.chart_id`, `edges.chart_id` and `shared_links.chart_id` are queried on every request).
- **W18. The e2e suite is broken.** It hard-codes a macOS path (`/Users/markcollin/...`) in `package.json` and fails against the real Clerk key.
- **W19. Performance at scale hasn't been tested.** Bulk position save runs one `UPDATE` per node. There's no pagination. The 1,267-line `OrgChart.tsx` renders every node. Nobody has tried 500+ nodes.
- **W20. Ops not set up.** Clerk is on test keys, Vercel is on Hobby (non-commercial ToS), there's no custom domain, no backups/point-in-time-recovery policy, no uptime monitoring, no status page, no support channel, and no product analytics, so you can't measure activation or conversion.
- **W21. AI model is hard-coded.** `api/ai/draft.ts` pins `claude-sonnet-4-6`. Put the model ID in an environment variable so you can upgrade without a code change, and track cost per draft.

---

## 2. Roadmap to Production

Each item lists **what to do** and **done when**. Effort: **S** ≤ ½ day, **M** 1–2 days, **L** 3–5 days.

### Phase 0: Security & integrity (must ship before any real customer data)

> **Status (2026-11-05): code complete on branch `claude/magical-cannon-a545tb` and verified against a real Neon dev branch** (`npm run test:live`: roles, salary redaction, plan limits, AI quota, share links, validation and rate limiting all pass on the production `neon-http` driver).
> The new tables (`rate_limits`, `ai_usage`) are created automatically by the deploy-time migrations (3.2). No manual `push` is needed.
> Deviations from the plan below:
> - Share links and the Public toggle are **editor+**, not admin+, because editors create the charts.
> - Legacy `/share/:token` links can't be revoked by design: the data lives in the URL itself. Nothing generates them any more.
> - The CSP ships as **Report-Only**. Switch it to enforcing after checking the browser console on production (Clerk and Sentry hosts), and add `clerk.<your-domain>` once the custom domain exists.
> - `npm audit fix` crashes on an npm peer-dependency bug; the dependency upgrade is tracked as a separate item. Zod uses the patched v4.

| ID | Task | Fixes | Effort | Done when |
|---|---|---|---|---|
| 0.1 | Add a `requirePermission(auth, minRole)` helper. Make `requireAuth` return the member's `permission`. Apply a role matrix to every mutating route: viewer/commenter = read-only; editor = chart/node/edge/JD/template writes; admin = members, invites, share links, departments, billing; owner = workspace delete and transfer. | W1 | M | An API test for each route shows a viewer gets 403 on every write. |
| 0.2 | Block privilege escalation: only allow invite/permission values below the caller's own role, never `owner`; an admin can't demote another admin; the last owner can't be removed. | W1 | S | Tests cover each escalation path. |
| 0.3 | Strip `salaryBandMin/Max/Currency` from JD responses unless the caller is admin/owner, and reject salary writes from everyone else. | W2 | S | A viewer's JD GET has no salary fields (test). |
| 0.4 | Enforce plan limits on the server: chart count on `POST /charts`, node count on node insert/template seed, seat count on invite. Return `402 {error:'plan-limit', limit}` and have the client show `UpgradeModal` on 402. | W3 | M | Tests hit each limit for each tier. |
| 0.5 | Add a DB-backed AI usage counter (`ai_usage` table: workspace, period, count). Check and increment it in `api/ai/draft.ts`. Add a per-request token cap and move the model ID to an `ANTHROPIC_MODEL` env var. | W3, W21 | M | A Starter workspace gets 429 after 3 drafts per period. |
| 0.6 | Share links: require `charts.isPublic` in `api/share/[code].ts`; increase codes to ≥ 16 chars from `crypto.getRandomValues`; strip internal fields from the snapshot; retire or sign legacy URL tokens; offer an optional expiry. | W4 | S | Setting a chart Private makes its link return 404 (test). |
| 0.7 | Validate every request body with **zod** schemas from `src/types` (allow-listed fields only, server-generated IDs, size caps). Remove all `...req.body` spreads. | W5 | M | No route spreads untrusted input; fuzz tests return 400. |
| 0.8 | Rate limiting (Upstash Redis / Vercel KV): AI draft, share lookup, invites (per workspace and per day), admin. Compare the admin secret with `crypto.timingSafeEqual`. | W6 | S | Over-limit requests return 429. |
| 0.9 | Add security headers in `vercel.json`: CSP, HSTS, `X-Frame-Options`, `Referrer-Policy`. Run `npm audit`. Turn on GitHub secret scanning and Dependabot. | — | S | Mozilla Observatory grade ≥ B+. |

### Phase 1: Make the core promises true

| ID | Task | Fixes | Effort | Done when |
|---|---|---|---|---|
| 1.1 | **Invite acceptance.** Put a signed, single-use, expiring token in each invite email (`/invite/:token`). On sign-in, accept the invite (create the `workspace_members` row, delete the `pending_invites` row) *before* the onboarding redirect, and also auto-match on verified email. Add resend/revoke to the Settings page from the API (not local state). | W7 | M | Owner invites B → B signs up → B lands in the owner's workspace with the invited role (e2e). |
| | ✅ **Done (2026-11-05)** except the e2e test, which depends on 3.3. Each invite email carries `/invite/<token>`: a random 256-bit token, stored only as a SHA-256 hash, single use, valid for 7 days. Resend issues a new token, which kills the old link; revoke deletes the invite. `POST /api/invites/accept` requires the invite's email to be one of the user's **verified** Clerk emails. `AuthProvider` accepts the invite (via the remembered token, or by matching email) *before* the onboarding redirect, and takes the user's role from the server instead of assuming `owner`. Settings → Members now runs on the API: invite, resend, revoke, change role and remove. Also fixed along the way: `/sign-up` rendered the sign-in form, and invite emails didn't escape names. Limit: a user who already belongs to another workspace gets 409 until 1.2. | | | |
| 1.2 | **Multiple workspaces.** Add an `x-workspace-id` header (or URL prefix) checked against membership, plus a workspace switcher in the sidebar. | W8 | M | One user can switch between two workspaces. |
| | ✅ **Done (2026-11-05).** **Decided (owner):** the switcher lives in the sidebar, the app remembers the last workspace, and plans stay per workspace. Every request carries `X-Workspace-Id`. `requireAuth` checks the caller is a member there and uses the role they hold there (`403 not-a-member` otherwise); with no header it uses the first workspace joined. `GET /api/workspaces` lists the user's workspaces with each one's plan and role. Accepting an invite no longer returns 409 for members of other workspaces. The client remembers the choice in `localStorage` (`src/lib/workspaceSelection.ts`), forgets it and retries if the user was removed, and switching reloads the app so no data from the previous workspace remains. **Decided (owner, 2026-11-05): one owned workspace per user.** Each workspace carries its own plan. People join other workspaces only by invite, and `POST /api/workspace` returns the workspace a user already has, so nobody can stack Free workspaces to get around the limits. If customers ask for more (e.g. agencies), add it as: your first workspace can be Free, and every additional workspace you create must be on a paid plan (create → checkout). | | | |
| 1.3 | **Billing life-cycle.** Handle `invoice.payment_failed`, `invoice.paid` and subscription `status` (past_due → banner + grace period → downgrade). Derive the tier from the price ID instead of metadata. Add a `POST /api/billing/portal` → Stripe Customer Portal "Manage billing" button. Store `planExpiresAt`. | W9 | M | Stripe CLI test of each event updates the workspace correctly. |
| | ✅ **Done (2026-11-05)** except a manual Stripe CLI pass, which needs the dashboard set up (see `docs/BILLING.md`). Every webhook re-reads the subscription from Stripe and mirrors `status`, `planExpiresAt` and `cancelAtPeriodEnd` onto the workspace. The tier comes from the price id, and Checkout no longer sends `planTier` in metadata. **Decided (owner):** follow Stripe's retry schedule. `past_due` keeps the plan and shows a banner; `unpaid` and `canceled` drop to Free. Cancels and downgrades take effect at the end of the period. Owners and admins get an email on the first failed renewal. Added `POST /api/billing/portal`, plus **Manage billing** in Settings → Billing, which now shows the real plan instead of always saying "Free". Checkout sends existing subscribers to the portal, so nobody gets a second subscription. Fixed the FAQ to say when changes take effect. Also: unsigned webhook events are now refused on preview deployments, not only on production. | | | |
| 1.4 | **Webhook idempotency.** Add a `stripe_events` table and dedup guard (previously deferred; needed now that receipts and failed-payment emails get sent). | W9 | S | Replaying an event is a no-op. |
| | ✅ **Done (2026-11-05), shipped with 1.3.** The webhook claims `event.id` in `stripe_events` (`ON CONFLICT DO NOTHING`) before handling it. A replay returns `duplicate: true`. If handling fails, the claim is released so Stripe's retry runs again. | | | |
| 1.5 | **Decide how seats work.** Either price per seat (`quantity` = seats, sync on member add/remove) or keep flat tiers with a hard seat cap (0.4). Make the pricing page match. **Decided (owner, 2026-11-05): flat tiers with a hard seat cap.** | W9 | S | Seat behaviour matches the pricing copy. |
| | ✅ **Done (2026-11-05).** A seat is a member or a live pending invite (`getSeatUsage()` in `api/_lib/access.ts`). The cap was already enforced on invite. It now also applies when accepting an invite (a workspace that downgraded may have no room left; the invite is kept, so it works again after an upgrade) and when resending an expired invite (which takes a seat again). Over the cap, `402 plan-limit` with `limit: 'seats'`. Nobody is removed when a downgrade leaves the workspace over the cap. If a signed-in user is matched to an invite by email but there's no free seat, a toast explains why before onboarding. Pricing cards and the upgrade modal now say "Up to N team members", and the FAQ says who counts (members and pending invites, not people viewing a public share link). | | | |
| 1.6 | **Over-limit after downgrade.** Existing data becomes read-only over the limit (never deleted), with a banner explaining how to fix it. | W9 | S | A downgraded workspace can view but not add. |
| | ✅ **Done (2026-11-05).** **Decided (owner):** with more charts than the plan allows, *every* chart becomes view-only (`402 plan-frozen`) until charts are deleted down to the limit or the workspace upgrades. Deleting a chart, making it private and revoking its share link stay allowed. With more roles on a chart than the plan allows, roles can still be edited, moved, connected and removed; only adding is blocked (`402 plan-limit`). AI drafts need nothing: the monthly quota is checked on every draft. Server: `requireChartsEditable()` in `api/_lib/access.ts` guards chart PUT, node create/update/delete/move, edge create/delete, share-link create and JD writes. UI: `ChartLimitBanner` (app-wide), a view-only canvas and JD panel, and no status changes or duplicating in the chart list while frozen. A banner on the canvas shows when a chart is over the role limit. Also fixed: the client's chart-limit and node-limit checks read counters that were never updated (`usage.chartsUsed`, `chart.nodes` from the list), so the UI never knew it was at a limit; both now use real counts (`useChartLimit()`). The FAQ describes both behaviours. | | | |
| 1.7 | Remove the fake "Trusted by" logos (replace them with a real testimonial or nothing). Check landing-page claims against what's actually built (no "real-time" until 3.1 ships). | W10 | S | No made-up claims anywhere. |
| | ✅ **Done (2026-11-05).** Removed the fake logos. Removed features that aren't built (real-time collaboration, password-protected shares, PNG watermark) from the pricing page and the upgrade modal. Fixed "Save 22%" (annual billing is 2 months free, about 17% off) and "Unlimited charts & nodes" (nodes are capped at 500). Moved Auto-layout to Starter, which is the tier that unlocks it. **Decided (owner):** lock job descriptions, approval workflows and PDF export on Free, and make clear what each unlocks. Done: the API returns `402 plan-feature` for JD writes and approval statuses; the UI shows lock badges and an upgrade modal describing the feature. All of it is driven by `PAID_FEATURES` in `src/lib/plans.ts`. Headcount planning is locked to Growth the same way, as the Growth card advertised. The FAQ promises self-serve downgrade and cancel (needs 1.3) and read-only charts over the limit after a downgrade (needs 1.6). | | | |
| 1.8 | Remove every `mockDepartments`/`mockRoleSearchResults` import from production paths. Use workspace departments from the API, with an empty state when there are none. | W13 | S | `grep -r "data/mock" src/pages src/features` only matches tests/dev. |
| | ✅ **Done (2026-11-05).** Nothing in `src/pages` or `src/features` imports `src/data/mock*`. Templates live in `src/lib/chartTemplates.ts`: role labels instead of made-up people, and only the departments each template uses. A blank chart starts with the workspace's departments. The canvas, share page and Spotlight no longer fall back to mock departments. **Find roles** search is real (`GET /api/roles/search`). Chart cards show real node and department counts (from `GET /api/charts`) and a readable date. Also fixed: onboarding's **quick start** never called the API (the workspace and chart existed only in the browser), and new owners were shown as viewers until they reloaded. | | | |

### Phase 2: Activation & conversion (needed to make money, not just to be safe)

| ID | Task | Fixes | Effort | Done when |
|---|---|---|---|---|
| 2.1 | **CSV/XLSX import** with a column-mapping step (name, title, dept, manager email/name, location, start date). Build the reporting tree from the manager column, auto-layout it, and preview before commit. Provide a downloadable template. | W11 | L | A 200-row sheet imports into a laid-out chart in under 2 minutes. |
| | ✅ **Done (2026-11-06).** Import dialog (Charts page → new chart; canvas toolbar → add to this chart or new chart): file → column mapping (guessed from headers) → dry-run review → import. CSV (papaparse) and `.xlsx` (read-excel-file, loaded on demand); parsed in the browser; 5 MB / 5,000 rows. **Owner decisions:** a row needs a name *or* a title (a blank name is an open role named after its title); "Reports to" matches an **ID column first, then email, then full name**, so a vacant role can be a manager through its ID; unknown/ambiguous matches, duplicate IDs and loops are **errors that block the import** (fix the file and retry); import is **free** and limited by the plan's chart and role limits, **all or nothing** (over the limit blocks the whole import). Departments are created from the department column (same-named ones on the chart are reused). The tree is laid out automatically (to the right of existing roles when appending). A downloadable template is included. Server: `POST /api/charts/:id/import` (editor, not frozen, node limit); new-chart import reuses `POST /api/charts`. Also fixed: seeding thousands of roles in one insert exceeded Postgres's bind-parameter limit, so inserts are now chunked. **Not done:** `.xls`, multiple sheets (first sheet only), updating existing roles from a file (import only adds). | | | |
| 2.2 | **CSV export** of chart and headcount plan (for finance). | W11 | S | Round-trip import → export → import gives the same chart. |
| | ✅ **Done (2026-11-06).** **Chart:** canvas Export menu → "Export as CSV" (free, built in the browser from what's on screen). The file is also an import file: ID, Name, Title, Department, Reports to, Location, Start date, Role type, Status, Employment type, **X, Y** (exact position, so the shape and sibling order survive) and Department colour. Import gained matching optional columns; when every role has X and Y they are used instead of auto-layout (kept exactly in a new chart; moved to the right of existing roles when adding to a chart). Export → import → export gives a byte-identical file (tested), and a browser test re-imports an export and checks the shape. Reporting lines are read from the connections drawn on the canvas (the Connect tool doesn't always update the stored manager); a role with several managers exports the first and the user is told how many were affected. Open roles export a blank Name. **Spreadsheet safety:** text starting with `=`, `+`, `-` or `@` is prefixed with `'` on export (CSV injection) and un-prefixed on import; files start with a BOM so Excel reads UTF-8. **Headcount plan:** "Export CSV" on the Headcount page (Title, Department, Role type, Target quarter, Status, Chart, Notes), exactly the year and chart filter shown; it is a read, so it works on plans where editing is locked. **Known difference:** an open role with no role type comes back as "new headcount". **Not done:** importing a headcount plan, multiple managers per role in one cell. | | | |
| 2.3 | **Product analytics** (PostHog). Track the funnel: sign-up → workspace → first chart → 10 nodes → invite → share → upgrade. **Code done 2026-11-06** (server-side, consent-gated; see CLAUDE.md). Owner: create the PostHog project (EU), set `POSTHOG_KEY` in Vercel, build the funnel insight. | W20 | S | Funnel dashboard live. |
| 2.4 | **Edit conflict safety.** Add optimistic concurrency (a `revision` check on structural writes → 409 + "chart changed, reload"; moving boxes is exempt). **Done 2026-11-06** (see CLAUDE.md). This is the cheap step before full real-time collaboration. | W12 | M | Two tabs can't silently overwrite each other. |
| 2.5 | **SEO/social:** meta description, OG/Twitter tags, OG image; per-share-link OG via an edge function that renders the chart name; `sitemap.xml`/`robots.txt`; prerender `/`, `/pricing`, `/privacy`, `/terms`. Replace the `404.html` SPA hack with Vercel `rewrites`. **Done 2026-11-06** (see CLAUDE.md; `/pricing` made public; prerender is head-only). Owner: set `APP_URL` once there is a custom domain, and after the first deploy check a deep link and a Slack unfurl. | W15 | M | A share link unfurls with a preview in Slack. |
| 2.6 | **Free-tier PNG watermark** "Made with StratMap" (already in the Phase 2 backlog). Free shares link back to the landing page. **Done 2026-11-06** (PNG mark + share-page footer, Free only). | — | S | A free-plan export shows the watermark. |
| 2.7 | **Onboarding polish:** a checklist (import or add people → invite → share), useful empty states, a sample chart people can delete. **Done 2026-11-06** (see CLAUDE.md: opt-in marked sample that doesn't count toward the plan, checklist ticking from real data, empty states). | W11 | M | Activation rate is measurable via 2.3. |
| 2.8 | **Mobile:** read-only canvas plus a responsive sidebar and share page. | — | M | A share link is usable on a phone. **Done 2026-11-06** (drawer navigation, view-only touch canvas with pan and pinch, share page, Dashboard and Charts reflow; Roles/Headcount/Settings only scroll). |

### Phase 3: Operations & launch gates (owner / dashboard actions plus a little code)

| ID | Task | Fixes | Effort | Done when |
|---|---|---|---|---|
| 3.1 | **CI** (GitHub Actions): `tsc`, lint, `test:run`, `test:api`, build on every PR. Use branch protection on `main`. | W16 | S | A red PR can't merge. |
| | ✅ **Done (2026-11-05)** except branch protection. `.github/workflows/ci.yml` runs on every PR and every push to `main`: `typecheck` (app, plus the API via the new `tsconfig.api.json`; `api/` was never type-checked before), lint, `test:run`, `test:api` (includes the migration drift check from 3.2) and build. **Owner action:** GitHub → Settings → Branches → protect `main`, require the `check` status. | | | |
| 3.2 | **Migrations:** switch to `drizzle-kit generate` + `migrate` in CI/deploy. Generate the PGlite test schema from the migrations instead of the hand-kept `SCHEMA_SQL`. Add indexes on all FK/lookup columns. | W17 | M | No more `push` against prod. Tests use the real migrations. |
| | ✅ **Done (2026-11-05).** `vercel-build` runs `scripts/migrate.mjs --deploy` after the build, on production only (preview is opt-in via `MIGRATE_PREVIEW_DATABASE`). Each migration is one atomic Neon HTTP transaction, and the script adopts push-managed databases at `0000_baseline`. Migrations: `0000_baseline`, `0001_phase0_usage_tables`, `0002_lookup_indexes` (12 indexes). PGlite tests build from `drizzle/`; `migrations.test.ts` fails on schema drift. See `docs/MIGRATIONS.md`. CI runs the drift check (3.1). | | | |
| 3.3 | **Fix e2e:** use a portable Playwright path, run with no Clerk key (bypass) or a Clerk testing token, and cover sign-up → invite-accept → create chart → share → checkout (Stripe test mode). Run in CI against preview deployments. | W18 | M | `npm run test:e2e` passes in CI. |
| | ✅ **Done in code (2026-11-06); CI needs one secret.** `npm run test:e2e` no longer uses `vercel dev` or a hard-coded path. `scripts/e2e-server.mjs` serves Vite in dev-bypass mode and mounts every `api/**/*.ts` handler, with no Clerk, Stripe, Anthropic or Resend keys. The dev bypass now supports several identities (`X-Dev-User: <slug>` → user `dev-<slug>`, email `<slug>@e2e.test`, no workspace until onboarding); it is still refused on preview and production. `tests/e2e/journey.spec.ts` runs two users through onboarding → create chart → share (public link opens for a guest) → invite from Settings → accept → second workspace → switch → used link is dead. Mail goes to a file (`E2E_EMAIL_OUTBOX`) so the test can read the invite link. Each run uses unique user ids and deletes its workspaces afterwards. CI job `e2e` runs when the `E2E_DATABASE_URL` secret (a throwaway Neon branch) exists, and skips otherwise. **Not covered:** Clerk's own sign-up UI, and checkout (Stripe test mode); no Clerk testing token or preview-deployment run yet. | | | |
| 3.4 | **Performance:** a single bulk `UPDATE ... FROM (VALUES …)` for positions; render only visible nodes on the canvas when > 300 nodes; load-test a 1,000-node chart. **Done 2026-11-06** (see CLAUDE.md: viewport rendering, chips when zoomed out, one bulk UPDATE; a 1,000-role chart opens in about 1.6 to 2.1 s and drags at 60 fps in the e2e measurement). | W19 | M | 1,000-node chart opens in under 2 s and drags at 60 fps. |
| 3.5 | **Clerk production instance** + Google OAuth (+ Microsoft OAuth, which HR buyers often ask for). | W20 | S | Production uses `pk_live_`. |
| 3.6 | **Vercel Pro**, **custom domain**, update `getAppUrl`/email/OG URLs; set up SPF/DKIM/DMARC for the Resend sending domain. | W20 | S | Email passes DMARC. The app is served on its own domain. |
| 3.7 | **Stripe live mode:** live keys, live price IDs, live webhook endpoint, tax (Stripe Tax) and invoice settings. | W9 | S | A real card purchase upgrades a workspace. |
| 3.8 | **Data safety:** Neon point-in-time recovery on a paid plan, a documented restore drill, separate prod/preview databases (preview must never touch prod data). | W20 | S | One successful test restore. |
| 3.9 | **Monitoring:** set Sentry DSNs and alerts, uptime check (Better Stack/Checkly) on `/` and `/api/health` (add the route), plus a simple status page. **Code done 2026-11-06** (`/api/health`, `docs/MONITORING.md`). Owner: set the DSNs, create the monitors and status page, and run the phone-alert test in the guide. | W20 | S | An alert reaches your phone. |
| 3.10 | **Support:** support email/Intercom/Crisp widget, a help centre with ~10 articles, and an in-app feedback link. | W20 | S | Users have a way to reach you. |

### Phase 4: Legal & compliance (needed before charging EU/UK customers)

| ID | Task | Fixes | Effort | Done when |
|---|---|---|---|---|
| 4.1 | Lawyer review of `/privacy` and `/terms`. Add a **DPA** (customers upload employee personal data, so you are a processor) and a **subprocessor list** (Vercel, Neon, Clerk, Stripe, Resend, Sentry, Anthropic). | W14 | — | Signed off by counsel. |
| 4.2 | **Data rights:** workspace export (JSON + CSV), workspace deletion (cascade, plus Stripe cancel), account deletion, and member removal that revokes access immediately. | W14 | M | Each action is self-serve and tested. |
| 4.3 | Disclose in-product that JD prompts go to Anthropic. Confirm no employee personal data is included in AI prompts (today only title/department/notes are sent, so keep it that way and say so). | — | S | The disclosure is visible in the AI draft UI. **Done 2026-11-06.** |
| 4.4 | Basic **audit log** table (who changed what, when) for member, permission, share and salary changes. Show it to owners; export it for Enterprise. | W14 | M | Permission changes appear in the log. |
| 4.5 | Make sure the cookie consent banner actually controls Sentry replay and analytics (no tracking before consent in the EU). | — | S | No analytics requests before the user accepts. **Done 2026-11-06** (fonts self-hosted; Sentry has no replay or default PII). |

### Phase 5: Post-launch growth (not blockers)

- Real-time collaboration (Liveblocks/PartyKit), presence cursors, comments for the `commenter` role
- Chart version history and scenario comparison ("Plan A vs Plan B")
- Headcount cost modelling (salary band × headcount plan → budget by quarter)
- HRIS sync (BambooHR, Rippling, HiBob, Workday) for the Enterprise tier
- SSO/SAML + SCIM (WorkOS), audit log export, SOC 2 Type I prep
- Embeds (Notion/Confluence) and Slack integration for share links

---

## 3. Suggested sequencing

```
Weeks 1–2  Phase 0 (all)              ← nothing else matters if data leaks
Weeks 2–3  Phase 1 (1.1–1.8)          ← invites + billing life-cycle
           Phase 3.1–3.3 in parallel  ← CI, migrations, e2e so fixes stay fixed
Weeks 4–5  Phase 2 (2.1 import, 2.3 analytics, 2.5 SEO first)
Week 6     Phase 3.4–3.10 + Phase 4   ← ops, live keys, legal sign-off
           → Private beta with 5–10 friendly companies (promo codes / admin trials)
Week 8     Public launch
```

**Launch-ready definition:** Phases 0, 1, 3 and 4 are complete, 2.1/2.3/2.5 are shipped, the e2e suite is green in CI against a preview deployment, and at least one real company has run the full loop of import → invite → plan → share → pay.
