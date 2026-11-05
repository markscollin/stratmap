import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('../../features/auth/useAuth', () => ({ IS_DEV_BYPASS: true }))

vi.mock('../../lib/apiClient', () => {
  class ApiError extends Error {
    status: number
    body: Record<string, unknown>
    constructor(status: number, body: Record<string, unknown>) { super(String(body.error)); this.status = status; this.body = body }
    get userMessage() { return typeof this.body.message === 'string' ? this.body.message : this.message }
  }
  return { ApiError, api: { get: vi.fn(), post: vi.fn() } }
})

import { api, ApiError } from '../../lib/apiClient'
import { InvitePage } from '../InvitePage'

const TOKEN = 'a'.repeat(43)
const PREVIEW = { workspaceName: 'Acme', inviterName: 'Alex', email: 'new@co.com', permission: 'editor', expiresAt: null }

function renderAt(path = `/invite/${TOKEN}`) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/invite/:token" element={<InvitePage />} /></Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.mocked(api.get).mockReset()
  vi.mocked(api.post).mockReset()
  sessionStorage.clear()
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign: vi.fn() } })
})

describe('InvitePage', () => {
  it('shows who invited you and to what, and remembers the token for sign-up', async () => {
    vi.mocked(api.get).mockResolvedValue(PREVIEW)
    renderAt()
    expect(await screen.findByRole('heading', { name: 'Join Acme' })).toBeInTheDocument()
    expect(screen.getByText('Alex')).toBeInTheDocument()
    expect(screen.getByText('Editor')).toBeInTheDocument()
    expect(screen.getByText(/Invite sent to new@co.com/)).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith(`/api/invites/${TOKEN}`)
    expect(sessionStorage.getItem('stratmap_invite_token')).toBe(TOKEN)
  })

  it('accepting posts the token and goes to the dashboard', async () => {
    vi.mocked(api.get).mockResolvedValue(PREVIEW)
    vi.mocked(api.post).mockResolvedValue({ workspaceId: 'ws-1', permission: 'editor' })
    renderAt()
    fireEvent.click(await screen.findByRole('button', { name: 'Join Acme' }))
    await waitFor(() => expect(window.location.assign).toHaveBeenCalledWith('/dashboard'))
    expect(api.post).toHaveBeenCalledWith('/api/invites/accept', { token: TOKEN })
    expect(sessionStorage.getItem('stratmap_invite_token')).toBeNull()
  })

  it('shows the server explanation when accepting fails', async () => {
    vi.mocked(api.get).mockResolvedValue(PREVIEW)
    vi.mocked(api.post).mockRejectedValue(new ApiError(403, {
      error: 'invite-email-mismatch', message: 'This invite was sent to new@co.com.',
    }))
    renderAt()
    fireEvent.click(await screen.findByRole('button', { name: 'Join Acme' }))
    expect(await screen.findByText('This invite was sent to new@co.com.')).toBeInTheDocument()
    expect(window.location.assign).not.toHaveBeenCalled()
  })

  it('explains an expired invite', async () => {
    vi.mocked(api.get).mockRejectedValue(new ApiError(410, { error: 'invite-expired' }))
    renderAt()
    expect(await screen.findByText(/This invite has expired/)).toBeInTheDocument()
    expect(sessionStorage.getItem('stratmap_invite_token')).toBeNull()
  })

  it('explains an invalid or used link', async () => {
    vi.mocked(api.get).mockRejectedValue(new ApiError(404, { error: 'invite-not-found' }))
    renderAt()
    expect(await screen.findByText(/invalid or has already been used/)).toBeInTheDocument()
  })
})
