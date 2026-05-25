# StratMap — Claude Project Definition

## Project Overview

**StratMap** is a collaborative org chart and people planning tool. Full-stack: React + TypeScript frontend, Vercel Serverless API, Neon Postgres via Drizzle ORM.

**GitHub:** https://github.com/markscollin/stratmap  
**Repo owner:** markscollin (SSH keys already configured)  
**Dev server:** `npm run dev:local` (= `vercel dev`) → http://localhost:3000

---

## Current State (updated 2026-05-24)

The app has been through a "prepare for paid launch" hardening pass. Tests:
**143 frontend + 143 backend = 286 passing**; `tsc` clean; `lint` 0 errors; build OK.

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
- **Legal + consent** — `/privacy`, `/terms` (`LegalPages.tsx`, template content,
  needs lawyer review) + app-wide `CookieConsent` banner.
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

**Known issue — e2e:** `npm run test:e2e` currently fails because `vercel dev` loads
the real `VITE_CLERK_PUBLISHABLE_KEY` from `.env.local`, so dev-bypass never engages
and authed routes redirect to Clerk sign-in. The e2e setup needs a way to run without
the real Clerk key before the suite is reliable again.

**Deferred:** Stripe webhook idempotency — add a `stripe_events` table + dedup guard
*when* billing-receipt emails are wired (replays would double-send). Not needed yet
(handlers are idempotent set-ops).

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
- Pricing page (/pricing): plan cards, monthly/annual toggle, "Trusted by teams at" logo bar, FAQ, enterprise CTA
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
- SPA routing: `vercel.json = {}` (dev), `public/404.html` → sessionStorage redirect (production)
- 111 backend tests using PGlite (`npm run test:api`)
- Schema: `src/lib/db/schema.ts` (13 tables, 8 enums); push with `npx drizzle-kit push`
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
- `src/pages/PricingPage.tsx` — pricing with logo bar + FAQ
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

# Type check (frontend only)
npx tsc -p tsconfig.app.json --noEmit

# Run frontend tests (watch mode)
npm test

# Run frontend tests once (CI)
npm run test:run       # 143 tests

# Run backend API tests
npm run test:api       # 143 tests (PGlite, no network)

# Run all tests
npm run test:all       # 286 tests total

# Build for production
npm run build

# Schema changes — push to Neon after editing src/lib/db/schema.ts
npx drizzle-kit push

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
- **Schema changes** — Edit `src/lib/db/schema.ts` then run `npx drizzle-kit push` to apply to Neon (reads `DATABASE_URL` from `.env.local`)
- **Share links** — `isPublic` on charts controls the toggle; `shared_links` table stores the short code. `api/share/[code].ts` is public (no auth). `SharePage` handles both 10-char short codes and legacy URL tokens.
- **Salary band** — Stored on `job_descriptions` table (`salary_band_min`, `salary_band_max`, `salary_currency`). Visible/editable only to `admin`/`owner` permission in JDPanel OverviewTab. Locked placeholder shown to others.
- **PGlite test schema** — `api/__tests__/helpers/db.ts` `SCHEMA_SQL` must be kept in sync with `src/lib/db/schema.ts`. When adding new tables/columns, update both files and reset `schemaReady = false` is not needed — PGlite starts fresh each test run.
