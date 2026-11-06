import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { requireAuth, requireUser } from './_lib/auth'
import { track, hasAnalyticsConsent } from './_lib/analytics'
import { requireRole, getPermission } from './_lib/access'
import { parseBody } from './_lib/validate'
import { WorkspaceCreate, WorkspaceUpdate } from './_lib/schemas'
import { db } from './_lib/db'
import { resolvePlanTier } from './_lib/billing'
import { workspaces, workspaceMembers } from '../src/lib/db/schema'

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
        .select({ workspaceId: workspaceMembers.workspaceId })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.userId, user.userId))
        .limit(1)

      if (existing) {
        const [ws] = await db
          .select()
          .from(workspaces)
          .where(eq(workspaces.id, existing.workspaceId))
          .limit(1)
        return res.status(200).json(ws)
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
        email: body.email ?? '',
        name: body.userName ?? '',
        permission: 'owner',
      })

      await track('workspace_created', { userId: user.userId, workspaceId, consent: hasAnalyticsConsent(req), props: { plan: 'free' } })

      return res.status(201).json(ws)
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

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('/api/workspace', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
