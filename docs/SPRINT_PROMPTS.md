# StratMap Sprint Prompts
*Original curated prompts for each feature across Sprints 2–7.*  
*Use alongside BACKLOG.md to reference detailed requirements while coding.*

---

## Sprint 2 — Node Management + Reporting Lines

### Prompt 2.1 — Add Node Modal

```
In the StratMap project, build the Add Node modal.

Reference: src/types/chart.ts for the OrgNode type.
Reference: stratmap-design-brief.md for component rules and colour tokens.

File to create: src/features/nodes/NodeModal.tsx

The modal should:
- Open when the user clicks "Add node" in the canvas toolbar
- Be a full overlay modal (not a side panel)
- Have a close button top-right and close on overlay click
- Use the nodePop animation on mount (scale from 0.88 to 1)

Fields:
1. Name — text input, required
   Label: "Name or role title"
   Placeholder: "e.g. Sarah Chen, or Head of Product (if open)"

2. Job title — text input, required
   Placeholder: "e.g. Senior Engineer"

3. Department — select dropdown
   Options populated from the current chart's departments array
   Each option shows the department colour dot + name

4. Employment type — segmented control (not a dropdown)
   Options: Full-time | Part-time | Contractor | Advisor
   Default: Full-time

5. Status — segmented control
   Options: Active | Open | Planned | Backfill
   Default: Active
   "Active" = filled role with a real person
   "Open / Planned / Backfill" = unfilled role

6. Reports to — select dropdown
   Options: all existing nodes in the chart (show name + title)
   Optional — can be left blank for the root node

7. Location — text input, optional
   Placeholder: "e.g. London, Remote"

8. Is this a new role? — toggle
   When on: shows ★ NEW badge on the node card

Form validation:
- Name and Job title are required
- Create button is disabled (greyed out) until both are filled
- Show inline error if user tries to submit without required fields

On submit:
- Call addNode(node) action in chartStore
- Auto-generate an OrgEdge if "Reports to" is selected
- Close modal
- Animate new node appearing on canvas with a pop animation

Styling:
- Modal width: 480px
- Inputs: use --input-bg, focus ring --brand-bg as defined in brief
- Create button: --grad-brand, disabled state uses --raised background
- Cancel button: transparent with --border

Export the modal as NodeModal with props:
  isOpen: boolean
  onClose: () => void
  chartId: string
```

---

### Prompt 2.2 — Edit Node Modal

```
Build the Edit Node modal in src/features/nodes/NodeModal.tsx.

This reuses the same component as Add Node but in edit mode.

Changes for edit mode:
- Title: "Edit role" instead of "Add node"
- All fields pre-populated with the node's current values
- Add a Delete button bottom-left (destructive, red)
- Delete requires a confirmation step — do not delete immediately:
  - Clicking Delete changes the button to "Are you sure?" with a 
    Confirm and Cancel option inline
  - Only on Confirm does it call deleteNode(nodeId)

On submit in edit mode:
- Call updateNode(nodeId, updates) in chartStore
- Close modal

Update chartStore to include:
  updateNode: (nodeId: string, updates: Partial<OrgNode>) => void
  deleteNode: (nodeId: string) => void
  — deleteNode should also remove any OrgEdges connected to that node

Wire up: double-clicking a node card on the canvas opens the edit modal
for that node. Single click still opens the JD panel.
```

---

### Prompt 2.3 — Reporting Lines (Edge Drawing)

```
Build the click-to-connect interaction for drawing reporting lines 
on the canvas.

Reference: src/features/canvas/OrgChart.tsx (existing canvas)
Reference: src/types/chart.ts for OrgEdge type

How it should work:
1. User selects the "Connect" tool in the toolbar (add this tool)
2. Canvas cursor changes to crosshair
3. User clicks a source node — it highlights with a brand-coloured 
   ring (--brand, 2px, animated pulse)
4. User clicks a target node — edge is drawn between them
5. A new OrgEdge is added to chartStore via addEdge(edge)
6. Canvas returns to normal select mode

Edge visual style:
- Smooth cubic bezier curve (not straight lines)
- Colour: the source node's department colour at 60% opacity
- Stroke width: 2px
- Arrow head at the target end (small, filled triangle)
- On hover: stroke width increases to 3px, opacity 100%
- Selected state (click on edge): brand colour, 3px, with a 
  small delete button appearing at the midpoint

Deleting an edge:
- Click the edge to select it
- Press Delete or Backspace key to remove it
- OR click the × button that appears at the edge midpoint when selected

Update chartStore:
  addEdge: (edge: OrgEdge) => void
  deleteEdge: (edgeId: string) => void

Guard against:
- Self-connections (source === target)
- Duplicate edges (same source + target already exists)
- Circular reporting (A reports to B, B already reports to A)
  — show a toast error: "This would create a circular reporting line"
```

---

### Prompt 2.4 — Undo/Redo History

