import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq, and } from 'drizzle-orm'
import { requireAuth } from '../_lib/auth'
import { db } from '../_lib/db'
import { reportError } from '../_lib/sentry'
import { sendWorkspaceInvite } from '../_lib/email'
import { getAppUrl } from '../_lib/url'
import { workspaces, workspaceMembers, pendingInvites, permissionEnum } from '../../src/lib/db/schema'

type Permission = (typeof permissionEnum.enumValues)[number]

function normalizePermission(value: string | undefined): Permission {
  return (permissionEnum.enumValues as readonly string[]).includes(value ?? '')
    ? (value as Permission)
    : 'editor'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await requireAuth(req, res)
  if (!auth) return

  try {
    const { invites } = req.body as { invites?: Array<{ email?: string; permission?: string }> }
    if (!Array.isArray(invites) || invites.length === 0) {
      return res.status(400).json({ error: 'invites array is required' })
    }

    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, auth.workspaceId)).limit(1)
    const [inviter] = await db
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, auth.workspaceId), eq(workspaceMembers.userId, auth.userId)))
      .limit(1)

    const workspaceName = ws?.name ?? 'a workspace'
    const inviterName = inviter?.name ?? 'A teammate'
    const inviteUrl = `${getAppUrl()}/sign-up`

    const created = []
    for (const inv of invites) {
      const email = inv.email?.trim()
      if (!email) continue
      const permission = normalizePermission(inv.permission)

      const [row] = await db
        .insert(pendingInvites)
        .values({ id: crypto.randomUUID(), workspaceId: auth.workspaceId, email, permission })
        .returning()
      created.push(row)

      // Email failures must not fail the request — the invite is already persisted.
      try {
        await sendWorkspaceInvite({ to: email, workspaceName, inviterName, inviteUrl })
      } catch (emailErr) {
        console.error('[invites] email send failed for', email, emailErr)
        reportError(emailErr, { route: '/api/workspace/invites', email })
      }
    }

    return res.status(201).json({ invites: created })
  } catch (err) {
    console.error('/api/workspace/invites', err)
    reportError(err, { route: '/api/workspace/invites' })
    return res.status(500).json({ error: 'Internal server error' })
  }
}
