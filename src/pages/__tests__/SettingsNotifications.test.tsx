import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../lib/apiClient', () => {
  class ApiError extends Error {
    get userMessage() { return this.message }
  }
  return { ApiError, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }
})

import { api } from '../../lib/apiClient'
import { SettingsView } from '../SettingsView'
import { useUserStore, MOCK_WORKSPACE } from '../../store/userStore'
import { useBillingStore, PLAN_BY_TIER } from '../../store/billingStore'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.get).mockResolvedValue({ comments: true } as never)
  vi.mocked(api.put).mockResolvedValue({ comments: false } as never)
  useUserStore.setState({ user: { id: 'u', name: 'U', email: 'u@co.com' }, permission: 'editor', isAuthenticated: true, workspace: MOCK_WORKSPACE })
  useBillingStore.setState({ plan: PLAN_BY_TIER.growth })
})

async function open() {
  render(<MemoryRouter><SettingsView /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
  return screen.findByRole('switch', { name: 'New comments' })
}

describe('Settings → Notifications → New comments (roadmap 5)', () => {
  it('shows the saved choice, on by default', async () => {
    const sw = await open()
    await waitFor(() => expect(sw).toBeEnabled())
    expect(sw).toHaveAttribute('aria-checked', 'true')
    expect(api.get).toHaveBeenCalledWith('/api/notifications')
  })

  it('saving the switch calls the server (it used to be only a picture)', async () => {
    const sw = await open()
    await waitFor(() => expect(sw).toBeEnabled())
    fireEvent.click(sw)
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/api/notifications', { comments: false }))
    expect(sw).toHaveAttribute('aria-checked', 'false')
  })

  it('puts the switch back and says so if saving fails', async () => {
    vi.mocked(api.put).mockRejectedValueOnce(new Error('offline'))
    const sw = await open()
    await waitFor(() => expect(sw).toBeEnabled())
    fireEvent.click(sw)
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save')
    expect(sw).toHaveAttribute('aria-checked', 'true')
  })

  it('stays off and disabled until the saved choice has loaded', async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}) as never)
    const sw = await open()
    expect(sw).toBeDisabled()
  })

  it('the other switches are not connected to the server', async () => {
    await open()
    fireEvent.click(screen.getByRole('switch', { name: 'Approval requests' }))
    expect(api.put).not.toHaveBeenCalled()
  })
})
