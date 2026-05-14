import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { CheckoutButton } from '../features/billing/CheckoutButton'
import { usePlanLimits } from '../hooks/usePlanLimits'

export function PricingPage() {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly')
  const { currentTier } = usePlanLimits()

  const plans = [
    {
      tier: 'free' as const,
      name: 'Free',
      monthlyPrice: '£0',
      annualPrice: '£0',
      description: 'Perfect for getting started',
      features: [
        { name: '1 org chart', included: true },
        { name: 'Up to 30 nodes', included: true },
        { name: '3 team members', included: true },
        { name: 'PNG export (watermarked)', included: true },
        { name: 'JD editor', included: false },
        { name: 'PDF export', included: false },
        { name: 'Approval workflows', included: false },
      ],
      cta: 'Current plan',
      ctaDisabled: true,
    },
    {
      tier: 'starter' as const,
      name: 'Starter',
      monthlyPrice: '£18',
      annualPrice: '£180',
      description: 'For growing teams',
      popular: true,
      features: [
        { name: 'Up to 5 org charts', included: true },
        { name: 'Up to 100 nodes', included: true },
        { name: '5 team members', included: true },
        { name: 'PNG export (no watermark)', included: true },
        { name: 'JD editor & AI drafting', included: true },
        { name: 'PDF export', included: true },
        { name: 'Password-protected shares', included: true },
      ],
      cta: 'Upgrade to Starter',
    },
    {
      tier: 'growth' as const,
      name: 'Growth',
      monthlyPrice: '£49',
      annualPrice: '£490',
      description: 'For ambitious scaling',
      features: [
        { name: 'Unlimited org charts', included: true },
        { name: 'Up to 500 nodes', included: true },
        { name: '10 team members', included: true },
        { name: 'All export options', included: true },
        { name: 'Unlimited AI drafting', included: true },
        { name: 'Headcount planning', included: true },
        { name: 'Real-time collaboration', included: true },
      ],
      cta: 'Upgrade to Growth',
    },
  ]

  const getDisplayPrice = (monthly: string, annual: string) => {
    if (billingCycle === 'annual') {
      return annual
    }
    return monthly
  }

  return (
    <div style={{ padding: '32px', animation: 'fadeUp .3s ease-out' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', marginBottom: 12, letterSpacing: '-.5px' }}>
          Simple, transparent pricing
        </h1>
        <p style={{ fontSize: 16, color: 'var(--muted)', marginBottom: 24, maxWidth: 500, margin: '0 auto 24px' }}>
          Choose the plan that fits your team. Always upgrade, downgrade, or cancel.
        </p>

        {/* Billing toggle */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, background: 'var(--raised)', padding: 3, borderRadius: 8 }}>
          <button
            onClick={() => setBillingCycle('monthly')}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              background: billingCycle === 'monthly' ? 'var(--surface)' : 'transparent',
              border: 'none',
              color: 'var(--text)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all .15s',
            }}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingCycle('annual')}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              background: billingCycle === 'annual' ? 'var(--surface)' : 'transparent',
              border: 'none',
              color: 'var(--text)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all .15s',
            }}
          >
            Annual
          </button>
        </div>
        {billingCycle === 'annual' && (
          <div style={{ marginTop: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600, background: 'var(--success-bg)', padding: '4px 12px', borderRadius: 6 }}>
              Save 22%
            </span>
          </div>
        )}
      </div>

      {/* Pricing cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, maxWidth: 1200, margin: '0 auto 40px' }}>
        {plans.map((plan) => {
          const isCurrent = currentTier === plan.tier
          return (
            <div
              key={plan.tier}
              style={{
                position: 'relative',
                background: 'var(--surface)',
                border: isCurrent ? '2px solid var(--brand)' : plan.popular ? '2px solid var(--brand)' : '1px solid var(--border)',
                borderRadius: 16,
                padding: 28,
                display: 'flex',
                flexDirection: 'column',
                boxShadow: plan.popular && !isCurrent ? '0 8px 32px rgba(14,165,233,0.15)' : 'var(--shadow-sm)',
                transition: 'all .2s',
              }}
              onMouseEnter={(e) => {
                if (!isCurrent && !plan.ctaDisabled) {
                  e.currentTarget.style.transform = 'translateY(-4px)'
                  e.currentTarget.style.boxShadow = 'var(--shadow)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = plan.popular && !isCurrent ? '0 8px 32px rgba(14,165,233,0.15)' : 'var(--shadow-sm)'
              }}
            >
              {plan.popular && !isCurrent && (
                <div style={{ position: 'absolute', top: -12, left: 16, background: 'var(--grad-brand)', color: '#fff', padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                  Most popular
                </div>
              )}

              <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                {plan.name}
              </h3>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
                {plan.description}
              </p>

              {/* Price */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--text)' }}>
                    {getDisplayPrice(plan.monthlyPrice, plan.annualPrice)}
                  </span>
                  <span style={{ fontSize: 14, color: 'var(--muted)' }}>
                    {plan.monthlyPrice === '£0' ? '' : billingCycle === 'monthly' ? '/month' : '/year'}
                  </span>
                </div>
              </div>

              {/* Features */}
              <div style={{ flex: 1, marginBottom: 24 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {plan.features.map((feature, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {feature.included ? (
                        <Check size={16} color="var(--success)" style={{ flexShrink: 0 }} />
                      ) : (
                        <X size={16} color="var(--dim)" style={{ flexShrink: 0 }} />
                      )}
                      <span style={{ fontSize: 13, color: feature.included ? 'var(--text)' : 'var(--dim)' }}>
                        {feature.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* CTA */}
              {plan.tier !== 'free' ? (
                <CheckoutButton tier={plan.tier} billingCycle={billingCycle} />
              ) : (
                <button
                  disabled
                  style={{
                    padding: '11px 20px',
                    background: 'var(--raised)',
                    border: 'none',
                    borderRadius: 9,
                    color: 'var(--dim)',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'default',
                    width: '100%',
                  }}
                >
                  {isCurrent ? 'Current plan' : 'Get started free'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Enterprise CTA */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 32, maxWidth: 1200, margin: '0 auto 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 40 }}>
        <div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Need something bigger?</h3>
          <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
            For enterprise customers with custom requirements, dedicated support, and compliance needs.
          </p>
        </div>
        <a
          href="mailto:sales@stratmap.app"
          style={{
            padding: '11px 24px',
            background: 'var(--grad-brand)',
            border: 'none',
            borderRadius: 9,
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          Talk to sales
        </a>
      </div>

      {/* FAQ (simple) */}
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 24, textAlign: 'center' }}>
          Frequently asked questions
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            { q: 'Can I change plans at any time?', a: 'Yes. Upgrade, downgrade, or cancel anytime. Changes take effect immediately.' },
            { q: 'What happens to my charts if I downgrade?', a: 'Your charts are never deleted. If you exceed the node limit on a lower plan, you can view but not edit until you upgrade.' },
            { q: 'Do guests count towards seat limits?', a: 'No. Only team members with active accounts count. Guests viewing shared charts are free.' },
            { q: 'Is there a free trial?', a: 'Our Free plan is effectively a trial. No credit card required to start.' },
            { q: 'What payment methods do you accept?', a: 'We accept all major credit cards, debit cards, and digital wallets via Stripe.' },
          ].map((faq, i) => (
            <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
                {faq.q}
              </h4>
              <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
                {faq.a}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
