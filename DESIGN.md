# StratMap — Design & Product Brief
*The authoritative reference for building StratMap in Claude Code.*
*Last updated: May 2026*

---

## What StratMap Is

StratMap is a collaborative org chart and people planning tool for HR teams, founders, and operations leaders. It lets companies create, manage, and get approval on org charts — treating them as living documents that evolve as the company changes.

**Core promise:** *"Map your organisation. Build it deliberately."*

**The three things StratMap does:**
1. Visualise your organisation as an interactive, draggable org chart
2. Attach living job descriptions to every role and route them through an approval workflow
3. Plan headcount — open roles, backfills, new hires — mapped onto the chart

---

## Design System

### Colour tokens

Use CSS custom properties. Both themes must work from day one.

```css
/* Dark theme (default) */
--bg:           #060D18;   /* deep space — page background */
--surface:      #0D1B2A;   /* navy — cards, sidebar, nav */
--raised:       #152336;   /* elevated surfaces within cards */
--border:       rgba(148,163,184,0.10);
--border-hover: rgba(148,163,184,0.22);
--brand:        #0EA5E9;
--brand-bg:     rgba(14,165,233,0.12);
--brand-glow:   rgba(14,165,233,0.30);
--success:      #10B981;
--success-bg:   rgba(16,185,129,0.12);
--warn:         #F59E0B;
--warn-bg:      rgba(245,158,11,0.12);
--purple:       #8B5CF6;
--purple-bg:    rgba(139,92,246,0.12);
--danger:       #EF4444;
--danger-bg:    rgba(239,68,68,0.12);
--text:         #F0F6FF;
--muted:        #94A3B8;
--dim:          #475569;
--shadow:       0 16px 48px rgba(0,0,0,0.60);
--shadow-sm:    0 2px 12px rgba(0,0,0,0.35);
--grad-brand:   linear-gradient(135deg,#0EA5E9,#0369A1);
--grad-purple:  linear-gradient(135deg,#8B5CF6,#6D28D9);
--grad-success: linear-gradient(135deg,#10B981,#059669);
--grad-warn:    linear-gradient(135deg,#F59E0B,#D97706);

/* Light theme */
--bg:           #EEF2F8;
--surface:      #FFFFFF;
--raised:       #F4F7FB;
--border:       rgba(15,23,42,0.08);
--border-hover: rgba(15,23,42,0.18);
--brand:        #0284C7;
--brand-bg:     rgba(2,132,199,0.08);
--brand-glow:   rgba(2,132,199,0.25);
--success:      #059669;
--success-bg:   rgba(5,150,105,0.08);
--warn:         #D97706;
--warn-bg:      rgba(217,119,6,0.08);
--purple:       #7C3AED;
--purple-bg:    rgba(124,58,237,0.08);
--danger:       #DC2626;
--danger-bg:    rgba(220,38,38,0.08);
--text:         #0F172A;
--muted:        #64748B;
--dim:          #94A3B8;
--shadow:       0 16px 48px rgba(0,0,0,0.12);
--shadow-sm:    0 2px 12px rgba(0,0,0,0.07);
--grad-brand:   linear-gradient(135deg,#0284C7,#0369A1);
--grad-purple:  linear-gradient(135deg,#7C3AED,#5B21B6);
--grad-success: linear-gradient(135deg,#059669,#047857);
--grad-warn:    linear-gradient(135deg,#D97706,#B45309);
```

### Typography

- **Primary font:** DM Sans (Google Fonts) — all weights 400–800
- **Mono font:** JetBrains Mono — code, version pills
- **Display/headings:** DM Sans 700–800, letter-spacing -0.4px to -0.5px
- **Body:** DM Sans 400, 14px
- **Small/meta:** 12px, color: var(--muted)
- **Tiny/labels:** 11px uppercase, letter-spacing 0.4–0.5px, color: var(--dim)

### Spacing & shape

- Card border-radius: 16px
- Button border-radius: 8–9px
- Badge/pill border-radius: 20px (fully rounded)
- Small element radius: 6–8px
- Standard padding inside cards: 24–28px
- Gap between grid cards: 14–16px
- Sidebar width (expanded): 232px
- Sidebar width (collapsed): 56px
- Top nav height: 56px

