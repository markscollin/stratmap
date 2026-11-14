import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, eq, isNull } from 'drizzle-orm'
import { requireAuth, requireUser } from './_lib/auth'
import { track, hasAnalyticsConsent } from './_lib/analytics'
import { requireRole, getPermission } from './_lib/access'
import { parseBody } from './_lib/validate'
import { WorkspaceCreate, WorkspaceUpdate, WorkspaceDelete } from './_lib/schemas'
import { db } from './_lib/db'
import { resolvePlanTier } from './_lib/billing'
import { softDeleteWorkspace, eraseDate } from './_lib/workspaceLifecycle'
import { reportError } from './_lib/sentry'
import { getUserIdentity, type UserIdentity } from './_lib/identity'
import { workspaces, workspaceMembers } from '../src/lib/db/schema'

/** A workspace row without Stripe ids or the trial/billing internals, for replies that go to any member. */
function withoutBillingIds<T extends { stripeCustomerId?: unknown; stripeSubscriptionId?: unknown }>(ws: T): Omit<T, 'stripeCustomerId' | 'stripeSubscriptionId'> {
  const { stripeCustomerId: _c, stripeSubscriptionId: _s, ...rest } = ws
  return rest
}

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

      // Stripe ids stay server-side; the client gets the subscription state it shows.
      const { stripeCustomerId, stripeSubscriptionId: _sub, subscriptionStatus, planExpiresAt, cancelAtPeriodEnd, ...rest } = ws
      const billing = {
        status: subscriptionStatus,
        planExpiresAt,
        cancelAtPeriodEnd,
        hasBillingAccount: stripeCustomerId != null,
      }

      return res.json({ ...rest, planTier: resolvePlanTier(ws), billing, members, myPermission })
    }

    if (req.method === 'POST') {
      // Called from onboarding — no workspace exists yet, so use requireUser not requireAuth
      const user = await requireUser(req, res)
      if (!user) return

      const body = parseBody(WorkspaceCreate, req, res)
      if (!body) return
      const { name, ownerRole, size } = body

      // Guard: if user already has a workspace, return it instead of creating a duplicate
      const [existing] = await db
        .select({ workspaceId: workspaceMembers.workspaceId, permission: workspaceMembers.permission })
        .from(workspaceMembers)
        .innerJoin(workspaces, and(eq(workspaces.id, workspaceMembers.workspaceId), isNull(workspaces.deletedAt)))
        .where(eq(workspaceMembers.userId, user.userId))
        .limit(1)

      if (existing) {
        const [ws] = await db
          .select()
          .from(workspaces)
          .where(eq(workspaces.id, existing.workspaceId))
          .limit(1)
        // Say what this person is in it: the client used to assume "owner", wrong for someone who was only invited (R-13).
        // Billing ids are not part of the reply (R-29).
        return res.status(200).json({ ...withoutBillingIds(ws), myPermission: existing.permission })
      }

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

      const [ws] = await db
        .insert(workspaces)
        .values({ id: workspaceId, name, ownerId: user.userId, ownerRole, size })
        .returning()

      await db.insert(workspaceMembers).values({
        id: crypto.randomUUID(),
        workspaceId,
        userId: user.userId,
        email: identity.emails[0] ?? '',   // verified by the sign-in provider, never what the browser sent (R-09)
        name: identity.name ?? '',
        permission: 'owner',
      })

      await track('workspace_created', { userId: user.userId, workspaceId, consent: hasAnalyticsConsent(req), props: { plan: 'free' } })

      return res.status(201).json({ ...withoutBillingIds(ws), myPermission: 'owner' })
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

      return res.json(updated)
    }

    // Delete the workspace (roadmap 4.2): owner only, and only after typing its name. It is hidden at once, the
    // subscription is cancelled, members are emailed, and the owner can restore it for 30 days.
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
