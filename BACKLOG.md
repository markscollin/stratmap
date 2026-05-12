# StratMap Development Backlog
*All remaining work across Sprints 2–7. Check off tasks as they're completed.*

---

## Sprint 2 — Node Management + Reporting Lines
**Goal:** Make the canvas fully editable. Users can add, edit, and delete nodes, draw and remove reporting lines, and see their changes persist in state.

### 2.1 — Add Node Modal ✅
**Prompt:** Build the Add Node modal in src/features/nodes/NodeModal.tsx

- [x] Create NodeModal.tsx component scaffold
- [x] Build form fields:
  - [x] Name (text input, required)
  - [x] Job title (text input, required)
  - [x] Department (select dropdown)
  - [x] Employment type (segmented control)
  - [x] Status (segmented control)
  - [x] Reports to (select dropdown, optional)
  - [x] Location (text input, optional)
  - [x] Is this a new role? (toggle)
- [x] Form validation (Name & Job title required)
- [x] Create button disabled until required fields filled
- [x] Wire modal open trigger to toolbar "Add node" button
- [x] Implement chartStore.addNode() action
- [x] Auto-generate OrgEdge if "Reports to" selected
- [x] Modal animations (nodePop on mount)
- [x] Style with design tokens (--input-bg, --brand-bg, --grad-brand)
- [x] Test form submission & validation

---

### 2.2 — Edit Node Modal ✅
**Prompt:** Build Edit Node modal (reuses NodeModal component, edit mode)

- [x] Add edit mode to NodeModal component
- [x] Pre-populate all fields with node's current values
- [x] Change title to "Edit role"
- [x] Add Delete button (bottom-left, destructive)
- [x] Implement delete confirmation flow (2-step: Delete → "Are you sure?" → Confirm/Cancel)
- [x] Implement chartStore.updateNode() action
- [x] Implement chartStore.deleteNode() action (removes connected edges)
- [x] Wire double-click on node card to open edit modal
- [x] Verify single-click still opens JD panel
- [x] Test edit, delete, confirmation flows

---

### 2.3 — Reporting Lines (Edge Drawing) ✅
**Prompt:** Build click-to-connect interaction for drawing reporting lines

- [x] Add "Connect" tool button to toolbar
- [x] Implement cursor change to crosshair when Connect active
- [x] Implement click-to-connect flow:
  - [x] Click source node → highlight with brand ring (animated pulse)
  - [x] Click target node → draw edge
  - [x] Return to normal select mode
- [x] Implement chartStore.addEdge() action
- [x] Guard against self-connections (source === target)
- [x] Guard against duplicate edges
- [x] Guard against circular reporting (show toast error)
- [x] Edge visual styling:
  - [x] Smooth cubic bezier curve
  - [x] Department colour at 60% opacity
  - [x] Arrow head at target end
  - [x] On hover: 3px, 100% opacity
- [x] Edge selection state:
  - [x] Click edge to select → brand colour, 3px
  - [x] Delete button appears at midpoint
- [x] Delete edge via Delete/Backspace key or × button
- [x] Implement chartStore.deleteEdge() action
- [x] Test all connection scenarios & guards

---

### 2.4 — Undo/Redo History ✅
**Prompt:** Implement undo/redo for all canvas operations

- [x] Create src/store/historyStore.ts (Zustand)
- [x] Maintain past/future state arrays (max 50 snapshots)
- [x] Export: pushSnapshot(), undo(), redo(), canUndo, canRedo
- [x] Integrate with chartStore:
  - [x] addNode calls pushSnapshot
  - [x] updateNode calls pushSnapshot
  - [x] deleteNode calls pushSnapshot
  - [x] addEdge calls pushSnapshot
  - [x] deleteEdge calls pushSnapshot
  - [x] Node drag reposition calls pushSnapshot
- [x] Create src/hooks/useKeyboard.ts (or extend existing)
- [x] Wire keyboard shortcuts:
  - [x] Ctrl+Z / Cmd+Z → undo
  - [x] Ctrl+Shift+Z / Cmd+Shift+Z → redo
- [x] Add undo/redo buttons to canvas toolbar (disabled when canUndo/canRedo false)
- [x] Show toast notification on undo/redo (bottom-centre, 2 second fade)
- [x] Test undo/redo for all operatable actions

---

### 2.5 — Node Status Badges + Department Colour Coding ✅
**Prompt:** Polish node cards with full status badges and department colours

- [x] Add department colour to node cards:
  - [x] Left border: 3px solid, department colour
  - [x] Avatar background: department colour at 20% opacity
  - [x] Avatar border: 1px department colour at 40% opacity
