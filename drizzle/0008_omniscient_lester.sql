ALTER TABLE "workspaces" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "deleted_by" text;