import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eq } from 'drizzle-orm'
import { db } from './db'
import { workspaces, workspaceMembers } from '../../src/lib/db/schema'

export interface AuthContext {
  userId: string
  workspaceId: string
}

const DEV_USER_ID = 'u-dev'
const DEV_WORKSPACE_ID = 'ws-dev'

// Dev auth bypass is allowed only on local/unset environments — never on deployed
// Vercel environments. Preview deployments have public URLs, so they must require
// real auth just like production.
function isDevBypassAllowed(): boolean {
  const env = process.env.VERCEL_ENV
  return env !== 'production' && env !== 'preview'
}

async function ensureDevWorkspace() {
  const [existing] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, DEV_WORKSPACE_ID))
    .limit(1)

  if (!existing) {
    await db.insert(workspaces).values({
      id: DEV_WORKSPACE_ID,
      name: 'Dev Workspace',
      ownerId: DEV_USER_ID,
      ownerRole: 'Founder/CEO',
      size: '11-50',
      planTier: 'free',
    })
    await db.insert(workspaceMembers).values({
      id: 'wm-dev',
      workspaceId: DEV_WORKSPACE_ID,
      userId: DEV_USER_ID,
      email: 'dev@example.com',
      name: 'Dev User',
      permission: 'owner',
    })
  }
}

// Verifies identity only — does NOT require a workspace to exist.
// Use this for workspace creation (onboarding) where no membership row exists yet.
export async function requireUser(
  req: VercelRequest,
  res: VercelResponse
): Promise<{ userId: string } | null> {
  const bypassAllowed = isDevBypassAllowed()

  if (req.headers['x-dev-user'] === 'true' && bypassAllowed) {
    return { userId: DEV_USER_ID }
  }

  if (!process.env.CLERK_SECRET_KEY && bypassAllowed) {
    return { userId: DEV_USER_ID }
  }

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }

  try {
    const { verifyToken } = await import('@clerk/backend')
    const payload = await verifyToken(authHeader.slice(7), {
      secretKey: process.env.CLERK_SECRET_KEY!,
    })
    return { userId: payload.sub }
  } catch {
    res.status(401).json({ error: 'Invalid token' })
    return null
  }
}

export async function requireAuth(
  req: VercelRequest,
  res: VercelResponse
): Promise<AuthContext | null> {
  const bypassAllowed = isDevBypassAllowed()

  // Dev bypass via header (local/unset environments only — not preview or production)
  if (req.headers['x-dev-user'] === 'true' && bypassAllowed) {
    await ensureDevWorkspace()
    return { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID }
  }

  // If no Clerk secret key on a local/unset environment, fall back to dev identity
  // so local development works without full Clerk setup
  if (!process.env.CLERK_SECRET_KEY && bypassAllowed) {
    console.warn('[auth] CLERK_SECRET_KEY not set — using dev identity')
    await ensureDevWorkspace()
    return { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID }
  }

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }

  try {
    const { verifyToken } = await import('@clerk/backend')
    const payload = await verifyToken(authHeader.slice(7), {
      secretKey: process.env.CLERK_SECRET_KEY!,
    })
    const userId = payload.sub

    const [membership] = await db
      .select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, userId))
      .limit(1)

    if (!membership) {
      // User authenticated but has no workspace yet — they need onboarding
      res.status(404).json({ error: 'no-workspace' })
      return null
    }

    return { userId, workspaceId: membership.workspaceId }
  } catch {
    res.status(401).json({ error: 'Invalid token' })
    return null
  }
}
