import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, eq, isNull } from 'drizzle-orm'
import { NEW_WORKSPACE_TRIAL_PLAN, DEFAULT_NEW_WORKSPACE_TRIAL_DAYS } from '../src/lib/plans'
import { requireAuth, requireUser } from './_lib/auth'
import { track, hasAnalyticsConsent } from './_lib/analytics'
import { requireRole, getPermission } from './_lib/access'
import { parseBody } from './_lib/validate'
import { WorkspaceCreate, WorkspaceUpdate, WorkspaceDelete } from './_lib/schemas'
import { db } from './_lib/db'
import { publicWorkspace } from './_lib/publicWorkspace'
import { softDeleteWorkspace, eraseDate } from './_lib/workspaceLifecycle'
import { reportError } from './_lib/sentry'
import { getUserIdentity, type UserIdentity } from './_lib/identity'
import { workspaces, workspaceMembers, trialGrants } from '../src/lib/db/schema'
import { runAtomically } from './_lib/atomic'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      const auth = await requireAuth(req, res)
      if (!auth) return

      const [ws] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, auth.workspaceId))
        .limit(1)

      if (!ws) return res.status(404).json({ error: 'Workspace not found' })

      const members = await db
        .select()
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, auth.workspaceId))

      // The caller's own role, so the client gates UI on the real permission.
      const myPermission = await getPermission(auth)

      // Stripe ids stay server-side (publicWorkspace); the client gets the subscription state it shows.
      return res.json({ ...publicWorkspace(ws), members, myPermission })
    }

    if (req.method === 'POST') {
      // Called from onboarding — no workspace exists yet, so use requireUser not requireAuth
      const user = await requireUser(req, res)
      if (!user) return

      const body = parseBody(WorkspaceCreate, req, res)
      if (!body) return
      const { name, ownerRole, size } = body

      // Guard: one OWNED workspace per user (owner-decided, roadmap 1.2). If they already own a live one, return it instead of
      // creating a second. Memberships elsewhere do not count (R-56): someone who was invited to a workspace may still make their own,
      // otherwise an invite they never accepted, or one they accepted by mistake, would stop them ever starting fresh.
      const [existing] = await db
        .select()
        .from(workspaces)
        .where(and(eq(workspaces.ownerId, user.userId), isNull(workspaces.deletedAt)))
        .limit(1)

      if (existing) return res.status(200).json({ ...publicWorkspace(existing), myPermission: 'owner' })

      // Who this person is comes from the sign-in provider, not from the request body: the stored address receives
      // workspace-deleted and comment emails and decides whose invites an account deletion removes (R-09).
      let identity: UserIdentity
      try {
        identity = await getUserIdentity(user.userId)
      } catch (err) {
        console.error('/api/workspace POST identity', err)
        reportError(err, { route: '/api/workspace POST', step: 'identity' })
        return res.status(503).json({ error: 'identity-unavailable', message: "We couldn't verify your account just now. Please try again in a moment." })
      }

      const workspaceId = crypto.randomUUID()

      // A first workspace gets the new-workspace trial (R-18, D-3). Not for someone who has owned one before, deleted or not,
      // and not for someone who has had the trial before: `trial_grants` outlives the 30-day erase of a deleted workspace (R-39),
      // so delete, wait and recreate is not a free Growth plan every month. The claim is one insert that only one request can
      // win, so two sign-ups racing cannot both get it.
      const [owned] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.ownerId, user.userId)).limit(1)
      const trialDays = Number(process.env.NEW_WORKSPACE_TRIAL_DAYS ?? DEFAULT_NEW_WORKSPACE_TRIAL_DAYS)
      let trial: { trialPlan?: typeof NEW_WORKSPACE_TRIAL_PLAN; trialEndsAt?: Date } = {}
      let trialClaimed = false
      if (!owned && trialDays > 0) {
        const [claimed] = await db.insert(trialGrants).values({ userId: user.userId }).onConflictDoNothing().returning()
        trialClaimed = !!claimed
        if (claimed) trial = { trialPlan: NEW_WORKSPACE_TRIAL_PLAN, trialEndsAt: new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000) }
      }

      // The workspace and its owner's membership in ONE atomic batch (R-74): a failure between them used to leave a workspace
      // the person owned but could not open (and, with the one-owned-workspace rule, could never replace).
      try {
        await runAtomically(d => [
          d.insert(workspaces).values({ id: workspaceId, name, ownerId: user.userId, ownerRole, size, ...trial }),
          d.insert(workspaceMembers).values({
            id: crypto.randomUUID(),
            workspaceId,
            userId: user.userId,
            email: identity.emails[0] ?? '',   // verified by the sign-in provider, never what the browser sent (R-09)
            name: identity.name ?? '',
            permission: 'owner',
          }),
        ])
      } catch (err) {
        // The workspace was not made, so the trial was not used: give it back, or a failed request would cost it.
        if (trialClaimed) await db.delete(trialGrants).where(eq(trialGrants.userId, user.userId)).catch(() => {})
        throw err
      }
      const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1)

      await track('workspace_created', { userId: user.userId, workspaceId, consent: hasAnalyticsConsent(req), props: { plan: 'free' } })

      return res.status(201).json({ ...publicWorkspace(ws), myPermission: 'owner' })
    }

    if (req.method === 'PUT') {
      const auth = await requireAuth(req, res)
      if (!auth) return

      if (!(await requireRole(auth, res, 'admin'))) return
      const body = parseBody(WorkspaceUpdate, req, res)
      if (!body) return
      const { name } = body

      const [updated] = await db
        .update(workspaces)
        .set({ name, updatedAt: new Date() })
        .where(eq(workspaces.id, auth.workspaceId))
        .returning()

      return res.json(publicWorkspace(updated))
    }

    // Delete the workspace (roadmap 4.2): owner only, and only after typing its name. It is hidden at once, the
    // subscription stops renewing at the end of the paid period (D-4), members are emailed, and the owner can restore it for 30 days.
    if (req.method === 'DELETE') {
      const auth = await requireAuth(req, res)
      if (!auth) return
      if (!(await requireRole(auth, res, 'owner'))) return
      const body = parseBody(WorkspaceDelete, req, res)
      if (!body) return

      const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, auth.workspaceId)).limit(1)
      if (!ws) return res.status(404).json({ error: 'Workspace not found' })
      if (body.confirmName !== ws.name) {
        return res.status(400).json({ error: 'confirm-name-mismatch', message: 'Type the workspace name exactly to confirm.' })
      }

      try {
        await softDeleteWorkspace(ws, auth.userId)
      } catch (err) {
        // Stripe could not cancel the subscription: nothing was deleted, so nothing keeps billing a deleted workspace.
        console.error('/api/workspace DELETE', err)
        reportError(err, { route: '/api/workspace DELETE' })
        return res.status(502).json({ error: 'cancel-failed', message: 'We could not cancel the subscription, so nothing was deleted. Please try again.' })
      }
      return res.json({ deleted: true, eraseOn: eraseDate(new Date()).toISOString() })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('/api/workspace', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
