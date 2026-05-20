import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { db } from '../_lib/db'
import { sharedLinks, charts, nodes, edges, departments } from '../../src/lib/db/schema'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const code = req.query.code as string

    const [link] = await db
      .select()
      .from(sharedLinks)
      .where(eq(sharedLinks.id, code))
      .limit(1)

    if (!link) return res.status(404).json({ error: 'Link not found or revoked' })

    if (link.expiresAt && link.expiresAt < new Date()) {
      return res.status(410).json({ error: 'This link has expired' })
    }

    const [chart] = await db
      .select()
      .from(charts)
      .where(eq(charts.id, link.chartId))
      .limit(1)

    if (!chart) return res.status(404).json({ error: 'Chart not found' })

    const [nodeList, edgeList, deptList] = await Promise.all([
      db.select().from(nodes).where(eq(nodes.chartId, chart.id)),
      db.select().from(edges).where(eq(edges.chartId, chart.id)),
      db.select().from(departments).where(eq(departments.chartId, chart.id)),
    ])

    return res.json({
      name: chart.name,
      nodes: nodeList,
      edges: edgeList,
      departments: deptList,
      exportedAt: chart.updatedAt,
    })
  } catch (err) {
    console.error('/api/share/[code]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
