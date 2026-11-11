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
vi.mock('../../../lib/csvSafe', async (orig) => ({ ...(await orig<typeof import('../../../lib/csvSafe')>()), downloadText: vi.fn() }))
vi.mock('../../../lib/workspaceSelection', () => ({ setSelectedWorkspaceId: vi.fn(), switchWorkspace: vi.fn(), getSelectedWorkspaceId: vi.fn() }))
const signOut = vi.fn().mockResolvedValue(undefined)
vi.mock('../../auth/useSignOut', () => ({ useSignOut: () => signOut }))

import { api, ApiError } from '../../../lib/apiClient'
import { downloadText } from '../../../lib/csvSafe'
import { setSelectedWorkspaceId, switchWorkspace } from '../../../lib/workspaceSelection'
import { DataRightsSection } from '../DataRightsSection'
import { DeletedWorkspaceNotice } from '../DeletedWorkspaceNotice'
import { useUserStore, MOCK_WORKSPACE } from '../../../store/userStore'
import type { Permission } from '../../../types'

const assign = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } })
  vi.mocked(api.getText).mockResolvedValue('file contents')
  vi.mocked(api.delete).mockResolvedValue({} as never)
})

function setup(permission: Permission) {
  useUserStore.setState({
    user: { id: 'u-me', name: 'Me', email: 'me@co.com' }, permission, isAuthenticated: true,
    workspace: { ...MOCK_WORKSPACE, name: 'Acme Inc' },
  })
  render(<DataRightsSection />)
}

describe('Settings → data rights (roadmap 4.2)', () => {
  it.each(['editor', 'commenter', 'viewer'] as const)('%s can only delete their own account', (role) => {
    setup(role)
    expect(screen.queryByText('Export your data')).toBeNull()
    expect(screen.queryByRole('button', { name: /delete workspace/i })).toBeNull()
    expect(screen.getByRole('button', { name: /delete my account/i })).toBeInTheDocument()
  })

  it('an admin can export but not delete the workspace', async () => {
    setup('admin')
    expect(screen.queryByRole('button', { name: /delete workspace/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /all data \(json\)/i }))
    await waitFor(() => expect(downloadText).toHaveBeenCalledWith('stratmap-workspace.json', 'file contents', 'application/json'))
    expect(api.getText).toHaveBeenCalledWith('/api/workspace/export')
    fireEvent.click(screen.getByRole('button', { name: /all roles \(csv\)/i }))
    await waitFor(() => expect(api.getText).toHaveBeenCalledWith('/api/workspace/export?format=csv'))
    expect(downloadText).toHaveBeenLastCalledWith('stratmap-roles.csv', 'file contents', 'text/csv;charset=utf-8')
  })

  it('the owner must type the exact workspace name before the delete button works', async () => {
    setup('owner')
    fireEvent.click(screen.getByRole('button', { name: /delete workspace…/i }))
    const confirm = screen.getByRole('button', { name: 'Delete this workspace' })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/to confirm/i), { target: { value: 'acme inc' } })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/to confirm/i), { target: { value: 'Acme Inc' } })
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/workspace', { confirmName: 'Acme Inc' }))
    expect(setSelectedWorkspaceId).toHaveBeenCalledWith(null)
    expect(assign).toHaveBeenCalledWith('/dashboard')
  })

  it('shows the server message if the workspace could not be deleted, and stays put', async () => {
    vi.mocked(api.delete).mockRejectedValueOnce(new ApiError(502, { error: 'cancel-failed', message: 'We could not cancel the subscription, so nothing was deleted.' }))
    setup('owner')
    fireEvent.click(screen.getByRole('button', { name: /delete workspace…/i }))
    fireEvent.change(screen.getByLabelText(/to confirm/i), { target: { value: 'Acme Inc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Delete this workspace' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('nothing was deleted')
    expect(assign).not.toHaveBeenCalled()
  })

  it('deleting an account needs the word DELETE, then signs out', async () => {
    setup('editor')
    fireEvent.click(screen.getByRole('button', { name: /delete my account…/i }))
    const confirm = screen.getByRole('button', { name: 'Delete my account' })
    fireEvent.change(screen.getByLabelText(/to confirm/i), { target: { value: 'delete' } })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/to confirm/i), { target: { value: 'DELETE' } })
    fireEvent.click(confirm)
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/account', { confirm: 'DELETE' }))
    await waitFor(() => expect(signOut).toHaveBeenCalledWith('/'))
  })

  it('warns an owner that their workspace goes with their account, and cannot be restored', () => {
    setup('owner')
    expect(screen.getByText(/so it is deleted with you/i)).toBeInTheDocument()
    expect(screen.getByText(/cannot restore it/i)).toBeInTheDocument()
  })

  it('does not warn a non-owner about a workspace', () => {
    setup('editor')
    expect(screen.queryByText(/deleted with you/i)).toBeNull()
  })
})

