import { useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
import { api } from '../lib/apiClient'
import { useBillingStore, FREE_PLAN, PLAN_BY_TIER } from '../store/billingStore'
import type { PlanTier } from '../types'

export function BillingSuccessPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { setPlan } = useBillingStore()
  const plan = searchParams.get('plan')

  const planNames: Record<string, string> = {
    starter: 'Starter',
    growth: 'Growth',
  }
  const displayPlan = planNames[plan || ''] || 'upgraded plan'

  // Sync the billing store from the DB. The Stripe webhook updates planTier
  // asynchronously and often lands *after* this redirect, so poll with backoff
  // until the workspace reflects the purchased tier (or we run out of attempts).
  useEffect(() => {
    let cancelled = false
    const target = plan as PlanTier | null

    async function sync() {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const ws = await api.get<{ planTier: PlanTier }>('/api/workspace')
          if (cancelled) return
          const matched = !target || ws.planTier === target
          if (matched || attempt === 4) {
            setPlan(PLAN_BY_TIER[ws.planTier] ?? FREE_PLAN)
            return
          }
        } catch {
          if (cancelled) return
        }
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
      }
    }

    sync()
    return () => { cancelled = true }
  }, [plan, setPlan])

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
