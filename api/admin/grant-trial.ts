import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { db } from '../_lib/db'
import { workspaces } from '../../src/lib/db/schema'

type PlanTier = 'starter' | 'growth' | 'enterprise'
const VALID_TIERS: PlanTier[] = ['starter', 'growth', 'enterprise']

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const secret = req.headers['x-admin-secret']
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const { workspaceId, planTier, days = 90 } = req.body as {
      workspaceId?: string
      planTier?: PlanTier
      days?: number
    }

    if (!workspaceId || !planTier) {
      return res.status(400).json({ error: 'workspaceId and planTier are required' })
    }

    if (!VALID_TIERS.includes(planTier)) {
      return res.status(400).json({ error: `planTier must be one of: ${VALID_TIERS.join(', ')}` })
    }

    const trialEndsAt = new Date()
    trialEndsAt.setDate(trialEndsAt.getDate() + days)

    const [updated] = await db
      .update(workspaces)
      .set({ trialPlan: planTier, trialEndsAt, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId))
      .returning()

    if (!updated) return res.status(404).json({ error: 'Workspace not found' })

    return res.json({
      workspaceId: updated.id,
      trialPlan: updated.trialPlan,
      trialEndsAt: updated.trialEndsAt,
    })
  } catch (err) {
    console.error('/api/admin/grant-trial', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