```
Implement undo/redo for all canvas operations in StratMap.

Operations that should be undoable:
- Add node
- Edit node
- Delete node
- Add edge
- Delete edge
- Move node (drag reposition)

Implementation approach:
Create src/store/historyStore.ts using Zustand.

The store should maintain:
  past: ChartSnapshot[]   — previous states, max 50
  future: ChartSnapshot[] — states after current (for redo)

Where ChartSnapshot = { nodes: OrgNode[], edges: OrgEdge[] }

Expose:
  pushSnapshot: (snapshot: ChartSnapshot) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean

Every mutating chartStore action (addNode, updateNode, deleteNode, 
addEdge, deleteEdge) should call pushSnapshot with the current state 
before making the change.

Wire up keyboard shortcuts in src/hooks/useKeyboard.ts:
  Ctrl+Z / Cmd+Z → undo
  Ctrl+Shift+Z / Cmd+Shift+Z → redo

Show undo/redo buttons in the canvas toolbar:
  ← (undo) and → (redo) icons, disabled state when canUndo/canRedo is false

Show a brief toast notification when undoing/redoing:
  "Undo: deleted node" / "Redo: added reporting line"
  Toast appears bottom-centre, fades out after 2 seconds
```

---

### Prompt 2.5 — Node Status Badges + Department Colour Coding

```
Polish the node cards on the canvas with full status badge and 
department colour coding as defined in the StratMap brief.

For each OrgNode rendered on the canvas:

1. Department colour:
   - Left border of the node card: 3px solid, department colour
   - Avatar circle background: department colour at 20% opacity, 
     border 1px department colour at 40% opacity

2. Status badges — show in the bottom-right corner of the node card:
   - active: no badge (clean)
   - open: amber pill "OPEN" with Briefcase icon
   - planned: purple pill "PLANNED" with Clock icon  
   - backfill: blue pill "BACKFILL" with RefreshCw icon
   - isNew: teal pill "★ NEW" — shown in addition to status badge

3. Employment type indicator — small label bottom-left:
   - contractor: show "CONTRACT" in dim text
   - advisor: show "ADVISOR" in dim text
   - full-time / part-time: no label

4. Node card dimensions:
   - Width: 220px
   - Min height: 80px
   - Border radius: 12px
   - Background: --surface
   - Border: 1px --border
   - Box shadow: --shadow-sm
   - On hover: border --border-hover, shadow --shadow, 
     translateY(-1px), transition 0.15s

5. Node card content layout:
   Top row: avatar circle (36px) + name (font-weight 700) + 
            status badge (right-aligned)
   Bottom row: job title (--muted, 13px) + 
               employment type label (--dim, 11px)

Make sure nodes that are "open" or "planned" show the role title 
in place of a person name, styled in italic to signal the role 
is unfilled.
```

---

### Prompt 2.6 — Spotlight Search (Cmd+K)

```
Build the Spotlight search in StratMap.

Trigger: Cmd+K or Ctrl+K from anywhere in the app.

File: src/components/ui/Spotlight.tsx

UI:
- Full-screen overlay, background rgba(0,0,0,0.5)
- Centred modal, 560px wide, border-radius 16px
- --surface background, --shadow shadow
- Large search input at top (18px font, no border, full width)
- Results list below the input, max-height 360px, scrollable
- Keyboard navigable: arrow keys move selection, Enter confirms, 
  Escape closes

Search scope:
1. Nodes in the current chart (name + job title)
   Result shows: avatar circle + name + title + department colour dot
   On select: pan canvas to centre that node, highlight it with 
   a brand ring for 2 seconds

2. Org charts in the workspace (name)
   Result shows: Network icon + chart name + status badge
   On select: navigate to that chart

3. Pages / navigation
   Result shows: relevant icon + page name
   On select: navigate to that page
   Static list: Dashboard, Org Charts, Roles, Headcount, Settings

Group results under headings: "People & Roles", "Charts", "Pages"
Show empty state if no results: "No results for '...'"

Wire up in src/hooks/useKeyboard.ts alongside the undo/redo shortcuts.
Show the ⌘K hint in the top nav search bar (already visually present 
from Sprint 1 — just needs to be wired up).
```

---

## Sprint 3 — Auth + Workspace + Invite Flow

### Prompt 3.1 — Clerk Auth Setup

