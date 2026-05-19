import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from '../../../src/lib/db/schema'

const client = new PGlite()
export const testDb = drizzle(client, { schema })

export const TEST_USER_ID = 'u-test'
export const TEST_WS_ID = 'ws-test'
export const TEST_CHART_ID = 'chart-test'
export const TEST_NODE_ID = 'node-test'
export const TEST_EDGE_ID = 'edge-test'
export const TEST_JD_ID = 'jd-test'

const SCHEMA_SQL = `
DO $$ BEGIN CREATE TYPE chart_status AS ENUM('draft','editing','review','rejected','approved','live','archived'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE employment_type AS ENUM('full-time','part-time','contractor','advisor'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE node_status AS ENUM('active','open','planned','backfill'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE permission AS ENUM('owner','admin','editor','commenter','viewer'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE plan_tier AS ENUM('free','starter','growth','enterprise'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE role_status AS ENUM('draft','in-review','approved','published','hired'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE role_type AS ENUM('existing','new-headcount','backfill','contractor','tbd'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS workspaces (
  id text PRIMARY KEY,
  name text NOT NULL,
  owner_id text NOT NULL,
  owner_role text NOT NULL,
  size text NOT NULL,
  plan_tier plan_tier NOT NULL DEFAULT 'free',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  email text NOT NULL,
  name text,
  avatar_url text,
  permission permission NOT NULL DEFAULT 'viewer',
  joined_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pending_invites (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  permission permission NOT NULL DEFAULT 'viewer',
  sent_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS charts (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  status chart_status NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1,
  owner_id text NOT NULL,
  creator_id text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS departments (
  id text PRIMARY KEY,
  chart_id text NOT NULL REFERENCES charts(id) ON DELETE CASCADE,
  name text NOT NULL,
  colour text NOT NULL
);

CREATE TABLE IF NOT EXISTS nodes (
  id text PRIMARY KEY,
  chart_id text NOT NULL REFERENCES charts(id) ON DELETE CASCADE,
  name text NOT NULL,
  title text NOT NULL,
  department_id text,
  manager_id text,
  status node_status NOT NULL DEFAULT 'active',
  employment_type employment_type NOT NULL DEFAULT 'full-time',
  role_type role_type,
  avatar_url text,
  location text,
  start_date text,
  x real NOT NULL DEFAULT 0,
  y real NOT NULL DEFAULT 0,
  is_new boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS edges (
  id text PRIMARY KEY,
  chart_id text NOT NULL REFERENCES charts(id) ON DELETE CASCADE,
  source_id text NOT NULL,
  target_id text NOT NULL
);

CREATE TABLE IF NOT EXISTS job_descriptions (
  id text PRIMARY KEY,
  node_id text NOT NULL,
  chart_id text NOT NULL REFERENCES charts(id) ON DELETE CASCADE,
  status role_status NOT NULL DEFAULT 'draft',
  responsibilities text NOT NULL DEFAULT '',
  requirements text NOT NULL DEFAULT '',
  salary_band_min integer,
  salary_band_max integer,
  salary_currency text,
  level text,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamp NOT NULL DEFAULT now(),
  updated_by text NOT NULL
);

CREATE TABLE IF NOT EXISTS role_templates (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  department text NOT NULL,
  responsibilities text NOT NULL DEFAULT '',
  requirements text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  created_by text NOT NULL,
  updated_by text NOT NULL,
  updated_at timestamp NOT NULL DEFAULT now(),
  uses integer NOT NULL DEFAULT 0
);
`

let schemaReady = false

export async function setupSchema() {
  if (schemaReady) return
  await client.exec(SCHEMA_SQL)
  schemaReady = true
}

export async function cleanDb() {
  await testDb.delete(schema.jobDescriptions)
  await testDb.delete(schema.edges)
  await testDb.delete(schema.nodes)
  await testDb.delete(schema.departments)
  await testDb.delete(schema.roleTemplates)
  await testDb.delete(schema.charts)
  await testDb.delete(schema.pendingInvites)
  await testDb.delete(schema.workspaceMembers)
  await testDb.delete(schema.workspaces)
}

export async function seedWorkspace() {
  await testDb.insert(schema.workspaces).values({
    id: TEST_WS_ID,
    name: 'Test Workspace',
    ownerId: TEST_USER_ID,
    ownerRole: 'Founder/CEO',
    size: '11-50',
  })
  await testDb.insert(schema.workspaceMembers).values({
    id: 'wm-test',
    workspaceId: TEST_WS_ID,
    userId: TEST_USER_ID,
    email: 'test@example.com',
    name: 'Test User',
    permission: 'owner',
  })
}

export async function seedChart() {
  await testDb.insert(schema.charts).values({
    id: TEST_CHART_ID,
    workspaceId: TEST_WS_ID,
    name: 'Test Chart',
    ownerId: TEST_USER_ID,
    creatorId: TEST_USER_ID,
    version: 1,
  })
}

export async function seedNode() {
  await testDb.insert(schema.nodes).values({
    id: TEST_NODE_ID,
    chartId: TEST_CHART_ID,
    name: 'Alice',
    title: 'CTO',
    x: 100,
    y: 100,
  })
}

export async function seedEdge() {
  // Needs a second node
  await testDb.insert(schema.nodes).values({
    id: 'node-b',
    chartId: TEST_CHART_ID,
    name: 'Bob',
    title: 'Engineer',
    x: 100,
    y: 250,
  })
  await testDb.insert(schema.edges).values({
    id: TEST_EDGE_ID,
    chartId: TEST_CHART_ID,
    sourceId: TEST_NODE_ID,
    targetId: 'node-b',
  })
}
