import { e2eSql } from './neon'

// Deletes what this run created. Workspaces cascade to charts, nodes, members, invites…
export default async function globalTeardown() {
  const url = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL
  if (!url || !process.env.E2E_RUN_ID) return
  const sql = e2eSql(url)
  await sql`DELETE FROM workspaces WHERE owner_id LIKE ${`dev-e2e${process.env.E2E_RUN_ID}-%`}`
}
