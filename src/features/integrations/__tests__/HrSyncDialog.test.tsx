import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../../lib/apiClient', () => {
  class ApiError extends Error {
    status: number
    body: Record<string, unknown>
    constructor(status: number, body: Record<string, unknown>) { super(String(body.error)); this.status = status; this.body = body }
    get userMessage() { return typeof this.body.message === 'string' ? this.body.message : this.message }
  }
  return { ApiError, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }
})

import { api, ApiError } from '../../../lib/apiClient'
import { HrSyncDialog } from '../HrSyncDialog'
import { resultLine } from '../../../lib/hrSyncText'
import { useBillingStore, PLAN_BY_TIER } from '../../../store/billingStore'
import { useUserStore } from '../../../store/userStore'

const CONNECTED = {
  connected: true, available: true, subdomain: 'acme', keyHint: '1234', autoSync: false, lastSyncAt: null,
  lastResult: { at: '2026-11-27T03:41:00Z', status: 'held', reason: '12 people would be removed at once.', trigger: 'scheduled', leavers: 12 },
}
const PREVIEW = {
  blocked: false, hasChanges: true, issues: [], unchanged: 4, kept: 1,
  joiners: [{ label: 'Eve Test', manager: 'Ada Test' }], leavers: [{ label: 'Cy Test' }],
  moves: [{ label: 'Bo Test', from: 'Ada Test', to: 'Di Test' }], edits: [{ label: 'Di Test', changes: [{ field: 'title', from: 'CTO', to: 'CEO' }] }],
}

const mount = (onSynced = vi.fn()) => {
  render(<MemoryRouter><HrSyncDialog chart={{ id: 'c1', name: 'People' }} onClose={vi.fn()} onSynced={onSynced} /></MemoryRouter>)
  return { onSynced }
}

beforeEach(() => {
  for (const f of [api.get, api.post, api.put, api.delete]) vi.mocked(f).mockReset()
  useBillingStore.getState().setPlan(PLAN_BY_TIER.growth)
  useUserStore.setState({ permission: 'admin' })
})

describe('HrSyncDialog (R-78)', () => {
  it('on a plan without the feature, shows what it unlocks and calls nothing', () => {
    useBillingStore.getState().setPlan(PLAN_BY_TIER.starter)
    mount()
    expect(screen.getByTestId('locked-hr-sync')).toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalled()
  })

  it('an admin connects with a subdomain and key; the key is sent once and cleared', async () => {
    vi.mocked(api.get).mockResolvedValue({ connected: false, available: true })
    vi.mocked(api.put).mockResolvedValue(CONNECTED)
    mount()
    fireEvent.change(await screen.findByLabelText('BambooHR subdomain'), { target: { value: 'Acme' } })
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'secret-key-1234' } })
    fireEvent.click(screen.getByRole('button', { name: /Connect/ }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/api/charts/c1/integration', { subdomain: 'acme', apiKey: 'secret-key-1234', autoSync: false }))
    expect(await screen.findByText(/key ending 1234/)).toBeInTheDocument()
    expect(screen.queryByDisplayValue('secret-key-1234')).toBeNull()
  })

  it('shows why a connection was refused', async () => {
    vi.mocked(api.get).mockResolvedValue({ connected: false, available: true })
    vi.mocked(api.put).mockRejectedValue(new ApiError(400, { error: 'bamboohr-bad-key', message: 'BambooHR refused the API key.' }))
    mount()
    fireEvent.change(await screen.findByLabelText('BambooHR subdomain'), { target: { value: 'acme' } })
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'wrong-key-0000' } })
    fireEvent.click(screen.getByRole('button', { name: /Connect/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('BambooHR refused the API key.')
  })

  it('an editor cannot connect, and is told to ask an admin', async () => {
    useUserStore.setState({ permission: 'editor' })
    vi.mocked(api.get).mockResolvedValue({ connected: false, available: true })
    mount()
    expect(await screen.findByText(/Ask a workspace admin to connect it/)).toBeInTheDocument()
    expect(screen.queryByLabelText('API key')).toBeNull()
  })

  it('says when the server cannot hold keys yet', async () => {
    vi.mocked(api.get).mockResolvedValue({ connected: false, available: false })
    mount()
    expect(await screen.findByText(/not set up on this server yet/)).toBeInTheDocument()
  })

  it('shows a held daily sync, previews every change, and applies them', async () => {
    vi.mocked(api.get).mockResolvedValue(CONNECTED)
    vi.mocked(api.post).mockImplementation(async (path: string) =>
      path.endsWith('/preview') ? PREVIEW : { result: { at: '2026-11-28T10:00:00Z', status: 'ok', trigger: 'manual', joiners: 1, leavers: 1, moves: 1, changed: 1 } })
    const { onSynced } = mount()
    expect(await screen.findByTestId('hr-last-result')).toHaveTextContent('waited for a review: 12 people would be removed')
    fireEvent.click(screen.getByRole('button', { name: /Preview changes/ }))
    expect(within(await screen.findByRole('region', { name: 'Joiners' })).getByText('Eve Test')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Leavers (removed)' })).getByText('Cy Test')).toBeInTheDocument()
    expect(screen.getByText(/Ada Test → Di Test/)).toBeInTheDocument()
    expect(screen.getByText(/Title: CTO → CEO/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Apply 4 changes' }))
    await waitFor(() => expect(onSynced).toHaveBeenCalled())
    expect(api.post).toHaveBeenCalledWith('/api/charts/c1/integration/sync', {})
  })

  it('an admin turns the daily sync on without retyping the key', async () => {
    vi.mocked(api.get).mockResolvedValue(CONNECTED)
    vi.mocked(api.put).mockResolvedValue({ ...CONNECTED, autoSync: true })
    mount()
    fireEvent.click(await screen.findByRole('checkbox', { name: /Sync every day/ }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/api/charts/c1/integration', { subdomain: 'acme', autoSync: true }))
  })
})

describe('resultLine', () => {
  it('says what the last sync did', () => {
    const at = '2026-11-27T03:41:00Z'
    expect(resultLine(null)).toBeNull()
    expect(resultLine({ at, status: 'ok', trigger: 'manual', joiners: 2, leavers: 0, moves: 1, changed: 3 })).toMatch(/^Last sync on .*: 2 joined, 0 left, 1 moved, 3 changed\.$/)
    expect(resultLine({ at, status: 'unchanged', trigger: 'scheduled' })).toMatch(/^Daily sync on .*: already up to date\.$/)
    expect(resultLine({ at, status: 'failed', trigger: 'manual', reason: 'BambooHR refused the API key.' })).toMatch(/did not finish: BambooHR refused/)
  })
})
