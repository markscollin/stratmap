import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../lib/apiClient', () => {
  class ApiError extends Error {
    status: number
    body: Record<string, unknown>
    constructor(status: number, body: Record<string, unknown>) { super(String(body.error)); this.status = status; this.body = body }
    get userMessage() { return typeof this.body.message === 'string' ? this.body.message : this.message }
  }
  return { ApiError, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }
})

import { api, ApiError } from '../../lib/apiClient'
import { SettingsView } from '../SettingsView'
import { PaymentBanner } from '../../features/billing/PaymentBanner'
import { useUserStore, MOCK_WORKSPACE } from '../../store/userStore'
import { useBillingStore, PLAN_BY_TIER, NO_SUBSCRIPTION } from '../../store/billingStore'
import { useToastStore } from '../../store/toastStore'
import type { Permission, SubscriptionInfo } from '../../types'

const assign = vi.fn()

function setup(opts: { tier?: 'free' | 'starter' | 'growth'; permission?: Permission; sub?: Partial<SubscriptionInfo> } = {}) {
  useUserStore.setState({
    user: { id: 'u-me', name: 'Me', email: 'me@co.com' },
    permission: opts.permission ?? 'admin',
    isAuthenticated: true,
    workspace: MOCK_WORKSPACE,
  })
  useBillingStore.setState({
    plan: PLAN_BY_TIER[opts.tier ?? 'free'],
    subscription: { ...NO_SUBSCRIPTION, ...opts.sub },
  })
}

function renderBilling() {
  render(<MemoryRouter initialEntries={['/settings?tab=billing']}><SettingsView /></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  useToastStore.setState({ toasts: [] })
  vi.mocked(api.get).mockResolvedValue({ members: [] } as never)
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } })
})

describe('Settings → Billing', () => {
  it('opens on the billing tab from ?tab=billing and shows the real plan', () => {
    setup({ tier: 'starter', sub: { status: 'active', hasBillingAccount: true, planExpiresAt: '2030-03-17T00:00:00Z' } })
    renderBilling()
    expect(screen.getByText('Current plan')).toBeInTheDocument()
    expect(screen.getByText('Starter')).toBeInTheDocument()
    expect(screen.getByText(/Renews on/)).toBeInTheDocument()
    // Only higher tiers are offered.
    expect(screen.getByText('Upgrade to Growth')).toBeInTheDocument()
    expect(screen.queryByText('Upgrade to Starter')).not.toBeInTheDocument()
  })

  it('hides Manage billing for a workspace that never paid', () => {
    setup({ tier: 'free' })
    renderBilling()
    expect(screen.queryByText('Manage billing')).not.toBeInTheDocument()
    expect(screen.getByText('Upgrade to Starter')).toBeInTheDocument()
  })

  it('says when a cancelled plan ends', () => {
    setup({ tier: 'growth', sub: { status: 'active', hasBillingAccount: true, cancelAtPeriodEnd: true, planExpiresAt: '2030-03-17T00:00:00Z' } })
    renderBilling()
    expect(screen.getByRole('status')).toHaveTextContent(/stays active until .*2030, then moves to Free/)
  })

  it('opens the Stripe Customer Portal from Manage billing', async () => {
    setup({ tier: 'starter', sub: { status: 'active', hasBillingAccount: true } })
    vi.mocked(api.post).mockResolvedValue({ url: 'https://billing.stripe.test/p' } as never)
    renderBilling()
    fireEvent.click(screen.getByText('Manage billing'))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://billing.stripe.test/p'))
    expect(api.post).toHaveBeenCalledWith('/api/billing/portal', {})
  })

  it('shows the server message when the portal cannot open', async () => {
    setup({ tier: 'starter', sub: { status: 'active', hasBillingAccount: true } })
    vi.mocked(api.post).mockRejectedValue(new ApiError(503, { error: 'billing-unavailable', message: 'Billing is not configured in this environment.' }))
    renderBilling()
    fireEvent.click(screen.getByText('Manage billing'))
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.message).toBe('Billing is not configured in this environment.'))
    expect(assign).not.toHaveBeenCalled()
  })
})

describe('PaymentBanner', () => {
  it('renders nothing while the subscription is healthy', () => {
    setup({ tier: 'starter', sub: { status: 'active' } })
    const { container } = render(<PaymentBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('warns admins during the past_due grace period and offers to update payment', () => {
    setup({ tier: 'starter', sub: { status: 'past_due', hasBillingAccount: true } })
    render(<PaymentBanner />)
    expect(screen.getByRole('alert')).toHaveTextContent(/plan stays active while we retry/)
    expect(screen.getByText('Update payment')).toBeInTheDocument()
  })

  it('tells non-admins to ask an admin, without the billing button', () => {
    setup({ tier: 'starter', permission: 'editor', sub: { status: 'past_due' } })
    render(<PaymentBanner />)
    expect(screen.getByRole('alert')).toHaveTextContent(/Ask a workspace admin/)
    expect(screen.queryByText('Update payment')).not.toBeInTheDocument()
  })

  it('explains the downgrade once Stripe gives up (unpaid)', () => {
    setup({ tier: 'free', sub: { status: 'unpaid', hasBillingAccount: true } })
    render(<PaymentBanner />)
    expect(screen.getByRole('alert')).toHaveTextContent(/on the Free plan. Nothing has been deleted/)
  })
})