```
Set up Clerk authentication in StratMap.

Install and configure @clerk/clerk-react.

1. Add VITE_CLERK_PUBLISHABLE_KEY to .env.local
   (I will provide the key — leave a placeholder for now)

2. Wrap the app in <ClerkProvider> in src/main.tsx

3. Create src/features/auth/AuthProvider.tsx
   This component should:
   - Show a loading spinner while Clerk initialises
   - Redirect unauthenticated users to /sign-in
   - Wrap authenticated routes in a workspace check
     (if user has no workspace, redirect to /onboarding)

4. Create src/features/auth/useAuth.ts
   A hook that returns:
     user: { id, name, email, avatarUrl }
     permission: Permission (from WorkspaceMember type)
     isLoaded: boolean
     signOut: () => void

5. Create two auth pages:
   src/pages/SignInPage.tsx — Clerk <SignIn> component, centred, 
   dark background, StratMap logo above
   
   src/pages/SignUpPage.tsx — Clerk <SignUp> component, same layout

6. Add routes in App.tsx:
   /sign-in → SignInPage
   /sign-up → SignUpPage
   /onboarding → OnboardingPage (build in next prompt)
   All other routes → wrapped in AuthProvider (require auth)

7. Update the user avatar in TopNav to show the real Clerk user's 
   initials and avatar if available. Wire the avatar click to 
   Clerk's signOut().

Update userStore to hydrate from Clerk's useUser() hook.
```

---

### Prompt 3.2 — Onboarding Flow

```
Build the onboarding flow in src/pages/OnboardingPage.tsx.

This appears when a user signs up for the first time and has 
no workspace yet.

Step 1 of 2 — "Set up your workspace":
  - Workspace name input (required)
    Placeholder: "e.g. Acme Corp, My Startup"
  - Your role select:
    Options: Founder/CEO, HR Leader, Operations, Finance, Other
  - Company size select:
    Options: 1–10, 11–50, 51–200, 201–1000, 1000+
  - Continue button (disabled until workspace name is filled)

Step 2 of 2 — "Invite your team" (optional, skippable):
  - Heading: "StratMap is better with your team"
  - Three email input rows pre-shown (add more up to 5)
  - Each row: email input + role select (Admin/Editor/Viewer)
  - "Add another" link below
  - Two buttons: "Skip for now" and "Send invites & get started"

Progress indicator: two dots at the top (step 1 filled, step 2 hollow)

On completion:
  - Create workspace in userStore: { id, name, role, size, members }
  - If invites entered: add to a pendingInvites array in userStore
  - Navigate to /charts
  - Show a welcome toast: "Welcome to StratMap, [name] 🎉"

Layout:
  - Full screen, --bg background
  - Centred card, max-width 480px
  - StratMap logo top-centre
  - Step card with --surface background, 32px padding, 20px border-radius
```

---

### Prompt 3.3 — Workspace Settings + Invite Management

```
Build the Members tab in SettingsPage to be fully functional.

Replace the current empty state with real workspace member management.

Member list (when members exist):
  Each row shows:
  - Avatar circle + name + email
  - Role badge (Owner/Admin/Editor/Viewer) — clickable dropdown 
    to change role (Owner/Admin only can change roles)
  - Remove button (×) — Owner/Admin only, not shown for own row
  - Joined date in --dim text

Invite flow:
  "Invite" button opens an inline form below the member list:
  - Email input
  - Role select: Admin | Editor | Viewer | Commenter
  - Send invite button

Pending invites section (if any):
  Shows below the member list with heading "Pending invites"
  Each row: email + role + "Resend" link + "Cancel" (×)
  Shown with a clock icon and "--muted" styling

Seat usage indicator:
  "3 of 5 seats used" shown below the heading
  A simple progress bar: seats used / seats included
  If at limit: amber warning "You've used all included seats. 
  Additional seats are £4/month."
  Link: "Upgrade to add more seats"

Permission rules enforced in UI:
  - Owner can do everything
  - Admin can invite, change roles (except Owner), remove members
  - Editor/Viewer/Commenter can only view the members list
  - Show a lock icon and tooltip for actions the current user 
    cannot perform

Wire all this to userStore — no real API yet, just state management.
```

---

### Prompt 3.4 — Permission-gating Across the UI

```
Enforce role-based permissions throughout StratMap's UI.

Using the permission from useAuth(), apply these rules:

Canvas:
  - Viewer/Commenter: cannot drag nodes, cannot add/edit/delete nodes,
    cannot draw edges. Canvas is read-only.
  - Show a "View only" badge in the canvas toolbar for these roles.
  - Editor+: full canvas editing

Node modal:
  - Viewer/Commenter: cannot open edit modal (double-click does nothing)
  - Editor+: full access

JD panel:
  - Viewer: can read only
  - Commenter: can read and comment (Phase 2)
  - Editor+: can edit

Chart library:
  - Viewer: can see charts, cannot create new ones (New chart button hidden)
  - Editor+: can create charts
  - Admin+: can delete charts

Status actions in chart card menu:
  - Editor can "Submit for approval" and "Revise"
  - Admin can "Approve", "Request changes", "Publish", "Retire"
  - Viewer sees no action items in the menu

Settings:
  - Billing tab: Admin+ only (redirect to Dashboard with toast 
    "Only admins can manage billing" if Viewer/Editor tries to access)
  - Members tab: Editor and above can view, Admin+ can manage

Implementation:
  Create src/hooks/usePermission.ts
  Exports: 
    canEdit: boolean
    canAdmin: boolean  
    canComment: boolean
    isOwner: boolean
  
  Use this hook in every component that needs permission checks.
  Never duplicate the permission logic — always use the hook.
```

