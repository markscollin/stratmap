import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, desc, eq, ilike, or } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import { db } from '../_lib/db'
import { reportError } from '../_lib/sentry'
import { charts, nodes, departments } from '../../src/lib/db/schema'

// GET /api/roles/search?q=engineer — roles across every chart in the caller's
// workspace whose title or person name matches. Any member may search (read-only).

const MAX_RESULTS = 200

/** Escapes LIKE wildcards so a search for "100%" or "a_b" matches literally. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, c => `\\${c}`)}%`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await requireAuth(req, res)
  if (!auth) return

  try {
    const q = String(req.query.q ?? '').trim()
    if (q.length < 2 || q.length > 100) {
      return res.status(400).json({ error: 'invalid-request', message: 'Search for 2 to 100 characters.' })
    }
    const pattern = likePattern(q)

    const rows = await db
      .select({
        nodeId: nodes.id,
        chartId: charts.id,
        chart: charts.name,
        version: charts.version,
        title: nodes.title,
        name: nodes.name,
        status: nodes.status,
        dept: departments.name,
      })
      .from(nodes)
      .innerJoin(charts, eq(nodes.chartId, charts.id))
      .leftJoin(departments, eq(nodes.departmentId, departments.id))
      .where(and(
        eq(charts.workspaceId, auth.workspaceId),
        or(ilike(nodes.title, pattern), ilike(nodes.name, pattern)),
      ))
      .orderBy(desc(charts.updatedAt), nodes.title)
      .limit(MAX_RESULTS + 1)

    const results = rows.slice(0, MAX_RESULTS).map(r => ({
      nodeId: r.nodeId,
      chartId: r.chartId,
      chart: r.chart,
      version: r.version,
      title: r.title,
      // Only filled roles have a person; open/planned roles' "name" is just a label.
      person: r.status === 'active' && r.name && r.name !== r.title ? r.name : null,
      status: r.status,
      dept: r.dept ?? null,
    }))

    return res.json({ results, truncated: rows.length > MAX_RESULTS })
  } catch (err) {
    console.error('/api/roles/search', err)
    reportError(err, { route: '/api/roles/search' })
    return res.status(500).json({ error: 'Internal server error' })
  }
}
