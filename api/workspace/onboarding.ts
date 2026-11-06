import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, count, eq, sql } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import { requireRole } from '../_lib/access'
import { parseBody } from '../_lib/validate'
import { OnboardingUpdate } from '../_lib/schemas'
import { db } from '../_lib/db'
import { charts, workspaces, workspaceMembers, pendingInvites, sharedLinks } from '../../src/lib/db/schema'

// The getting-started checklist (roadmap 2.7). Steps tick from real data, never from clicks:
//   chart  - a chart of your own (not the sample) with at least ROLES_FOR_CHART roles
//   invite - someone else is in the workspace, or an invite has been sent
//   share  - a chart has a share link
// GET is open to every member; PUT (dismiss for the whole workspace) is admin-only.
export const ROLES_FOR_CHART = 3

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = await requireAuth(req, res)
    if (!auth) return
    const workspaceId = auth.workspaceId

    if (req.method === 'GET') {
      const [[ownChart], [{ value: members }], [{ value: invites }], [link], [ws]] = await Promise.all([
        db.select({ id: charts.id }).from(charts)
          .where(and(
            eq(charts.workspaceId, workspaceId),
            eq(charts.isSample, false),
            sql`(select count(*) from "nodes" n where n."chart_id" = "charts"."id") >= ${ROLES_FOR_CHART}`,
          ))
          .limit(1),
        db.select({ value: count() }).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId)),
        db.select({ value: count() }).from(pendingInvites).where(eq(pendingInvites.workspaceId, workspaceId)),
        db.select({ id: sharedLinks.id }).from(sharedLinks)
          .innerJoin(charts, eq(charts.id, sharedLinks.chartId))
          .where(eq(charts.workspaceId, workspaceId))
          .limit(1),
        db.select({ dismissedAt: workspaces.onboardingDismissedAt }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1),
      ])
      const steps = { chart: !!ownChart, invite: members > 1 || invites > 0, share: !!link }
      return res.json({
        steps,
        complete: steps.chart && steps.invite && steps.share,
        dismissed: !!ws?.dismissedAt,
      })
    }

    if (req.method === 'PUT') {
      if (!(await requireRole(auth, res, 'admin'))) return
      const body = parseBody(OnboardingUpdate, req, res)
      if (!body) return
      await db.update(workspaces)
        .set({ onboardingDismissedAt: body.dismissed ? new Date() : null })
        .where(eq(workspaces.id, workspaceId))
      return res.json({ dismissed: body.dismissed })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('/api/workspace/onboarding', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
