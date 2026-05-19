import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, desc } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import { db } from '../_lib/db'
import { charts, nodes, edges, departments } from '../../src/lib/db/schema'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    if (req.method === 'GET') {
      const chartList = await db
        .select()
        .from(charts)
        .where(eq(charts.workspaceId, auth.workspaceId))
        .orderBy(desc(charts.updatedAt))

      return res.json(chartList)
    }

    if (req.method === 'POST') {
      const { name, status = 'draft', templateNodes = [], templateEdges = [], templateDepts = [] } =
        req.body as {
          name: string
          status?: string
          templateNodes?: typeof nodes.$inferInsert[]
          templateEdges?: typeof edges.$inferInsert[]
          templateDepts?: typeof departments.$inferInsert[]
        }

      if (!name) return res.status(400).json({ error: 'name is required' })

      const chartId = crypto.randomUUID()

      const [chart] = await db
        .insert(charts)
        .values({
          id: chartId,
          workspaceId: auth.workspaceId,
          name,
          status: status as typeof charts.$inferInsert['status'],
          version: 1,
          ownerId: auth.userId,
          creatorId: auth.userId,
        })
        .returning()

      // Seed from template — generate fresh IDs to avoid PK conflicts across charts
      const deptIdMap = new Map<string, string>()
      const nodeIdMap = new Map<string, string>()

      if (templateDepts.length) {
        const newDepts = templateDepts.map((d) => {
          const newId = crypto.randomUUID()
          deptIdMap.set(d.id!, newId)
          return { ...d, id: newId, chartId }
        })
        await db.insert(departments).values(newDepts)
      }

      if (templateNodes.length) {
        // Pre-generate all node IDs so managerId refs can be remapped in one pass
        templateNodes.forEach((n) => nodeIdMap.set(n.id!, crypto.randomUUID()))
        const newNodes = templateNodes.map((n) => ({
          ...n,
          id: nodeIdMap.get(n.id!)!,
          chartId,
          departmentId: n.departmentId ? (deptIdMap.get(n.departmentId) ?? null) : null,
          managerId: n.managerId ? (nodeIdMap.get(n.managerId) ?? null) : null,
        }))
        await db.insert(nodes).values(newNodes)
      }

      if (templateEdges.length) {
        const newEdges = templateEdges.map((e) => ({
          ...e,
          id: crypto.randomUUID(),
          chartId,
          sourceId: nodeIdMap.get(e.sourceId!) ?? e.sourceId!,
          targetId: nodeIdMap.get(e.targetId!) ?? e.targetId!,
        }))
        await db.insert(edges).values(newEdges)
      }

      return res.status(201).json(chart)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('/api/charts', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
