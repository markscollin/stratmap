// Launch review R-18: the new-workspace trial must be visible, and its end must never be a surprise.
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TrialBanner } from '../TrialBanner'
import { trialDaysLeft } from '../../../lib/trial'
import { useBillingStore, NO_SUBSCRIPTION } from '../../../store/billingStore'
import { useUserStore } from '../../../store/userStore'

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000 - 60_000).toISOString()
const mount = () => render(<MemoryRouter><TrialBanner /></MemoryRouter>)

beforeEach(() => {
  useBillingStore.setState({ trial: null, subscription: NO_SUBSCRIPTION })
  useUserStore.setState({ permission: 'owner' })
})

describe('trialDaysLeft', () => {
  it('rounds up and never goes below zero', () => {
    expect(trialDaysLeft(inDays(14))).toBe(14)
    expect(trialDaysLeft(inDays(0.2))).toBe(1)
    expect(trialDaysLeft(new Date(Date.now() - 1000).toISOString())).toBe(0)
  })
})

describe('TrialBanner', () => {
  it('shows nothing without a trial, or once the trial is over', () => {
    mount()
    expect(screen.queryByTestId('trial-banner')).toBeNull()
    useBillingStore.setState({ trial: { plan: 'growth', endsAt: new Date(Date.now() - 1000).toISOString() } })
    mount()
    expect(screen.queryByTestId('trial-banner')).toBeNull()
  })

  it('says how long is left and exactly what changes afterwards, with the real Free limits', () => {
    useBillingStore.setState({ trial: { plan: 'growth', endsAt: inDays(9) } })
    mount()
    const b = screen.getByTestId('trial-banner')
    expect(b).toHaveTextContent('Growth trial has 9 days left')
    expect(b).toHaveTextContent('1 chart, 30 roles per chart, 3 members')
    expect(b).toHaveTextContent('Nothing is deleted')
    expect(screen.getByRole('link', { name: /See plans/ })).toHaveAttribute('href', '/pricing')
  })

  it('"ends tomorrow" on the last day', () => {
    useBillingStore.setState({ trial: { plan: 'growth', endsAt: inDays(0.5) } })
    mount()
    expect(screen.getByTestId('trial-banner')).toHaveTextContent('ends tomorrow')
  })

  it('people who cannot change the plan are not sent to the plans page', () => {
    useUserStore.setState({ permission: 'editor' })
    useBillingStore.setState({ trial: { plan: 'growth', endsAt: inDays(5) } })
    mount()
    expect(screen.queryByRole('link', { name: /See plans/ })).toBeNull()
  })

  it('is hidden once the workspace pays for a plan of its own', () => {
    useBillingStore.setState({ trial: { plan: 'growth', endsAt: inDays(5) }, subscription: { ...NO_SUBSCRIPTION, status: 'active' } })
    mount()
    expect(screen.queryByTestId('trial-banner')).toBeNull()
  })
})

// R-66: the banner can be put away for the day, and on a chart's canvas it is one short line.
describe('TrialBanner (R-66)', () => {
  beforeEach(() => { localStorage.clear(); useBillingStore.setState({ trial: { plan: 'growth', endsAt: inDays(9) } }) })

  it('"Hide until tomorrow" hides it, and it stays hidden today on every page', async () => {
    const { fireEvent } = await import('@testing-library/react')
    const { unmount } = mount()
    fireEvent.click(screen.getByRole('button', { name: 'Hide the trial notice until tomorrow' }))
    expect(screen.queryByTestId('trial-banner')).toBeNull()
    unmount()
    mount()
    expect(screen.queryByTestId('trial-banner')).toBeNull()
  })

  it('comes back on another day', () => {
    localStorage.setItem('stratmap_trial_banner_dismissed', '2000-01-01')
    mount()
    expect(screen.getByTestId('trial-banner')).toBeInTheDocument()
  })

  it('is one short line on a chart\'s canvas, the full explanation elsewhere', () => {
    render(<MemoryRouter initialEntries={['/charts/c1']}><TrialBanner /></MemoryRouter>)
    const b = screen.getByTestId('trial-banner')
    expect(b).toHaveAttribute('data-compact', 'true')
    expect(b).toHaveTextContent('Your free Growth trial has 9 days left.')
    expect(b).not.toHaveTextContent('Nothing is deleted')
  })
})
