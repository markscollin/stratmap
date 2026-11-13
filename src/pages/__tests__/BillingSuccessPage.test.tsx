import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../lib/apiClient', () => ({ api: { get: vi.fn() }, ApiError: class extends Error {} }))
vi.mock('../../lib/contact', () => ({ SUPPORT_EMAIL: 'help@example.test' }))

import { api } from '../../lib/apiClient'
import { BillingSuccessPage } from '../BillingSuccessPage'
import { useBillingStore } from '../../store/billingStore'

const renderPage = (plan = 'starter') => render(
  <MemoryRouter initialEntries={[`/billing/success?plan=${plan}`]}><BillingSuccessPage /></MemoryRouter>,
)
const settle = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

// Launch review R-06: the page must not announce a finished upgrade that has not happened.
beforeEach(() => { vi.useFakeTimers(); vi.mocked(api.get).mockReset(); useBillingStore.getState().setPlan(useBillingStore.getState().plan) })
afterEach(() => vi.useRealTimers())

describe('BillingSuccessPage', () => {
  it('says the upgrade is complete once the workspace is on the purchased plan', async () => {
    vi.mocked(api.get).mockResolvedValue({ planTier: 'starter' })
    renderPage()
    await settle(0)
    expect(screen.getByText(/Welcome to Starter/)).toBeInTheDocument()
    expect(screen.getByText(/Your upgrade is complete/)).toBeInTheDocument()
  })

  it('while waiting for the webhook it says it is finishing, not that it is done', async () => {
    vi.mocked(api.get).mockResolvedValue({ planTier: 'free' })
    renderPage()
    await settle(0)
    expect(screen.getByText(/Finishing your upgrade/)).toBeInTheDocument()
    expect(screen.queryByText(/Your upgrade is complete/)).toBeNull()
  })

  it('becomes complete if the webhook lands during the wait', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ planTier: 'free' }).mockResolvedValueOnce({ planTier: 'free' }).mockResolvedValue({ planTier: 'starter' })
    renderPage()
    await settle(4000)
    expect(screen.getByText(/Your upgrade is complete/)).toBeInTheDocument()
  })

  it('when the plan never changes it says the payment was received and the plan will update, never "complete"', async () => {
    vi.mocked(api.get).mockResolvedValue({ planTier: 'free' })
    renderPage()
    await settle(15_000)
    expect(screen.getByText('Payment received')).toBeInTheDocument()
    expect(screen.getByText(/plan has not updated yet/)).toBeInTheDocument()
    expect(screen.queryByText(/Your upgrade is complete/)).toBeNull()
    expect(screen.queryByText(/Welcome to/)).toBeNull()
    expect(screen.getByRole('link', { name: 'help@example.test' })).toHaveAttribute('href', 'mailto:help@example.test')
  })

  it('the same when the workspace cannot be read at all', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('offline'))
    renderPage()
    await settle(15_000)
    expect(screen.getByText('Payment received')).toBeInTheDocument()
  })

  it('"Check again" looks again, and confirms once the plan has changed', async () => {
    vi.mocked(api.get).mockResolvedValue({ planTier: 'free' })
    renderPage()
    await settle(15_000)
    vi.mocked(api.get).mockResolvedValue({ planTier: 'starter' })
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    await settle(0)
    expect(screen.getByText(/Your upgrade is complete/)).toBeInTheDocument()
  })
})
