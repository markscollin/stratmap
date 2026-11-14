import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { useBillingStore } from '../../store/billingStore'
import { usePermission } from '../../hooks/usePermission'
import { PLAN_LIMITS } from '../../lib/plans'
import { trialDaysLeft } from '../../lib/trial'

const NAME: Record<string, string> = { starter: 'Starter', growth: 'Growth', enterprise: 'Enterprise' }

/**
 * Shown while the workspace is on a trial of a paid plan (the new-workspace trial, launch review R-18, or one an admin granted).
 * Says how long is left and, plainly, what changes afterwards, so the end of the trial is never a surprise. Hidden once the
 * workspace has a paid subscription of its own.
 */
export function TrialBanner() {
  const trial = useBillingStore(s => s.trial)
  const status = useBillingStore(s => s.subscription.status)
  const { canAdmin } = usePermission()
  if (!trial || status === 'active' || status === 'trialing' || status === 'past_due') return null
  const days = trialDaysLeft(trial.endsAt)
  if (days <= 0) return null

  const free = PLAN_LIMITS.free
  const when = days === 1 ? 'ends tomorrow' : `has ${days} days left`
  return (
    <div
      data-testid="trial-banner"
      data-export-ignore
      style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '9px 20px', background: 'var(--brand-bg)', borderBottom: '1px solid var(--brand)', color: 'var(--text)', fontSize: 13,
      }}
    >
      <Sparkles size={15} color="var(--brand)" style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 200 }}>
        Your free {NAME[trial.plan] ?? 'paid'} trial {when}. After that this workspace moves to the Free plan
        ({free.maxCharts} chart, {free.maxNodesPerChart} roles per chart, {free.seats} members). Nothing is deleted, but charts over the
        limit become view-only until you upgrade.
      </span>
      {canAdmin && <Link to="/pricing" style={{ fontWeight: 600, color: 'var(--brand)', textDecoration: 'none', whiteSpace: 'nowrap' }}>See plans →</Link>}
    </div>
  )
}