---

## Sprint 4 — Billing + Feature Gating

### Prompt 4.1 — Plan and Limits State

```
Set up the billing and plan state in StratMap.

Create src/store/billingStore.ts using Zustand.

Types to add in src/types/user.ts:
  type PlanTier = 'free' | 'starter' | 'growth' | 'enterprise'
  
  interface Plan {
    tier: PlanTier
    seats: number           // included seats
    maxCharts: number       // -1 = unlimited
    maxNodesPerChart: number
    billingCycle: 'monthly' | 'annual' | null
    renewsAt: string | null
  }

  interface UsageLimits {
    chartsUsed: number
    seatsUsed: number
    aiDraftsUsed: number    // resets monthly
    aiDraftsLimit: number   // 0 = none, -1 = unlimited, 3 = starter
  }

Billing store:
  plan: Plan (default: free tier values)
  usage: UsageLimits
  isLoading: boolean
  
  Actions:
  setPlan: (plan: Plan) => void
  incrementUsage: (key: keyof UsageLimits) => void

Free tier limits:
  maxCharts: 1
  maxNodesPerChart: 30
  seats: 3
  aiDraftsLimit: 0

Starter tier limits:
  maxCharts: 5
  maxNodesPerChart: 100
  seats: 5
  aiDraftsLimit: 3

Growth tier limits:
  maxCharts: -1 (unlimited)
  maxNodesPerChart: 500
  seats: 10
  aiDraftsLimit: -1 (unlimited)

Create src/hooks/usePlanLimits.ts
  Exports:
    isAtChartLimit: boolean
    isAtNodeLimit: (chartId: string) => boolean
    isAtSeatLimit: boolean
    canUseAIDrafting: boolean
    currentTier: PlanTier
    upgradeRequired: (feature: string) => boolean
```

---

### Prompt 4.2 — Upgrade Modal

```
Build a reusable upgrade modal in src/components/ui/UpgradeModal.tsx.

This modal appears whenever a user tries to use a gated feature 
on an insufficient plan.

Props:
  isOpen: boolean
  onClose: () => void
  feature: string        // e.g. "Headcount planning"
  requiredTier: 'starter' | 'growth' | 'enterprise'
  currentTier: PlanTier

Layout:
  - Centred modal, 460px wide, nodePop animation on mount
  - Top: coloured icon relevant to the feature (use purple for growth, 
    blue for starter features)
  - Heading: "Unlock [feature]"
  - Body: one sentence explaining what they get and which plan it's on
    e.g. "Headcount planning is available on the Growth plan — 
    plan every hire by quarter, track budgets, and route approvals."
  - Plan card showing the required plan:
    - Plan name + price (monthly/annual toggle)
    - 4 key features of that plan as bullet points with check icons
    - "Upgrade to [Plan]" button (gradient, full width)
  - "Maybe later" text link below

The modal should be smart about what it shows:
  - If requiredTier is 'starter' and they're on Free: show Starter card
  - If requiredTier is 'growth': show Growth card
  - Include the annual discount prominently: "Save 22% with annual billing"

Trigger this modal from:
  - Headcount page (already has an upgrade CTA — wire it to this modal)
  - Node limit reached (when trying to add node beyond plan limit)
  - Chart limit reached (when trying to create chart beyond plan limit)
  - PDF export attempt on Free plan
  - AI JD drafting attempt on Free plan or when Starter limit reached
```

---

### Prompt 4.3 — Limit Enforcement

```
Enforce plan limits throughout StratMap using usePlanLimits hook.

1. Chart creation limit:
   In ChartView.tsx, when "New chart" is clicked:
   - Check isAtChartLimit
   - If true: open UpgradeModal instead of NewChartModal
   - Show current usage in the library: "3 of 5 charts used" 
     as a small indicator below the page heading

2. Node creation limit:
   In NodeModal.tsx, when adding a node:
   - Check isAtNodeLimit(chartId)
   - If true: show UpgradeModal with feature="More nodes"
   - Show node count in canvas toolbar: "18 / 30 nodes" 
     for free tier, hidden for unlimited tiers

3. Seat limit:
   In Settings > Members:
   - Check isAtSeatLimit before showing invite form
   - If at limit: show upgrade prompt inline (not a modal, 
     just an amber banner within the members card)

4. Export gating:
   PNG export: available to all (add watermark for free tier)
   PDF export: check plan, show UpgradeModal if Free

5. Free tier watermark on PNG export:
   When exporting PNG on Free plan, add a subtle watermark 
   to the bottom-right of the exported image:
   "Made with StratMap" in --dim colour, 12px, DM Sans

All limit checks must use usePlanLimits — never inline the logic.
```

---

### Prompt 4.4 — Stripe Checkout Integration

