CREATE INDEX IF NOT EXISTS "charts_workspace_id_idx" ON "charts" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "departments_chart_id_idx" ON "departments" USING btree ("chart_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "edges_chart_id_idx" ON "edges" USING btree ("chart_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "headcount_plans_workspace_id_idx" ON "headcount_plans" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_descriptions_chart_id_node_id_idx" ON "job_descriptions" USING btree ("chart_id","node_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nodes_chart_id_idx" ON "nodes" USING btree ("chart_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pending_invites_workspace_id_email_idx" ON "pending_invites" USING btree ("workspace_id","email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "role_templates_workspace_id_idx" ON "role_templates" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shared_links_chart_id_idx" ON "shared_links" USING btree ("chart_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_departments_workspace_id_idx" ON "workspace_departments" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_members_user_id_idx" ON "workspace_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_members_workspace_id_idx" ON "workspace_members" USING btree ("workspace_id");