import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('../../../lib/apiClient', () => {
  class ApiError extends Error {
    status: number
    body: Record<string, unknown>
    constructor(status: number, body: Record<string, unknown>) { super(String(body.error)); this.status = status; this.body = body }
    get userMessage() { return typeof this.body.message === 'string' ? this.body.message : this.message }
  }
  return { ApiError, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }
})
const frozenState = { frozen: false }
vi.mock('../../../hooks/useChartLimit', () => ({ useChartLimit: () => ({ count: 1, max: 5, atLimit: false, frozen: frozenState.frozen }) }))

import { api, ApiError } from '../../../lib/apiClient'
import { HistoryPanel, type VersionRow } from '../HistoryPanel'
import { useUserStore } from '../../../store/userStore'
import { useBillingStore, PLAN_BY_TIER } from '../../../store/billingStore'
import { useToastStore } from '../../../store/toastStore'
import { useChartStore } from '../../../store'
import type { Permission } from '../../../types'

const row = (id: string, over: Partial<VersionRow> = {}): VersionRow => ({
  id, name: `Version ${id}`, kind: 'manual', createdBy: 'u-other', createdAt: new Date(Date.now() - 3_600_000).toISOString(), nodeCount: 3, edgeCount: 2, authorName: 'Grace Hopper', ...over,
})
const node = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Name ${id}`, title: `Title ${id}`, departmentId: null, status: 'active', roleType: null, employmentType: 'full-time', location: null, startDate: null, x: 0, y: 0, ...over })
const onClose = vi.fn(), onRestored = vi.fn()
let versions: VersionRow[] = []
const data: Record<string, { nodes: unknown[]; edges: unknown[]; departments: unknown[] }> = {}

function setup(permission: Permission, tier: keyof typeof PLAN_BY_TIER = 'growth', list: VersionRow[] = [row('a')]) {
  vi.clearAllMocks()
  frozenState.frozen = false
  versions = list
  vi.mocked(api.get).mockImplementation((path: string) => {
    if (path.endsWith('/snapshots')) return Promise.resolve({ snapshots: versions, limit: 50 }) as never
    const m = /\/snapshots\/([^/]+)$/.exec(path)
    if (m) return Promise.resolve({ id: m[1], data: data[m[1]] }) as never
    return Promise.resolve(data.today) as never
  })
  vi.mocked(api.post).mockResolvedValue({ id: 'new-chart' } as never)
  vi.mocked(api.delete).mockResolvedValue(undefined as never)
  useUserStore.setState({ user: { id: 'u-me', name: 'Me', email: 'me@co.com' }, permission })
  useBillingStore.setState({ plan: PLAN_BY_TIER[tier] })
  useToastStore.setState({ toasts: [] } as never)
  vi.spyOn(useChartStore.getState(), 'fetchCharts').mockResolvedValue(undefined)
  render(
    <MemoryRouter initialEntries={['/charts/c1']}>
      <Routes>
        <Route path="/charts/:id" element={<HistoryPanel chartId="c1" chartName="Org" onClose={onClose} onRestored={onRestored} />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('HistoryPanel: listing', () => {
  it('lists the versions with who, when and how many roles, and marks the automatic ones', async () => {
    setup('editor', 'growth', [row('a'), row('b', { kind: 'auto', name: 'Before restoring “x”', authorName: null, nodeCount: 1 })])
    expect(await screen.findAllByTestId('version-row')).toHaveLength(2)
    const [first, second] = screen.getAllByTestId('version-row')
    expect(first).toHaveTextContent('Version a')
    expect(first).toHaveTextContent('Grace Hopper')
    expect(first).toHaveTextContent('3 roles')
    expect(first).toHaveTextContent('1 h ago')
    expect(second).toHaveTextContent('Automatic')
    expect(second).toHaveTextContent('A former member')
    expect(second).toHaveTextContent('1 role')
    expect(api.get).toHaveBeenCalledWith('/api/charts/c1/snapshots')
  })

  it('says so when there are none yet', async () => {
    setup('editor', 'growth', [])
    expect(await screen.findByText(/No versions yet/)).toBeInTheDocument()
  })

  it('shows the server message if the list cannot be loaded', async () => {
    setup('editor')
    vi.mocked(api.get).mockRejectedValueOnce(new ApiError(500, { error: 'x', message: 'Boom' }))
    render(<MemoryRouter><HistoryPanel chartId="bad" chartName="X" onClose={onClose} onRestored={onRestored} /></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent('Boom')
  })
})

describe('HistoryPanel: who can do what', () => {
  it('a viewer can look and compare, but cannot save, restore or branch, and can delete only their own', async () => {
    setup('viewer', 'growth', [row('a'), row('mine', { createdBy: 'u-me' })])
    await screen.findAllByTestId('version-row')
    expect(screen.queryByLabelText('Version name')).toBeNull()
    expect(screen.queryByRole('button', { name: /Restore/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /New chart from this/ })).toBeNull()
    expect(screen.getAllByRole('button', { name: /Compare with today/ })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: /Delete/ })).toHaveLength(1)
  })

  it('an admin can delete anyone\'s version', async () => {
    setup('admin', 'growth', [row('a'), row('b')])
    await screen.findAllByTestId('version-row')
    expect(screen.getAllByRole('button', { name: /^Delete$/ })).toHaveLength(2)
  })

  it('without the Growth plan: explains what it unlocks, keeps existing versions readable, offers no way to change anything', async () => {
    setup('owner', 'starter')
    expect(await screen.findByTestId('locked-version-history')).toBeInTheDocument()
    expect(screen.getByText(/Save named versions of a chart/)).toBeInTheDocument()
    expect(screen.getAllByTestId('version-row')).toHaveLength(1)
    expect(screen.queryByLabelText('Version name')).toBeNull()
    expect(screen.queryByRole('button', { name: /Restore/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Compare with today/ })).toBeInTheDocument()
  })

  it('on a chart that is view-only because of the plan: can save, but cannot restore or branch', async () => {
    frozenState.frozen = true
    setup('editor')
    frozenState.frozen = true
    await screen.findAllByTestId('version-row')
    expect(screen.queryByRole('button', { name: /Restore/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /New chart from this/ })).toBeNull()
  })
})

describe('HistoryPanel: saving, restoring, branching, deleting', () => {
  it('saves a named version and shows it', async () => {
    setup('editor', 'growth', [])
    await screen.findByText(/No versions yet/)
    const save = screen.getByRole('button', { name: 'Save version' })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Version name'), { target: { value: '  Before the reorg  ' } })
    versions = [row('new', { name: 'Before the reorg' })]
    fireEvent.click(save)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/charts/c1/snapshots', { name: 'Before the reorg' }))
    expect(await screen.findByText('Before the reorg')).toBeInTheDocument()
    expect((screen.getByLabelText('Version name') as HTMLInputElement).value).toBe('')
  })

  it('restoring asks first, explains the safety copy, then restores, tells the page and closes', async () => {
    setup('editor')
    fireEvent.click(await screen.findByRole('button', { name: /Restore/ }))
    expect(screen.getByText(/saved first as an automatic version, so you can undo this/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(api.post).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Restore/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore this version' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/charts/c1/snapshots/a/restore', {}))
    await waitFor(() => expect(onRestored).toHaveBeenCalled())
    expect(onClose).toHaveBeenCalled()
  })

  it('a failed restore shows the reason and stays open', async () => {
    setup('editor')
    vi.mocked(api.post).mockRejectedValueOnce(new ApiError(409, { error: 'chart-changed', message: 'This chart was changed by someone else.' }))
    fireEvent.click(await screen.findByRole('button', { name: /Restore/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore this version' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('changed by someone else')
    expect(onRestored).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('a version becomes a new chart: the name is prefilled and editable, and you land on the new chart', async () => {
    setup('editor')
    fireEvent.click(await screen.findByRole('button', { name: /New chart from this/ }))
    const input = screen.getByLabelText('New chart name') as HTMLInputElement
    expect(input.value).toBe('Org (Version a)')
    fireEvent.change(input, { target: { value: 'Plan B' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create chart' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/charts/c1/snapshots/a/branch', { name: 'Plan B' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('deleting asks first', async () => {
    setup('admin')
    fireEvent.click(await screen.findByRole('button', { name: /^Delete$/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    expect(api.delete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/ }))
    versions = []
    fireEvent.click(screen.getByRole('button', { name: 'Delete version' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/charts/c1/snapshots/a'))
    expect(await screen.findByText(/No versions yet/)).toBeInTheDocument()
  })
})

describe('HistoryPanel: comparing', () => {
  beforeEach(() => {
    data.a = { nodes: [node('1', { name: 'Ada', title: 'CTO' }), node('2', { name: 'Bo', title: 'Dev', departmentId: 'd1' }), node('3', { name: 'Cy', title: 'Ops', status: 'open' })], edges: [{ sourceId: '1', targetId: '2' }], departments: [{ id: 'd1', name: 'Eng' }] }
    data.today = { nodes: [node('1', { name: 'Ada', title: 'CTO' }), node('2', { name: 'Bo', title: 'Senior Dev', departmentId: 'd1' }), node('4', { name: 'Dee', title: 'PM' })], edges: [{ sourceId: '1', targetId: '2' }], departments: [{ id: 'd1', name: 'Eng' }] }
  })

  it('compares a version with today: what was added, removed and changed, and the headcount', async () => {
    setup('viewer')
    fireEvent.click(await screen.findByRole('button', { name: /Compare with today/ }))
    const result = await screen.findByTestId('compare-result')
    expect(api.get).toHaveBeenCalledWith('/api/charts/c1/snapshots/a')
    expect(api.get).toHaveBeenCalledWith('/api/charts/c1')
    expect(within(result).getByTestId('diff-added')).toHaveTextContent('Dee, PM')
    expect(within(result).getByTestId('diff-removed')).toHaveTextContent('Ops (open)')
    expect(within(result).getByTestId('diff-changed')).toHaveTextContent('title: Title 2 → Senior Dev'.replace('Title 2', 'Dev'))
    expect(within(result).getByTestId('diff-roles')).toHaveTextContent('3')                       // 3 before, 3 after: no change
    expect(within(result).getByTestId('diff-open')).toHaveTextContent('1 → 0 (-1)')
    expect(result).toHaveTextContent('Version a → Today')
  })

  it('says there are no differences when there are none', async () => {
    data.today = data.a
    setup('viewer')
    fireEvent.click(await screen.findByRole('button', { name: /Compare with today/ }))
    expect(await screen.findByText(/No differences/)).toBeInTheDocument()
  })

  it('compares two saved versions, and can be closed', async () => {
    data.b = { nodes: [node('1', { name: 'Ada', title: 'CTO' })], edges: [], departments: [] }
    setup('viewer', 'growth', [row('a'), row('b')])
    fireEvent.click((await screen.findAllByRole('button', { name: /Compare with today/ }))[0])
    await screen.findByTestId('compare-result')
    fireEvent.change(screen.getByLabelText('Second version'), { target: { value: 'b' } })
    await waitFor(() => expect(screen.getByTestId('compare-result')).toHaveTextContent('Version a → Version b'))
    expect(screen.getAllByTestId('diff-removed')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Close comparison' }))
    expect(screen.queryByTestId('compare-result')).toBeNull()
  })

  it('shows the reason if the comparison cannot be loaded', async () => {
    setup('viewer')
    await screen.findAllByTestId('version-row')
    vi.mocked(api.get).mockRejectedValue(new ApiError(404, { error: 'x', message: 'Version not found' }))
    fireEvent.click(screen.getByRole('button', { name: /Compare with today/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Version not found')
    expect(screen.queryByTestId('compare-result')).toBeNull()
  })
})
