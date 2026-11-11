import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { fileURLToPath } from 'node:url'
import * as schema from '../../../src/lib/db/schema'

const client = new PGlite()
export const testDb = drizzle(client, { schema })

export const TEST_USER_ID = 'u-test'
export const TEST_WS_ID = 'ws-test'
export const TEST_CHART_ID = 'chart-test'
export const TEST_NODE_ID = 'node-test'
export const TEST_EDGE_ID = 'edge-test'
export const TEST_JD_ID = 'jd-test'
export const TEST_DEPT_ID = 'dept-test'
export const TEST_PLAN_ID = 'plan-test'

// The test schema is built from the real migrations in ./drizzle — the same SQL
// production runs — so tests can't drift from the deployed schema.
const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../../drizzle', import.meta.url))

let schemaReady = false

export async function setupSchema() {
  if (schemaReady) return
  await migrate(testDb, { migrationsFolder: MIGRATIONS_FOLDER })
  schemaReady = true
}

export async function cleanDb() {
  await testDb.delete(schema.auditLog)
  await testDb.delete(schema.chartSnapshots)
  await testDb.delete(schema.roleComments)
  await testDb.delete(schema.userNotificationPrefs)
  await testDb.delete(schema.stripeEvents)
  await testDb.delete(schema.rateLimits)
  await testDb.delete(schema.aiUsage)
  await testDb.delete(schema.sharedLinks)
  await testDb.delete(schema.headcountPlans)
  await testDb.delete(schema.jobDescriptions)
  await testDb.delete(schema.edges)
  await testDb.delete(schema.nodes)
  await testDb.delete(schema.departments)
  await testDb.delete(schema.roleTemplates)
  await testDb.delete(schema.workspaceDepartments)
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

export async function seedWorkspaceDept() {
  await testDb.insert(schema.workspaceDepartments).values({
    id: TEST_DEPT_ID,
    workspaceId: TEST_WS_ID,
    name: 'Engineering',
    colour: '#0EA5E9',
  })
}

export async function seedHeadcountPlan() {
  await testDb.insert(schema.headcountPlans).values({
    id: TEST_PLAN_ID,
    workspaceId: TEST_WS_ID,
    title: 'Senior Engineer',
    roleType: 'new-headcount',
    targetQuarter: '2026-Q2',
    createdBy: TEST_USER_ID,
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

/** Add another member to the test workspace with the given permission. */
export async function seedMember(
  userId: string,
  permission: 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer',
  email = `${userId}@example.com`,
) {
  await testDb.insert(schema.workspaceMembers).values({
    id: `wm-${userId}`,
    workspaceId: TEST_WS_ID,
    userId,
    email,
    name: userId,
    permission,
  })
}
