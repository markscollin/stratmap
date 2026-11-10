CREATE TABLE "role_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"chart_id" text NOT NULL,
	"node_id" text NOT NULL,
	"parent_id" text,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"mentions" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"edited_at" timestamp,
	"deleted_at" timestamp,
	"resolved_at" timestamp,
	"resolved_by" text
);
--> statement-breakpoint
CREATE TABLE "user_notification_prefs" (
	"user_id" text PRIMARY KEY NOT NULL,
	"comment_emails" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "role_comments" ADD CONSTRAINT "role_comments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_comments" ADD CONSTRAINT "role_comments_chart_id_charts_id_fk" FOREIGN KEY ("chart_id") REFERENCES "public"."charts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_comments" ADD CONSTRAINT "role_comments_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_comments" ADD CONSTRAINT "role_comments_parent_id_role_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."role_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "role_comments_chart_node_idx" ON "role_comments" USING btree ("chart_id","node_id");--> statement-breakpoint
CREATE INDEX "role_comments_workspace_idx" ON "role_comments" USING btree ("workspace_id");