describe('Leave this workspace (roadmap 5)', () => {
  it.each(['admin', 'editor', 'commenter', 'viewer'] as const)('%s can leave, after confirming', async (role) => {
    setup(role)
    expect(screen.getByText(/Leave this workspace\./)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /leave workspace…/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(api.post).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /leave workspace…/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Leave Acme Inc$/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/workspace/leave', {}))
    expect(setSelectedWorkspaceId).toHaveBeenCalledWith(null)
    expect(assign).toHaveBeenCalledWith('/dashboard')
  })

  it('the owner is not offered it (they delete the workspace instead)', () => {
    setup('owner')
    expect(screen.queryByText(/Leave this workspace\./)).toBeNull()
    expect(screen.queryByRole('button', { name: /leave workspace…/i })).toBeNull()
  })

  it('shows the server message and stays put if leaving fails', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new ApiError(500, { error: 'x', message: 'Try again later.' }))
    setup('editor')
    fireEvent.click(screen.getByRole('button', { name: /leave workspace…/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Leave Acme Inc$/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Try again later.')
    expect(assign).not.toHaveBeenCalled()
  })
})

describe('DeletedWorkspaceNotice', () => {
  const ERASE = new Date(Date.now() + 20 * 86_400_000).toISOString()

  it('shows nothing when no workspace is waiting to be restored', async () => {
    vi.mocked(api.get).mockResolvedValue({ workspaces: [], deleted: [] } as never)
    render(<DeletedWorkspaceNotice />)
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/workspaces'))
    expect(screen.queryByTestId('deleted-workspaces')).toBeNull()
  })

  it('offers to restore a deleted workspace, then opens it', async () => {
    vi.mocked(api.get).mockResolvedValue({ workspaces: [], deleted: [{ id: 'ws-1', name: 'Acme Inc', deletedAt: new Date().toISOString(), eraseOn: ERASE }] } as never)
    vi.mocked(api.post).mockResolvedValue({ restored: true } as never)
    render(<DeletedWorkspaceNotice />)
    expect(await screen.findByText(/was deleted/)).toBeInTheDocument()
    expect(screen.getByText(/starts on the Free plan/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Restore workspace' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/workspace/restore', { workspaceId: 'ws-1' }))
    expect(switchWorkspace).toHaveBeenCalledWith('ws-1')
  })

  it('explains why a restore was refused', async () => {
    vi.mocked(api.get).mockResolvedValue({ workspaces: [], deleted: [{ id: 'ws-1', name: 'Acme Inc', deletedAt: new Date().toISOString(), eraseOn: ERASE }] } as never)
    vi.mocked(api.post).mockRejectedValueOnce(new ApiError(409, { error: 'owns-another-workspace', message: 'You already own another workspace. Delete it first, then restore this one.' }))
    render(<DeletedWorkspaceNotice />)
    fireEvent.click(await screen.findByRole('button', { name: 'Restore workspace' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already own another workspace')
    expect(switchWorkspace).not.toHaveBeenCalled()
  })
})
