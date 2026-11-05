import { useState } from 'react'
import { CreditCard } from 'lucide-react'
import { api, ApiError } from '../../lib/apiClient'
import { useToastStore } from '../../store/toastStore'

interface ManageBillingButtonProps {
  label?: string
  variant?: 'primary' | 'secondary'
}

/** Opens the Stripe Customer Portal (card, plan changes, cancel, invoices). Admin-only on the server. */
export function ManageBillingButton({ label = 'Manage billing', variant = 'secondary' }: ManageBillingButtonProps) {
  const [loading, setLoading] = useState(false)
  const addToast = useToastStore(s => s.addToast)

  const open = async () => {
    setLoading(true)
    try {
      const { url } = await api.post<{ url: string }>('/api/billing/portal', {})
      window.location.assign(url)
    } catch (err) {
      addToast(err instanceof ApiError ? err.userMessage : 'Could not open billing. Please try again.', 'error')
      setLoading(false)
    }
  }

  const primary = variant === 'primary'
  return (
    <button
      onClick={open}
      disabled={loading}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '9px 16px', borderRadius: 9, fontSize: 13, fontWeight: 600,
        background: primary ? 'var(--grad-brand)' : 'var(--surface)',
        border: primary ? 'none' : '1px solid var(--border)',
        color: primary ? '#fff' : 'var(--text)',
        cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      <CreditCard size={14} />
      {loading ? 'Opening…' : label}
    </button>
  )
}
