ALTER TABLE "rate_limits" ADD COLUMN "window_seconds" integer;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "trial_warned_at" timestamp;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "trial_ended_notice_at" timestamp;