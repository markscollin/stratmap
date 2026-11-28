CREATE TABLE "hr_integrations" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"chart_id" text NOT NULL,
	"provider" text NOT NULL,
	"subdomain" text NOT NULL,
	"api_key_encrypted" text NOT NULL,
	"key_hint" text NOT NULL,
	"auto_sync" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_sync_at" timestamp,
	"last_result" jsonb
);
--> statement-breakpoint
ALTER TABLE "hr_integrations" ADD CONSTRAINT "hr_integrations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_integrations" ADD CONSTRAINT "hr_integrations_chart_id_charts_id_fk" FOREIGN KEY ("chart_id") REFERENCES "public"."charts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hr_integrations_chart_uq" ON "hr_integrations" USING btree ("chart_id");--> statement-breakpoint
CREATE INDEX "hr_integrations_workspace_idx" ON "hr_integrations" USING btree ("workspace_id");