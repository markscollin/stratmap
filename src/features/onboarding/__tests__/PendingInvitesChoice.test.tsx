// R-56: invites to the person's address are shown with who sent them, and accepted or declined only on a click.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('../../../lib/apiClient', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/apiClient')>('../../../lib/apiClient')
  return { ...actual, api: { get: vi.fn(), post: vi.fn() } }
})
vi.mock('../../../lib/workspaceSelection', () => ({ switchWorkspace: vi.fn() }))

import { PendingInvitesChoice, type MyInvite } from '../PendingInvitesChoice'
import { api, ApiError } from '../../../lib/apiClient'
import { switchWorkspace } from '../../../lib/workspaceSelection'
import { useToastStore } from '../../../store/toastStore'

const invite: MyInvite = { id: 'inv-1', workspaceName: 'VictimCo', inviterName: 'Mallory', inviterEmail: 'mallory@evil.test', permission: 'admin', expiresAt: null }

beforeEach(() => {
  vi.mocked(api.get).mockReset(); vi.mocked(api.post).mockReset(); vi.mocked(switchWorkspace).mockReset()
  useToastStore.setState({ toasts: [] })
})

describe('PendingInvitesChoice', () => {
  it('shows nothing when there are no invites, and accepts nothing on its own', async () => {
    vi.mocked(api.get).mockResolvedValue({ invites: [] } as never)
    render(<PendingInvitesChoice />)
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/invites/mine'))
    expect(screen.queryByTestId('pending-invites')).toBeNull()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('names the workspace, the inviter with their email and the role; nothing is joined until Accept', async () => {
    vi.mocked(api.get).mockResolvedValue({ invites: [invite] } as never)
    render(<PendingInvitesChoice />)
    expect(await screen.findByText(/Mallory \(mallory@evil\.test\) invited you to/)).toBeInTheDocument()
    expect(screen.getByText('VictimCo')).toBeInTheDocument()
    expect(screen.getByText(/as an admin/)).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()

    vi.mocked(api.post).mockResolvedValue({ workspaceId: 'ws-v' } as never)
    fireEvent.click(screen.getByRole('button', { name: 'Accept the invite to VictimCo' }))
    await waitFor(() => expect(switchWorkspace).toHaveBeenCalledWith('ws-v'))
    expect(api.post).toHaveBeenCalledWith('/api/invites/accept', { inviteId: 'inv-1' })
  })

  it('Decline removes the invite from the list and joins nothing', async () => {
    vi.mocked(api.get).mockResolvedValue({ invites: [invite] } as never)
    vi.mocked(api.post).mockResolvedValue({ declined: true } as never)
    render(<PendingInvitesChoice />)
    fireEvent.click(await screen.findByRole('button', { name: 'Decline the invite to VictimCo' }))
    await waitFor(() => expect(screen.queryByTestId('pending-invites')).toBeNull())
    expect(api.post).toHaveBeenCalledWith('/api/invites/decline', { inviteId: 'inv-1' })
    expect(switchWorkspace).not.toHaveBeenCalled()
  })

  it('a refused accept (no free seat) says why and keeps the choice', async () => {
    vi.mocked(api.get).mockResolvedValue({ invites: [invite] } as never)
    vi.mocked(api.post).mockRejectedValue(new ApiError(402, { error: 'plan-limit', message: 'This workspace has no free seats.' }))
    render(<PendingInvitesChoice />)
    fireEvent.click(await screen.findByRole('button', { name: 'Accept the invite to VictimCo' }))
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.message).toContain('no free seats'))
    expect(switchWorkspace).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Accept the invite to VictimCo' })).not.toBeDisabled()
  })
})