### Component rules

- **Buttons:** always have hover + active states. Primary = var(--grad-brand). Never plain colour fills without gradient for primary actions.
- **Cards:** subtle box-shadow (--shadow-sm), border with --border. On hover: border becomes --border-hover, shadow becomes --shadow, translateY(-2px).
- **Borders:** always low-opacity. Never stark lines.
- **Empty states:** always have an icon, a heading, a description, and at least one action. Never a blank area.
- **Destructive actions:** always require a confirmation step. Never immediate.
- **Badges/pills:** inline-flex, align-items center, gap 5px for icon + label.
- **Shadows:** layered and dark — never harsh. Use --shadow-sm for resting, --shadow for elevated/hover.
- **Inputs:** background var(--input-bg), border var(--border). On focus: border becomes var(--brand), box-shadow 0 0 0 3px var(--brand-bg).
- **Toggles:** 42×24px pill, white circle slides left/right, transition 0.2s.

### Department colours

Always use these exact colours for departments, in this order:
```
Engineering:  #0EA5E9
Product:      #10B981
Design:       #8B5CF6
Go-to-Market: #F59E0B
Operations:   #EF4444
Finance:      #06B6D4
```

---

## Application Structure

### Navigation

**Sidebar (left, collapsible):**
- Logo mark (SM) + "StratMap" wordmark
- Nav items: Dashboard, Org Charts, Roles, Headcount
- Bottom: Settings, Collapse toggle
- Active state: brand-coloured left border (2px), brand text, nav-active background
- Collapsed state: 56px wide, icons only, no labels

**Top nav:**
- Left: breadcrumb (StratMap → current page)
- Centre: search bar with ⌘K shortcut hint
- Right: theme toggle, notification bell, user avatar

**Routing:**
```
/              → Dashboard
/charts        → Org Charts library
/charts/:id    → Canvas view for specific chart
/roles         → Roles (template library + find roles)
/headcount     → Headcount planning
/settings      → Settings
```

---

## Page Specifications

### 1. Dashboard — "Org Health"

**Purpose:** Answer "what does my organisation look like right now?" at a glance. This is a strategic overview, not a task list.

**Layout — top to bottom:**

**KPI row (4 cards):**
- Total headcount (active people across all depts)
- Open roles (unfilled positions)
- Planned hires (approved, not yet filled)
- Live org charts (currently published)

Each card: icon in coloured circle, large number, label, subtitle. Subtle circle decoration top-right.

**Main content (2 columns):**

Left column — Department breakdown:
- List of all departments
- Each row: coloured dot + dept name, headcount count, open roles count (amber badge)
- Horizontal bar: filled portion = active headcount, unfilled = open roles
- "View chart" link top right

Right column (stacked):
- Role pipeline: stacked bar (active/open/planned), legend below
- Chart status summary: list of statuses with count badges, "Manage" link

**Quick actions (full width row):**
- New org chart, Add a role, Invite teammate, View headcount
- Hover: background and border take the relevant colour

---

### 2. Org Charts — Chart Library

**Purpose:** A library of all org charts in the workspace. Not just a file picker — a system of record for every org design decision the company has made or is planning.

**Key principle:** Charts are named clearly (e.g. "Current Structure", "Q3 Hiring Plan"). Version numbers are SYSTEM METADATA shown as a small pill (v1, v2, v3) — never part of the chart name. Dates are tracked fields, not embedded in names.

**Approval cycle bar (above the grid):**
Displays the cyclical nature of chart approval. Clickable — each status filters the grid.

```
Draft → Editing → In Review → Approved → Live → (Start revision → Editing again)
                                  ↩ Changes Requested → Editing
                                                   · Retired
```

**Chart card shows:**
- Mini SVG thumbnail of the chart structure (top section)
- Live pulse dot for Live status
- Chart name (bold)
- Status badge + version pill (side by side)
- Owner, last updated, node count, department count (2×2 meta grid)
- Collaborator avatar stack + relative timestamp (footer)
- "…" overflow menu

**"…" menu — action language (never system language):**
- Available actions based on current status:
  - draft/editing → "Submit for approval"
  - review → "Approve" | "Request changes"
  - rejected → "Revise"
  - approved → "Publish"
  - live → "Start revision" | "Retire"
