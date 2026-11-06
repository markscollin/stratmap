ALTER TABLE "charts" ADD COLUMN "is_sample" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "onboarding_dismissed_at" timestamp;