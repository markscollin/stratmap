import { and, eq, lt, sql } from 'drizzle-orm'
import { db } from './db'
import { deletedNodes, jobDescriptions } from '../../src/lib/db/schema'

/** How long a deleted role can be brought back. Undo only needs minutes; this is the outer limit (data-protection: keep it short). */
export const TRASH_DAYS = 3

export const trashCutoff = (): Date => new Date(Date.now() - TRASH_DAYS * 24 * 60 * 60 * 1000)

/** Erases kept copies of deleted roles older than the window. One chart, or every chart (the daily job). Returns how many. */
export async function purgeExpiredTrash(chartId?: string): Promise<number> {
  const gone = await db
    .delete(deletedNodes)
    .where(and(lt(deletedNodes.deletedAt, trashCutoff()), chartId ? eq(deletedNodes.chartId, chartId) : undefined))
    .returning({ id: deletedNodes.id })
  return gone.length
}

/**
 * Erases job descriptions whose role no longer exists (R-38): rows orphaned before deletes took them along. Only rows
 * untouched for a day, so one written a moment before its role finished saving is never caught. Returns how many.
 */
export async function purgeOrphanJobDescriptions(): Promise<number> {
  const gone = await db
    .delete(jobDescriptions)
    .where(and(
      lt(jobDescriptions.updatedAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
      sql`not exists (select 1 from nodes where nodes.id = ${jobDescriptions.nodeId} and nodes.chart_id = ${jobDescriptions.chartId})`,
    ))
    .returning({ id: jobDescriptions.id })
  return gone.length
}
