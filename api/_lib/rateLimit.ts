import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from 'drizzle-orm'
import { db } from './db'
import { reportError } from './sentry'
import { rateLimits } from '../../src/lib/db/schema'

// Postgres-backed fixed-window rate limiter. No extra vendor: one upserted row
// per bucket key. Good enough for abuse protection at launch scale; swap for
// Upstash/Vercel KV if this table ever becomes hot.

/** Share of limiter failures sent to Sentry. */
export const LIMITER_FAILURE_REPORT_RATE = 0.1

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
    .values({ key, windowId, count: 1, windowSeconds })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        // Same window → increment; new window → reset to 1.
        count: sql`CASE WHEN ${rateLimits.windowId} = ${windowId} THEN ${rateLimits.count} + 1 ELSE 1 END`,
        windowId,
        windowSeconds,
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
    // Fails open on purpose, but a broken limiter must not go unnoticed (R-27). Sampled so an outage is one alert, not thousands.
    if (Math.random() < LIMITER_FAILURE_REPORT_RATE) reportError(err, { route: 'rateLimit', note: 'rate limiter failed open' })
    return true
  }
}

/**
 * Deletes limiter rows whose window ended more than an hour ago (R-27). A row is only ever read in its own window, so
 * nothing that is deleted could still count. Rows written before `window_seconds` existed use the fact that 60 s window
 * ids are above 10 million and 3600 s ones are far below it. Returns how many were removed.
 */
export async function pruneRateLimits(nowMs = Date.now()): Promise<number> {
  const nowSec = Math.floor(nowMs / 1000)
  const result = await db.execute(sql`
    delete from rate_limits
    where (window_id + 1) * coalesce(window_seconds, case when window_id > 10000000 then 60 else 3600 end) < ${nowSec - 3600}
    returning 1
  `)
  return (result as unknown as { rows: unknown[] }).rows.length
}
