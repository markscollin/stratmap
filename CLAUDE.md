# StratMap — Claude Project Definition

## Project Overview

**StratMap** is a collaborative org chart and people planning tool. This is the frontend React + TypeScript application.

**GitHub:** https://github.com/markscollin/stratmap  
**Repo owner:** markscollin (SSH keys already configured)  
**Dev server:** `npm run dev` → http://localhost:5173

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
│   ├── canvas/      # Org chart canvas (OrgChart.tsx, useCanvasState.ts)
│   ├── nodes/       # Node card rendering (NodeCard.tsx)
│   └── panel/       # JD slide-out panel (JDPanel.tsx)
├── pages/           # Page components (Dashboard, ChartView, CanvasView, etc.)
├── store/           # Zustand stores (chartStore, uiStore, userStore)
├── styles/          # Global CSS (globals.css with CSS custom properties for theming)
├── types/           # TypeScript types (chart.ts, user.ts, jd.ts)
├── App.tsx          # Router setup
└── main.tsx         # Entry point
```

---

## Key Technologies

- **React 18** + **TypeScript**
- **Vite** (dev server, build)
- **React Router v6** (navigation)
- **Zustand** (state management)
- **Tailwind CSS** + `@tailwindcss/vite` (styling)
- **CSS custom properties** (theming: dark by default, light mode via `data-theme='light'`)
- **Lucide React** (icons)
- **Framer Motion** (mentioned in types but not heavily used yet)

---

## What's Complete

### Phase 2: App Shell ✅
- Sidebar, TopNav, Layout
- Dashboard, ChartView, RolesView, HeadcountView, SettingsView
- Theme toggle (dark/light)
- Chart library with status badges, version pills, templates

### Phase 3: Org Chart Canvas ✅
- **Draggable nodes** with smooth positioning
- **SVG edges** (screen-space rendering, visible/selectable/deletable)
- **Zoom/pan controls** (mouse wheel, toolbar buttons, fit-to-view)
- **Minimap** with clickable pan
- **Toolbar** (Select/Pan/Zoom/Connect tools, Add Node button)
- **Connect tool** (2-click flow: source → target → edge created)
- **Undo/redo** with full history
- **JD panel** (slide-in, Overview tab, Responsibilities/Requirements placeholders for Sprint 6)
- **Chart creation** with template starters:
  - Blank (empty canvas)
  - Startup (5-node flat tree)
  - Scale-up (13-node functional org)
  - Hiring plan (active backbone + open/planned roles)

**Key files:**
- `src/features/canvas/OrgChart.tsx` — main canvas component
- `src/features/canvas/useCanvasState.ts` — canvas state management (nodes, edges, history, tools)
- `src/pages/CanvasView.tsx` — wires chart data to canvas
- `src/pages/ChartView.tsx` — chart library + new chart modal

---

## What's Not Done (Out of Scope)

- JD editor (Responsibilities/Requirements tabs) — Sprint 6
- Edit/Approve buttons (not wired)
- Filter tool (visual only, not functional)
- Salary band (locked placeholder)
- Persistence (no backend/DB yet — data resets on page reload)
- Headcount forecasting
- Approval workflows

---

## Common Commands

```bash
# Install dependencies (first time only)
npm install

# Start dev server
npm run dev

# Type check
npx tsc --noEmit

# Run tests (watch mode)
npm test

# Run tests once (CI / pre-commit)
npm run test:run

# Build for production
npm run build

# Git workflow
git add .
git commit -m "Your message"
git push
```

---

## Testing

**Stack:** Vitest + React Testing Library. Tests live in `__tests__/` directories co-located with source.

**Setup files:**
- `vite.config.ts` — test config (globals, jsdom, setupFiles)
- `src/test/setup.ts` — imports `@testing-library/jest-dom` matchers

**Test suites (Sprint 2):**
- `src/store/__tests__/toastStore.test.ts` — addToast variants, cap behaviour, auto-dismiss, removeToast
- `src/features/canvas/__tests__/useCanvasState.test.ts` — addNode, updateNode, deleteNode, addEdge guards (self/duplicate/circular), undo/redo
- `src/features/nodes/__tests__/NodeModal.test.tsx` — add/edit modes, validation, delete confirmation flow

**Convention for future sprints:** add a `__tests__/` folder alongside any new feature file that contains meaningful logic. Reset Zustand stores in `beforeEach` using `useXxxStore.setState({})`. Use `vi.useFakeTimers()` for any timer-dependent behaviour.

---

## Design System

All colors use CSS custom properties (never hardcoded hex). See `src/styles/globals.css`:

**Dark theme (default):**
```css
--bg: #060D18
--surface: #0D1B2A
--brand: #0EA5E9
--text: #F0F6FF
--muted: #94A3B8
--dim: #475569
```

**Light theme** (`data-theme='light'`):
- Inverts backgrounds, adjusts text colors, lightens accent colors

Font: **DM Sans** (400–800 weight) + **JetBrains Mono** (code)

---

## Deployment

✅ **Vercel is live and auto-deploys from main branch.**
- Production URL: https://stratmap-seven.vercel.app
- GitHub integration configured — every push to main triggers deployment
- Deployment set up on 2026-05-12

---

## Next Steps

**Recommended priorities:**
1. **JD editor** — Fill in Responsibilities/Requirements tabs (Sprint 6)
2. **Approval workflow** — Wire up Edit/Approve buttons, status transitions
3. **Backend/persistence** — Currently all data is mock; add API/database

---

## Notes for Future Sessions

- **SSH is your auth method** — No token setup needed for future chats. Just run git commands.
- **Dev server persists** — If you start `npm run dev`, it keeps running. You can stop it with Ctrl+C.
- **Canvas data is template-based** — New charts load nodes/edges from templates; existing charts show their stored structure.
- **TypeScript is strict** — `npx tsc --noEmit` verifies compilation before commits.
- **No environment variables** — Mock data only; no .env needed for dev.
