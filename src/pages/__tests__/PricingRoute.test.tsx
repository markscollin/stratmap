import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div data-testid="app-layout">{children}</div>,
}))
vi.mock('../../features/billing/CheckoutButton', () => ({
  CheckoutButton: ({ tier }: { tier: string }) => <button data-testid={`checkout-${tier}`}>Upgrade to {tier}</button>,
}))

import { PricingRoute } from '../PricingPage'
import { useUserStore } from '../../store/userStore'
import { useBillingStore, PLAN_BY_TIER } from '../../store/billingStore'

const renderRoute = () => render(<MemoryRouter><PricingRoute /></MemoryRouter>)

beforeEach(() => {
  useUserStore.getState().signOut()
  useBillingStore.getState().setPlan(PLAN_BY_TIER.free)
})

describe('/pricing for visitors (roadmap 2.5)', () => {
  it('shows the plans in the public layout with Sign in and Start free, not the app sidebar', () => {
    renderRoute()
    expect(screen.queryByTestId('app-layout')).toBeNull()
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/sign-in')
    expect(screen.getAllByRole('link', { name: 'Start free' })[0].getAttribute('href')).toBe('/sign-up')
    for (const name of ['Free', 'Starter', 'Growth']) expect(screen.getByRole('heading', { name })).toBeTruthy()
  })

  it('every plan sends a visitor to sign-up, and nothing calls checkout', () => {
    renderRoute()
    for (const tier of ['free', 'starter', 'growth']) {
      expect(screen.getByTestId(`pricing-cta-${tier}`).getAttribute('href')).toBe('/sign-up')
    }
    expect(screen.queryByTestId('checkout-starter')).toBeNull()
  })

  it('states the AI draft numbers from plans.ts and never says "unlimited AI" (R-07)', () => {
    renderRoute()
    expect(screen.getByText('300 AI JD drafts per month')).toBeTruthy()
    expect(screen.getByText('AI JD drafting (3 per month)')).toBeTruthy()
    expect(screen.queryByText(/unlimited ai/i)).toBeNull()
  })

  it('does not claim the visitor is on the Free plan', () => {
    renderRoute()
    expect(screen.queryByText('Current plan')).toBeNull()
  })
})