- [x] Add status badges (bottom-right corner):
  - [x] active: no badge
  - [x] open: amber pill "OPEN" + Briefcase icon
  - [x] planned: purple pill "PLANNED" + Clock icon
  - [x] backfill: blue pill "BACKFILL" + RefreshCw icon
  - [x] isNew: teal pill "★ NEW" (shown in addition to status)
- [x] Add employment type label (bottom-left):
  - [x] contractor: show "CONTRACT" in dim text
  - [x] advisor: show "ADVISOR" in dim text
  - [x] full-time/part-time: no label
- [x] Node card styling:
  - [x] Width: 220px, min-height: 80px
  - [x] Border-radius: 12px, background --surface, border --border
  - [x] Box shadow: --shadow-sm
  - [x] On hover: border --border-hover, shadow --shadow, translateY(-1px)
- [x] Handle open/planned roles:
  - [x] Show role title in place of person name
  - [x] Style role title in italic
- [x] Test styling in various states & departments

---

### 2.6 — Spotlight Search (Cmd+K) ✅
**Prompt:** Build the Spotlight search feature

- [x] Create src/components/ui/Spotlight.tsx
- [x] Set up keyboard listener for Cmd+K / Ctrl+K
- [x] Build UI:
  - [x] Full-screen overlay (rgba 0,0,0,0.5)
  - [x] Centred modal (560px wide)
  - [x] Large search input (18px, no border)
  - [x] Results list (max-height 360px, scrollable)
  - [x] Keyboard navigation (arrows, Enter, Escape)
- [x] Implement search scope:
  - [x] Nodes in current chart (name + title)
    - [x] Show avatar + name + title + dept colour
    - [x] On select: pan canvas, highlight with brand ring (2s)
  - [x] Org charts in workspace (by name)
    - [x] Show Network icon + chart name + status badge
    - [x] On select: navigate to chart
  - [x] Pages (static list)
    - [x] Dashboard, Org Charts, Roles, Headcount, Settings
    - [x] Show relevant icon
- [x] Group results under headings: "People & Roles", "Charts", "Pages"
- [x] Show empty state: "No results for '...'"
- [x] Wire search hint in top nav search bar
- [x] Test search functionality & keyboard navigation

---

## Sprint 3 — Auth + Workspace + Invite Flow
**Goal:** StratMap becomes a real multi-user product. Users can sign up, create a workspace, and invite colleagues.

**Prerequisite:** Install Clerk
```bash
npm install @clerk/clerk-react
```

### 3.1 — Clerk Auth Setup
**Prompt:** Set up Clerk authentication in StratMap

- [ ] Install @clerk/clerk-react
- [ ] Add VITE_CLERK_PUBLISHABLE_KEY to .env.local
- [ ] Wrap app in <ClerkProvider> in src/main.tsx
- [ ] Create src/features/auth/AuthProvider.tsx:
  - [ ] Show loading spinner while Clerk initialises
  - [ ] Redirect unauthenticated users to /sign-in
  - [ ] Wrap authenticated routes, check workspace existence
  - [ ] Redirect to /onboarding if user has no workspace
- [ ] Create src/features/auth/useAuth.ts hook:
  - [ ] Return: user { id, name, email, avatarUrl }
  - [ ] Return: permission (from WorkspaceMember type)
  - [ ] Return: isLoaded, signOut()
- [ ] Create src/pages/SignInPage.tsx (Clerk <SignIn> component)
- [ ] Create src/pages/SignUpPage.tsx (Clerk <SignUp> component)
- [ ] Add routes in App.tsx:
  - [ ] /sign-in → SignInPage
  - [ ] /sign-up → SignUpPage
  - [ ] /onboarding → OnboardingPage
  - [ ] Other routes → wrapped in AuthProvider
- [ ] Update TopNav user avatar:
  - [ ] Show real Clerk user's initials/avatar
  - [ ] Wire avatar click to signOut()
- [ ] Update userStore to hydrate from Clerk
- [ ] Test auth flow (sign up, sign in, sign out)

---

### 3.2 — Onboarding Flow
**Prompt:** Build the onboarding flow in src/pages/OnboardingPage.tsx

- [ ] Create OnboardingPage.tsx component
- [ ] Step 1 of 2 — "Set up your workspace":
  - [ ] Workspace name input (required)
  - [ ] Your role select (Founder/CEO, HR, Ops, Finance, Other)
  - [ ] Company size select (1–10, 11–50, 51–200, 201–1000, 1000+)
  - [ ] Continue button (disabled until workspace name filled)
