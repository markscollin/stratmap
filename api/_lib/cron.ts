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
