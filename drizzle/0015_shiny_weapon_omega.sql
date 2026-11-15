-- R-33: one membership per person per workspace. Any duplicate that already exists is the same person twice, so
-- keep the one with the highest role (the enum is declared owner first), then the earliest joined, then the lowest id.
DELETE FROM "workspace_members" a USING "workspace_members" b
WHERE a."workspace_id" = b."workspace_id" AND a."user_id" = b."user_id" AND a."id" <> b."id"
  AND (a."permission" > b."permission"
    OR (a."permission" = b."permission" AND (a."joined_at" > b."joined_at"
      OR (a."joined_at" = b."joined_at" AND a."id" > b."id"))));
--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_members_workspace_user_uq" ON "workspace_members" USING btree ("workspace_id","user_id");
