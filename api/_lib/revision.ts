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
import { and, eq, sql } from 'drizzle-orm'
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
  const [current] = await db.select({ revision: charts.revision }).from(charts).where(eq(charts.id, chartId)).limit(1)
  if (!current) {
    res.status(404).json({ error: 'Chart not found' })
    return null
  }
  res.setHeader(REVISION_HEADER, String(current.revision))
  res.status(409).json({
    error: 'chart-changed',
    revision: current.revision,
    message: 'This chart was changed by someone else. Reload to see the latest version.',
  })
  return null
}
