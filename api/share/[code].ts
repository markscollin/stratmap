import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { db } from '../_lib/db'
import { getEffectivePlan } from '../_lib/access'
import { showsBranding } from '../../src/lib/plans'
import { enforceRateLimit, clientIp } from '../_lib/rateLimit'
import { sharedLinks, charts, nodes, edges, departments, workspaces } from '../../src/lib/db/schema'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    // Public, unauthenticated endpoint — throttle per IP to stop code enumeration.
    if (!(await enforceRateLimit(res, `share:${clientIp(req)}`, 60, 60))) return

    const code = req.query.code as string
    if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(code)) {
      return res.status(404).json({ error: 'Link not found or revoked' })
    }

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

    // A link only works while the chart is set to Public. Same 404 as a missing
    // link so private charts are indistinguishable from non-existent ones.
    if (!chart || !chart.isPublic) return res.status(404).json({ error: 'Link not found or revoked' })
    // Links of a deleted workspace stop working at once (roadmap 4.2); they work again if it is restored.
    const [owner] = await db.select({ deletedAt: workspaces.deletedAt }).from(workspaces).where(eq(workspaces.id, chart.workspaceId)).limit(1)
    if (!owner || owner.deletedAt) return res.status(404).json({ error: 'Link not found or revoked' })

    const [nodeList, edgeList, deptList] = await Promise.all([
      db.select().from(nodes).where(eq(nodes.chartId, chart.id)),
      db.select().from(edges).where(eq(edges.chartId, chart.id)),
      db.select().from(departments).where(eq(departments.chartId, chart.id)),
    ])

    // Free workspaces' share pages carry the "Made with StratMap" mark (roadmap 2.6). Only this boolean
    // is exposed, never the plan itself.
    const plan = await getEffectivePlan(chart.workspaceId)
    const branding = !plan || showsBranding(plan.tier)

    // Public snapshot: only the fields the read-only canvas needs.
    res.setHeader('Cache-Control', 'no-store')
    return res.json({
      name: chart.name,
      nodes: nodeList.map(({ chartId: _c, ...n }) => n),
      edges: edgeList.map(({ id, sourceId, targetId }) => ({ id, sourceId, targetId })),
      departments: deptList.map(({ id, name, colour }) => ({ id, name, colour })),
      exportedAt: chart.updatedAt,
      branding,
    })
  } catch (err) {
    console.error('/api/share/[code]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
