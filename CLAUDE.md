# StratMap — Claude Project Definition

## Project Overview

**StratMap** is a collaborative org chart and people planning tool. Full-stack: React + TypeScript frontend, Vercel Serverless API, Neon Postgres via Drizzle ORM.

**GitHub:** https://github.com/markscollin/stratmap  
**Repo owner:** markscollin (SSH keys already configured)  
**Dev server:** `npm run dev:local` (= `vercel dev`) → http://localhost:3000

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
- **Anthropic SDK** (AI JD drafting — requires `VITE_ANTHROPIC_API_KEY` in `.env.local`)
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
- **⚠️ Requires `VITE_ANTHROPIC_API_KEY=sk-ant-...` in `.env.local` for AI drafting to work**
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
- `src/features/jd/AIJDDraft.tsx` — Anthropic streaming component
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
3. **Sprint 6 end-to-end verification** — verify Anthropic billing, add `VITE_ANTHROPIC_API_KEY` to `.env.local`, test AI drafting
4. ~~**Share Link (basic)**~~ ✅ Done (2026-05-20) — URL-encoded snapshot via `src/utils/shareLink.ts` + `/share/:token` route + `SharePage.tsx`
5. **Stripe webhooks** — handle payment completion + automatic plan upgrade
6. ~~**Filter tool**~~ ✅ Done (2026-05-20) — dept/status/role-type filter panel with opacity dimming on canvas
7. ~~**Salary band**~~ ✅ Done (2026-05-20) — editable min/max/currency inputs for admin/owner in JDPanel OverviewTab; locked for others
8. ~~**Headcount forecasting**~~ ✅ Done (2026-05-20) — full kanban HeadcountView, workspace departments, API routes, stores, 111 backend tests total
9. ~~**Dashboard KPIs**~~ ✅ Done (2026-05-20) — `roleTypeBreakdown` from stats API; RoleTypeBreakdown widget reads live data
10. ~~**Share Settings Panel**~~ ✅ Done (2026-05-20) — `ShareSettingsBtn` in toolbar, Private/Public toggle, blue icon when public, `isPublic` column on charts
11. ~~**Live Shared Links**~~ ✅ Done (2026-05-20) — `shared_links` table, `api/charts/[id]/share.ts`, `api/share/[code].ts`, SharePage detects short codes vs legacy tokens

---

## Remaining Work

### Stripe Webhooks
Handle payment completion → automatic plan upgrade in the database.
- New API route: `POST /api/webhooks/stripe` — verify `Stripe-Signature` header, handle `checkout.session.completed` event
- On success: update `workspaces.planTier` to the purchased tier
- Requires `STRIPE_WEBHOOK_SECRET` env var (from Stripe dashboard → Webhooks)
- Test locally with `stripe listen --forward-to localhost:3000/api/webhooks/stripe`

### View-Only Workspace Role (External Invite)
Allow external stakeholders to join a workspace as permanent viewers without a full editor seat.
- New role tier: `external-viewer` (below `viewer`) — view only, no edit/export/templates
- Invite flow: Settings → Members → "Invite external viewer" → magic link email (needs email provider)
- External viewer sees stripped-down layout (chart list + read-only canvas only)
- Does not count against seat limits
- Backend: `workspaceMembers` table gains `isExternal: boolean`; `requireAuth` respects the role
- **Blocked on email provider** — no email service configured yet (Resend/SendGrid/Postmark)

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
npm run test:run       # 141 tests

# Run backend API tests
npm run test:api       # 62 tests (PGlite, no network)

# Run all tests
npm run test:all       # 203 tests total

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
| Frontend | `vite.config.ts` | jsdom | 141 | `npm run test:run` |
| Backend API | `vitest.api.config.ts` | node | 111 | `npm run test:api` |

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
- **Sprint 6 AI drafting** — Blocked on Anthropic API key. Add `VITE_ANTHROPIC_API_KEY=sk-ant-...` to `.env.local` after verifying billing balance at console.anthropic.com
- **Schema changes** — Edit `src/lib/db/schema.ts` then run `npx drizzle-kit push` to apply to Neon (reads `DATABASE_URL` from `.env.local`)
- **Share links** — `isPublic` on charts controls the toggle; `shared_links` table stores the short code. `api/share/[code].ts` is public (no auth). `SharePage` handles both 10-char short codes and legacy URL tokens.
- **Salary band** — Stored on `job_descriptions` table (`salary_band_min`, `salary_band_max`, `salary_currency`). Visible/editable only to `admin`/`owner` permission in JDPanel OverviewTab. Locked placeholder shown to others.
- **PGlite test schema** — `api/__tests__/helpers/db.ts` `SCHEMA_SQL` must be kept in sync with `src/lib/db/schema.ts`. When adding new tables/columns, update both files and reset `schemaReady = false` is not needed — PGlite starts fresh each test run.
