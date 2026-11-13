CREATE TABLE "deleted_nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"chart_id" text NOT NULL,
	"node_id" text NOT NULL,
	"deleted_by" text NOT NULL,
	"deleted_at" timestamp DEFAULT now() NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deleted_nodes" ADD CONSTRAINT "deleted_nodes_chart_id_charts_id_fk" FOREIGN KEY ("chart_id") REFERENCES "public"."charts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deleted_nodes_chart_node_idx" ON "deleted_nodes" USING btree ("chart_id","node_id");--> statement-breakpoint
CREATE INDEX "deleted_nodes_deleted_at_idx" ON "deleted_nodes" USING btree ("deleted_at");