- Then divider, then: Open chart, Duplicate, New scenario, Delete

**Chart statuses and what they mean:**
```
draft     — never been through approval, brand new
editing   — live chart has a revision in progress
review    — submitted, awaiting approval decision
rejected  — changes requested, needs revision (shown as "Changes Requested")
approved  — approved, not yet published
live      — currently the active published version
archived  — retired, no longer active
```

**New chart modal:**
- Chart name input (required, Create button disabled until filled)
- Template selector: Blank / Startup / Scale-up / Hiring plan
- Cancel + Create buttons

---

### 3. Canvas View (Sprint 1 — primary build focus)

**Accessed by:** clicking any chart card in the library.

**Layout:**
- Full-screen SVG canvas (infinite, pannable, zoomable)
- Top-left: back button ("← All charts"), chart name chip, status badge, version pill
- Top-centre: toolbar (Select, Zoom, Filter, | Add node)
- Bottom-right: zoom controls (−, %, +)
- Bottom-left: minimap

**Node cards on canvas show:**
- Department colour as left border or background tint
- Avatar/initials circle
- Person name (or role title if open/planned)
- Job title
- Status badge: ★ NEW, OPEN, PLANNED, CONTRACTOR
- Employment type indicator

**Interactions required:**
- Drag nodes to reposition
- Click node → open job description slide-out panel (right side)
- Click-to-connect: click source node, click target node → creates reporting line edge
- Click edge → highlight, Delete key removes it
- Scroll to zoom, drag canvas to pan
- Cmd+K → search/spotlight to jump to any node
- Ctrl+Z / Ctrl+Shift+Z → undo/redo

**Job description panel (slide-out, right side):**
- Role title + status badge
- Tabs: Overview | Responsibilities | Requirements
- Salary band (admin-only)
- Status workflow actions: Approve / Request Edit
- Close button

---

### 4. Roles

**Purpose:** Two distinct capabilities, separated by tabs.

**Tab A — Template Library:**
- Reusable job description templates that can be applied to any node in any chart
- Changes to templates do NOT automatically update charts — templates are starting points
- Each template card shows: dept-coloured icon, title, department, last updated by + date, tags (IC/Leadership/etc), "Used in N charts" count, Edit button
- "New template" button top right
- Explanation banner: clarifies what templates are and how they work

**Tab B — Find Roles:**
- Cross-chart role search: searches every org chart in the workspace
- Answers questions like "how many QA Engineers do we have and where do they work?"
- Search input + Search button
- Suggested quick searches: QA Engineer, Product Manager, Head of Engineering, SDR
- Results table columns: Role title (+ person name if filled), Chart (+ version), Department, Status
- Summary bar above results: "N active", "N open", "N planned"
- Explanation banner: clarifies what this search covers

---

### 5. Headcount (Growth plan feature)

- Gated behind Growth plan
- Empty state with upgrade prompt
- Ghost/blurred table preview behind the gate to show what's coming
- Will contain: table view of all planned hires by quarter, role type tagging, budget fields (admin-only), approval workflow

---

### 6. Settings

**Four tabs:**
- **General:** Workspace name, primary email, Save changes
- **Members:** Team list, seat count, Invite button. Empty state with dashed border.
- **Billing:** Current plan card, upgrade buttons for Starter (£18/mo) and Growth (£49/mo) with gradient backgrounds
- **Notifications:** Toggle switches for: Approval requests, JD status changes, New comments, Team invitations

---

## Data Model

### Chart statuses (cyclical — not linear)

```typescript
type ChartStatus =
  | 'draft'     // new, never approved
  | 'editing'   // revision in progress on a previously live chart
  | 'review'    // submitted for approval
  | 'rejected'  // changes requested (do NOT call this "rejected" in UI — use "Changes Requested")
  | 'approved'  // approved, awaiting publish
  | 'live'      // currently published
  | 'archived'  // retired
```

Valid transitions and their human-language action labels:
```
draft    → review    : "Submit for approval"
editing  → review    : "Submit for approval"
review   → approved  : "Approve"
review   → rejected  : "Request changes"
rejected → editing   : "Revise"
approved → live      : "Publish"
live     → editing   : "Start revision"
live     → archived  : "Retire"
archived → (none)
```

