-- Phase 0: rate limiting + AI quota tables.
-- Written idempotently (IF NOT EXISTS / guarded constraint) because some
-- databases got these tables from `drizzle-kit push` before migrations existed.
CREATE TABLE IF NOT EXISTS "ai_usage" (
	"workspace_id" text NOT NULL,
	"period" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_usage_workspace_id_period_pk" PRIMARY KEY("workspace_id","period")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_id" bigint NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
