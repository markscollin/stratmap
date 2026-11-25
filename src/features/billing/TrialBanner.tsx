import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Sparkles, X } from 'lucide-react'
import { useBillingStore } from '../../store/billingStore'
import { usePermission } from '../../hooks/usePermission'
import { PLAN_LIMITS } from '../../lib/plans'
import { trialDaysLeft } from '../../lib/trial'

const NAME: Record<string, string> = { starter: 'Starter', growth: 'Growth', enterprise: 'Enterprise' }

// Hidden for the rest of the day once dismissed (R-66): it is useful, not urgent, and it sat on every page including the canvas.
const DISMISS_KEY = 'stratmap_trial_banner_dismissed'
const today = () => new Date().toISOString().slice(0, 10)
function dismissedToday(): boolean {
  try { return localStorage.getItem(DISMISS_KEY) === today() } catch { return false }
}
/** A chart's canvas: the banner shrinks to one short line there, so the chart keeps its room (R-66). */
const isCanvas = (path: string) => /^\/charts\/[^/]+\/?$/.test(path)

/**
 * Shown while the workspace is on a trial of a paid plan (the new-workspace trial, launch review R-18, or one an admin granted).
 * Says how long is left and, plainly, what changes afterwards, so the end of the trial is never a surprise. Hidden once the
 * workspace has a paid subscription of its own, and for the rest of the day once dismissed.
 */
export function TrialBanner() {
  const trial = useBillingStore(s => s.trial)
  const status = useBillingStore(s => s.subscription.status)
  const { canAdmin } = usePermission()
  const { pathname } = useLocation()
  const [dismissed, setDismissed] = useState(dismissedToday)
  if (dismissed || !trial || status === 'active' || status === 'trialing' || status === 'past_due') return null
  const days = trialDaysLeft(trial.endsAt)
  if (days <= 0) return null

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, today()) } catch { /* storage unavailable: hidden for this visit only */ }
    setDismissed(true)
  }
  const free = PLAN_LIMITS.free
  const plan = NAME[trial.plan] ?? 'paid'
  const when = days === 1 ? 'ends tomorrow' : `has ${days} days left`
  const compact = isCanvas(pathname)
  return (
    <div
      data-testid="trial-banner"
      data-compact={compact || undefined}
      data-export-ignore
      style={{
        display: 'flex', alignItems: 'center', gap: compact ? 8 : 12, flexWrap: 'wrap',
        padding: compact ? '4px 16px' : '9px 20px', background: 'var(--brand-bg)', borderBottom: '1px solid var(--brand)', color: 'var(--text)', fontSize: compact ? 12 : 13,
      }}
    >
      <Sparkles size={compact ? 13 : 15} color="var(--brand)" style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 200 }}>
        {compact ? (
          <>Your free {plan} trial {when}.</>
        ) : (
          <>
            Your free {plan} trial {when}. After that this workspace moves to the Free plan
            ({free.maxCharts} chart, {free.maxNodesPerChart} roles per chart, {free.seats} members). Nothing is deleted, but charts over the
            limit become view-only until you upgrade.
          </>
        )}
      </span>
      {canAdmin && <Link to="/pricing" style={{ fontWeight: 600, color: 'var(--brand)', textDecoration: 'none', whiteSpace: 'nowrap' }}>See plans →</Link>}
      <button
        aria-label="Hide the trial notice until tomorrow"
        title="Hide until tomorrow"
        onClick={dismiss}
        style={{ display: 'flex', alignItems: 'center', background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 2 }}
      >
        <X size={14} />
      </button>
    </div>
  )
}
