interface CheckoutButtonProps {
  tier: 'starter' | 'growth'
  billingCycle: 'monthly' | 'annual'
  variant?: 'primary' | 'secondary'
}

export function CheckoutButton({ tier, billingCycle, variant = 'primary' }: CheckoutButtonProps) {
  const getStripeUrl = () => {
    const urls: Record<string, Record<string, string>> = {
      starter: {
        monthly: import.meta.env.VITE_STRIPE_STARTER_MONTHLY_URL || '#',
        annual: import.meta.env.VITE_STRIPE_STARTER_ANNUAL_URL || '#',
      },
      growth: {
        monthly: import.meta.env.VITE_STRIPE_GROWTH_MONTHLY_URL || '#',
        annual: import.meta.env.VITE_STRIPE_GROWTH_ANNUAL_URL || '#',
      },
    }
    return urls[tier][billingCycle]
  }

  const handleClick = () => {
    const url = getStripeUrl()
    if (url && url !== '#') {
      window.location.href = url
    } else {
      window.location.href = `/billing/success?plan=${tier}`
    }
  }

  return (
    <button
      onClick={handleClick}
      style={{
        padding: '11px 20px',
        background: variant === 'primary' ? 'var(--grad-brand)' : 'var(--surface)',
        border: variant === 'primary' ? 'none' : '1px solid var(--border)',
        borderRadius: 9,
        color: variant === 'primary' ? '#fff' : 'var(--text)',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all .2s',
        width: '100%',
      }}
      onMouseEnter={(e) => {
        if (variant === 'primary') {
          e.currentTarget.style.opacity = '0.9'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = '1'
      }}
    >
      {variant === 'primary' ? 'Get started' : 'Learn more'}
    </button>
  )
}