describe('/pricing for signed-in people', () => {
  beforeEach(() => {
    useUserStore.getState().setUser({ id: 'u1', name: 'Ada', email: 'ada@example.com' }, 'owner')
  })

  it('keeps the in-app version: app layout, real checkout buttons, current plan marked', () => {
    renderRoute()
    expect(screen.getByTestId('app-layout')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull()
    expect(screen.getByTestId('checkout-starter')).toBeTruthy()
    expect(screen.getByTestId('checkout-growth')).toBeTruthy()
    expect(screen.getByText('Current plan')).toBeTruthy()
  })

  it('marks the plan they are actually on', () => {
    useBillingStore.getState().setPlan(PLAN_BY_TIER.starter)
    renderRoute()
    expect(screen.getAllByText('Current plan')).toHaveLength(1)   // on the Starter card, no longer the Free one (R-63)
    expect(screen.queryByTestId('checkout-starter')).toBeNull()
    expect(screen.getByTestId('free-downgrade-hint')).toBeTruthy()
    expect(screen.queryByTestId('pricing-cta-free')).toBeNull()
  })
})

// R-18 / D-3: the copy says what really happens to a new workspace.
describe('trial and plan copy (R-18)', () => {
  it('the FAQ promises the 14-day Growth trial, not "Free is effectively a trial"', () => {
    renderRoute()
    expect(screen.getByText(/starts with 14 days of Growth/)).toBeTruthy()
    expect(screen.queryByText(/effectively a trial/)).toBeNull()
  })

  it('the Growth card lists version history, and Enterprise no longer promises dedicated support', () => {
    renderRoute()
    expect(screen.getByText('Version history & scenarios')).toBeTruthy()
    expect(screen.queryByText(/dedicated support/i)).toBeNull()
  })
})

describe('VAT line (D-6)', () => {
  it('says nothing about VAT while it is undecided', () => {
    renderRoute()
    expect(screen.queryByTestId('price-tax-note')).toBeNull()
  })
})

// R-63: pricing page fixes.
describe('pricing page fixes (R-63)', () => {
  it('no "Most popular" badge before there are customers', () => {
    renderRoute()
    expect(screen.queryByText(/most popular/i)).toBeNull()
  })

  it('Growth says it includes everything in Starter, Starter everything in Free', () => {
    renderRoute()
    expect(screen.getByTestId('plan-includes-growth')).toHaveTextContent('Everything in Starter, plus')
    expect(screen.getByTestId('plan-includes-starter')).toHaveTextContent('Everything in Free, plus')
  })

  it('offers Scale above Growth, with its numbers from plans.ts (R-79)', async () => {
    const { PLAN_LIMITS, PLAN_PRICES } = await import('../../lib/plans')
    renderRoute()
    expect(screen.getByTestId('plan-includes-scale')).toHaveTextContent('Everything in Growth, plus')
    expect(screen.getByText(`Up to ${PLAN_LIMITS.scale.maxNodesPerChart} roles per chart`)).toBeTruthy()
    expect(screen.getByText(`Up to ${PLAN_LIMITS.scale.seats} team members`)).toBeTruthy()
    expect(screen.getByText(`£${PLAN_PRICES.scale.monthly}`)).toBeTruthy()
    expect(screen.getByTestId('pricing-cta-scale')).toHaveAttribute('href', '/sign-up')
  })

  it('every limit and price on the cards comes from plans.ts, and says "roles", not "nodes"', async () => {
    const { PLAN_LIMITS, PLAN_PRICES } = await import('../../lib/plans')
    renderRoute()
    expect(screen.getByText(`Up to ${PLAN_LIMITS.free.maxNodesPerChart} roles per chart`)).toBeTruthy()
    expect(screen.getByText(`Up to ${PLAN_LIMITS.starter.maxNodesPerChart} roles per chart`)).toBeTruthy()
    expect(screen.getByText(`Up to ${PLAN_LIMITS.growth.maxNodesPerChart} roles per chart`)).toBeTruthy()
    expect(screen.getByText(`Up to ${PLAN_LIMITS.starter.maxCharts} org charts`)).toBeTruthy()
    for (const t of ['free', 'starter', 'growth'] as const) expect(screen.getByText(`Up to ${PLAN_LIMITS[t].seats} team members`)).toBeTruthy()
    expect(screen.getByText(`£${PLAN_PRICES.starter.monthly}`)).toBeTruthy()
    expect(screen.getByText(`£${PLAN_PRICES.growth.monthly}`)).toBeTruthy()
    expect(screen.queryByText(/nodes/i)).toBeNull()
  })

  it('without a sales or support address there is no "Talk to sales" (no mailto to a domain we do not own)', () => {
    renderRoute()
    expect(screen.queryByTestId('talk-to-sales')).toBeNull()
    expect(document.body.innerHTML).not.toContain('sales@stratmap.app')
  })

  it('signed in on a paid plan, the Free card says how to move to Free instead of a dead button', () => {
    useUserStore.getState().setUser({ id: 'u1', name: 'Ada', email: 'ada@example.com' }, 'owner')
    useBillingStore.getState().setPlan(PLAN_BY_TIER.growth)
    renderRoute()
    expect(screen.getByTestId('free-downgrade-hint')).toHaveTextContent('cancel in Settings → Billing')
    expect(screen.queryByRole('button', { name: 'Get started free' })).toBeNull()
  })
})

describe('the plan you are on (R-63)', () => {
  it('a paid plan you are already on says "Current plan" and offers no checkout for it', () => {
    useUserStore.getState().setUser({ id: 'u1', name: 'Ada', email: 'ada@example.com' }, 'owner')
    useBillingStore.getState().setPlan(PLAN_BY_TIER.growth)
    renderRoute()
    expect(screen.getByText('Current plan')).toBeTruthy()
    expect(screen.queryByTestId('checkout-growth')).toBeNull()
    expect(screen.getByTestId('checkout-starter')).toBeTruthy()
  })
})
