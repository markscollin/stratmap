import { useState } from 'react'
import { api, ApiError } from '../../lib/apiClient'
import { useToastStore } from '../../store/toastStore'
import { usePermission } from '../../hooks/usePermission'

interface CheckoutButtonProps {
  tier: 'starter' | 'growth'
  billingCycle: 'monthly' | 'annual'
  variant?: 'primary' | 'secondary'
}

export function CheckoutButton({ tier, billingCycle, variant = 'primary' }: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false)
  const addToast = useToastStore(st => st.addToast)
  const { canAdmin } = usePermission()

  const handleClick = async () => {
    setLoading(true)
    try {
      const { url } = await api.post<{ url: string }>('/api/checkout', { tier, billingCycle })
      window.location.href = url
    } catch (err) {
      console.error('Checkout failed:', err)
      // Say why (R-20). The server's own message wins; a 403 means the person is not an admin.
      const message = err instanceof ApiError
        ? (err.status === 403 ? 'Only a workspace admin can change the plan. Ask an admin to upgrade.' : err.userMessage)
        : 'Could not start checkout. Check your connection and try again.'
      addToast(message, 'error')
      setLoading(false)
    }
  }

  // Billing is an admin action on the server, so do not offer a button that can only fail.
  if (!canAdmin) {
    return (
      <button
        disabled
        title="Only workspace admins can change the plan"
        style={{
          padding: '11px 20px', background: 'var(--raised)', border: 'none', borderRadius: 9,
          color: 'var(--dim)', fontSize: 14, fontWeight: 600, cursor: 'not-allowed', width: '100%',
        }}
      >
        Ask an admin to upgrade
      </button>
    )
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        padding: '11px 20px',
        background: variant === 'primary' ? 'var(--grad-brand)' : 'var(--surface)',
        border: variant === 'primary' ? 'none' : '1px solid var(--border)',
        borderRadius: 9,
        color: variant === 'primary' ? '#fff' : 'var(--text)',
        fontSize: 14,
        fontWeight: 600,
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.7 : 1,
        transition: 'all .2s',
        width: '100%',
      }}
      onMouseEnter={(e) => {
        if (!loading && variant === 'primary') e.currentTarget.style.opacity = '0.9'
      }}
      onMouseLeave={(e) => {
        if (!loading) e.currentTarget.style.opacity = '1'
      }}
    >
      {loading ? 'Redirecting…' : variant === 'primary' ? 'Get started' : 'Learn more'}
    </button>
  )
}
