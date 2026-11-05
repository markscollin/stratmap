CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "subscription_status" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "plan_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;