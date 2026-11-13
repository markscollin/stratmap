ALTER TABLE "stripe_events" ADD COLUMN "processed_at" timestamp;--> statement-breakpoint
ALTER TABLE "stripe_events" ADD COLUMN "emails_sent_at" timestamp;--> statement-breakpoint
-- Every row written by the old code is an event that was handled (it deleted the row when it failed).
UPDATE "stripe_events" SET "processed_at" = "received_at" WHERE "processed_at" IS NULL;