```
Build the Stripe checkout flow in StratMap.

This is frontend-only — we are not building a backend yet. 
Use Stripe's client-only Checkout (Payment Links) for now.

1. Create src/features/billing/CheckoutButton.tsx
   Props:
     tier: 'starter' | 'growth'
     billingCycle: 'monthly' | 'annual'
     
   On click: redirects to the appropriate Stripe Payment Link URL
   (these will be set as environment variables:
    VITE_STRIPE_STARTER_MONTHLY_URL
    VITE_STRIPE_STARTER_ANNUAL_URL
    VITE_STRIPE_GROWTH_MONTHLY_URL
    VITE_STRIPE_GROWTH_ANNUAL_URL)

2. Build the full Pricing page at src/pages/PricingPage.tsx
   Route: /pricing

   Layout: three columns (Free, Starter, Growth) + Enterprise card below
   
   For each plan card:
   - Plan name (large, bold)
   - Price with monthly/annual toggle at top of page
   - "Most popular" badge on Growth
   - One-line value proposition
   - Feature list with check icons (green for included, 
     grey × for not included)
   - CTA button: "Get started free" / "Upgrade to Starter" / 
     "Upgrade to Growth"
   - Current plan highlighted with brand border if user is on that plan
   
   Annual toggle: shows prices at annual rate with "Save 22%" badge

   Enterprise card (full width below):
   - Left: copy about enterprise features
   - Right: "Talk to us" button (mailto: link for now)

3. Add /pricing link in Settings > Billing tab beneath the 
   current plan card: "View all plans →"

4. Handle the post-Stripe-redirect:
   Add a /billing/success route that:
   - Shows a success message: "You're now on [Plan] 🎉"
   - Updates billingStore with the new plan
     (use URL params ?plan=starter or ?plan=growth)
   - Redirects to /charts after 3 seconds
```

---

## Sprint 5 — Share Link + PNG Export

### Prompt 5.1 — Read-only Share Link

```
Build the share link feature in StratMap.

1. Add share state to chartStore:
   Each OrgChart gets:
     shareToken: string | null    // null = not shared
     shareEnabled: boolean
     sharePasswordHash?: string   // Starter+ feature

   Actions:
     enableSharing: (chartId: string) => string  // returns token
     disableSharing: (chartId: string) => void
     setSharePassword: (chartId: string, password: string) => void

2. Share button in the canvas toolbar:
   Add a Share button (right side of toolbar, brand coloured)
   Opens a Share panel (not a full modal — a popover anchored to button)
   
   Share panel contains:
   - Toggle: "Anyone with the link can view" (on/off)
   - When on: show the share URL in a copy-able input
     Format: https://stratmap.app/share/[token]
   - Copy button: copies URL, shows "Copied!" for 2 seconds
   - Separator
   - Password protection toggle (Starter+ — show lock icon + 
     "Starter feature" tooltip if on Free)
   - When password enabled: password input field
   - "Done" button closes the panel

3. Shared chart view at /share/:token
   This route must work WITHOUT authentication.
   
   It should:
   - Look up the chart by token (from chartStore for now)
   - If password protected: show a password entry screen first
   - Render the full canvas in READ-ONLY mode (no toolbar editing tools)
   - Show a top bar: StratMap logo (left) + chart name + 
     status badge (centre) + "Sign up free" button (right, --grad-brand)
   - The "Sign up free" button links to /sign-up
   - No sidebar, no TopNav — clean, focused view
   - Show a subtle "Made with StratMap" footer

4. Share link in chart card:
   In the ChartCard "…" menu, add "Copy share link" as an option
   Only visible if sharing is enabled for that chart
   Otherwise shows "Share chart" which opens the share panel

The /share/:token route is public — do not wrap it in AuthProvider.
```

---

### Prompt 5.2 — PNG Export

```
Build PNG export for org charts in StratMap.

Reference: src/utils/export.ts (create this file)

1. Export utility in src/utils/export.ts:

   exportChartAsPNG(chartId: string, options: ExportOptions): Promise<void>
   
   interface ExportOptions {
     scale: number          // 1 = screen resolution, 2 = 2x (default)
     includeWatermark: boolean  // true for free tier
     filename: string
   }

   Implementation:
   - Use html-to-image library (install it: npm install html-to-image)
   - Target the canvas SVG element by a data-export-target attribute
   - Scale up for retina quality at 2x
   - If includeWatermark: overlay "Made with StratMap" text 
     bottom-right, --dim colour, 13px
   - Download the PNG file automatically

2. Export button in canvas toolbar:
   Add an Export button (download icon) in the toolbar
   
   Opens an Export panel (popover):
   - "Export as PNG" option — available to all
     Sub-label for Free: "Includes StratMap watermark"
   - "Export as PDF" option — Starter+ 
     Shows lock icon + "Starter feature" on Free
     On Free: clicking opens UpgradeModal
   - Quality selector: Standard / High (2×)
   - Filename input (pre-filled with chart name)
   - Export button (full width, --grad-brand)

3. For PDF export (Starter+):
   Use the browser's print functionality as a fallback:
   - Call window.print() on a dedicated print-optimised view
   - Add print CSS that hides navigation and shows only the canvas
   - This is acceptable for Sprint 5 — a proper PDF library 
     can come later

4. Check plan in the export panel using usePlanLimits:
   - Free: PNG with watermark only
   - Starter+: PNG without watermark, PDF
   - Always use the CheckPlanLimits hook, never inline the logic
```

