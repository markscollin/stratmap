import {
  pgTable,
  pgEnum,
  text,
  integer,
  real,
  boolean,
  timestamp,
  primaryKey,
  bigint,
  index,
  uniqueIndex,
  jsonb,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

// ─── Enums ──────────────────────────────────────────────────────────────────

export const nodeStatusEnum = pgEnum('node_status', ['active', 'open', 'planned', 'backfill'])
export const employmentTypeEnum = pgEnum('employment_type', ['full-time', 'part-time', 'contractor', 'advisor'])
export const roleTypeEnum = pgEnum('role_type', ['existing', 'new-headcount', 'backfill', 'contractor', 'tbd'])
export const roleStatusEnum = pgEnum('role_status', ['draft', 'in-review', 'approved', 'published', 'hired'])
export const chartStatusEnum = pgEnum('chart_status', ['draft', 'editing', 'review', 'rejected', 'approved', 'live', 'archived'])
export const permissionEnum = pgEnum('permission', ['owner', 'admin', 'editor', 'commenter', 'viewer'])
export const planTierEnum = pgEnum('plan_tier', ['free', 'starter', 'growth', 'enterprise'])
export const headcountStatusEnum = pgEnum('headcount_status', ['planned', 'approved', 'filled'])

// ─── Workspaces ──────────────────────────────────────────────────────────────

export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ownerId: text('owner_id').notNull(),         // Clerk userId
  ownerRole: text('owner_role').notNull(),     // WorkspaceRole
  size: text('size').notNull(),                // CompanySize
  planTier: planTierEnum('plan_tier').notNull().default('free'),
  // Stripe billing
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  // Mirror of the Stripe subscription (synced by api/webhooks/stripe.ts):
  // status is Stripe's own value (active, past_due, unpaid, canceled, …).
  subscriptionStatus: text('subscription_status'),
  // End of the paid-through period; when cancelAtPeriodEnd, the plan ends here.
  planExpiresAt: timestamp('plan_expires_at'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  // An admin dismissed the getting-started checklist for the whole workspace (roadmap 2.7).
  onboardingDismissedAt: timestamp('onboarding_dismissed_at'),
  // Admin-granted trial/comped access (overrides planTier when trialEndsAt > now)
  trialPlan: planTierEnum('trial_plan'),
  trialEndsAt: timestamp('trial_ends_at'),
  // Soft delete (roadmap 4.2): set when the owner deletes the workspace. It is hidden from every route
  // at once (api/_lib/auth.ts, share links) and can be restored by the owner until WORKSPACE_RESTORE_DAYS
  // have passed, when a daily job erases it for good (api/cron/purge-deleted.ts).
  deletedAt: timestamp('deleted_at'),
  deletedBy: text('deleted_by'),               // Clerk userId of the owner who deleted it
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const workspaceMembers = pgTable('workspace_members', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),           // Clerk userId
  email: text('email').notNull(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  permission: permissionEnum('permission').notNull().default('viewer'),
  joinedAt: timestamp('joined_at').notNull().defaultNow(),
}, (t) => [
  index('workspace_members_user_id_idx').on(t.userId),
  index('workspace_members_workspace_id_idx').on(t.workspaceId),
])

export const pendingInvites = pgTable('pending_invites', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  permission: permissionEnum('permission').notNull().default('viewer'),
  sentAt: timestamp('sent_at').notNull().defaultNow(),
  // SHA-256 of the single-use token in the invite link. The raw token is only
  // ever in the email; a DB leak can't be turned into working invite links.
  // Nullable: invites created before tokens existed can still be accepted by
  // verified-email match.
  tokenHash: text('token_hash'),
  expiresAt: timestamp('expires_at'),
  invitedBy: text('invited_by'),               // Clerk userId
}, (t) => [
  index('pending_invites_workspace_id_email_idx').on(t.workspaceId, t.email),
  uniqueIndex('pending_invites_token_hash_idx').on(t.tokenHash),
  index('pending_invites_email_idx').on(t.email),
])

// ─── Workspace Departments ────────────────────────────────────────────────────

export const workspaceDepartments = pgTable('workspace_departments', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  colour: text('colour').notNull(),
}, (t) => [index('workspace_departments_workspace_id_idx').on(t.workspaceId)])

// ─── Charts ──────────────────────────────────────────────────────────────────

