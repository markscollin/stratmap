import {
  pgTable,
  pgEnum,
  text,
  integer,
  real,
  boolean,
  timestamp,
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
})

export const pendingInvites = pgTable('pending_invites', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  permission: permissionEnum('permission').notNull().default('viewer'),
  sentAt: timestamp('sent_at').notNull().defaultNow(),
})

// ─── Workspace Departments ────────────────────────────────────────────────────

export const workspaceDepartments = pgTable('workspace_departments', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  colour: text('colour').notNull(),
})

// ─── Charts ──────────────────────────────────────────────────────────────────

export const charts = pgTable('charts', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  status: chartStatusEnum('status').notNull().default('draft'),
  version: integer('version').notNull().default(1),
  isPublic: boolean('is_public').notNull().default(false),
  ownerId: text('owner_id').notNull(),         // Clerk userId
  creatorId: text('creator_id').notNull(),     // Clerk userId
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const departments = pgTable('departments', {
  id: text('id').primaryKey(),
  chartId: text('chart_id').notNull().references(() => charts.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  colour: text('colour').notNull(),
  workspaceDepartmentId: text('workspace_department_id').references(() => workspaceDepartments.id, { onDelete: 'set null' }),
})

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
})

export const edges = pgTable('edges', {
  id: text('id').primaryKey(),
  chartId: text('chart_id').notNull().references(() => charts.id, { onDelete: 'cascade' }),
  sourceId: text('source_id').notNull(),
  targetId: text('target_id').notNull(),
})

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
})

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
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

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
})

// ─── Shared Links ────────────────────────────────────────────────────────────

export const sharedLinks = pgTable('shared_links', {
  id: text('id').primaryKey(),                 // short code, e.g. "abc12345"
  chartId: text('chart_id').notNull().references(() => charts.id, { onDelete: 'cascade' }),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at'),
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
