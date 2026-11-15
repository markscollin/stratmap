CREATE TABLE "trial_grants" (
	"user_id" text PRIMARY KEY NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Everyone who owns a workspace today is already barred from a second trial (the rule reads the workspaces table).
-- Record them, so the rule keeps holding after a deleted workspace is erased.
INSERT INTO "trial_grants" ("user_id") SELECT DISTINCT "owner_id" FROM "workspaces" ON CONFLICT DO NOTHING;