export const charts = pgTable('charts', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  status: chartStatusEnum('status').notNull().default('draft'),
  version: integer('version').notNull().default(1),   // user-visible chart version (the v1 pill)
  revision: integer('revision').notNull().default(0), // bumped by every structural edit; optimistic concurrency (roadmap 2.4)
  isSample: boolean('is_sample').notNull().default(false), // opt-in example chart: free, doesn't count toward the plan's chart limit (roadmap 2.7)
  isPublic: boolean('is_public').notNull().default(false),
  ownerId: text('owner_id').notNull(),         // Clerk userId
  creatorId: text('creator_id').notNull(),     // Clerk userId
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [index('charts_workspace_id_idx').on(t.workspaceId)])

export const departments = pgTable('departments', {
  id: text('id').primaryKey(),
  chartId: text('chart_id').notNull().references(() => charts.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  colour: text('colour').notNull(),
  workspaceDepartmentId: text('workspace_department_id').references(() => workspaceDepartments.id, { onDelete: 'set null' }),
}, (t) => [index('departments_chart_id_idx').on(t.chartId)])

// ─── Nodes & Edges ───────────────────────────────────────────────────────────

export const nodes = pgTable('nodes', {
  id: text('id').primaryKey(),
  chartId: text('chart_id').notNull().references(() => charts.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  title: text('title').notNull(),
  departmentId: text('department_id'),
  // No FK on managerId — self-referential on delete would need careful handling
  managerId: text('manager_id'),
  status: nodeStatusEnum('status').notNull().default('active'),
  employmentType: employmentTypeEnum('employment_type').notNull().default('full-time'),
  roleType: roleTypeEnum('role_type'),
  avatarUrl: text('avatar_url'),
  location: text('location'),
  startDate: text('start_date'),
  x: real('x').notNull().default(0),
  y: real('y').notNull().default(0),
  isNew: boolean('is_new').default(false),
}, (t) => [index('nodes_chart_id_idx').on(t.chartId)])

export const edges = pgTable('edges', {
  id: text('id').primaryKey(),
  chartId: text('chart_id').notNull().references(() => charts.id, { onDelete: 'cascade' }),
  sourceId: text('source_id').notNull(),
  targetId: text('target_id').notNull(),
}, (t) => [index('edges_chart_id_idx').on(t.chartId)])

// ─── Job Descriptions ────────────────────────────────────────────────────────

export const jobDescriptions = pgTable('job_descriptions', {
  id: text('id').primaryKey(),
  nodeId: text('node_id').notNull(),
  chartId: text('chart_id').notNull().references(() => charts.id, { onDelete: 'cascade' }),
  status: roleStatusEnum('status').notNull().default('draft'),
  responsibilities: text('responsibilities').notNull().default(''),
  requirements: text('requirements').notNull().default(''),
  salaryBandMin: integer('salary_band_min'),
  salaryBandMax: integer('salary_band_max'),
  salaryCurrency: text('salary_currency'),
  level: text('level'),
  version: integer('version').notNull().default(1),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  updatedBy: text('updated_by').notNull(),
}, (t) => [index('job_descriptions_chart_id_node_id_idx').on(t.chartId, t.nodeId)])

// ─── Headcount Plans ─────────────────────────────────────────────────────────

export const headcountPlans = pgTable('headcount_plans', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  departmentId: text('department_id').references(() => workspaceDepartments.id, { onDelete: 'set null' }),
  roleType: roleTypeEnum('role_type').notNull().default('new-headcount'),
  targetQuarter: text('target_quarter').notNull(),  // e.g. "2026-Q2"
  chartId: text('chart_id').references(() => charts.id, { onDelete: 'set null' }),
  status: headcountStatusEnum('status').notNull().default('planned'),
  notes: text('notes'),
  // Expected yearly pay for the planned hire (roadmap 5: cost modelling). Owner/admin only, like job-description
  // salary bands: other roles never receive these columns. Whole currency units per year; the currency is a 3-letter code.
  salaryMin: integer('salary_min'),
  salaryMax: integer('salary_max'),
  salaryCurrency: text('salary_currency'),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [index('headcount_plans_workspace_id_idx').on(t.workspaceId)])

// ─── Role Templates ──────────────────────────────────────────────────────────

export const roleTemplates = pgTable('role_templates', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  department: text('department').notNull(),
  responsibilities: text('responsibilities').notNull().default(''),
  requirements: text('requirements').notNull().default(''),
  tags: text('tags').array().notNull().default([]),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  uses: integer('uses').notNull().default(0),
}, (t) => [index('role_templates_workspace_id_idx').on(t.workspaceId)])

// ─── Shared Links ────────────────────────────────────────────────────────────

export const sharedLinks = pgTable('shared_links', {
  id: text('id').primaryKey(),                 // short code, e.g. "abc12345"
  chartId: text('chart_id').notNull().references(() => charts.id, { onDelete: 'cascade' }),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at'),
}, (t) => [index('shared_links_chart_id_idx').on(t.chartId)])

// ─── Usage & abuse protection ────────────────────────────────────────────────

// Fixed-window rate-limit counters. `key` encodes the bucket, e.g. "ai:ws-123"
// or "share:203.0.113.7". One row per key; the window resets in place.
// `windowId` = floor(epochSeconds / windowSeconds), so no timezone handling is needed.
export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  windowId: bigint('window_id', { mode: 'number' }).notNull(),
  count: integer('count').notNull().default(0),
})

