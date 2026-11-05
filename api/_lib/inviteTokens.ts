import { createHash, randomBytes } from 'node:crypto'
import { getAppUrl } from './url'

// Invite links carry a random 256-bit token. Only its SHA-256 is stored, so the
// link is effectively a signed, revocable capability: rotating the hash (resend)
// or deleting the row (revoke / accept) kills every earlier link.

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** base64url of 32 bytes = 43 chars. */
export const INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function newInviteToken(now = Date.now()): { token: string; tokenHash: string; expiresAt: Date } {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashInviteToken(token), expiresAt: new Date(now + INVITE_TTL_MS) }
}

export function inviteUrl(token: string): string {
  return `${getAppUrl()}/invite/${token}`
}

/** Null expiry = legacy invite from before tokens existed; treated as still valid. */
export function isExpired(expiresAt: Date | null, now = new Date()): boolean {
  return expiresAt !== null && expiresAt <= now
}