---

### Prompt 5.3 — Polish and Soft Launch Prep

```
Prepare StratMap for soft launch. Apply polish across the app.

1. Empty states — ensure every page has a proper empty state:
   
   Dashboard (no charts yet):
   - Replace KPI cards with welcome message + quick start guide
   - Show 3 cards: "Build your chart", "Invite your team", 
     "Share with stakeholders" with icons and CTAs
   
   Chart library (no charts):
   - Current empty state is good — verify it looks correct
   
   Canvas (empty chart, 0 nodes):
   - Centre prompt: "Add your first person or role"
   - Large + button in centre canvas area
   - Subtle grid dot pattern as canvas background
   
   Roles > Template library (no templates):
   - "No role templates yet" with FileText icon
   - "Create your first template" CTA
   
   Roles > Find roles (no charts to search):
   - Explain why search is empty: "Add people to your org charts 
     first, then search for roles here"

2. Toast notification system:
   Create src/components/ui/Toast.tsx
   A lightweight toast stack (bottom-centre of screen)
   Variants: success (green), error (red), info (blue), warning (amber)
   Auto-dismiss after 3 seconds
   Max 3 toasts visible at once
   Slide up on appear, fade out on dismiss
   
   Wire up toasts for:
   - Node added: "Role added"
   - Node deleted: "Role removed — Undo" (clicking Undo triggers undo)
   - Chart status changed: "Submitted for approval"
   - Link copied: "Link copied to clipboard"
   - Export started: "Exporting chart..."

3. Loading states:
   Add skeleton loaders to:
   - Chart library grid (while charts load)
   - Dashboard KPI cards (while data loads)
   Each skeleton: --raised background, subtle pulse animation

4. Error boundary:
   Create src/components/ui/ErrorBoundary.tsx
   Wrap the main app content
   Show a friendly error screen if something crashes:
   - StratMap logo
   - "Something went wrong" heading
   - "Refresh the page" button
   - In development: show the error stack

5. Favicon and meta tags:
   Update index.html with:
   - Title: "StratMap — Map your organisation"
   - Description meta tag
   - OG image meta tags (use a simple branded placeholder)
   - Theme colour: #060D18
```

---

## Sprint 6 — Rich JD Editor + AI Drafting

### Prompt 6.1 — TipTap Rich Text JD Editor

```
Build the job description editor in StratMap using TipTap.

File: src/features/jd/JDEditor.tsx

The JD editor lives inside the JD slide-out panel (right side of canvas).

Editor structure:
  Two sections, each with a TipTap editor instance:
  1. Responsibilities
  2. Requirements
  
  Both sections support:
  - Headings (H2, H3)
  - Bullet lists and numbered lists
  - Bold, italic, underline
  - Inline code
  - Links

Toolbar (shown above each editor on focus):
  Bold | Italic | | H2 | H3 | | Bullet list | Numbered list
  Compact, icon-only, appears floating above the active editor
  Uses --raised background, --border border, 8px border-radius

Additional fields (below the editors):
  - Level: text input, placeholder "e.g. IC3, Senior, L5, Director"
  - Salary band: two number inputs (min / max) + currency select (£/$/€)
    Admin-only — show a lock icon with tooltip for Editor/Viewer
  - Last edited by + timestamp (read-only, shown in --dim text)

Auto-save behaviour:
  - Debounce saves to jobDescriptionStore every 1 second after typing stops
  - Show "Saving..." and then "Saved" status indicator top-right of panel
  - Never require a manual save button for content

Create src/store/jobDescriptionStore.ts:
  jobDescriptions: Record<nodeId, JobDescription>
  
  Actions:
  updateJD: (nodeId: string, updates: Partial<JobDescription>) => void
  updateJDStatus: (nodeId: string, status: RoleStatus) => void

Character count: show at bottom of each editor section,
"287 characters" in --dim text.
```

---

### Prompt 6.2 — JD Status Workflow

