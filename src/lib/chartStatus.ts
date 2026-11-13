import type { ChartStatus } from '../types'

// Who may move a chart between statuses (launch review R-08). One rule, used by the API and checked against the
// UI's action table (`STATUS_ACTIONS`, src/constants/statusMeta.tsx) by a test, so the two cannot drift apart.
//
//   - Entering approved, rejected or live is the approver's decision: admin and owner only.
//   - Leaving approved or live (publish, start a revision, retire) is also admin-only; an editor cannot pull a chart back out.
//   - Everything else (draft, editing, review, archived, and leaving rejected) is open to editors.
// Paying for the approval workflow is a separate check (`approval-workflow`, plans.ts).
const ADMIN_ONLY_TARGETS: readonly ChartStatus[] = ['approved', 'rejected', 'live']
const ADMIN_ONLY_SOURCES: readonly ChartStatus[] = ['approved', 'live']

/** True when changing a chart from `from` (null for a new chart) to `to` needs the admin role. A no-op change needs nothing. */
export function statusChangeNeedsAdmin(from: ChartStatus | null, to: ChartStatus): boolean {
  if (from === to) return false
  return ADMIN_ONLY_TARGETS.includes(to) || (from !== null && ADMIN_ONLY_SOURCES.includes(from))
}
