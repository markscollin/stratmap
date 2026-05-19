import { pgTable, foreignKey, text, integer, timestamp, real, boolean, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const chartStatus = pgEnum("chart_status", ['draft', 'editing', 'review', 'rejected', 'approved', 'live', 'archived'])
export const employmentType = pgEnum("employment_type", ['full-time', 'part-time', 'contractor', 'advisor'])
export const nodeStatus = pgEnum("node_status", ['active', 'open', 'planned', 'backfill'])
export const permission = pgEnum("permission", ['owner', 'admin', 'editor', 'commenter', 'viewer'])
export const planTier = pgEnum("plan_tier", ['free', 'starter', 'growth', 'enterprise'])
export const roleStatus = pgEnum("role_status", ['draft', 'in-review', 'approved', 'published', 'hired'])
export const roleType = pgEnum("role_type", ['existing', 'new-headcount', 'backfill', 'contractor', 'tbd'])


export const charts = pgTable("charts", {
	id: text().primaryKey().notNull(),
	workspaceId: text("workspace_id").notNull(),
	name: text().notNull(),
	status: chartStatus().default('draft').notNull(),
	version: integer().default(1).notNull(),
	ownerId: text("owner_id").notNull(),
	creatorId: text("creator_id").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "charts_workspace_id_workspaces_id_fk"
		}).onDelete("cascade"),
]);

export const jobDescriptions = pgTable("job_descriptions", {
	id: text().primaryKey().notNull(),
	nodeId: text("node_id").notNull(),
	chartId: text("chart_id").notNull(),
	status: roleStatus().default('draft').notNull(),
	responsibilities: text().default(').notNull(),
	requirements: text().default(').notNull(),
	salaryBandMin: integer("salary_band_min"),
	salaryBandMax: integer("salary_band_max"),
	salaryCurrency: text("salary_currency"),
	level: text(),
	version: integer().default(1).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	updatedBy: text("updated_by").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.chartId],
			foreignColumns: [charts.id],
			name: "job_descriptions_chart_id_charts_id_fk"
		}).onDelete("cascade"),
]);

export const nodes = pgTable("nodes", {
	id: text().primaryKey().notNull(),
	chartId: text("chart_id").notNull(),
	name: text().notNull(),
	title: text().notNull(),
	departmentId: text("department_id").notNull(),
	managerId: text("manager_id"),
	status: nodeStatus().default('active').notNull(),
	employmentType: employmentType("employment_type").default('full-time').notNull(),
	roleType: roleType("role_type"),
	avatarUrl: text("avatar_url"),
	location: text(),
	startDate: text("start_date"),
	x: real().default(0).notNull(),
	y: real().default(0).notNull(),
	isNew: boolean("is_new").default(false),
}, (table) => [
	foreignKey({
			columns: [table.chartId],
			foreignColumns: [charts.id],
			name: "nodes_chart_id_charts_id_fk"
		}).onDelete("cascade"),
]);

export const pendingInvites = pgTable("pending_invites", {
	id: text().primaryKey().notNull(),
	workspaceId: text("workspace_id").notNull(),
	email: text().notNull(),
	permission: permission().default('viewer').notNull(),
	sentAt: timestamp("sent_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "pending_invites_workspace_id_workspaces_id_fk"
		}).onDelete("cascade"),
]);

export const roleTemplates = pgTable("role_templates", {
	id: text().primaryKey().notNull(),
	workspaceId: text("workspace_id").notNull(),
	title: text().notNull(),
	department: text().notNull(),
	responsibilities: text().default(').notNull(),
	requirements: text().default(').notNull(),
	tags: text().array().default([""]).notNull(),
	createdBy: text("created_by").notNull(),
	updatedBy: text("updated_by").notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	uses: integer().default(0).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "role_templates_workspace_id_workspaces_id_fk"
		}).onDelete("cascade"),
]);

export const workspaceMembers = pgTable("workspace_members", {
	id: text().primaryKey().notNull(),
	workspaceId: text("workspace_id").notNull(),
	userId: text("user_id").notNull(),
	email: text().notNull(),
	name: text(),
	avatarUrl: text("avatar_url"),
	permission: permission().default('viewer').notNull(),
	joinedAt: timestamp("joined_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "workspace_members_workspace_id_workspaces_id_fk"
		}).onDelete("cascade"),
]);

export const departments = pgTable("departments", {
	id: text().primaryKey().notNull(),
	chartId: text("chart_id").notNull(),
	name: text().notNull(),
	colour: text().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.chartId],
			foreignColumns: [charts.id],
			name: "departments_chart_id_charts_id_fk"
		}).onDelete("cascade"),
]);

export const workspaces = pgTable("workspaces", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	ownerId: text("owner_id").notNull(),
	ownerRole: text("owner_role").notNull(),
	size: text().notNull(),
	planTier: planTier("plan_tier").default('free').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const edges = pgTable("edges", {
	id: text().primaryKey().notNull(),
	chartId: text("chart_id").notNull(),
	sourceId: text("source_id").notNull(),
	targetId: text("target_id").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.chartId],
			foreignColumns: [charts.id],
			name: "edges_chart_id_charts_id_fk"
		}).onDelete("cascade"),
]);