```
Build the JD approval workflow into the JD panel.

The JD panel already has an Approve / Request Edit button area. 
Replace this with a full status workflow.

RoleStatus workflow:
  draft → in-review → approved → published → hired
                ↑         |
                └─────────┘ (rejected back to draft)

Status display:
  Show current status as a large badge at the top of the JD panel
  below the role title.
  
  Colour mapping:
  draft:     --muted
  in-review: --purple
  approved:  --brand
  published: --success
  hired:     --success (with checkmark)

Action buttons (shown based on current status and user permission):

  If draft:
    Editor+: "Submit for review" button (--grad-purple)
  
  If in-review:
    Admin+: "Approve" button (--grad-brand) + "Request changes" button (red outline)
    Editor: read-only, show "Awaiting approval" message
  
  If approved:
    Admin+: "Mark as published" button (--grad-success)
  
  If published:
    Admin+: "Mark as hired" button (--grad-success)
    Editor+: "Start new revision" button (outline) — resets to draft,
    increments JD version number
  
  If hired:
    Show "This role has been filled" banner (success bg)
    Admin+: "Reopen role" button (outline) — resets to draft

Version history indicator:
  Show "Version [n]" pill below the status badge
  "View history" link (Phase 2 — just show it greyed out for now 
  with "Coming soon" tooltip)
```

---

### Prompt 6.3 — AI JD Drafting

```
Build AI-assisted job description drafting in StratMap.

This feature calls the Anthropic API from a server-side route
(api/ai/draft.ts), which streams the result back to the frontend.
Use the claude-sonnet-4-6 model.

API call setup:
  The API key must come from a SERVER-side environment variable:
  ANTHROPIC_API_KEY  (never a VITE_ prefix — that bundles the key
  into the public client). The browser never sees the key; the
  component reads the stream from /api/ai/draft.

File: src/features/jd/AIJDDraft.tsx

UI — "Draft with AI" button:
  - Shown at the top of the JD panel when the JD is in draft status
    and the editor is empty or has less than 100 characters
  - Button style: --grad-purple with Sparkles icon
  - For Free tier: greyed out with lock icon, clicking opens UpgradeModal
  - For Starter: shows remaining drafts "2 of 3 remaining this month"
  - For Growth: no limit shown

Clicking "Draft with AI" opens an AI draft panel:
  - Slides in above the editor (not a modal)
  - Shows: role title (pre-filled from node) + department (pre-filled)
  - Optional tone selector: Professional | Direct | Startup | Inclusive
  - Optional: "Any specific requirements to include?" text area
  - "Generate draft" button

Loading state:
  - Animated gradient shimmer over placeholder text blocks
  - "Writing your JD..." label
  - Cancel button

On completion:
  - Stream the response into the editor using TipTap's commands
  - Text appears word by word (streaming effect)
  - "Review and edit" prompt appears above the editor
  - Show "Discard draft" link if they want to start over

Prompt sent to Anthropic API:
  System: "You are an expert HR professional writing job descriptions 
  for a modern tech company. Write clearly, inclusively, and 
  concisely. Use bullet points for responsibilities and requirements. 
  Do not include salary information. Do not use jargon."
  
  User: "Write a job description for a [title] role in the 
  [department] department. Tone: [tone]. [Any additional requirements].
  Format: two sections — Responsibilities (5-7 bullets) and 
  Requirements (4-6 bullets). Start directly with the content, 
  no preamble."

After drafting:
  - Increment aiDraftsUsed in billingStore
  - Save the draft to jobDescriptionStore
```

---

### Prompt 6.4 — JD Templates in Roles Section

```
Wire up the JD template library in the Roles section to be 
fully functional.

Currently the template library shows mock data. 
Make it real.

1. Create a templateStore in src/store/templateStore.ts:
   
   interface RoleTemplate {
     id: string
     title: string
     department: string
     responsibilities: string   // TipTap HTML
     requirements: string
     tags: string[]
     createdBy: string
     updatedBy: string
     updatedAt: string
     usedInCharts: string[]    // chart IDs
   }
   
   Actions:
   addTemplate: (template) => void
   updateTemplate: (id, updates) => void
   deleteTemplate: (id) => void
   applyToNode: (templateId, nodeId) => void
   
   Seed with the 6 mock templates from mockJDs.ts

2. Template card actions:
   - "Edit" button opens a full TipTap editor modal for that template
   - "Use in chart" dropdown: lists all current charts, 
     selecting one opens node selector to apply it to a node
   - "Duplicate" option in the … menu
   - "Delete" option in the … menu (with confirmation)

3. New template flow:
   "New template" button opens a modal with:
   - Title input (required)
   - Department select
   - Tags input (comma-separated, shown as pills)
   - TipTap editor for Responsibilities
   - TipTap editor for Requirements
   - Save button

4. Applying a template to a node:
   In the JD panel, add "Apply template" link below the editor 
   when the JD is empty.
   Opens a searchable list of templates.
   Selecting one populates the editor — user can then edit.
   Show "Applied from template: [name]" attribution below the editor
   in --dim text.
```

---

## Sprint 7 — Auto-layout + Role Type Tagging

### Prompt 7.1 — Hierarchical Auto-layout Algorithm

