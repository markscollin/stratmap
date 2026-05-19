import { relations } from "drizzle-orm/relations";
import { workspaces, charts, jobDescriptions, nodes, pendingInvites, roleTemplates, workspaceMembers, departments, edges } from "./schema";

export const chartsRelations = relations(charts, ({one, many}) => ({
	workspace: one(workspaces, {
		fields: [charts.workspaceId],
		references: [workspaces.id]
	}),
	jobDescriptions: many(jobDescriptions),
	nodes: many(nodes),
	departments: many(departments),
	edges: many(edges),
}));

export const workspacesRelations = relations(workspaces, ({many}) => ({
	charts: many(charts),
	pendingInvites: many(pendingInvites),
	roleTemplates: many(roleTemplates),
	workspaceMembers: many(workspaceMembers),
}));

export const jobDescriptionsRelations = relations(jobDescriptions, ({one}) => ({
	chart: one(charts, {
		fields: [jobDescriptions.chartId],
		references: [charts.id]
	}),
}));

export const nodesRelations = relations(nodes, ({one}) => ({
	chart: one(charts, {
		fields: [nodes.chartId],
		references: [charts.id]
	}),
}));

export const pendingInvitesRelations = relations(pendingInvites, ({one}) => ({
	workspace: one(workspaces, {
		fields: [pendingInvites.workspaceId],
		references: [workspaces.id]
	}),
}));

export const roleTemplatesRelations = relations(roleTemplates, ({one}) => ({
	workspace: one(workspaces, {
		fields: [roleTemplates.workspaceId],
		references: [workspaces.id]
	}),
}));

export const workspaceMembersRelations = relations(workspaceMembers, ({one}) => ({
	workspace: one(workspaces, {
		fields: [workspaceMembers.workspaceId],
		references: [workspaces.id]
	}),
}));

export const departmentsRelations = relations(departments, ({one}) => ({
	chart: one(charts, {
		fields: [departments.chartId],
		references: [charts.id]
	}),
}));

export const edgesRelations = relations(edges, ({one}) => ({
	chart: one(charts, {
		fields: [edges.chartId],
		references: [charts.id]
	}),
}));