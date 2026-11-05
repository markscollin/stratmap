import { AlertTriangle } from 'lucide-react'
import { useBillingStore } from '../../store/billingStore'
import { usePermission } from '../../hooks/usePermission'
import { ManageBillingButton } from './ManageBillingButton'

/**
 * App-wide banner when a renewal payment has failed (roadmap 1.3). past_due is the
 * grace period: the plan stays while Stripe retries. unpaid means Stripe gave up
 * and the workspace is on Free until the invoice is paid.
 */
export function PaymentBanner() {
  const status = useBillingStore(s => s.subscription.status)
  const { canAdmin } = usePermission()
  if (status !== 'past_due' && status !== 'unpaid') return null

  const message = status === 'past_due'
    ? "We couldn't take your last payment. Your plan stays active while we retry the card."
    : 'Your last payment failed, so this workspace is on the Free plan. Nothing has been deleted.'
  const action = canAdmin
    ? (status === 'past_due' ? 'Update your payment method to keep it.' : 'Pay the open invoice to restore your plan.')
    : 'Ask a workspace admin to update billing.'

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
      <AlertTriangle size={16} color="var(--warn)" style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 200 }}>{message} {action}</span>
      {canAdmin && <ManageBillingButton label="Update payment" />}
    </div>
  )
}
