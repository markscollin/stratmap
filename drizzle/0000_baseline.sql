CREATE TYPE "public"."chart_status" AS ENUM('draft', 'editing', 'review', 'rejected', 'approved', 'live', 'archived');--> statement-breakpoint
CREATE TYPE "public"."employment_type" AS ENUM('full-time', 'part-time', 'contractor', 'advisor');--> statement-breakpoint
CREATE TYPE "public"."headcount_status" AS ENUM('planned', 'approved', 'filled');--> statement-breakpoint
CREATE TYPE "public"."node_status" AS ENUM('active', 'open', 'planned', 'backfill');--> statement-breakpoint
CREATE TYPE "public"."permission" AS ENUM('owner', 'admin', 'editor', 'commenter', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."plan_tier" AS ENUM('free', 'starter', 'growth', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."role_status" AS ENUM('draft', 'in-review', 'approved', 'published', 'hired');--> statement-breakpoint
CREATE TYPE "public"."role_type" AS ENUM('existing', 'new-headcount', 'backfill', 'contractor', 'tbd');--> statement-breakpoint
CREATE TABLE "charts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"status" chart_status DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"owner_id" text NOT NULL,
	"creator_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" text PRIMARY KEY NOT NULL,
	"chart_id" text NOT NULL,
	"name" text NOT NULL,
	"colour" text NOT NULL,
	"workspace_department_id" text
);
--> statement-breakpoint
CREATE TABLE "edges" (
	"id" text PRIMARY KEY NOT NULL,
	"chart_id" text NOT NULL,
	"source_id" text NOT NULL,
	"target_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "headcount_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"title" text NOT NULL,
	"department_id" text,
	"role_type" "role_type" DEFAULT 'new-headcount' NOT NULL,
	"target_quarter" text NOT NULL,
	"chart_id" text,
	"status" "headcount_status" DEFAULT 'planned' NOT NULL,
	"notes" text,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_descriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"node_id" text NOT NULL,
	"chart_id" text NOT NULL,
	"status" "role_status" DEFAULT 'draft' NOT NULL,
	"responsibilities" text DEFAULT '' NOT NULL,
	"requirements" text DEFAULT '' NOT NULL,
	"salary_band_min" integer,
	"salary_band_max" integer,
	"salary_currency" text,
	"level" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"chart_id" text NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"department_id" text,
	"manager_id" text,
	"status" "node_status" DEFAULT 'active' NOT NULL,
	"employment_type" "employment_type" DEFAULT 'full-time' NOT NULL,
	"role_type" "role_type",
	"avatar_url" text,
	"location" text,
	"start_date" text,
	"x" real DEFAULT 0 NOT NULL,
	"y" real DEFAULT 0 NOT NULL,
	"is_new" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "pending_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"email" text NOT NULL,
	"permission" "permission" DEFAULT 'viewer' NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"title" text NOT NULL,
	"department" text NOT NULL,
	"responsibilities" text DEFAULT '' NOT NULL,
	"requirements" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_links" (
	"id" text PRIMARY KEY NOT NULL,
	"chart_id" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "workspace_departments" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"colour" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"avatar_url" text,
	"permission" "permission" DEFAULT 'viewer' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_id" text NOT NULL,
	"owner_role" text NOT NULL,
	"size" text NOT NULL,
	"plan_tier" "plan_tier" DEFAULT 'free' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"trial_plan" "plan_tier",
	"trial_ends_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "charts" ADD CONSTRAINT "charts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_chart_id_charts_id_fk" FOREIGN KEY ("chart_id") REFERENCES "public"."charts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_workspace_department_id_workspace_departments_id_fk" FOREIGN KEY ("workspace_department_id") REFERENCES "public"."workspace_departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_chart_id_charts_id_fk" FOREIGN KEY ("chart_id") REFERENCES "public"."charts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "headcount_plans" ADD CONSTRAINT "headcount_plans_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "headcount_plans" ADD CONSTRAINT "headcount_plans_department_id_workspace_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."workspace_departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "headcount_plans" ADD CONSTRAINT "headcount_plans_chart_id_charts_id_fk" FOREIGN KEY ("chart_id") REFERENCES "public"."charts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_descriptions" ADD CONSTRAINT "job_descriptions_chart_id_charts_id_fk" FOREIGN KEY ("chart_id") REFERENCES "public"."charts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_chart_id_charts_id_fk" FOREIGN KEY ("chart_id") REFERENCES "public"."charts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_invites" ADD CONSTRAINT "pending_invites_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_templates" ADD CONSTRAINT "role_templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_links" ADD CONSTRAINT "shared_links_chart_id_charts_id_fk" FOREIGN KEY ("chart_id") REFERENCES "public"."charts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_departments" ADD CONSTRAINT "workspace_departments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;