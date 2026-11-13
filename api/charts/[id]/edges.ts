import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, and, inArray } from 'drizzle-orm'
import { requireAuth } from '../../_lib/auth'
import { requireRole, requireChartsEditable } from '../../_lib/access'
import { claimRevision } from '../../_lib/revision'
import { parseBody } from '../../_lib/validate'
import { EdgeCreate } from '../../_lib/schemas'
import { db } from '../../_lib/db'
import { charts, edges, nodes } from '../../../src/lib/db/schema'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const chartId = req.query.id as string

    const [chart] = await db
      .select({ id: charts.id })
      .from(charts)
      .where(and(eq(charts.id, chartId), eq(charts.workspaceId, auth.workspaceId)))
      .limit(1)

    if (!chart) return res.status(404).json({ error: 'Chart not found' })

    if (req.method === 'POST') {
      if (!(await requireRole(auth, res, 'editor'))) return
      if (!(await requireChartsEditable(auth.workspaceId, res))) return
      const body = parseBody(EdgeCreate, req, res)
      if (!body) return
      const { id: clientId, sourceId, targetId } = body
      if (sourceId === targetId) return res.status(400).json({ error: 'A role cannot report to itself' })

      // Both ends must be nodes in this chart (prevents cross-chart/workspace links).
      const endpoints = await db
        .select({ id: nodes.id })
        .from(nodes)
        .where(and(eq(nodes.chartId, chartId), inArray(nodes.id, [sourceId, targetId])))
      if (endpoints.length !== 2) return res.status(400).json({ error: 'sourceId and targetId must be nodes in this chart' })

      // A client-supplied id makes a retry safe: the same edge sent again (the first reply was lost) is
      // returned as it is, without a second revision bump. An id used by anything else is a clean 409.
      const sameEdge = (e: { chartId: string; sourceId: string; targetId: string }) =>
        e.chartId === chartId && e.sourceId === sourceId && e.targetId === targetId
      if (clientId) {
        const [existing] = await db.select().from(edges).where(eq(edges.id, clientId)).limit(1)
        if (existing) {
          return sameEdge(existing) ? res.status(200).json(existing) : res.status(409).json({ error: 'id-taken' })
        }
      }

      if ((await claimRevision(req, res, chartId)) === null) return
      const [edge] = await db
        .insert(edges)
        .values({ id: clientId ?? crypto.randomUUID(), chartId, sourceId, targetId })
        .onConflictDoNothing({ target: edges.id })
        .returning()
      // Lost a race for the same id between the check and the insert.
      if (!edge) return res.status(409).json({ error: 'id-taken' })

      return res.status(201).json(edge)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('/api/charts/[id]/edges', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
