import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

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

import { api, ApiError } from '../../../lib/apiClient'
import { downloadText } from '../../../lib/csvSafe'
import { SettingsView } from '../../../pages/SettingsView'
import { useUserStore, MOCK_WORKSPACE } from '../../../store/userStore'
import { useBillingStore, PLAN_BY_TIER } from '../../../store/billingStore'
import type { Permission } from '../../../types'

const EVENT = {
  id: 'e1', action: 'member.role_changed', targetType: 'member', targetId: 'u-ed', createdAt: '2026-11-06T10:00:00Z',
  details: { email: 'ed@co.com', from: 'editor', to: 'viewer' }, actor: { userId: 'u-me', name: 'Me Admin', email: 'me@co.com' },
}

function setup(permission: Permission, tier: keyof typeof PLAN_BY_TIER = 'growth') {
  vi.clearAllMocks()
  vi.mocked(api.get).mockImplementation((path: string) =>
    Promise.resolve(path.startsWith('/api/workspace/audit') ? { events: [EVENT], nextBefore: null } : { members: [], invites: [] }) as never)
  vi.mocked(api.getText).mockResolvedValue('csv')
  useUserStore.setState({ user: { id: 'u-me', name: 'Me Admin', email: 'me@co.com' }, permission, isAuthenticated: true, workspace: MOCK_WORKSPACE })
  useBillingStore.setState({ plan: PLAN_BY_TIER[tier] })
  render(<MemoryRouter><SettingsView /></MemoryRouter>)
}

describe('Settings → Activity (roadmap 4.4)', () => {
  it('owners and admins see the tab and the log in plain English', async () => {
    setup('admin')
    fireEvent.click(screen.getByRole('button', { name: 'Activity' }))
    expect(await screen.findByText('Me Admin changed ed@co.com from Editor to Viewer')).toBeInTheDocument()
  })

  it.each(['editor', 'commenter', 'viewer'] as const)('%s has no Activity tab, and the log is never requested', (role) => {
    setup(role)
    expect(screen.queryByRole('button', { name: 'Activity' })).toBeNull()
    expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining('/api/workspace/audit'))
  })

  it('shows the CSV export only on Enterprise; other plans see what it unlocks', async () => {
    setup('owner', 'growth')
    fireEvent.click(screen.getByRole('button', { name: 'Activity' }))
    await screen.findByTestId('audit-event')
    expect(screen.queryByRole('button', { name: /export csv/i })).toBeNull()
    expect(screen.getByTestId('locked-audit-export')).toBeInTheDocument()
  })

  it('Enterprise downloads the CSV from the API', async () => {
    setup('owner', 'enterprise')
    fireEvent.click(screen.getByRole('button', { name: 'Activity' }))
    fireEvent.click(await screen.findByRole('button', { name: /export csv/i }))
    await waitFor(() => expect(downloadText).toHaveBeenCalledWith('audit-log.csv', 'csv'))
    expect(api.getText).toHaveBeenCalledWith('/api/workspace/audit?format=csv')
  })

  it('shows the server message if the log cannot be loaded', async () => {
    setup('admin')
    vi.mocked(api.get).mockRejectedValueOnce(new ApiError(500, { error: 'x', message: 'Boom' }))
    fireEvent.click(screen.getByRole('button', { name: 'Activity' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/boom|could not|x/i)
  })
})
