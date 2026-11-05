import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('../../../lib/apiClient', () => ({ api: { get: vi.fn() }, ApiError: class extends Error {} }))
vi.mock('../../../lib/workspaceSelection', () => ({ switchWorkspace: vi.fn() }))

import { api } from '../../../lib/apiClient'
import { switchWorkspace } from '../../../lib/workspaceSelection'
import { WorkspaceSwitcher } from '../WorkspaceSwitcher'
import { useUserStore, MOCK_WORKSPACE } from '../../../store/userStore'
import { useUIStore } from '../../../store/uiStore'

const LIST = {
  workspaces: [
    { id: MOCK_WORKSPACE.id, name: MOCK_WORKSPACE.name, myPermission: 'owner', planTier: 'starter' },
    { id: 'ws-other', name: 'Other Co', myPermission: 'viewer', planTier: 'growth' },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  useUserStore.setState({ workspace: MOCK_WORKSPACE })
  useUIStore.setState({ sidebarCollapsed: false })
  vi.mocked(api.get).mockResolvedValue(LIST as never)
})

describe('WorkspaceSwitcher', () => {
  it('shows the current workspace and lists all of them with plan and role', async () => {
    render(<WorkspaceSwitcher />)
    fireEvent.click(screen.getByRole('button', { name: 'Switch workspace' }))
    await waitFor(() => expect(screen.getByText('Other Co')).toBeInTheDocument())
    expect(api.get).toHaveBeenCalledWith('/api/workspaces')
    expect(screen.getByText('Growth · Viewer')).toBeInTheDocument()
    expect(screen.getByRole('option', { selected: true })).toHaveTextContent(MOCK_WORKSPACE.name)
  })

  it('switches to another workspace', async () => {
    render(<WorkspaceSwitcher />)
    fireEvent.click(screen.getByRole('button', { name: 'Switch workspace' }))
    fireEvent.click(await screen.findByText('Other Co'))
    expect(switchWorkspace).toHaveBeenCalledWith('ws-other')
  })

  it('does not reload when picking the current workspace', async () => {
    render(<WorkspaceSwitcher />)
    fireEvent.click(screen.getByRole('button', { name: 'Switch workspace' }))
    fireEvent.click(await screen.findByRole('option', { selected: true }))
    expect(switchWorkspace).not.toHaveBeenCalled()
  })

  it('renders nothing without a workspace', () => {
    useUserStore.setState({ workspace: null })
    const { container } = render(<WorkspaceSwitcher />)
    expect(container).toBeEmptyDOMElement()
  })
})
