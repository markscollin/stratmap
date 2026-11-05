import type { VercelRequest, VercelResponse } from '@vercel/node'
import { asc, eq } from 'drizzle-orm'
import { requireUser } from './_lib/auth'
import { db } from './_lib/db'
import { reportError } from './_lib/sentry'
import { resolvePlanTier } from './_lib/billing'
import { workspaces, workspaceMembers } from '../src/lib/db/schema'

// GET /api/workspaces — every workspace the caller belongs to, for the sidebar
// switcher (roadmap 1.2). Plans are per workspace, so each row carries its own tier.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const user = await requireUser(req, res)
  if (!user) return

  try {
    const rows = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        permission: workspaceMembers.permission,
        joinedAt: workspaceMembers.joinedAt,
        planTier: workspaces.planTier,
        trialPlan: workspaces.trialPlan,
        trialEndsAt: workspaces.trialEndsAt,
        cancelAtPeriodEnd: workspaces.cancelAtPeriodEnd,
        planExpiresAt: workspaces.planExpiresAt,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, user.userId))
      .orderBy(asc(workspaceMembers.joinedAt))

    return res.json({
      workspaces: rows.map(r => ({ id: r.id, name: r.name, myPermission: r.permission, planTier: resolvePlanTier(r) })),
    })
  } catch (err) {
    console.error('/api/workspaces', err)
    reportError(err, { route: '/api/workspaces' })
    return res.status(500).json({ error: 'Internal server error' })
  }
}
