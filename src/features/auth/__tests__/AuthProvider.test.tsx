// Launch review R-13: a failed /api/workspace used to count as "resolved". A returning person on a new browser was sent to
// onboarding, a returning browser kept the placeholder viewer permission, and every page rendered before the answer arrived.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})
vi.mock('@clerk/clerk-react', () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useUser: () => ({ isLoaded: true, isSignedIn: true, user: { id: 'u1', fullName: 'Ada', username: null, emailAddresses: [{ emailAddress: 'ada@example.com' }], imageUrl: '' } }),
}))
vi.mock('../useAuth', () => ({ IS_DEV_BYPASS: false, useAuth: () => ({}) }))
vi.mock('../../../lib/apiClient', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/apiClient')>('../../../lib/apiClient')
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }
})

import { AuthProvider } from '../AuthProvider'
import { api, ApiError } from '../../../lib/apiClient'
import { useUserStore } from '../../../store/userStore'
import { useBillingStore } from '../../../store/billingStore'

const workspace = { id: 'w1', name: 'Acme', ownerRole: 'Founder/CEO', size: '11-50', createdAt: '2026-01-01T00:00:00Z', planTier: 'growth', myPermission: 'editor', members: [] }
const mount = (path = '/dashboard') => render(<MemoryRouter initialEntries={[path]}><AuthProvider><div data-testid="app">the app</div></AuthProvider></MemoryRouter>)
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(10_000) })

beforeEach(() => {
  vi.useFakeTimers()
  mockNavigate.mockReset()
  vi.mocked(api.get).mockReset(); vi.mocked(api.post).mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  useUserStore.setState({ user: null, isAuthenticated: false, permission: 'viewer', workspace: null })
})
afterEach(() => { vi.useRealTimers() })

describe('AuthProvider workspace load (R-13)', () => {
  it('shows nothing of the app until the workspace has answered, then uses the server permission and plan', async () => {
    let resolve!: (v: unknown) => void
    vi.mocked(api.get).mockReturnValue(new Promise(r => { resolve = r }) as never)
    mount()
    expect(screen.queryByTestId('app')).toBeNull() // no placeholder-viewer flash
    await act(async () => { resolve(workspace) })
    expect(screen.getByTestId('app')).toBeInTheDocument()
    expect(useUserStore.getState().permission).toBe('editor')
    expect(useBillingStore.getState().plan.tier).toBe('growth')
  })

  it('a transient failure is retried quietly and the person never notices', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new ApiError(503, { error: 'x' })).mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(workspace as never)
    mount()
    await settle()
    expect(api.get).toHaveBeenCalledTimes(3)
    expect(screen.getByTestId('app')).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalledWith('/onboarding')
  })

  it('when it keeps failing: an error with Retry, no app, and NOT onboarding', async () => {
    vi.mocked(api.get).mockRejectedValue(new ApiError(500, { error: 'x' }))
    mount()
    await settle()
    expect(screen.getByTestId('workspace-load-failed')).toHaveTextContent("Couldn't load your workspace")
    expect(screen.queryByTestId('app')).toBeNull()
    expect(mockNavigate).not.toHaveBeenCalledWith('/onboarding')
    expect(vi.mocked(api.post)).not.toHaveBeenCalled() // never even asked to create a workspace
    expect(useUserStore.getState().workspace).toBeNull()
  })

  it('Retry loads again and, when the server is back, shows the app', async () => {
    vi.mocked(api.get).mockRejectedValue(new ApiError(500, { error: 'x' }))
    mount()
    await settle()
    vi.mocked(api.get).mockReset(); vi.mocked(api.get).mockResolvedValue(workspace as never)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await settle()
    expect(screen.getByTestId('app')).toBeInTheDocument()
    expect(screen.queryByTestId('workspace-load-failed')).toBeNull()
  })

  it('a refusal that retrying cannot fix (e.g. 401) is not retried', async () => {
    vi.mocked(api.get).mockRejectedValue(new ApiError(401, { error: 'Unauthorized' }))
    mount()
    await settle()
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('workspace-load-failed')).toBeInTheDocument()
  })

  it('a genuinely new person (no workspace, no invite) still goes to onboarding', async () => {
    vi.mocked(api.get).mockRejectedValue(new ApiError(404, { error: 'no-workspace' }))
    vi.mocked(api.post).mockImplementation(async (url: string) => {
      if (url === '/api/invites/accept') throw new ApiError(404, { error: 'no-invite' })
      return {} as never
    })
    mount()
    await settle()
    expect(mockNavigate).toHaveBeenCalledWith('/onboarding')
    expect(screen.queryByTestId('workspace-load-failed')).toBeNull()
  })

  it('if the invite check itself cannot reach the server, that is a failure, not "go and create a workspace"', async () => {
    vi.mocked(api.get).mockRejectedValue(new ApiError(404, { error: 'no-workspace' }))
    vi.mocked(api.post).mockRejectedValue(new TypeError('Failed to fetch'))
    mount()
    await settle()
    expect(screen.getByTestId('workspace-load-failed')).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalledWith('/onboarding')
  })
})
