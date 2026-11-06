import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm'
import { requireUser } from './_lib/auth'
import { db } from './_lib/db'
import { reportError } from './_lib/sentry'
import { resolvePlanTier } from './_lib/billing'
import { eraseDate } from './_lib/workspaceLifecycle'
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
      .where(and(eq(workspaceMembers.userId, user.userId), isNull(workspaces.deletedAt)))
      .orderBy(asc(workspaceMembers.joinedAt))

    // Workspaces this person owns that were deleted and can still be restored (roadmap 4.2).
    const deleted = await db
      .select({ id: workspaces.id, name: workspaces.name, deletedAt: workspaces.deletedAt })
      .from(workspaces)
      .where(and(eq(workspaces.ownerId, user.userId), isNotNull(workspaces.deletedAt)))

    return res.json({
      workspaces: rows.map(r => ({ id: r.id, name: r.name, myPermission: r.permission, planTier: resolvePlanTier(r) })),
      deleted: deleted
        .filter(d => d.deletedAt && eraseDate(d.deletedAt) > new Date())
        .map(d => ({ id: d.id, name: d.name, deletedAt: d.deletedAt!.toISOString(), eraseOn: eraseDate(d.deletedAt!).toISOString() })),
    })
  } catch (err) {
    console.error('/api/workspaces', err)
    reportError(err, { route: '/api/workspaces' })
    return res.status(500).json({ error: 'Internal server error' })
  }
}
