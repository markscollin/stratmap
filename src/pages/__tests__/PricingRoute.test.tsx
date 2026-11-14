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
    expect(screen.queryByText('Current plan')).toBeNull()   // the Free card is no longer marked as theirs
    expect(screen.queryByTestId('pricing-cta-free')).toBeNull()
  })
})