- [ ] Step 2 of 2 — "Invite your team" (optional):
  - [ ] Three email input rows (add more up to 5)
  - [ ] Each row: email input + role select (Admin/Editor/Viewer)
  - [ ] "Add another" link
  - [ ] "Skip for now" button
  - [ ] "Send invites & get started" button
- [ ] Progress indicator (two dots: step 1 filled, step 2 hollow)
- [ ] On completion:
  - [ ] Create workspace in userStore
  - [ ] If invites: add to pendingInvites array
  - [ ] Navigate to /charts
  - [ ] Show welcome toast
- [ ] Layout styling (full screen, centred card, logo top-centre)
- [ ] Test both steps, skip flow, submission

---

### 3.3 — Workspace Settings + Invite Management
**Prompt:** Build the Members tab in SettingsPage

- [ ] Create functional member list:
  - [ ] Avatar + name + email per row
  - [ ] Role badge (Owner/Admin/Editor/Viewer) — clickable dropdown
  - [ ] Remove button (×) — Owner/Admin only
  - [ ] Joined date in --dim text
- [ ] Build invite flow:
  - [ ] "Invite" button opens inline form below member list
  - [ ] Email input + role select (Admin/Editor/Viewer/Commenter)
  - [ ] Send invite button
- [ ] Add pending invites section:
  - [ ] Shows if any pending invites exist
  - [ ] Each row: email + role + "Resend" + "Cancel" (×)
  - [ ] Clock icon + --muted styling
- [ ] Add seat usage indicator:
  - [ ] "X of Y seats used"
  - [ ] Progress bar visualization
  - [ ] Amber warning if at limit
  - [ ] "Upgrade to add more seats" link
- [ ] Enforce permission rules in UI:
  - [ ] Owner: all actions
  - [ ] Admin: invite, change roles, remove members
  - [ ] Editor/Viewer/Commenter: view only
  - [ ] Show lock icon + tooltip for restricted actions
- [ ] Wire all actions to userStore
- [ ] Test permission gates, invite flow, seat tracking

---

### 3.4 — Permission Gating Across UI
**Prompt:** Enforce role-based permissions throughout StratMap

- [ ] Create src/hooks/usePermission.ts:
  - [ ] Export: canEdit, canAdmin, canComment, isOwner (booleans)
- [ ] Canvas permissions:
  - [ ] Viewer/Commenter: read-only (no drag, add, edit, delete, edges)
  - [ ] Show "View only" badge in toolbar
  - [ ] Editor+: full editing
- [ ] Node modal permissions:
  - [ ] Viewer/Commenter: cannot open edit modal
  - [ ] Editor+: full access
- [ ] JD panel permissions:
  - [ ] Viewer: read-only
  - [ ] Commenter: read + comment (Phase 2)
  - [ ] Editor+: full edit
- [ ] Chart library permissions:
  - [ ] Viewer: see charts, no new chart button
  - [ ] Editor+: can create
  - [ ] Admin+: can delete
- [ ] Status actions (in chart card menu):
  - [ ] Editor: "Submit for approval", "Revise"
  - [ ] Admin: "Approve", "Request changes", "Publish", "Retire"
  - [ ] Viewer: no actions
- [ ] Settings tab permissions:
  - [ ] Billing: Admin+ only (redirect with toast if insufficient)
  - [ ] Members: Editor+ can view, Admin+ can manage
- [ ] Use usePermission hook throughout (never inline logic)
- [ ] Test all permission gates with different roles

---

## Sprint 4 — Billing + Feature Gating
**Goal:** StratMap becomes a commercial product. Users hit real limits and see upgrade prompts.

**Prerequisite:** Install Stripe
```bash
npm install @stripe/stripe-js @stripe/react-stripe-js
```

### 4.1 — Plan and Limits State
**Prompt:** Set up billing and plan state in StratMap

- [ ] Add types to src/types/user.ts:
  - [ ] type PlanTier = 'free' | 'starter' | 'growth' | 'enterprise'
  - [ ] interface Plan (tier, seats, maxCharts, maxNodesPerChart, billingCycle, renewsAt)
  - [ ] interface UsageLimits (chartsUsed, seatsUsed, aiDraftsUsed, aiDraftsLimit)
- [ ] Create src/store/billingStore.ts (Zustand):
  - [ ] State: plan, usage, isLoading
  - [ ] Actions: setPlan(), incrementUsage()
- [ ] Define tier limits:
  - [ ] Free: 1 chart, 30 nodes, 3 seats, 0 AI drafts
  - [ ] Starter: 5 charts, 100 nodes, 5 seats, 3 AI drafts/month
  - [ ] Growth: unlimited charts, 500 nodes, 10 seats, unlimited AI drafts
