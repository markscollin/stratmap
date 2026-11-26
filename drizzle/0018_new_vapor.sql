CREATE INDEX "chart_snapshots_workspace_idx" ON "chart_snapshots" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "departments_workspace_department_id_idx" ON "departments" USING btree ("workspace_department_id");--> statement-breakpoint
CREATE INDEX "headcount_plans_chart_id_idx" ON "headcount_plans" USING btree ("chart_id");--> statement-breakpoint
CREATE INDEX "headcount_plans_department_id_idx" ON "headcount_plans" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "pending_invites_invited_by_idx" ON "pending_invites" USING btree ("invited_by");--> statement-breakpoint
CREATE INDEX "role_comments_node_idx" ON "role_comments" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "role_comments_parent_idx" ON "role_comments" USING btree ("parent_id");