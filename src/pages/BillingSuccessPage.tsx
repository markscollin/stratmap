import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Check, Clock } from 'lucide-react'
import { api } from '../lib/apiClient'
import { useBillingStore, FREE_PLAN, PLAN_BY_TIER } from '../store/billingStore'
import type { PlanTier } from '../types'
import { SUPPORT_EMAIL } from '../lib/contact'

// checking: waiting for the Stripe webhook to reach us; confirmed: the workspace is on the purchased plan;
// pending: we ran out of patience. The payment went through (Stripe sent us here) but the plan has not changed yet.
type Outcome = 'checking' | 'confirmed' | 'pending'

export function BillingSuccessPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { setPlan } = useBillingStore()
  const plan = searchParams.get('plan')
  const [outcome, setOutcome] = useState<Outcome>('checking')
  const [attemptKey, setAttemptKey] = useState(0)

  const planNames: Record<string, string> = {
    starter: 'Starter',
    growth: 'Growth',
  }
  const displayPlan = planNames[plan || ''] || 'upgraded plan'

  // Sync the billing store from the DB. The Stripe webhook updates planTier
  // asynchronously and often lands *after* this redirect, so poll with backoff
  // until the workspace reflects the purchased tier. If it never does, say so honestly
  // (R-06): the page must not announce a finished upgrade that has not happened.
  useEffect(() => {
    let cancelled = false
    const target = plan as PlanTier | null

    async function sync() {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const ws = await api.get<{ planTier: PlanTier }>('/api/workspace')
          if (cancelled) return
          setPlan(PLAN_BY_TIER[ws.planTier] ?? FREE_PLAN)
          if (!target || ws.planTier === target) { setOutcome('confirmed'); return }
        } catch {
          if (cancelled) return
        }
        if (attempt < 4) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
      }
      if (!cancelled) setOutcome('pending')
    }

    void sync()
    return () => { cancelled = true }
  }, [plan, setPlan, attemptKey])

  return (
    <div style={{ padding: '32px', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', maxWidth: 500 }}>
        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'center' }}>
          <div style={{ background: outcome === 'confirmed' ? 'var(--success)' : 'var(--brand)', borderRadius: '50%', padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {outcome === 'confirmed' ? <Check size={32} color="#fff" /> : <Clock size={32} color="#fff" />}
          </div>
        </div>

        {outcome === 'confirmed' && (
          <>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', marginBottom: 12 }}>Welcome to {displayPlan}!</h1>
            <p style={{ fontSize: 16, color: 'var(--muted)', marginBottom: 32, lineHeight: 1.6 }}>
              Your upgrade is complete. You now have access to all the premium features. Start building powerful org charts right away.
            </p>
          </>
        )}
        {outcome === 'checking' && (
          <>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', marginBottom: 12 }}>Finishing your upgrade…</h1>
            <p role="status" style={{ fontSize: 16, color: 'var(--muted)', marginBottom: 32, lineHeight: 1.6 }}>
              Your payment went through. We are waiting for the confirmation to reach us, which usually takes a few seconds.
            </p>
          </>
        )}
        {outcome === 'pending' && (
          <>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', marginBottom: 12 }}>Payment received</h1>
            <p role="status" style={{ fontSize: 16, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.6 }}>
              Your payment went through, but your plan has not updated yet. This normally sorts itself out within a few minutes.
              Check again in a moment{SUPPORT_EMAIL ? ', and if it still shows your old plan, email us and we will fix it straight away' : ''}.
            </p>
            {SUPPORT_EMAIL && (
              <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 16 }}>
                <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: 'var(--brand)' }}>{SUPPORT_EMAIL}</a>
              </p>
            )}
            <button
              onClick={() => { setOutcome('checking'); setAttemptKey(k => k + 1) }}
              style={{ padding: '9px 18px', marginBottom: 20, background: 'transparent', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Check again
            </button>
          </>
        )}

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