### Core types

```typescript
// types/chart.ts
export type EmploymentType = 'full-time' | 'part-time' | 'contractor' | 'advisor'
export type NodeStatus = 'active' | 'open' | 'planned' | 'backfill'
export type RoleStatus = 'draft' | 'in-review' | 'approved' | 'published' | 'hired'
export type ChartStatus = 'draft' | 'editing' | 'review' | 'rejected' | 'approved' | 'live' | 'archived'

export interface Department {
  id: string
  name: string
  colour: string  // hex
}

export interface OrgNode {
  id: string
  name: string           // person name, or role title if open/planned
  title: string          // job title
  departmentId: string
  managerId: string | null  // null = root node
  status: NodeStatus
  employmentType: EmploymentType
  avatarUrl?: string
  location?: string
  startDate?: string
  x: number              // canvas position
  y: number
  isNew?: boolean        // shows ★ NEW badge
}

export interface OrgEdge {
  id: string
  sourceId: string  // manager node
  targetId: string  // report node
}

export interface OrgChart {
  id: string
  name: string      // clean name only — NO version numbers or dates in the name
  status: ChartStatus
  version: number   // system-tracked, shown as pill, never in the name
  departments: Department[]
  nodes: OrgNode[]
  edges: OrgEdge[]
  owner: string
  creator: string
  collaborators: string[]
  createdAt: string
  updatedAt: string
}

// types/jd.ts
export interface JobDescription {
  id: string
  nodeId: string
  status: RoleStatus
  responsibilities: string  // rich text HTML
  requirements: string
  salaryBandMin?: number
  salaryBandMax?: number
  salaryCurrency?: string
  level?: string
  updatedAt: string
  updatedBy: string
  version: number
}

// types/user.ts
export type Permission = 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer'

export interface User {
  id: string
  name: string
  email: string
  avatarUrl?: string
}

export interface WorkspaceMember {
  user: User
  permission: Permission
  joinedAt: string
}
```

---

## Mock Data

### Org charts (data/mockOrg.ts)

```typescript
// 6 charts covering all statuses
{ id:'1', name:'Current Structure',      status:'live',     version:3, nodes:24, depts:6 }
{ id:'2', name:'Q3 Hiring Plan',         status:'review',   version:2, nodes:31, depts:5 }
{ id:'3', name:'Post-Series B Scenario', status:'editing',  version:1, nodes:48, depts:6 }
{ id:'4', name:'Board Overview',         status:'approved', version:1, nodes:22, depts:4 }
{ id:'5', name:'Engineering Reorg',      status:'rejected', version:2, nodes:18, depts:3 }
{ id:'6', name:'2024 Structure',         status:'archived', version:4, nodes:20, depts:4 }
```

### Departments (used in mockOrg.ts)

```typescript
{ id:'eng',     name:'Engineering',  colour:'#0EA5E9', headcount:12, open:3 }
{ id:'product', name:'Product',      colour:'#10B981', headcount:5,  open:1 }
{ id:'design',  name:'Design',       colour:'#8B5CF6', headcount:4,  open:2 }
{ id:'go',      name:'Go-to-Market', colour:'#F59E0B', headcount:7,  open:1 }
{ id:'ops',     name:'Operations',   colour:'#EF4444', headcount:3,  open:0 }
{ id:'finance', name:'Finance',      colour:'#06B6D4', headcount:2,  open:1 }
```

### Role templates (data/mockJDs.ts)

```typescript
{ id:'1', title:'Senior Software Engineer', dept:'Engineering',  uses:4, tags:['IC','Technical'] }
{ id:'2', title:'Product Manager',          dept:'Product',      uses:2, tags:['PM','Leadership'] }
{ id:'3', title:'UX Designer',              dept:'Design',       uses:3, tags:['Design','IC'] }
{ id:'4', title:'Head of Engineering',      dept:'Engineering',  uses:1, tags:['Leadership','Director'] }
{ id:'5', title:'Sales Development Rep',    dept:'Go-to-Market', uses:5, tags:['Sales','IC'] }
{ id:'6', title:'QA Engineer',              dept:'Engineering',  uses:3, tags:['QA','IC'] }
```

