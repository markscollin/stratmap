import { asc } from 'drizzle-orm'
import { nodes, edges } from '../../src/lib/db/schema'

// Postgres returns rows in storage order when there is no ORDER BY, and that order changes after rows are deleted and
// re-inserted (undo, restore, import). Every read that hands a chart's roles or lines to a client, an export or a version
// uses these, so two reads of the same chart give the same order (R-43).
// Roles: top to bottom, left to right (the reading order of the drawn chart), the id breaks ties.
export const nodeOrder = [asc(nodes.y), asc(nodes.x), asc(nodes.id)] as const
export const edgeOrder = [asc(edges.id)] as const
