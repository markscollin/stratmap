import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, and } from 'drizzle-orm'
import { requireAuth } from '../../_lib/auth'
import { db } from '../../_lib/db'
import { charts, sharedLinks } from '../../../src/lib/db/schema'

function generateCode(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 10)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return

    const chartId = req.query.id as string

    const [chart] = await db
      .select({ id: charts.id, isPublic: charts.isPublic })
      .from(charts)
      .where(and(eq(charts.id, chartId), eq(charts.workspaceId, auth.workspaceId)))
      .limit(1)

    if (!chart) return res.status(404).json({ error: 'Chart not found' })

    if (req.method === 'POST') {
      // Return existing link if one exists
      const [existing] = await db
        .select()
        .from(sharedLinks)
        .where(eq(sharedLinks.chartId, chartId))
        .limit(1)

      if (existing) return res.json({ code: existing.id })

      const code = generateCode()
      await db.insert(sharedLinks).values({
        id: code,
        chartId,
        createdBy: auth.userId,
      })

      return res.status(201).json({ code })
    }

    if (req.method === 'DELETE') {
      await db.delete(sharedLinks).where(eq(sharedLinks.chartId, chartId))
      return res.status(204).end()
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('/api/charts/[id]/share', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
