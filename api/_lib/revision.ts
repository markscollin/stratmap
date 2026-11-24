// Optimistic concurrency for chart structure (roadmap 2.4).
//
// `charts.revision` goes up by one on every structural edit (add/edit/delete a role,
// add/remove a reporting line, import, rename, status change). Moving boxes does not
// count. A client sends the revision it last saw in `X-Chart-Revision`; if someone
// else has edited since, the write is refused with 409 `chart-changed` instead of
// silently mixing two people's edits. A request without the header is not checked
// (scripts, older clients) but still bumps the revision.
//
// The check and the bump are one conditional UPDATE, so two simultaneous writes with
// the same revision cannot both succeed. Call it as the last step before the write,
// after validation, role and plan checks, so refused requests don't bump anything.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, eq, sql, type SQL } from 'drizzle-orm'
import { db } from './db'
import { charts } from '../../src/lib/db/schema'

export const REVISION_HEADER = 'X-Chart-Revision'

function expectedRevision(req: VercelRequest): number | undefined {
  const raw = req.headers[REVISION_HEADER.toLowerCase()]
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value === undefined || !/^\d{1,9}$/.test(value)) return undefined
  return Number(value)
}

/** Claims the next revision. Returns it, or sends 409 and returns null. */
export async function claimRevision(req: VercelRequest, res: VercelResponse, chartId: string): Promise<number | null> {
  const expected = expectedRevision(req)
  const [row] = await db
    .update(charts)
    .set({ revision: sql`${charts.revision} + 1`, updatedAt: new Date() })
    .where(and(eq(charts.id, chartId), expected === undefined ? undefined : eq(charts.revision, expected)))
    .returning({ revision: charts.revision })
  if (row) {
    res.setHeader(REVISION_HEADER, String(row.revision))
    return row.revision
  }
  await sendChartChanged(res, chartId)
  return null
}

// ── Inside one atomic batch (R-59) ──────────────────────────────────────────────────────────────────────────────────────────
// A multi-statement write (import, restore, …) must bump the revision in the SAME transaction as its rows, or a failure part-way
// leaves a bumped revision (and half the rows) behind. Neon's batch cannot read a result between statements, so the "did the
// conditional UPDATE match?" check is a statement that fails the whole batch when it did not: the cast of a text that is not a
// number raises, and its text names the reason, which `guardFailure` reads back. The bump also takes the chart row's lock first,
// so a second batch on the same chart waits for this one and its later statements see this one's rows.

/** The revision this request was based on (`X-Chart-Revision`), or undefined when it sent none (no check, still bumps). */
export function sentRevision(req: VercelRequest): number | undefined {
  return expectedRevision(req)
}

/**
 * A statement that fails the batch with `guard:<reason>` unless `ok` (a boolean over `from`, which must give exactly one row, e.g.
 * an aggregate) is true. `withClause` goes first: a data-modifying WITH must be at the top level of a statement.
 */
export function guardStatement(d: typeof db, reason: string, ok: SQL, from: SQL, withClause?: SQL) {
  return d.execute(sql`${withClause ?? sql``} SELECT CASE WHEN ${ok} THEN 1 ELSE (${'guard:' + reason + ':'} || (${ok})::text)::int END FROM ${from}`)
}

/** Bumps the chart's revision (checking it first when the client sent one); the batch fails with `guard:chart-changed` otherwise. */
export function revisionClaimStatement(d: typeof db, chartId: string, expected: number | undefined) {
  const where = expected === undefined ? sql`id = ${chartId}` : sql`id = ${chartId} AND revision = ${expected}`
  return guardStatement(d, 'chart-changed', sql`count(*) = 1`, sql`bumped`,
    sql`WITH bumped AS (UPDATE charts SET revision = revision + 1, updated_at = now() WHERE ${where} RETURNING 1)`)
}

/** The reason a guard statement failed the batch (`'chart-changed'`, `'plan-limit'`, …), or null for any other error. */
export function guardFailure(err: unknown): string | null {
  // Only Postgres's own error text counts (a driver's wrapper message also lists the query's parameters, which hold every reason).
  for (let e: unknown = err, i = 0; e && i < 5; e = (e as { cause?: unknown }).cause, i++) {
    const m = /invalid input syntax for type integer: "guard:([a-z-]+):/.exec(String((e as { message?: unknown }).message ?? ''))
    if (m) return m[1]
  }
  return null
}

/** After a refused or failed claim: 409 chart-changed with the current revision (or 404). */
export async function sendChartChanged(res: VercelResponse, chartId: string): Promise<void> {
  const [current] = await db.select({ revision: charts.revision }).from(charts).where(eq(charts.id, chartId)).limit(1)
  if (!current) { res.status(404).json({ error: 'Chart not found' }); return }
  res.setHeader(REVISION_HEADER, String(current.revision))
  res.status(409).json({ error: 'chart-changed', revision: current.revision, message: 'This chart was changed by someone else. Reload to see the latest version.' })
}

/** Answers 409 early (nothing written) when the client's revision is already stale; true when it may go on. */
export async function revisionStillCurrent(req: VercelRequest, res: VercelResponse, chartId: string): Promise<boolean> {
  const expected = expectedRevision(req)
  if (expected === undefined) return true
  const [current] = await db.select({ revision: charts.revision }).from(charts).where(eq(charts.id, chartId)).limit(1)
  if (current && current.revision === expected) return true
  await sendChartChanged(res, chartId)
  return false
}

/** Sets the `X-Chart-Revision` reply header to the chart's revision now (after a committed batch). */
export async function sendRevisionHeader(res: VercelResponse, chartId: string): Promise<void> {
  const [current] = await db.select({ revision: charts.revision }).from(charts).where(eq(charts.id, chartId)).limit(1)
  if (current) res.setHeader(REVISION_HEADER, String(current.revision))
}
