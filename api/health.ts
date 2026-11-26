/// <reference types="node" />
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sql } from 'drizzle-orm'
import { db } from './_lib/db'

// GET /api/health: for uptime monitors and the status page (roadmap 3.9).
//   200 { status: 'ok' }        the API is up and the database answered
//   503 { status: 'degraded' }  the database did not answer in time, or errored
// Public on purpose and read-only: it says only whether things work, never why (no error text, versions or
// hostnames), and does one trivial query. Point the monitor at it every few minutes, not every few seconds,
// because each check also wakes Neon's compute if it had gone to sleep.
export const DB_TIMEOUT_MS = 3000
/** A check is reused for this long by the same function instance (R-75): a burst of hits wakes the database once, not each time. */
export const HEALTH_CACHE_MS = 10_000
let last: { at: number; ok: boolean; responseMs: number } | null = null
/** Tests only: forget the cached result. */
export function resetHealthCache() { last = null }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).json({ error: 'Method not allowed' })

  res.setHeader('Cache-Control', 'no-store')
  if (last && Date.now() - last.at < HEALTH_CACHE_MS) {
    return last.ok
      ? res.status(200).json({ status: 'ok', checks: { database: 'ok' }, responseMs: last.responseMs })
      : res.status(503).json({ status: 'degraded', checks: { database: 'down' }, responseMs: last.responseMs })
  }
  const started = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('database check timed out')), DB_TIMEOUT_MS) }),
    ])
    last = { at: Date.now(), ok: true, responseMs: Date.now() - started }
    return res.status(200).json({ status: 'ok', checks: { database: 'ok' }, responseMs: last.responseMs })
  } catch (err) {
    // The detail goes to the logs (and from there to whoever is on call), never to the caller.
    console.error('[health] database check failed:', (err as Error)?.message)
    last = { at: Date.now(), ok: false, responseMs: Date.now() - started }
    return res.status(503).json({ status: 'degraded', checks: { database: 'down' }, responseMs: last.responseMs })
  } finally {
    clearTimeout(timer)
  }
}
