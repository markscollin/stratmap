import { useState } from 'react'
import { api } from '../../lib/apiClient'

interface CheckoutButtonProps {
  tier: 'starter' | 'growth'
  billingCycle: 'monthly' | 'annual'
  variant?: 'primary' | 'secondary'
}

export function CheckoutButton({ tier, billingCycle, variant = 'primary' }: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    setLoading(true)
    try {
      const { url } = await api.post<{ url: string }>('/api/checkout', { tier, billingCycle })
      window.location.href = url
    } catch (err) {
      console.error('Checkout failed:', err)
      setLoading(false)
    }
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
