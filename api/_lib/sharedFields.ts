import { nodes } from '../../src/lib/db/schema'

// What a public share link may show about a role (R-26, owner decision D-5). This is an ALLOW-list: a column added to `nodes`
// later (an email, a note, a salary) is not published until someone writes it here on purpose. Everything the read-only canvas
// draws is listed; `location`, `startDate` and `avatarUrl` are public by decision D-5. api/__tests__/share-fields.test.ts fails
// when a `nodes` column is in neither list.
export const SHARED_NODE_FIELDS = [
  'id', 'name', 'title', 'departmentId', 'managerId', 'status', 'employmentType', 'roleType',
  'avatarUrl', 'location', 'startDate', 'x', 'y', 'isNew',
] as const satisfies readonly (keyof typeof nodes.$inferSelect)[]

/** Columns that exist on `nodes` and are deliberately never in a share response. */
export const PRIVATE_NODE_FIELDS = ['chartId'] as const satisfies readonly (keyof typeof nodes.$inferSelect)[]

type Row = typeof nodes.$inferSelect
export type PublicNode = Pick<Row, (typeof SHARED_NODE_FIELDS)[number]>

export function publicNode(row: Row): PublicNode {
  const out: Record<string, unknown> = {}
  for (const f of SHARED_NODE_FIELDS) out[f] = row[f]
  return out as PublicNode
}
