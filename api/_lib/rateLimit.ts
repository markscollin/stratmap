import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from 'drizzle-orm'
import { db } from './db'
import { rateLimits } from '../../src/lib/db/schema'

// Postgres-backed fixed-window rate limiter. No extra vendor: one upserted row
// per bucket key. Good enough for abuse protection at launch scale; swap for
// Upstash/Vercel KV if this table ever becomes hot.

export interface RateLimitResult {
  allowed: boolean
  count: number
  retryAfterSeconds: number
}

export async function hitRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const nowSec = Math.floor(Date.now() / 1000)
  const windowId = Math.floor(nowSec / windowSeconds)
  const retryAfterSeconds = (windowId + 1) * windowSeconds - nowSec

  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowId, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        // Same window → increment; new window → reset to 1.
        count: sql`CASE WHEN ${rateLimits.windowId} = ${windowId} THEN ${rateLimits.count} + 1 ELSE 1 END`,
        windowId,
      },
    })
    .returning({ count: rateLimits.count })

  const count = row?.count ?? 1
  return { allowed: count <= limit, count, retryAfterSeconds }
}

/** Best-effort client IP (Vercel sets x-forwarded-for / x-real-ip). */
export function clientIp(req: VercelRequest): string {
  const fwd = req.headers['x-forwarded-for']
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim()
  const real = req.headers['x-real-ip']
  return first || (Array.isArray(real) ? real[0] : real) || 'unknown'
}

/**
 * Applies a rate limit and sends 429 when exceeded. Returns true if the request
 * may proceed. Fails OPEN on limiter errors (logged) so a DB hiccup on the
 * counter table never takes the product down.
 */
export async function enforceRateLimit(
  res: VercelResponse,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const result = await hitRateLimit(key, limit, windowSeconds)
    if (result.allowed) return true
    res.setHeader('Retry-After', String(result.retryAfterSeconds))
    res.status(429).json({ error: 'rate-limited', retryAfterSeconds: result.retryAfterSeconds })
    return false
  } catch (err) {
    console.error('[rateLimit] limiter failed, allowing request:', key, err)
    return true
  }
}
