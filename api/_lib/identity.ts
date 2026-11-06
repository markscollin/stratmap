/// <reference types="node" />

// Server-side lookup of who a Clerk user is. Used where the server must trust an
// email address (invite acceptance), so it only returns VERIFIED addresses —
// never anything the client sent.

export interface UserIdentity {
  /** Verified email addresses, lower-cased. */
  emails: string[]
  name: string | null
  avatarUrl: string | null
}

const DEV_USER_ID = 'u-dev'
const DEV_PREFIX = 'dev-' // extra dev-bypass identities, see api/_lib/auth.ts

export async function getUserIdentity(userId: string): Promise<UserIdentity> {
  if (userId.startsWith(DEV_PREFIX)) {
    // `x-dev-user: alice` → dev-alice, alice@e2e.test. Clerk ids never start with "dev-".
    const slug = userId.slice(DEV_PREFIX.length)
    return { emails: [`${slug}@e2e.test`], name: slug, avatarUrl: null }
  }
  if (userId === DEV_USER_ID || !process.env.CLERK_SECRET_KEY) {
    // Dev bypass identity (local only — requireUser never yields u-dev on deployed envs).
    return { emails: ['dev@example.com'], name: 'Dev User', avatarUrl: null }
  }

  const { createClerkClient } = await import('@clerk/backend')
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
  const user = await clerk.users.getUser(userId)

  const emails = user.emailAddresses
    .filter(e => e.verification?.status === 'verified')
    .map(e => e.emailAddress.toLowerCase())
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || null

  return { emails, name, avatarUrl: user.imageUrl ?? null }
}

/** Deletes the person's sign-in account (roadmap 4.2). No-op for dev-bypass identities and when Clerk is not configured. */
export async function deleteUserAccount(userId: string): Promise<void> {
  if (userId.startsWith(DEV_PREFIX) || userId === DEV_USER_ID || !process.env.CLERK_SECRET_KEY) return
  const { createClerkClient } = await import('@clerk/backend')
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
  try {
    await clerk.users.deleteUser(userId)
  } catch (err) {
    // Already gone (a retry after a partial failure) counts as success.
    if ((err as { status?: number }).status === 404) return
    throw err
  }
}
