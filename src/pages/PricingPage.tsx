import { useState, useEffect } from 'react'
import { priceTaxNote } from '../lib/taxDetails'
import { Link } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { CheckoutButton } from '../features/billing/CheckoutButton'
import { usePlanLimits } from '../hooks/usePlanLimits'
import { LegalFooter } from './LegalPages'
import { Layout } from '../components/layout/Layout'
import { PublicNav } from '../components/layout/PublicNav'
import { useUserStore } from '../store/userStore'
import { PLAN_LIMITS, PLAN_PRICES, NEW_WORKSPACE_TRIAL_PLAN, DEFAULT_NEW_WORKSPACE_TRIAL_DAYS } from '../lib/plans'
import { SALES_EMAIL } from '../lib/contact'
import type { PlanLimits } from '../lib/plans'

/**
 * /pricing is public (roadmap 2.5): visitors see the plans in the marketing layout and are sent to sign-up;
 * signed-in people keep the in-app version with their current plan and checkout.
 */
export function PricingRoute() {
  const signedIn = useUserStore(s => s.isAuthenticated)
  if (signedIn) return <Layout><PricingPage /></Layout>
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <PublicNav />
      <PricingPage />
    </div>
  )
}

export function PricingPage() {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly')
  const { currentTier } = usePlanLimits()
  const signedIn = useUserStore(s => s.isAuthenticated)

  useEffect(() => { document.title = 'Pricing — StratMap' }, [])

  // Every number comes from plans.ts (R-63), so the cards cannot drift from what the server enforces.
  const charts = (l: PlanLimits) => (l.maxCharts < 0 ? 'Unlimited org charts' : l.maxCharts === 1 ? '1 org chart' : `Up to ${l.maxCharts} org charts`)
  const roles = (l: PlanLimits) => (l.maxNodesPerChart < 0 ? 'Unlimited roles per chart' : `Up to ${l.maxNodesPerChart} roles per chart`)
  const seats = (l: PlanLimits) => (l.seats < 0 ? 'Unlimited team members' : `Up to ${l.seats} team members`)
  const pounds = (n: number) => `£${n}`
  const { free, starter, growth, scale } = PLAN_LIMITS
  const plans: { tier: 'free' | 'starter' | 'growth' | 'scale'; name: string; monthlyPrice: string; annualPrice: string; description: string; includes?: string; features: { name: string; included: boolean }[] }[] = [
    {
      tier: 'free',
      name: 'Free',
      monthlyPrice: '£0',
      annualPrice: '£0',
      description: 'Perfect for getting started',
      features: [
        { name: `${DEFAULT_NEW_WORKSPACE_TRIAL_DAYS}-day Growth trial for every new workspace`, included: true },
        { name: charts(free), included: true },
        { name: roles(free), included: true },
        { name: seats(free), included: true },
        { name: 'Import, PNG and CSV export, comments and share links', included: true },
        { name: 'Job descriptions', included: false },
        { name: 'Approval workflows', included: false },
        { name: 'PDF export', included: false },
        { name: 'AI drafting & auto-layout', included: false },
        { name: 'Headcount planning', included: false },
      ],
    },
    {
      tier: 'starter',
      name: 'Starter',
      monthlyPrice: pounds(PLAN_PRICES.starter.monthly),
      annualPrice: pounds(PLAN_PRICES.starter.annual),
      description: 'For growing teams',
      includes: 'Everything in Free, plus',
      features: [
        { name: charts(starter), included: true },
        { name: roles(starter), included: true },
        { name: seats(starter), included: true },
        { name: 'Job descriptions', included: true },
        { name: 'Approval workflows', included: true },
        { name: 'PDF export', included: true },
        { name: `AI JD drafting (${starter.aiDraftsPerMonth} per month)`, included: true },
        { name: 'Auto-layout', included: true },
        { name: 'Headcount planning', included: false },
      ],
    },
    {
      tier: 'growth',
      name: 'Growth',
      monthlyPrice: pounds(PLAN_PRICES.growth.monthly),
      annualPrice: pounds(PLAN_PRICES.growth.annual),
      description: 'For ambitious scaling',
      includes: 'Everything in Starter, plus',
      features: [
        { name: charts(growth), included: true },
        { name: roles(growth), included: true },
        { name: seats(growth), included: true },
        { name: `${growth.aiDraftsPerMonth} AI JD drafts per month`, included: true },
        { name: 'Headcount planning and budgets', included: true },
        { name: 'Version history & scenarios', included: true },
        { name: 'BambooHR sync', included: true },
      ],
    },
    {
      // R-79: the self-serve step above Growth (D-10), for organisations of roughly 50 to 500 people.
      tier: 'scale',
      name: 'Scale',
      monthlyPrice: pounds(PLAN_PRICES.scale.monthly),
      annualPrice: pounds(PLAN_PRICES.scale.annual),
      description: 'For organisations of about 50 to 500 people',
      includes: 'Everything in Growth, plus',
      features: [
        { name: charts(scale), included: true },
        { name: roles(scale), included: true },
        { name: seats(scale), included: true },
        { name: `${scale.aiDraftsPerMonth} AI JD drafts per month`, included: true },
      ],
    },
  ]
  // "2 months free" is what the annual price actually saves, worked out from the prices.
  const monthsFree = Math.round((PLAN_PRICES.starter.monthly * 12 - PLAN_PRICES.starter.annual) / PLAN_PRICES.starter.monthly)

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
              {monthsFree} months free
            </span>
          </div>
        )}
      </div>

      {/* Pricing cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, maxWidth: 1200, margin: '0 auto 40px' }}>
        {plans.map((plan) => {
          const isCurrent = signedIn && currentTier === plan.tier
          return (
            <div
              key={plan.tier}
              style={{
                position: 'relative',
                background: 'var(--surface)',
                border: isCurrent ? '2px solid var(--brand)' : '1px solid var(--border)',
                borderRadius: 16,
                padding: 28,
                display: 'flex',
                flexDirection: 'column',
                boxShadow: 'var(--shadow-sm)',
                transition: 'all .2s',
              }}
              onMouseEnter={(e) => {
                if (!isCurrent && plan.tier !== 'free') {
                  e.currentTarget.style.transform = 'translateY(-4px)'
                  e.currentTarget.style.boxShadow = 'var(--shadow)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
              }}
            >

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
                {plan.includes && <p data-testid={`plan-includes-${plan.tier}`} style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', margin: '0 0 10px' }}>{plan.includes}</p>}
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
              {!signedIn ? (
                // Visitors need an account (and a workspace) before they can pay: sign up first, upgrade after.
                <Link
                  to="/sign-up"
                  data-testid={`pricing-cta-${plan.tier}`}
                  style={{
                    display: 'block', textAlign: 'center', textDecoration: 'none', padding: '11px 20px', borderRadius: 9,
                    fontSize: 14, fontWeight: 600, width: '100%', boxSizing: 'border-box',
                    background: plan.tier === 'free' ? 'var(--surface)' : 'var(--grad-brand)',
                    border: plan.tier === 'free' ? '1px solid var(--border)' : 'none',
                    color: plan.tier === 'free' ? 'var(--text)' : '#fff',
                  }}
                >
                  {plan.tier === 'free' ? 'Start free' : `Start free, upgrade to ${plan.name}`}
                </Link>
              ) : isCurrent ? (
                // The plan they are on: say so, never offer to buy it again (R-63).
                <button disabled style={{ padding: '11px 20px', background: 'var(--raised)', border: 'none', borderRadius: 9, color: 'var(--dim)', fontSize: 14, fontWeight: 600, cursor: 'default', width: '100%' }}>
                  Current plan
                </button>
              ) : plan.tier !== 'free' ? (
                <CheckoutButton tier={plan.tier} billingCycle={billingCycle} />
              ) : (
                // On a paid plan, Free is reached by cancelling, which Stripe's billing portal handles (R-63).
                <p data-testid="free-downgrade-hint" style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', margin: 0, lineHeight: 1.6 }}>
                  To move to Free, cancel in <Link to="/settings?tab=billing" style={{ color: 'var(--brand)' }}>Settings → Billing</Link>. You keep your plan until the end of the period.
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* VAT wording follows the owner's decision (D-6, src/lib/taxDetails.ts); nothing is said until it is made */}
      {priceTaxNote() && (
        <p data-testid="price-tax-note" style={{ maxWidth: 1200, margin: '-16px auto 32px', textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
          {priceTaxNote()}
        </p>
      )}

      {/* Enterprise CTA */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 32, maxWidth: 1200, margin: '0 auto 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 40 }}>
        <div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Need something bigger?</h3>
          <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
            For larger organisations: no limits on seats, charts or roles per chart, and an exportable audit log. {SALES_EMAIL ? 'Talk to us about what you need.' : ''}
          </p>
        </div>
        {/* Only with a real address (VITE_SALES_EMAIL, else VITE_SUPPORT_EMAIL), R-63 */}
        {SALES_EMAIL && <a
          data-testid="talk-to-sales"
          href={`mailto:${SALES_EMAIL}`}
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
        </a>}
      </div>

      {/* FAQ (simple) */}
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 24, textAlign: 'center' }}>
          Frequently asked questions
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            { q: 'Can I change plans at any time?', a: 'Yes. Upgrade, downgrade, or cancel anytime from Settings → Billing. Upgrades take effect immediately, and you pay the prorated difference. Downgrades and cancellations take effect at the end of your billing period, so you keep what you paid for until then.' },
            { q: 'What happens to my charts if I downgrade?', a: 'Your charts are never deleted. If you have more charts than the new plan allows, all of them become view-only until you delete enough charts or upgrade again. If a chart has more roles than the new plan allows, you can still edit and remove roles, but you can\'t add new ones until you\'re back under the limit.' },
            { q: 'Who counts towards the team member limit?', a: 'Every member of your workspace, plus every pending invite. People who only view a chart through a public share link don\'t count. Once every seat is taken, you can invite someone new after you upgrade or remove a member. If you downgrade with more members than the new plan allows, nobody is removed, but you can\'t add anyone until you\'re back under the limit.' },
            { q: 'Is there a free trial?', a: `Yes. Every new workspace starts with ${DEFAULT_NEW_WORKSPACE_TRIAL_DAYS} days of ${NEW_WORKSPACE_TRIAL_PLAN === 'growth' ? 'Growth' : 'a paid plan'}, with no card needed, so you can try job descriptions, AI drafting, headcount planning and version history. When it ends the workspace moves to the Free plan (or the plan you chose). Nothing is deleted, but if you have more charts than Free allows they become view-only until you upgrade.` },
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

      <div style={{ maxWidth: 700, margin: '40px auto 0' }}>
        <LegalFooter />
      </div>
    </div>
  )
}
