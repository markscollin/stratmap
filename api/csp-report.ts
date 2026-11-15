import type { VercelRequest, VercelResponse } from '@vercel/node'
import { enforceRateLimit, clientIp } from './_lib/rateLimit'
import { parseCspReports } from './_lib/cspReport'

// POST /api/csp-report: where browsers send Content-Security-Policy violation reports (R-23). Public, because browsers send
// it with no credentials. It stores nothing: each report becomes one trimmed log line (`[csp] …`, searchable in the Vercel logs),
// with page URLs cut down to origin + first path segment (see api/_lib/cspReport.ts). Rate limited per IP; always answers 204
// so a browser never retries. Read the logs for a week with the policy in report-only mode, fix what is blocked that should not be,
// then enforce (docs/CSP.md).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    if (!(await enforceRateLimit(res, `csp:${clientIp(req)}`, 30, 60))) return
    for (const v of parseCspReports(req.body)) {
      console.warn(`[csp] ${v.disposition} ${v.directive} blocked=${v.blocked || '-'} page=${v.page || '-'} source=${v.source || '-'}${v.line ? `:${v.line}` : ''}`)
    }
  } catch (err) {
    console.error('/api/csp-report', err)
  }
  return res.status(204).end()
}