---

## Zustand Store Structure

```typescript
// store/chartStore.ts
interface ChartStore {
  charts: OrgChart[]
  activeChartId: string | null
  setActiveChart: (id: string | null) => void
  updateChartStatus: (id: string, status: ChartStatus) => void
  addChart: (chart: OrgChart) => void
  duplicateChart: (id: string) => void
}

// store/uiStore.ts
interface UIStore {
  isDark: boolean
  sidebarCollapsed: boolean
  activePanelNodeId: string | null  // JD panel open for this node
  toggleTheme: () => void
  toggleSidebar: () => void
  openPanel: (nodeId: string) => void
  closePanel: () => void
}

// store/userStore.ts (stubbed Phase 1)
interface UserStore {
  user: User | null
  permission: Permission
  isAuthenticated: boolean
}
```

---

## Pricing & Feature Gating

| Feature | Free | Starter £18/mo | Growth £49/mo | Enterprise £800+/mo |
|---|---|---|---|---|
| Org charts | 1 | 5 | Unlimited | Unlimited |
| Nodes per chart | 30 | 100 | 500 | Unlimited |
| Collaborators | 3 | 5 + £4/seat | 10 + £4/seat | 25 + £6/seat |
| PNG export | ✅ watermark | ✅ | ✅ | ✅ |
| PDF export | ❌ | ✅ | ✅ | ✅ |
| JD editor | view only | ✅ | ✅ | ✅ |
| AI JD drafting | ❌ | 3/month | Unlimited | Unlimited |
| Headcount planning | ❌ | ❌ | ✅ | ✅ |
| Approval workflows | ❌ | ❌ | ✅ | ✅ |
| Real-time collab | ❌ | ❌ | ✅ | ✅ |
| SSO / SAML | ❌ | ❌ | ❌ | ✅ |
| Audit log | ❌ | ❌ | ❌ | ✅ |

---

## Sprint Plan

### Sprints 1–5 → Soft launch

| Sprint | Focus |
|---|---|
| 1 | App shell + canvas (this is the main build) |
| 2 | Node add/edit/delete + reporting lines |
| 3 | Auth + workspace + invite flow (Clerk) |
| 4 | Billing + feature gating (Stripe) |
| 5 | Share link + PNG export |

### Sprints 6–7 → Paid launch

| Sprint | Focus |
|---|---|
| 6 | Rich JD editor + AI drafting |
| 7 | Auto-layout + role type tagging |

---

## Tech Stack

| Concern | Choice |
|---|---|
| Framework | React 18 + TypeScript |
| Bundler | Vite |
| Styling | Tailwind CSS + CSS custom properties |
| Canvas | Custom SVG renderer (no third-party diagramming libs) |
| State | Zustand (chartStore, uiStore, userStore) |
| Routing | React Router v6 |
| Rich text | TipTap (Sprint 6) |
| Auth | Clerk (Sprint 3, stubbed until then) |
| Animations | Framer Motion |
| Icons | lucide-react |
| Deployment | Vercel (frontend), GitHub (version control) |

---

## Key Design Decisions — Do Not Revisit

| Decision | Rationale |
|---|---|
| No third-party component library | Custom components only — shadcn/ui and MUI fight the aesthetic |
| No third-party diagramming library | Custom SVG gives full design control and no licensing constraints |
| Version is metadata, never in the chart name | "Current Structure v2" is bad practice; "Current Structure" + v2 pill is correct |
| Action language in menus, never system language | Users "Submit for approval" — they don't "Move to In Review" |
| Roles section = templates + cross-chart search | Not a standalone entity list; roles live inside charts |
| Dashboard = org health snapshot | Not a task list; answers "what does my organisation look like right now?" |
| Dark theme as default | Premium, modern feel; matches NovaTech prototype baseline |
| Free tier is generous by design | Goal is dependency, not early revenue |
| Starter at £18/mo | Positions as HR workflow tool, not cheap diagramming |
| Hybrid seat model | Flat base seats included, per-seat overage above that |

---

*This document is the single source of truth for StratMap's design and product decisions.
Reference it in every Claude Code session. Last updated May 2026.*
