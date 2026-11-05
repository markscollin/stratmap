import { useNavigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { useChartLimit } from '../../hooks/useChartLimit'
import { usePermission } from '../../hooks/usePermission'
import { useBillingStore } from '../../store/billingStore'

/**
 * Shown everywhere while the workspace has more charts than its plan allows
 * (roadmap 1.6). Every chart is view-only until enough are deleted or the
 * workspace upgrades. Nothing is deleted for it.
 */
export function ChartLimitBanner() {
  const { frozen, count, max } = useChartLimit()
  const tier = useBillingStore(s => s.plan.tier)
  const { canAdmin } = usePermission()
  const navigate = useNavigate()
  if (!frozen) return null

  const extra = count - max
  const planName = tier.charAt(0).toUpperCase() + tier.slice(1)
  const fix = canAdmin
    ? `Delete ${extra} chart${extra === 1 ? '' : 's'} or upgrade to edit again.`
    : 'Ask a workspace admin to delete charts or upgrade.'

  return (
    <div
      role="alert"
      data-export-ignore
      style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '10px 20px', background: 'var(--warn-bg)',
        borderBottom: '1px solid var(--warn)', color: 'var(--text)', fontSize: 13,
      }}
    >
      <Lock size={15} color="var(--warn)" style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 200 }}>
        Your {planName} plan allows {max} chart{max === 1 ? '' : 's'} and this workspace has {count}, so all charts are view-only. {fix}
      </span>
      {canAdmin && (
        <button onClick={() => navigate('/charts')} style={btn('secondary')}>Manage charts</button>
      )}
      <button onClick={() => navigate('/pricing')} style={btn('primary')}>Upgrade</button>
    </div>
  )
}

function btn(variant: 'primary' | 'secondary'): React.CSSProperties {
  const primary = variant === 'primary'
  return {
    padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
    background: primary ? 'var(--grad-brand)' : 'var(--surface)',
    border: primary ? 'none' : '1px solid var(--border)',
    color: primary ? '#fff' : 'var(--text)',
  }
}
