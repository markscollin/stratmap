import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
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
import { useUserStore, MOCK_WORKSPACE } from '../../store/userStore'
import { useBillingStore, PLAN_BY_TIER } from '../../store/billingStore'

const MEMBERS = [
  { userId: 'u-me', email: 'me@co.com', name: 'Me Admin', avatarUrl: null, permission: 'admin', joinedAt: '2026-01-01' },
  { userId: 'u-ed', email: 'ed@co.com', name: 'Ed Editor', avatarUrl: null, permission: 'editor', joinedAt: '2026-01-01' },
  { userId: 'u-ow', email: 'ow@co.com', name: 'Olive Owner', avatarUrl: null, permission: 'owner', joinedAt: '2026-01-01' },
]
const INVITES = [
  { id: 'inv-1', email: 'new@co.com', permission: 'viewer', sentAt: '2026-11-01', expiresAt: '2026-11-08', expired: false },
  { id: 'inv-2', email: 'old@co.com', permission: 'editor', sentAt: '2026-10-01', expiresAt: '2026-10-08', expired: true },
]

function mockApi() {
  vi.mocked(api.get).mockImplementation((path: string) =>
    Promise.resolve(path === '/api/workspace/invites' ? { invites: INVITES } : { members: MEMBERS }) as never)
  vi.mocked(api.post).mockResolvedValue({})
  vi.mocked(api.put).mockResolvedValue({})
  vi.mocked(api.delete).mockResolvedValue(undefined)
}

async function openMembers() {
  render(<MemoryRouter><SettingsView /></MemoryRouter>)
  fireEvent.click(screen.getByText('Members'))
  await screen.findByText('Ed Editor')
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi()
  useUserStore.setState({
    user: { id: 'u-me', name: 'Me Admin', email: 'me@co.com' },
    permission: 'admin',
    isAuthenticated: true,
    workspace: MOCK_WORKSPACE,
  })
  useBillingStore.setState({ plan: PLAN_BY_TIER.growth })
})

describe('Settings → Members (API-backed)', () => {
  it('lists members and pending invites from the API, counting live invites as seats', async () => {
    await openMembers()
    expect(screen.getByText('new@co.com')).toBeInTheDocument()
    expect(screen.getByText('Expired')).toBeInTheDocument()
    expect(screen.getByText(/4 of 10 seats used/)).toBeInTheDocument() // 3 members + 1 live invite
  })

  it('sends an invite through the API', async () => {
    await openMembers()
    fireEvent.click(screen.getByRole('button', { name: /Invite/ }))
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'pat@co.com' } })
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'commenter' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/workspace/invites', { invites: [{ email: 'pat@co.com', permission: 'commenter' }] }))
  })

  it('an admin can only grant roles below admin', async () => {
    await openMembers()
    fireEvent.click(screen.getByRole('button', { name: /Invite/ }))
    const options = within(screen.getByLabelText('Role')).getAllByRole('option').map(o => o.getAttribute('value'))
    expect(options).toEqual(['editor', 'commenter', 'viewer'])
  })

  it('resend and revoke call the invite endpoints', async () => {
    await openMembers()
    fireEvent.click(screen.getAllByRole('button', { name: 'Resend' })[0])
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/workspace/invites/inv-1', {}))
    fireEvent.click(screen.getByRole('button', { name: 'Revoke invite for new@co.com' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/workspace/invites/inv-1'))
  })

  it('changes a role and removes a member via the API; owner and self are not editable', async () => {
    await openMembers()
    fireEvent.change(screen.getByLabelText('Role for Ed Editor'), { target: { value: 'viewer' } })
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/api/workspace/members/u-ed', { permission: 'viewer' }))

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Ed Editor' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/workspace/members/u-ed'))

    expect(screen.queryByLabelText('Role for Olive Owner')).toBeNull()
    expect(screen.queryByLabelText('Role for Me Admin')).toBeNull()
  })

  it('shows the server message when an action fails (e.g. seat limit)', async () => {
    vi.mocked(api.post).mockRejectedValue(new ApiError(402, { error: 'plan-limit', message: 'Your free plan allows up to 3 seats.' }))
    await openMembers()
    fireEvent.click(screen.getByRole('button', { name: /Invite/ }))
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'pat@co.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Your free plan allows up to 3 seats.')
  })

  it('non-admins see members but no invites or controls', async () => {
    useUserStore.setState({ permission: 'editor' })
    await openMembers()
    expect(api.get).not.toHaveBeenCalledWith('/api/workspace/invites')
    expect(screen.queryByRole('button', { name: /Invite/ })).toBeNull()
    expect(screen.getByText('Only admins can invite and manage team members')).toBeInTheDocument()
  })
})
