-- R-74: one job description per role. Two first autosaves could each insert a row; keep the newest of any duplicates
-- (latest updated_at, then highest id) before the unique index goes on. The old non-unique index stays (migrations only add).
DELETE FROM "job_descriptions" a USING "job_descriptions" b
  WHERE a."chart_id" = b."chart_id" AND a."node_id" = b."node_id"
    AND (a."updated_at" < b."updated_at" OR (a."updated_at" = b."updated_at" AND a."id" < b."id"));--> statement-breakpoint
CREATE UNIQUE INDEX "job_descriptions_chart_node_uq" ON "job_descriptions" USING btree ("chart_id","node_id");