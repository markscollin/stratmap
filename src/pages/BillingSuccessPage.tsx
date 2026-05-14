import { useSearchParams, useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'

export function BillingSuccessPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const plan = searchParams.get('plan')

  const planNames: Record<string, string> = {
    starter: 'Starter',
    growth: 'Growth',
  }

  const displayPlan = planNames[plan || ''] || 'upgraded plan'

  return (
    <div style={{ padding: '32px', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', maxWidth: 500 }}>
        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'center' }}>
          <div style={{ background: 'var(--success)', borderRadius: '50%', padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Check size={32} color="#fff" />
          </div>
        </div>

        <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', marginBottom: 12 }}>
          Welcome to {displayPlan}!
        </h1>

        <p style={{ fontSize: 16, color: 'var(--muted)', marginBottom: 32, lineHeight: 1.6 }}>
          Your upgrade is complete. You now have access to all the premium features. Start building powerful org charts right away.
        </p>

        <button
          onClick={() => navigate('/charts')}
          style={{
            padding: '11px 24px',
            background: 'var(--grad-brand)',
            border: 'none',
            borderRadius: 9,
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Go to charts
        </button>
      </div>
    </div>
  )
}
