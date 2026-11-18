import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('../../../lib/apiClient', () => {
  class ApiError extends Error {
    status: number
    body: Record<string, unknown>
    constructor(status: number, body: Record<string, unknown>) { super(String(body.error)); this.status = status; this.body = body }
    get userMessage() { return typeof this.body.message === 'string' ? this.body.message : this.message }
  }
  return { ApiError, api: { get: vi.fn(), getText: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }
})

vi.mock('../../auth/useSignOut', () => ({ useSignOut: () => vi.fn() }))

import { api, ApiError } from '../../../lib/apiClient'
import { TransferOwnership } from '../TransferOwnership'
import { DataRightsSection } from '../DataRightsSection'
import { useUserStore, MOCK_WORKSPACE } from '../../../store/userStore'
import type { Permission } from '../../../types'

const assign = vi.fn()
const member = (id: string, name: string, permission: Permission) => ({ user: { id, name, email: `${id}@co.com` }, permission, joinedAt: '2026-01-01' })

function setup(members = [member('u-me', 'Me', 'owner'), member('u-ad', 'Ada Admin', 'admin'), member('u-ed', 'Ed Editor', 'editor')], permission: Permission = 'owner') {
  useUserStore.setState({
    user: { id: 'u-me', name: 'Me', email: 'me@co.com' }, permission, isAuthenticated: true,
    workspace: { ...MOCK_WORKSPACE, name: 'Acme Inc', members },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } })
})

describe('Settings → Transfer ownership', () => {
  it('lists only other admins, needs a choice and the typed name, then posts and reloads', async () => {
    setup(); vi.mocked(api.post).mockResolvedValue({} as never)
    render(<TransferOwnership />)
    fireEvent.click(screen.getByRole('button', { name: /transfer ownership…/i }))
    const options = screen.getAllByRole('option').map(o => o.textContent)
    expect(options).toEqual(['Choose an admin…', 'Ada Admin'])
    const go = screen.getByRole('button', { name: 'Transfer ownership' })
    expect(go).toBeDisabled()
    fireEvent.change(screen.getByLabelText('New owner'), { target: { value: 'u-ad' } })
    fireEvent.change(screen.getByLabelText(/type acme inc to confirm/i), { target: { value: 'Acme' } })
    expect(go).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/type acme inc to confirm/i), { target: { value: 'Acme Inc' } })
    fireEvent.click(go)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/workspace/transfer-ownership', { userId: 'u-ad', confirmName: 'Acme Inc' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/dashboard'))
  })

  it('shows the server message and stays put when it is refused', async () => {
    setup(); vi.mocked(api.post).mockRejectedValue(new ApiError(409, { error: 'owns-another-workspace', message: 'That person already owns another workspace.' }))
    render(<TransferOwnership />)
    fireEvent.click(screen.getByRole('button', { name: /transfer ownership…/i }))
    fireEvent.change(screen.getByLabelText('New owner'), { target: { value: 'u-ad' } })
    fireEvent.change(screen.getByLabelText(/type acme inc to confirm/i), { target: { value: 'Acme Inc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Transfer ownership' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already owns another workspace')
    expect(assign).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Transfer ownership' })).toBeEnabled()
  })

  it('with no other admin it says to make one first', () => {
    setup([member('u-me', 'Me', 'owner'), member('u-ed', 'Ed Editor', 'editor')])
    render(<TransferOwnership />)
    fireEvent.click(screen.getByRole('button', { name: /transfer ownership…/i }))
    expect(screen.getByText(/no other admin yet/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('New owner')).toBeNull()
  })

  it('only the owner sees it in Settings', () => {
    setup(undefined, 'admin')
    render(<DataRightsSection />)
    expect(screen.queryByRole('button', { name: /transfer ownership/i })).toBeNull()
  })
  it('the owner sees it in Settings', () => {
    setup()
    render(<DataRightsSection />)
    expect(screen.getByRole('button', { name: /transfer ownership…/i })).toBeInTheDocument()
  })
})