- [ ] Create src/hooks/usePlanLimits.ts:
  - [ ] Export: isAtChartLimit, isAtNodeLimit(chartId), isAtSeatLimit
  - [ ] Export: canUseAIDrafting, currentTier, upgradeRequired(feature)
- [ ] Set default plan to free tier
- [ ] Test plan state management & limit checks

---

### 4.2 — Upgrade Modal
**Prompt:** Build reusable upgrade modal in src/components/ui/UpgradeModal.tsx

- [ ] Create UpgradeModal component:
  - [ ] Props: isOpen, onClose, feature, requiredTier, currentTier
  - [ ] Centered modal (460px wide), nodePop animation
- [ ] Build UI:
  - [ ] Coloured icon (purple for growth, blue for starter)
  - [ ] Heading: "Unlock [feature]"
  - [ ] Body: one-sentence explanation
  - [ ] Plan card showing required plan:
    - [ ] Plan name + price (monthly/annual toggle)
    - [ ] 4 key features with check icons
    - [ ] "Upgrade to [Plan]" button (--grad-brand, full width)
  - [ ] "Maybe later" text link
- [ ] Show annual discount: "Save 22% with annual billing"
- [ ] Adjust content based on requiredTier vs currentTier
- [ ] Trigger from:
  - [ ] Headcount page upgrade CTA
  - [ ] Node limit reached
  - [ ] Chart limit reached
  - [ ] PDF export on Free
  - [ ] AI drafting on Free/insufficient Starter quota
- [ ] Test modal appearance & content for each trigger

---

### 4.3 — Limit Enforcement
**Prompt:** Enforce plan limits throughout StratMap

- [ ] Chart creation limit:
  - [ ] In ChartView, check isAtChartLimit before "New chart"
  - [ ] Open UpgradeModal if at limit
  - [ ] Show usage indicator below page heading: "3 of 5 charts used"
- [ ] Node creation limit:
  - [ ] In NodeModal, check isAtNodeLimit(chartId) on add
  - [ ] Show UpgradeModal if at limit
  - [ ] Show node count in toolbar: "18 / 30 nodes" (hidden for unlimited)
- [ ] Seat limit:
  - [ ] In Settings > Members, check isAtSeatLimit before invite form
  - [ ] Show amber banner (not modal) if at limit
- [ ] Export gating:
  - [ ] PNG export: available all, watermark on Free
  - [ ] PDF export: check plan, show UpgradeModal if Free
- [ ] Free tier PNG watermark:
  - [ ] Add "Made with StratMap" text bottom-right
  - [ ] 12px, DM Sans, --dim colour
- [ ] Use usePlanLimits hook consistently (no inline logic)
- [ ] Test all limit enforcement scenarios

---

### 4.4 — Stripe Checkout Integration
**Prompt:** Build Stripe checkout flow (frontend-only for now)

- [ ] Set up Stripe Payment Links (client-only checkout)
- [ ] Add environment variables:
  - [ ] VITE_STRIPE_STARTER_MONTHLY_URL
  - [ ] VITE_STRIPE_STARTER_ANNUAL_URL
  - [ ] VITE_STRIPE_GROWTH_MONTHLY_URL
  - [ ] VITE_STRIPE_GROWTH_ANNUAL_URL
- [ ] Create src/features/billing/CheckoutButton.tsx:
  - [ ] Props: tier, billingCycle
  - [ ] On click: redirect to appropriate Stripe Payment Link
- [ ] Build src/pages/PricingPage.tsx:
  - [ ] Route: /pricing
  - [ ] Three-column layout (Free, Starter, Growth) + Enterprise below
  - [ ] For each plan card:
    - [ ] Plan name, price (monthly/annual toggle)
    - [ ] "Most popular" badge on Growth
    - [ ] Value proposition line
    - [ ] Feature list (check icons for included, × for not)
    - [ ] CTA button
    - [ ] Current plan highlighted with brand border
  - [ ] Annual toggle at top (shows annual price + "Save 22%")
  - [ ] Enterprise card full-width below
- [ ] Handle post-checkout redirect:
  - [ ] Add /billing/success route
  - [ ] Show success message: "You're now on [Plan] 🎉"
  - [ ] Update billingStore with new plan (via URL params)
  - [ ] Redirect to /charts after 3 seconds
- [ ] Add /pricing link in Settings > Billing tab
- [ ] Test checkout redirect & plan update flow

---

## Sprint 5 — Share Link + PNG Export
**Goal:** Charts can be shared with anyone. Users can export clean images.

### 5.1 — Read-only Share Link
**Prompt:** Build the share link feature in StratMap