```
Build the auto-layout engine for StratMap's org chart canvas.

File: src/utils/layout.ts

Implement a top-down hierarchical layout algorithm.

The algorithm should:
1. Find the root node (managerId === null)
2. Build a tree structure from OrgEdges
3. Calculate x,y positions for each node using a 
   Reingold-Tilford style algorithm:
   - Top-down orientation
   - Each level has a fixed vertical gap: 120px
   - Nodes at the same level are spaced 260px apart horizontally
   - Subtrees are centred under their parent
   - No node overlaps

Export:
  calculateLayout(nodes: OrgNode[], edges: OrgEdge[]): 
    Map<string, { x: number, y: number }>

Handle edge cases:
  - Multiple root nodes (disconnected nodes): lay them out in a 
    row at the top
  - Circular references: detect and skip (log a warning)
  - Isolated nodes (no edges): place them in a row below the tree

2. "Auto-layout" button in canvas toolbar:
   Add a layout icon button in the toolbar
   On click:
   - Calculate new positions using calculateLayout
   - Animate all nodes smoothly to their new positions
     Use Framer Motion's animate() or CSS transitions
     Duration: 400ms, ease-out-cubic
   - Show a toast: "Layout applied"

3. "Tidy selection" option:
   When multiple nodes are selected (Phase 2 multi-select), 
   only lay out the selected subtree. 
   For now: greyed out with "Select nodes first" tooltip.

Available on: Starter plan and above.
Free tier: button shows but is locked. Clicking opens UpgradeModal.
```

---

### Prompt 7.2 — Role Type Tagging

```
Add role type tagging to every node in StratMap.

Role types represent the headcount context of a position — 
whether it is an existing role, a new hire, a backfill, etc.

Add to OrgNode type in types/chart.ts:
  roleType?: 'existing' | 'new-headcount' | 'backfill' | 'contractor' | 'tbd'

1. Role type selector in NodeModal (Add + Edit):
   Add a "Role type" field between Status and Reports to.
   
   Shown as a segmented button row:
   Existing | New HC | Backfill | Contractor | TBD
   
   Default: 'existing' for Active status, 'tbd' for Open/Planned
   
   Visual hint for each type (small coloured dot):
   existing:       --muted (grey)
   new-headcount:  --success (green)
   backfill:       --warn (amber)
   contractor:     --purple (purple)
   tbd:            --dim (dark grey)

2. Role type badge on node cards:
   Show a small pill badge below the job title:
   - "NEW HC" in green for new-headcount
   - "BACKFILL" in amber for backfill
   - "CONTRACT" in purple for contractor
   - "TBD" in dim for tbd
   - Nothing for 'existing' (clean default)

3. Role type filter in canvas department filter panel:
   Add a second filter section "Role type" below departments
   Checkboxes for each type
   When filtered: only matching nodes are fully visible, 
   others are shown at 30% opacity

4. Role type summary in the JD panel:
   Show the role type as a field in the Overview tab:
   "Role type: New Headcount" in a simple key-value row

5. Dashboard — role type breakdown:
   Add a small "By role type" breakdown to the dashboard,
   below the role pipeline section.
   Show counts for each non-existing type:
   e.g. "3 new hires · 2 backfills · 1 contractor"
   Each as a coloured pill.
```

---

### Prompt 7.3 — Paid Launch Polish

```
Final polish before paid launch of StratMap.

1. Pricing page improvements:
   - Add a FAQ section below the plan cards:
     Q: Can I change plans at any time?
     Q: What happens to my charts if I downgrade?
     Q: Do guests count as seats?
     Q: Is there a free trial for paid plans?
     Q: What payment methods do you accept?
   - Add a "Trusted by teams at" logo bar (placeholder company names)
   - Add annual/monthly pricing toggle that affects ALL plan prices

2. Onboarding improvements:
   - After workspace creation, offer to create a starter chart 
     from a template immediately
   - "Quick start" option: creates a 5-node "Current Structure" 
     chart with placeholder nodes for CEO, CTO, CPO, Head of Sales, 
     Head of Operations
   - User can immediately start editing

3. In-app upgrade prompts (contextual):
   
   When user hits 80% of node limit:
   Show amber banner at top of canvas:
   "You're using 24 of 30 nodes. Upgrade to Starter for 100 nodes."
   With dismiss (×) and "Upgrade" button.
   
   When user creates their 1st chart (Free):
   Show subtle banner: "Free plan includes 1 chart. 
   Upgrade to create up to 5."
   
   When user shares a chart (Free):
   After copying the link, show:
   "Upgrade to Starter to remove the StratMap watermark from exports 
   and protect links with a password."

4. Footer in shared chart view:
   Replace "Made with StratMap" plain text with a styled component:
   StratMap logo mark + "Made with StratMap" + "Try it free →" link
   This is the primary viral growth mechanism — make it look good.

5. Page titles:
   Every page should have a dynamic document title:
   Dashboard:     "StratMap — Dashboard"
   Chart library: "StratMap — Org Charts"
   Canvas:        "[Chart name] — StratMap"
   Roles:         "StratMap — Roles"
   Shared view:   "[Chart name] — Shared via StratMap"
   Sign in:       "Sign in — StratMap"
```

---

*Last updated: May 2026*
