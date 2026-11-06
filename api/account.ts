import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireUser } from './_lib/auth'
import { parseBody } from './_lib/validate'
import { AccountDelete } from './_lib/schemas'
import { enforceRateLimit } from './_lib/rateLimit'
import { reportError } from './_lib/sentry'
import { deleteAccount } from './_lib/workspaceLifecycle'

// DELETE /api/account { confirm: 'DELETE' } — a person deletes their own account (roadmap 4.2).
// Owner-decided: a workspace they own is deleted with them (30-day soft delete, members emailed); their
// memberships elsewhere are removed. See deleteAccount() for the order and what is scrubbed.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' })
  const user = await requireUser(req, res)
  if (!user) return
  try {
    if (!(await enforceRateLimit(res, `account-delete:${user.userId}`, 5, 60 * 60))) return
    const body = parseBody(AccountDelete, req, res)
    if (!body) return
    const result = await deleteAccount(user.userId)
    return res.json({ deleted: true, ...result })
  } catch (err) {
    console.error('/api/account DELETE', err)
    reportError(err, { route: '/api/account DELETE' })
    // Every step before the sign-in account is safe to repeat, so a retry finishes the job.
    return res.status(502).json({ error: 'account-delete-failed', message: 'We could not finish deleting your account. Nothing more was lost: please try again.' })
  }
}