// Server-side AI drafting quota — one row per workspace per calendar month (UTC).
export const aiUsage = pgTable('ai_usage', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  period: text('period').notNull(),            // "YYYY-MM"
  count: integer('count').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.workspaceId, t.period] })])

// Stripe webhook events we have processed (roadmap 1.4). The event id is the
// primary key, so a replayed or duplicate delivery can't claim it twice.
export const stripeEvents = pgTable('stripe_events', {
  id: text('id').primaryKey(),                 // Stripe event id (evt_…)
  type: text('type').notNull(),
  // When the claim was taken (or last taken over). A claim with no `processedAt` that is older than
  // CLAIM_STALE_MS belongs to a delivery that crashed: the next delivery takes it over (launch review R-06).
  receivedAt: timestamp('received_at').notNull().defaultNow(),
  processedAt: timestamp('processed_at'),      // set when the event was handled in full
  emailsSentAt: timestamp('emails_sent_at'),   // set once the payment-failed emails went out, so a retry never sends them twice
})

// ─── Inferred types (for use in Phase 2 API routes) ─────────────────────────

export type Workspace = typeof workspaces.$inferSelect
export type NewWorkspace = typeof workspaces.$inferInsert
export type WorkspaceMember = typeof workspaceMembers.$inferSelect
export type NewWorkspaceMember = typeof workspaceMembers.$inferInsert
export type Chart = typeof charts.$inferSelect
export type NewChart = typeof charts.$inferInsert
export type Department = typeof departments.$inferSelect
export type Node = typeof nodes.$inferSelect
export type NewNode = typeof nodes.$inferInsert
export type Edge = typeof edges.$inferSelect
export type NewEdge = typeof edges.$inferInsert
export type JobDescription = typeof jobDescriptions.$inferSelect
export type NewJobDescription = typeof jobDescriptions.$inferInsert
export type RoleTemplate = typeof roleTemplates.$inferSelect
export type NewRoleTemplate = typeof roleTemplates.$inferInsert
export type WorkspaceDepartment = typeof workspaceDepartments.$inferSelect
export type NewWorkspaceDepartment = typeof workspaceDepartments.$inferInsert
export type HeadcountPlan = typeof headcountPlans.$inferSelect
export type NewHeadcountPlan = typeof headcountPlans.$inferInsert
export type SharedLink = typeof sharedLinks.$inferSelect
export type NewSharedLink = typeof sharedLinks.$inferInsert

// ─── Audit log (roadmap 4.4) ─────────────────────────────────────────────────
// Who changed what, when, for member, permission, invite, share and salary changes. Append-only.
// `details` holds small facts about the event (emails, roles, chart/role names) and NEVER salary
// amounts. Rows are removed with the workspace (cascade).
export const auditLog = pgTable('audit_log', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  actorUserId: text('actor_user_id').notNull(),   // Clerk userId
  action: text('action').notNull(),               // e.g. 'member.role_changed' (see api/_lib/audit.ts)
  targetType: text('target_type').notNull(),      // 'member' | 'invite' | 'chart' | 'role'
  targetId: text('target_id'),
  details: jsonb('details').$type<Record<string, string | number | boolean | null>>().notNull().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [index('audit_log_workspace_created_idx').on(t.workspaceId, t.createdAt)])

