// Launch review R-20: a failed checkout used to just re-enable the button. Now it says why, and people who cannot
// change the plan are not offered a button that can only fail.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const post = vi.fn()
vi.mock('../../../lib/apiClient', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/apiClient')>('../../../lib/apiClient')
  return { ...actual, api: { post: (...a: unknown[]) => post(...a) } }
})

import { CheckoutButton } from '../CheckoutButton'
import { ApiError } from '../../../lib/apiClient'
import { useUserStore } from '../../../store/userStore'
import { useToastStore } from '../../../store/toastStore'

const asRole = (permission: 'owner' | 'admin' | 'editor' | 'viewer') =>
  useUserStore.getState().setUser({ id: 'u1', name: 'Ada', email: 'ada@example.com' }, permission)

beforeEach(() => {
  post.mockReset()
  useToastStore.setState({ toasts: [] })
  asRole('owner')
})

describe('CheckoutButton', () => {
  it('offers non-admins a disabled "Ask an admin to upgrade" instead of a button that would fail', () => {
    asRole('editor')
    render(<CheckoutButton tier="starter" billingCycle="monthly" />)
    const btn = screen.getByRole('button', { name: 'Ask an admin to upgrade' })
    expect(btn).toBeDisabled()
    fireEvent.click(btn)
    expect(post).not.toHaveBeenCalled()
  })

  it('admins can start checkout', async () => {
    asRole('admin')
    post.mockRejectedValue(new ApiError(500, { error: 'x' }))
    render(<CheckoutButton tier="starter" billingCycle="monthly" />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/checkout', { tier: 'starter', billingCycle: 'monthly' }))
  })

  it('shows the server message when checkout is unavailable (503) and re-enables the button', async () => {
    post.mockRejectedValue(new ApiError(503, { error: 'billing-unavailable', message: 'Billing is not available right now.' }))
    render(<CheckoutButton tier="growth" billingCycle="annual" />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(useToastStore.getState().toasts.map(t => t.message)).toContain('Billing is not available right now.'))
    expect(screen.getByRole('button')).not.toBeDisabled()
  })

  it('says to ask an admin on a 403 that slipped past the UI', async () => {
    post.mockRejectedValue(new ApiError(403, { error: 'forbidden' }))
    render(<CheckoutButton tier="starter" billingCycle="monthly" />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(useToastStore.getState().toasts.some(t => /Ask an admin/.test(t.message))).toBe(true))
  })

  it('says it could not start checkout when the network fails', async () => {
    post.mockRejectedValue(new TypeError('Failed to fetch'))
    render(<CheckoutButton tier="starter" billingCycle="monthly" />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(useToastStore.getState().toasts.some(t => /Could not start checkout/.test(t.message))).toBe(true))
  })
})
