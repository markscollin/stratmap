import type { VercelRequest, VercelResponse } from '@vercel/node'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { db } from './db'
import { workspaces, workspaceMembers } from '../../src/lib/db/schema'
import { isDevBypassAllowed } from './devBypass'

export interface AuthContext {
  userId: string
  workspaceId: string
  /** Caller's role in the workspace. Optional so test mocks may omit it —
   *  api/_lib/access.ts falls back to a DB lookup when it is absent. */
  permission?: (typeof workspaceMembers.$inferSelect)['permission']
}

const DEV_USER_ID = 'u-dev'
const DEV_WORKSPACE_ID = 'ws-dev'
/** Prefix of the extra dev-bypass identities. Clerk ids never start with it. */
export const DEV_PREFIX = 'dev-'
const DEV_SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/i

/**
 * Who the dev bypass acts as. `x-dev-user: true` is the classic single dev identity
 * (`u-dev`, with a ready-made workspace). Any other short slug (`x-dev-user: alice`)
 * is a distinct user `dev-alice` who starts with no workspace, so e2e tests can run
 * sign-up → onboarding → invites with several people (roadmap 3.3). Only called
 * after isDevBypassAllowed() (an explicit ALLOW_DEV_BYPASS=1 and never on preview or production, see devBypass.ts).
 */
function devUserFromHeader(req: VercelRequest): string | null {
  const raw = req.headers['x-dev-user']
  if (typeof raw !== 'string') return null
  if (raw === 'true') return DEV_USER_ID
  return DEV_SLUG.test(raw) ? `${DEV_PREFIX}${raw.toLowerCase()}` : null
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

  const devUser = bypassAllowed ? devUserFromHeader(req) : null
  if (devUser) return { userId: devUser }

  if (!process.env.CLERK_SECRET_KEY && bypassAllowed) {
    return { userId: DEV_USER_ID }
  }

  if (!process.env.CLERK_SECRET_KEY) {
    // Not configured and not an explicit dev bypass: fail closed, and say why in the log (R-16).
    console.error('[auth] CLERK_SECRET_KEY is not set and ALLOW_DEV_BYPASS is not on: refusing the request. Locally, add ALLOW_DEV_BYPASS=1 to .env.local.')
    res.status(401).json({ error: 'Unauthorized' })
    return null
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
  const devUser = bypassAllowed ? devUserFromHeader(req) : null
  if (devUser) {
    if (devUser === DEV_USER_ID) await ensureDevWorkspace()
    return resolveWorkspace(req, res, devUser)
  }

  // If no Clerk secret key on a local/unset environment, fall back to dev identity
  // so local development works without full Clerk setup
  if (!process.env.CLERK_SECRET_KEY && bypassAllowed) {
    console.warn('[auth] CLERK_SECRET_KEY not set — using dev identity')
    await ensureDevWorkspace()
    return resolveWorkspace(req, res, DEV_USER_ID)
  }

  if (!process.env.CLERK_SECRET_KEY) {
    // Not configured and not an explicit dev bypass: fail closed, and say why in the log (R-16).
    console.error('[auth] CLERK_SECRET_KEY is not set and ALLOW_DEV_BYPASS is not on: refusing the request. Locally, add ALLOW_DEV_BYPASS=1 to .env.local.')
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }

  let userId: string
  try {
    const { verifyToken } = await import('@clerk/backend')
    const payload = await verifyToken(authHeader.slice(7), {
      secretKey: process.env.CLERK_SECRET_KEY!,
    })
    userId = payload.sub
  } catch {
    res.status(401).json({ error: 'Invalid token' })
    return null
  }
  return resolveWorkspace(req, res, userId)
}

export const WORKSPACE_HEADER = 'x-workspace-id'

/**
 * Picks the workspace a request acts on (roadmap 1.2: multiple workspaces).
 * The client sends `X-Workspace-Id`, and the caller must be a member of it, so
 * the header can never reach someone else's workspace. Without the header we
 * fall back to the workspace the user joined first (older clients, first load).
 */
async function resolveWorkspace(req: VercelRequest, res: VercelResponse, userId: string): Promise<AuthContext | null> {
  const raw = req.headers[WORKSPACE_HEADER]
  const requested = typeof raw === 'string' && raw.length > 0 && raw.length <= 128 ? raw : undefined

  const [membership] = await db
    .select({ workspaceId: workspaceMembers.workspaceId, permission: workspaceMembers.permission })
    .from(workspaceMembers)
    // A soft-deleted workspace (roadmap 4.2) does not exist for anyone until the owner restores it.
    .innerJoin(workspaces, and(eq(workspaces.id, workspaceMembers.workspaceId), isNull(workspaces.deletedAt)))
    .where(requested
      ? and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, requested))
      : eq(workspaceMembers.userId, userId))
    .orderBy(asc(workspaceMembers.joinedAt))
    .limit(1)

  if (!membership) {
    if (requested) {
      // Not (or no longer) a member there; the client drops the header and retries.
      res.status(403).json({ error: 'not-a-member', message: 'You are not a member of that workspace.' })
      return null
    }
    // User authenticated but has no workspace yet — they need onboarding
    res.status(404).json({ error: 'no-workspace' })
    return null
  }

  return { userId, workspaceId: membership.workspaceId, permission: membership.permission }
}
