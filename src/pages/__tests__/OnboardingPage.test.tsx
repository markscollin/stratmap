import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { OnboardingPage } from '../OnboardingPage'
import { useUserStore, MOCK_USER } from '../../store/userStore'
import { useToastStore } from '../../store/toastStore'

// Mock useNavigate so we don't need a full router
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

// Provide a signed-in user for useAuth
vi.mock('../../features/auth/useAuth', () => ({
  IS_DEV_BYPASS: false,
  useAuth: () => ({ user: { id: 'u-1', name: 'Dev User', email: 'dev@example.com', initials: 'DU' }, isSignedIn: true }),
}))

// Mock the API client so complete() doesn't make real HTTP calls
vi.mock('../../lib/apiClient', () => ({
  api: {
    post: vi.fn().mockImplementation((_url: string, body: Record<string, unknown>) =>
      Promise.resolve({
        id: 'ws-test-123',
        name: body?.name ?? 'Test Workspace',
        ownerRole: body?.ownerRole ?? 'Founder/CEO',
        size: body?.size ?? '11-50',
        createdAt: new Date().toISOString(),
      })
    ),
    get: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <OnboardingPage />
    </MemoryRouter>
  )
}

beforeEach(() => {
  mockNavigate.mockReset()
  useUserStore.setState({ user: MOCK_USER, isAuthenticated: true, permission: 'owner', workspace: null })
  useToastStore.setState({ toasts: [] })
})

describe('OnboardingPage — Step 1', () => {
  it('renders step 1 heading', () => {
    renderPage()
    expect(screen.getByText('Set up your workspace')).toBeDefined()
  })

  it('Continue button is disabled when workspace name is empty', () => {
    renderPage()
    const btn = screen.getByTestId('continue-btn') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('Continue button enables when workspace name is filled', () => {
    renderPage()
    fireEvent.change(screen.getByTestId('workspace-name'), { target: { value: 'Acme Corp' } })
    const btn = screen.getByTestId('continue-btn') as HTMLButtonElement
    expect(btn.disabled).toBe(false)
  })

  it('advances to step 2 when Continue is clicked with a valid name', () => {
    renderPage()
    fireEvent.change(screen.getByTestId('workspace-name'), { target: { value: 'Acme Corp' } })
    fireEvent.click(screen.getByTestId('continue-btn'))
    expect(screen.getByText('Invite your team')).toBeDefined()
  })

  it('does not advance if workspace name is only whitespace', () => {
    renderPage()
    fireEvent.change(screen.getByTestId('workspace-name'), { target: { value: '   ' } })
    fireEvent.click(screen.getByTestId('continue-btn'))
    expect(screen.queryByText('Invite your team')).toBeNull()
  })
})

describe('OnboardingPage — Step 2', () => {
  function goToStep2() {
    renderPage()
    fireEvent.change(screen.getByTestId('workspace-name'), { target: { value: 'Acme Corp' } })
    fireEvent.click(screen.getByTestId('continue-btn'))
  }

  it('renders step 2 heading', () => {
    goToStep2()
    expect(screen.getByText('Invite your team')).toBeDefined()
  })

  it('Skip creates workspace and navigates to /charts', async () => {
    goToStep2()
    fireEvent.click(screen.getByTestId('skip-btn'))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/charts'))

    const { workspace } = useUserStore.getState()
    expect(workspace?.name).toBe('Acme Corp')
    expect(workspace?.pendingInvites).toHaveLength(0)
  })

  it('Send invites stores filled emails as pending invites', async () => {
    goToStep2()
    fireEvent.change(screen.getByTestId('invite-email-0'), { target: { value: 'alice@co.com' } })
    fireEvent.change(screen.getByTestId('invite-email-1'), { target: { value: 'bob@co.com' } })
    fireEvent.click(screen.getByTestId('send-invites-btn'))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/charts'))

    const { workspace } = useUserStore.getState()
    expect(workspace?.pendingInvites).toHaveLength(2)
    expect(workspace?.pendingInvites[0].email).toBe('alice@co.com')
    expect(workspace?.pendingInvites[1].email).toBe('bob@co.com')
  })

  it('empty invite rows are not stored as pending invites', async () => {
    goToStep2()
    // Only fill the first row
    fireEvent.change(screen.getByTestId('invite-email-0'), { target: { value: 'alice@co.com' } })
    fireEvent.click(screen.getByTestId('send-invites-btn'))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/charts'))
    const { workspace } = useUserStore.getState()
    expect(workspace?.pendingInvites).toHaveLength(1)
  })

  it('shows Add another link and caps at 5 rows', () => {
    goToStep2()
    expect(screen.getByText('Add another')).toBeDefined()

    // Add rows until cap
    fireEvent.click(screen.getByText('Add another'))
    fireEvent.click(screen.getByText('Add another'))
    // Now at 5 rows, link disappears
    expect(screen.queryByText('Add another')).toBeNull()
  })

  it('fires a success toast after completion', async () => {
    goToStep2()
    fireEvent.click(screen.getByTestId('skip-btn'))

    await waitFor(() => {
      const { toasts } = useToastStore.getState()
      expect(toasts.some(t => t.message.includes('Welcome to StratMap'))).toBe(true)
    })
  })

  it('toast includes the user first name', async () => {
    goToStep2()
    fireEvent.click(screen.getByTestId('skip-btn'))

    await waitFor(() => {
      const { toasts } = useToastStore.getState()
      expect(toasts.some(t => t.message.includes('Dev'))).toBe(true)
    })
  })
})

describe('OnboardingPage — workspace owner', () => {
  it('workspace created with signed-in user as owner member', async () => {
    renderPage()
    fireEvent.change(screen.getByTestId('workspace-name'), { target: { value: 'My Startup' } })
    fireEvent.click(screen.getByTestId('continue-btn'))
    fireEvent.click(screen.getByTestId('skip-btn'))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/charts'))

    const { workspace } = useUserStore.getState()
    expect(workspace?.members[0].permission).toBe('owner')
    expect(workspace?.members[0].user.id).toBe('u-1')
  })
})
