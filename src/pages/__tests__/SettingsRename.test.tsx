// A failed workspace rename must say so and leave the shown name alone (the old backlog note: "the rename failure toast has no test").
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../lib/apiClient', () => {
  class ApiError extends Error {
    status: number
    body: Record<string, unknown>
    constructor(status: number, body: Record<string, unknown>) { super(typeof body.error === 'string' ? body.error : `API error ${status}`); this.status = status; this.body = body }
    get userMessage() { return this.message }
  }
  return { ApiError, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }
})

import { api, ApiError } from '../../lib/apiClient'
import { SettingsView } from '../SettingsView'
import { useUserStore, MOCK_WORKSPACE } from '../../store/userStore'
import { useBillingStore, PLAN_BY_TIER } from '../../store/billingStore'
import { useToastStore } from '../../store/toastStore'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.get).mockResolvedValue({ members: [], invites: [] } as never)
  useUserStore.setState({ user: { id: 'u', name: 'U', email: 'u@co.com' }, permission: 'admin', isAuthenticated: true, workspace: { ...MOCK_WORKSPACE, name: 'Old name' } })
  useBillingStore.setState({ plan: PLAN_BY_TIER.growth })
  useToastStore.setState({ toasts: [] })
})

function rename(to: string) {
  render(<MemoryRouter><SettingsView /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Workspace name'), { target: { value: to } })
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
}
const toasts = () => useToastStore.getState().toasts.map(t => `${t.variant}: ${t.message}`)

describe('renaming the workspace', () => {
  it('saves, shows Saved and updates the name', async () => {
    vi.mocked(api.put).mockResolvedValue({} as never)
    rename('New name')
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(api.put).toHaveBeenCalledWith('/api/workspace', { name: 'New name' })
    expect(useUserStore.getState().workspace?.name).toBe('New name')
    expect(toasts()).toEqual([])
  })

  it('a refused rename (403) toasts the reason and keeps the old name', async () => {
    vi.mocked(api.put).mockRejectedValue(new ApiError(403, { error: 'Forbidden' }))
    rename('New name')
    await waitFor(() => expect(toasts()).toEqual(["error: You don't have permission to rename the workspace."]))
    expect(useUserStore.getState().workspace?.name).toBe('Old name')
    expect(screen.queryByText('Saved')).toBeNull()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled() // can try again
  })

  it('a lost connection toasts that the server could not be reached and keeps the old name', async () => {
    vi.mocked(api.put).mockRejectedValue(new TypeError('Failed to fetch'))
    rename('New name')
    await waitFor(() => expect(toasts()[0]).toMatch(/^error: Couldn't rename the workspace: can't reach the server/))
    expect(useUserStore.getState().workspace?.name).toBe('Old name')
  })
})