- [ ] Add share state to chartStore:
  - [ ] shareToken (string | null)
  - [ ] shareEnabled (boolean)
  - [ ] sharePasswordHash (optional, Starter+ feature)
  - [ ] Actions: enableSharing(), disableSharing(), setSharePassword()
- [ ] Create Share button in canvas toolbar (brand coloured)
- [ ] Build Share panel (popover, not modal):
  - [ ] Toggle: "Anyone with the link can view"
  - [ ] When on: copy-able share URL input (https://stratmap.app/share/[token])
  - [ ] Copy button → "Copied!" for 2 seconds
  - [ ] Separator
  - [ ] Password protection toggle (Starter+ only, show lock icon + tooltip on Free)
  - [ ] When password enabled: password input field
  - [ ] "Done" button closes panel
- [ ] Build /share/:token route (public, no auth required):
  - [ ] Look up chart by token (chartStore for now)
  - [ ] If password protected: show password entry screen first
  - [ ] Render full canvas in READ-ONLY mode
  - [ ] Top bar: logo + chart name + status badge + "Sign up free" button (--grad-brand)
  - [ ] "Sign up free" → /sign-up
  - [ ] No sidebar, no TopNav (clean view)
  - [ ] Footer: "Made with StratMap" (subtle)
- [ ] Add "Copy share link" to chart card menu (only if sharing enabled)
- [ ] Do NOT wrap /share/:token in AuthProvider
- [ ] Test share link public access, password protection, read-only rendering

---

### 5.2 — PNG Export
**Prompt:** Build PNG export for org charts

- [ ] Install html-to-image library: `npm install html-to-image`
- [ ] Create src/utils/export.ts:
  - [ ] Function: exportChartAsPNG(chartId, options: ExportOptions)
  - [ ] Options: scale (1 or 2), includeWatermark, filename
  - [ ] Use html-to-image to target canvas SVG
  - [ ] Scale up to 2x for retina quality
  - [ ] If watermark: overlay "Made with StratMap" text (bottom-right, 13px, --dim)
  - [ ] Auto-download PNG file
- [ ] Create Export button in canvas toolbar (download icon)
- [ ] Build Export panel (popover):
  - [ ] "Export as PNG" option (available all)
    - [ ] Sub-label on Free: "Includes StratMap watermark"
  - [ ] "Export as PDF" option (Starter+ only)
    - [ ] Lock icon + "Starter feature" on Free
    - [ ] Clicking on Free opens UpgradeModal
  - [ ] Quality selector: Standard / High (2×)
  - [ ] Filename input (pre-filled with chart name)
  - [ ] Export button (--grad-brand, full width)
- [ ] PDF export (for now):
  - [ ] Use window.print() on dedicated print-optimised view
  - [ ] Add print CSS to hide nav, show only canvas
- [ ] Use usePlanLimits hook for plan checks (no inline logic)
- [ ] Test PNG export with/without watermark, quality options, PDF export

---

### 5.3 — Polish and Soft Launch Prep
**Prompt:** Prepare StratMap for soft launch

- [ ] Empty states across app:
  - [ ] Dashboard (no charts): welcome message + quick start guide (3 cards)
  - [ ] Chart library (no charts): verify current state looks correct
  - [ ] Canvas (0 nodes): "Add your first person or role" + large + button
  - [ ] Roles > Templates (none): "No role templates yet" + "Create first template" CTA
  - [ ] Roles > Find roles (empty): explain why search is empty
- [ ] Create Toast notification system (src/components/ui/Toast.tsx):
  - [ ] Lightweight stack (bottom-centre)
  - [ ] Variants: success (green), error (red), info (blue), warning (amber)
  - [ ] Auto-dismiss after 3 seconds
  - [ ] Max 3 toasts visible
  - [ ] Slide up on appear, fade out on dismiss
  - [ ] Wire up toasts for:
    - [ ] Node added: "Role added"
    - [ ] Node deleted: "Role removed — Undo" (clicking Undo triggers undo)
    - [ ] Chart status changed: "Submitted for approval"
    - [ ] Link copied: "Link copied to clipboard"
    - [ ] Export started: "Exporting chart..."
- [ ] Add skeleton loaders:
  - [ ] Chart library grid (while charts load)
  - [ ] Dashboard KPI cards (while data loads)
  - [ ] Skeleton: --raised background, subtle pulse animation
- [ ] Create ErrorBoundary (src/components/ui/ErrorBoundary.tsx):
  - [ ] Wrap main app content
  - [ ] Show friendly error screen on crash
  - [ ] Show error stack in development
- [ ] Update index.html:
  - [ ] Title: "StratMap — Map your organisation"
  - [ ] Meta description
  - [ ] OG image meta tags (placeholder)
  - [ ] Theme colour: #060D18
- [ ] Test all empty states, toast flows, error handling

---

## Sprint 6 — Rich JD Editor + AI Drafting
**Goal:** Every role becomes a living document with AI-assisted drafting.

**Prerequisites:**
```bash
npm install @tiptap/react @tiptap/pm @tiptap/starter-kit
npm install @tiptap/extension-placeholder @tiptap/extension-character-count
```

### 6.1 — TipTap Rich Text JD Editor
**Prompt:** Build job description editor using TipTap

- [ ] Create src/features/jd/JDEditor.tsx component
- [ ] Add to JD slide-out panel (right side of canvas)
- [ ] Build two TipTap editor sections:
  - [ ] Responsibilities
  - [ ] Requirements
- [ ] Editor features (both sections):
  - [ ] Headings (H2, H3)
  - [ ] Bullet lists and numbered lists
  - [ ] Bold, italic, underline
  - [ ] Inline code
  - [ ] Links
- [ ] Build floating toolbar (appears on focus):
  - [ ] Bold | Italic | | H2 | H3 | || Bullet list | Numbered list
  - [ ] Icon-only, compact
  - [ ] --raised background, --border border, 8px radius
- [ ] Add fields below editors:
  - [ ] Level (text input, placeholder "e.g. IC3, Senior, L5")
  - [ ] Salary band (two number inputs: min/max + currency select)
    - [ ] Admin-only (lock icon + tooltip for Editor/Viewer)
  - [ ] Last edited by + timestamp (read-only, --dim)
- [ ] Implement auto-save:
  - [ ] Debounce saves to jobDescriptionStore every 1s after typing stops
  - [ ] Show "Saving..." then "Saved" status indicator (top-right of panel)
  - [ ] No manual save button required
- [ ] Create src/store/jobDescriptionStore.ts (Zustand):
  - [ ] State: jobDescriptions (Record<nodeId, JobDescription>)
  - [ ] Actions: updateJD(), updateJDStatus()
- [ ] Add character count:
  - [ ] Show at bottom of each editor section
  - [ ] Format: "287 characters" in --dim text
- [ ] Test auto-save, character count, toolbar functionality

---

### 6.2 — JD Status Workflow
**Prompt:** Build the JD approval workflow

- [ ] Define RoleStatus workflow:
  ```
  draft → in-review → approved → published → hired
                ↑         |
                └─────────┘ (rejected back to draft)
  ```
- [ ] Show status as large badge (top of JD panel, below role title):
  - [ ] draft: --muted
  - [ ] in-review: --purple
  - [ ] approved: --brand
  - [ ] published: --success
  - [ ] hired: --success (with checkmark)
- [ ] Implement action buttons (based on status + permission):
  - [ ] If draft:
    - [ ] Editor+: "Submit for review" button (--grad-purple)
  - [ ] If in-review:
    - [ ] Admin+: "Approve" + "Request changes" buttons
    - [ ] Editor: read-only, show "Awaiting approval" message
  - [ ] If approved:
    - [ ] Admin+: "Mark as published" button (--grad-success)
  - [ ] If published:
    - [ ] Admin+: "Mark as hired" button (--grad-success)
    - [ ] Editor+: "Start new revision" button (outline) — resets to draft, increments version
  - [ ] If hired:
    - [ ] Show "This role has been filled" banner (success bg)
    - [ ] Admin+: "Reopen role" button (outline) — resets to draft
- [ ] Add version history indicator:
  - [ ] Show "Version [n]" pill below status badge
  - [ ] "View history" link (greyed out + "Coming soon" tooltip for Phase 2)
- [ ] Test status transitions, permission gates, version tracking

---

### 6.3 — AI JD Drafting
**Prompt:** Build AI-assisted job description drafting

- [ ] Install Anthropic SDK: `npm install @anthropic-ai/sdk`
- [ ] Add VITE_ANTHROPIC_API_KEY to .env.local (note: frontend call only for dev)
- [ ] Create src/features/jd/AIJDDraft.tsx component
- [ ] Build "Draft with AI" button:
  - [ ] Shown when JD in draft status + empty or <100 chars
  - [ ] Style: --grad-purple with Sparkles icon
  - [ ] On Free: greyed out + lock icon, clicking opens UpgradeModal
  - [ ] On Starter: show remaining drafts "2 of 3 remaining this month"
  - [ ] On Growth: no limit shown
- [ ] On click: open AI draft panel:
  - [ ] Role title (pre-filled from node)
  - [ ] Department (pre-filled)
  - [ ] Optional tone selector: Professional | Direct | Startup | Inclusive
  - [ ] Optional text area: "Any specific requirements?"
  - [ ] "Generate draft" button
- [ ] Loading state:
  - [ ] Animated gradient shimmer over placeholder blocks
  - [ ] "Writing your JD..." label
  - [ ] Cancel button
- [ ] On completion:
  - [ ] Stream response into editor (word-by-word effect)
  - [ ] Show "Review and edit" prompt above editor
  - [ ] Show "Discard draft" link if they want to restart
- [ ] Anthropic API call:
  - [ ] Model: claude-sonnet-4-20250514
  - [ ] System prompt: "You are an expert HR professional writing job descriptions for a modern tech company..."
  - [ ] User prompt: "Write a job description for a [title] role in the [department] department. Tone: [tone]. [requirements]. Format: Responsibilities (5-7 bullets) and Requirements (4-6 bullets)."
- [ ] After drafting:
  - [ ] Increment aiDraftsUsed in billingStore
  - [ ] Save draft to jobDescriptionStore
- [ ] Test drafting, streaming, quota tracking, all tones

---

### 6.4 — JD Templates in Roles Section
**Prompt:** Wire up the JD template library

- [ ] Create src/store/templateStore.ts (Zustand):
  - [ ] State: templates (Record<id, RoleTemplate>)
  - [ ] Actions: addTemplate(), updateTemplate(), deleteTemplate(), applyToNode()
  - [ ] Seed with 6 mock templates from mockJDs.ts
- [ ] Define RoleTemplate type:
  - [ ] id, title, department, responsibilities, requirements, tags, createdBy, updatedBy, updatedAt, usedInCharts[]
- [ ] Implement template card actions:
  - [ ] "Edit" button → full TipTap editor modal for that template
  - [ ] "Use in chart" dropdown → lists all charts, select chart → node selector
  - [ ] "Duplicate" option (in … menu)
  - [ ] "Delete" option (in … menu, with confirmation)
- [ ] Build "New template" flow:
  - [ ] Modal with: title input (required), department select, tags input (comma-separated, pills)
  - [ ] TipTap editor for Responsibilities
  - [ ] TipTap editor for Requirements
  - [ ] Save button
- [ ] Implement "Apply template to node":
  - [ ] In JD panel, add "Apply template" link when JD empty
  - [ ] Opens searchable list of templates
  - [ ] Selecting one populates editor (user can edit)
  - [ ] Show "Applied from template: [name]" attribution (--dim)
- [ ] Test template CRUD, application to nodes, attribution

---

## Sprint 7 — Auto-layout + Role Type Tagging
**Goal:** Canvas becomes intelligent. Charts auto-tidy. Every role has a type for headcount planning.

### 7.1 — Hierarchical Auto-layout Algorithm
**Prompt:** Build the auto-layout engine

- [ ] Create src/utils/layout.ts with algorithm implementation:
  - [ ] Find root node (managerId === null)
  - [ ] Build tree structure from OrgEdges
  - [ ] Calculate x,y positions using Reingold-Tilford style:
    - [ ] Top-down orientation
    - [ ] Vertical gap: 120px per level
    - [ ] Horizontal gap: 260px between nodes
    - [ ] Subtrees centred under parent
    - [ ] No overlaps
  - [ ] Export: calculateLayout(nodes, edges) → Map<nodeId, { x, y }>
- [ ] Handle edge cases:
  - [ ] Multiple root nodes (disconnected): lay out in row at top
  - [ ] Circular references: detect and skip (warn in console)
  - [ ] Isolated nodes (no edges): lay out in row below tree
- [ ] Add "Auto-layout" button to canvas toolbar:
  - [ ] Layout icon
  - [ ] On click:
    - [ ] Calculate new positions via calculateLayout()
    - [ ] Animate all nodes to new positions smoothly
    - [ ] Duration: 400ms, ease-out-cubic
    - [ ] Show toast: "Layout applied"
- [ ] Add "Tidy selection" option (Phase 2):
  - [ ] Greyed out with "Select nodes first" tooltip for now
  - [ ] Will apply layout only to selected subtree
- [ ] Feature gate: Starter+ only
  - [ ] Free tier: button locked, clicking opens UpgradeModal
- [ ] Test layout on complex charts, animation smoothness

---

### 7.2 — Role Type Tagging
**Prompt:** Add role type tagging to every node

- [ ] Add to OrgNode type (types/chart.ts):
  - [ ] roleType?: 'existing' | 'new-headcount' | 'backfill' | 'contractor' | 'tbd'
- [ ] Add "Role type" field to NodeModal (Add + Edit):
  - [ ] Segmented button row: Existing | New HC | Backfill | Contractor | TBD
  - [ ] Default: 'existing' for Active status, 'tbd' for Open/Planned
  - [ ] Position: between Status and Reports To
  - [ ] Visual hint (small coloured dot per type):
    - [ ] existing: --muted
    - [ ] new-headcount: --success
    - [ ] backfill: --warn
    - [ ] contractor: --purple
    - [ ] tbd: --dim
- [ ] Add role type badge on node cards (below job title):
  - [ ] "NEW HC" in green (new-headcount)
  - [ ] "BACKFILL" in amber (backfill)
  - [ ] "CONTRACT" in purple (contractor)
  - [ ] "TBD" in dim (tbd)
  - [ ] Nothing for 'existing' (clean)
- [ ] Add role type filter in canvas:
  - [ ] Add filter section below departments
  - [ ] Checkboxes for each type
  - [ ] When filtered: matching nodes fully visible, others 30% opacity
- [ ] Show role type in JD panel:
  - [ ] Overview tab: "Role type: New Headcount" (key-value row)
- [ ] Add role type breakdown to Dashboard:
  - [ ] Below role pipeline section
  - [ ] Show counts for non-existing types (e.g. "3 new hires · 2 backfills · 1 contractor")
  - [ ] Each as coloured pill
- [ ] Test filtering, badge display, dashboard summary

---

### 7.3 — Paid Launch Polish
**Prompt:** Final polish before paid launch

- [ ] Pricing page improvements:
  - [ ] Add FAQ section below plan cards (5 Q&As)
  - [ ] Add "Trusted by teams at" logo bar (placeholder company names)
  - [ ] Annual/monthly pricing toggle affects ALL prices
- [ ] Onboarding improvements:
  - [ ] After workspace creation, offer starter chart from template
  - [ ] "Quick start" option: creates 5-node "Current Structure" with placeholders
  - [ ] User can immediately start editing
- [ ] In-app upgrade prompts (contextual):
  - [ ] 80% of node limit: amber banner at canvas top
    - [ ] "You're using 24 of 30 nodes. Upgrade to Starter for 100 nodes."
    - [ ] Dismiss (×) + "Upgrade" button
  - [ ] First chart created on Free: subtle banner
    - [ ] "Free plan includes 1 chart. Upgrade to create up to 5."
  - [ ] After sharing chart on Free: show after link copied
    - [ ] "Upgrade to Starter to remove watermark and password-protect links."
- [ ] Shared chart view footer:
  - [ ] Replace plain "Made with StratMap" text with styled component
  - [ ] Logo mark + "Made with StratMap" + "Try it free →" link
  - [ ] Primary viral growth mechanism — style well
- [ ] Page titles (dynamic):
  - [ ] Dashboard: "StratMap — Dashboard"
  - [ ] Chart library: "StratMap — Org Charts"
  - [ ] Canvas: "[Chart name] — StratMap"
  - [ ] Roles: "StratMap — Roles"
  - [ ] Shared view: "[Chart name] — Shared via StratMap"
  - [ ] Sign in: "Sign in — StratMap"
- [ ] Test all upgrades prompts, soft launch readiness

---

## Soft to Paid Launch Checklist

Before opening paid signups, verify these are working:

**Auth**
- [ ] Sign up with email works
- [ ] Sign up with Google OAuth works
- [ ] Password reset works (Clerk handles)
- [ ] Session persists on refresh

**Canvas**
- [ ] Drag and drop nodes feels smooth
- [ ] Zoom and pan work on trackpad and mouse
- [ ] Add/edit/delete nodes works
- [ ] Reporting lines draw correctly
- [ ] Undo/redo works for all operations
- [ ] Spotlight search (Cmd+K) finds nodes and pages

**Sharing**
- [ ] Share link works without auth
- [ ] Shared chart is read-only
- [ ] Watermark appears on Free exports
- [ ] Copy link button works

**Billing**
- [ ] Stripe test checkout completes
- [ ] Plan updates after successful checkout
- [ ] Limits are enforced correctly
- [ ] Upgrade modal appears at right triggers

**Mobile**
- [ ] Sidebar collapses correctly
- [ ] Dashboard is readable on mobile
- [ ] Roles and Settings pages are usable on mobile
- [ ] Canvas shows read-only on mobile (editing desktop-only)

**Performance**
- [ ] Initial page load < 3 seconds
- [ ] Canvas with 30 nodes renders without lag
- [ ] No console errors in production build

---

*Last updated: May 2026*