// ─── Role comments (roadmap 5) ───────────────────────────────────────────────
// Discussion threads on a role (a node on a chart). A top-level comment may have replies one level deep; only top-level
// comments can be resolved. Commenters and above can write (api/charts/[id]/comments). Deleting a comment that has replies
// keeps a "deleted" shell (body cleared, deletedAt set) so the thread survives; otherwise the row is removed. Comments go
// with their role, chart and workspace (cascade).
export const roleComments = pgTable('role_comments', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  chartId: text('chart_id').notNull().references(() => charts.id, { onDelete: 'cascade' }),
  nodeId: text('node_id').notNull().references(() => nodes.id, { onDelete: 'cascade' }),
  parentId: text('parent_id').references((): AnyPgColumn => roleComments.id, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull(),          // Clerk userId
  body: text('body').notNull(),
  mentions: text('mentions').array().notNull().default([]),   // userIds of workspace members, checked by the server
  createdAt: timestamp('created_at').notNull().defaultNow(),
  editedAt: timestamp('edited_at'),
  deletedAt: timestamp('deleted_at'),
  resolvedAt: timestamp('resolved_at'),            // top-level comments only
  resolvedBy: text('resolved_by'),
}, (t) => [
  index('role_comments_chart_node_idx').on(t.chartId, t.nodeId),
  index('role_comments_workspace_idx').on(t.workspaceId),
])

// Per-person email settings (not per workspace: it is about the person's inbox). A missing row means the defaults.
export const userNotificationPrefs = pgTable('user_notification_prefs', {
  userId: text('user_id').primaryKey(),            // Clerk userId
  commentEmails: boolean('comment_emails').notNull().default(true),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// ─── Chart version history (roadmap 5) ──────────────────────────────────────
// A saved version of a chart's structure: its roles, reporting lines and departments (NOT job-description text or
// salary bands, so history never exposes pay). Used to compare two versions, restore one, or branch a scenario into
// a new chart. `kind` 'auto' = taken by the app (before a restore), pruned oldest-first; 'manual' = saved by a person.
// Goes with its chart and workspace (cascade).
export interface SnapshotData {
  nodes: {
    id: string; name: string; title: string; departmentId: string | null; managerId: string | null
    status: 'active' | 'open' | 'planned' | 'backfill'
    employmentType: 'full-time' | 'part-time' | 'contractor' | 'advisor'
    roleType: 'existing' | 'new-headcount' | 'backfill' | 'contractor' | 'tbd' | null
    avatarUrl: string | null; location: string | null; startDate: string | null; x: number; y: number; isNew: boolean | null
  }[]
  edges: { id: string; sourceId: string; targetId: string }[]
  departments: { id: string; name: string; colour: string; workspaceDepartmentId: string | null }[]
}

export const chartSnapshots = pgTable('chart_snapshots', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  chartId: text('chart_id').notNull().references(() => charts.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('manual'),   // 'manual' | 'auto'
  createdBy: text('created_by').notNull(),          // Clerk userId
  createdAt: timestamp('created_at').notNull().defaultNow(),
  nodeCount: integer('node_count').notNull().default(0),
  edgeCount: integer('edge_count').notNull().default(0),
  data: jsonb('data').$type<SnapshotData>().notNull(),
}, (t) => [index('chart_snapshots_chart_idx').on(t.chartId, t.createdAt)])

// ─── Deleted roles (launch review R-02, owner decision D-1) ──────────────────
// Deleting a role really removes it, but first keeps a copy here (the role, its comments and its reporting lines)
// for a few days, so Undo can bring back everything: `POST /api/charts/:id/nodes/:nodeId/restore`. Nothing else reads
// this table, so no ordinary query needs a "not deleted" filter. Rows go with their chart (cascade), are replaced if the
// same role is deleted again, and are erased after TRASH_DAYS (`api/_lib/nodeTrash.ts`).
export interface DeletedNodeData {
  node: typeof nodes.$inferSelect
  comments: (typeof roleComments.$inferSelect)[]
  edges: (typeof edges.$inferSelect)[]
}

export const deletedNodes = pgTable('deleted_nodes', {
  id: text('id').primaryKey(),
  chartId: text('chart_id').notNull().references(() => charts.id, { onDelete: 'cascade' }),
  nodeId: text('node_id').notNull(),
  deletedBy: text('deleted_by').notNull(),          // Clerk userId
  deletedAt: timestamp('deleted_at').notNull().defaultNow(),
  data: jsonb('data').$type<DeletedNodeData>().notNull(),
}, (t) => [
  uniqueIndex('deleted_nodes_chart_node_idx').on(t.chartId, t.nodeId),
  index('deleted_nodes_deleted_at_idx').on(t.deletedAt),
])
