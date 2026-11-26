/// <reference types="node" />
import type { VercelRequest } from '@vercel/node'
import { timingSafeEqual } from 'node:crypto'

/** True when the request carries `Authorization: Bearer $CRON_SECRET` (what Vercel Cron sends). False when CRON_SECRET is unset. */
export function cronAuthorised(req: VercelRequest): boolean {
  const expected = process.env.CRON_SECRET
  const header = req.headers.authorization
  if (!expected || typeof header !== 'string') return false
  const a = Buffer.from(header)
  const b = Buffer.from(`Bearer ${expected}`)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Tells an uptime service that a cron run finished (R-71): Vercel Cron does not retry and nothing else would notice a job that
 * silently stopped running. Set `CRON_HEARTBEAT_URL_<NAME>` (e.g. a Better Stack or healthchecks.io heartbeat URL): a good run
 * requests it, a failed run requests it with `/fail` added (both services understand that). No URL: nothing is sent.
 * Never throws and gives up after 3 s: a monitoring hiccup must not fail the job.
 */
export async function pingHeartbeat(name: 'DAILY' | 'PURGE', ok: boolean): Promise<void> {
  const base = process.env[`CRON_HEARTBEAT_URL_${name}`]?.trim()
  if (!base || !/^https:\/\//.test(base)) return
  const url = ok ? base : `${base.replace(/\/$/, '')}/fail`
  try {
    await fetch(url, { method: 'GET', signal: AbortSignal.timeout(3_000) })
  } catch (err) {
    console.error(`[cron] heartbeat ${name} failed:`, err instanceof Error ? err.message : err)
  }
}

/** The time a cron run may spend on its slow steps before it stops cleanly (R-71); `vercel.json` gives the function 60 s. */
export const CRON_BUDGET_MS = 45_000
