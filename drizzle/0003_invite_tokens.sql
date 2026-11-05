ALTER TABLE "pending_invites" ADD COLUMN "token_hash" text;--> statement-breakpoint
ALTER TABLE "pending_invites" ADD COLUMN "expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "pending_invites" ADD COLUMN "invited_by" text;--> statement-breakpoint
CREATE UNIQUE INDEX "pending_invites_token_hash_idx" ON "pending_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "pending_invites_email_idx" ON "pending_invites" USING btree ("email");