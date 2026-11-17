// Launch review R-46: a failed load of the dashboard figures, headcount plans, role templates or departments must say so with a Retry.
// It must never look like "no data" (zeros, an empty board, an empty library, an empty department list).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../lib/apiClient', () => {
  class ApiError extends Error {}
  return { ApiError, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }
})
vi.mock('../../components/ui/MiniChartThumb', () => ({ MiniChartThumb: () => null }))

import { api } from '../../lib/apiClient'
import { Dashboard } from '../Dashboard'
import { HeadcountView } from '../HeadcountView'
import { RolesView } from '../RolesView'
import { ChartView } from '../ChartView'
import { useChartStore } from '../../store/chartStore'
import { useHeadcountStore } from '../../store/headcountStore'
import { useTemplateStore } from '../../store/templateStore'
import { useWorkspaceDepartmentStore } from '../../store/workspaceDepartmentStore'
import { useBillingStore, PLAN_BY_TIER } from '../../store/billingStore'
import { useUserStore } from '../../store/userStore'
import { useToastStore } from '../../store/toastStore'

const YEAR = new Date().getFullYear()
const PLAN = {
  id: 'hp-1', workspaceId: 'ws', title: 'Platform Engineer', departmentId: null, departmentName: null, departmentColour: null,
  roleType: 'new-headcount', targetQuarter: `${YEAR}-Q2`, chartId: null, status: 'planned', notes: null,
  createdBy: 'u', createdAt: '2026-01-01', updatedAt: '2026-01-01',
}
const TEMPLATE = { id: 't-1', title: 'Senior Engineer', department: 'Engineering', tags: [], responsibilities: '', requirements: '', uses: 0, createdBy: 'u', updatedAt: '2026-01-01' }
const DEPT = { id: 'd-1', workspaceId: 'ws', name: 'Engineering', colour: '#0EA5E9' }
const STATS = { totalHeadcount: 12, totalOpen: 3, deptBreakdown: [], roleTypeBreakdown: {} }
const CHART = {
  id: 'c1', name: 'Q3 Plan', status: 'draft' as const, version: 1, isPublic: false, departments: [], nodes: [], edges: [],
  owner: 'A', creator: 'A', collaborators: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', nodeCount: 3,
}

/** One reply per call, in order; the last one repeats. An Error rejects. */
const queues = new Map<string, unknown[]>()
function reply(path: string, ...items: unknown[]) { queues.set(path, items) }
const FAIL = () => new Error('Failed to fetch')

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  queues.clear()
  reply('/api/workspace/onboarding', { steps: { chart: true, invite: true, share: true }, complete: true, dismissed: true })
  vi.mocked(api.get).mockImplementation(((path: string) => {
    const q = queues.get(path) ?? [{}]
    const item = q.length > 1 ? q.shift() : q[0]
    return item instanceof Error ? Promise.reject(item) : Promise.resolve(item)
  }) as never)
  vi.mocked(api.post).mockReset()
  useChartStore.setState({ charts: [CHART], loaded: true, loading: false, error: false })
  useHeadcountStore.setState({ plans: [], loading: false, loaded: false, error: false })
  useTemplateStore.setState({ templates: {}, loading: false, loaded: false, error: false })
  useWorkspaceDepartmentStore.setState({ departments: [], loading: false, loaded: false, error: false })
  useBillingStore.setState({ plan: PLAN_BY_TIER.growth })
  useUserStore.setState({ permission: 'admin' })
  useToastStore.setState({ toasts: [] } as never)
})

const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('Dashboard figures', () => {
  it('a failed stats load says so with Retry (no zeros, no endless dashes), and Retry recovers', async () => {
    reply('/api/workspace/stats', FAIL(), STATS)
    reply('/api/headcount', [PLAN])
    wrap(<Dashboard />)
    expect(await screen.findByTestId('load-error')).toHaveTextContent("Couldn't load your dashboard figures")
    expect(screen.queryByText('Total headcount')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Retry/ }))
    expect(await screen.findByText('Total headcount')).toBeInTheDocument()
    expect(screen.queryByTestId('load-error')).toBeNull()
    expect(within(screen.getByText('Total headcount').parentElement as HTMLElement).getByText('12')).toBeInTheDocument()
  })

  it('a failed headcount load also says so, instead of showing "0 planned hires"', async () => {
    reply('/api/workspace/stats', STATS)
    reply('/api/headcount', FAIL(), [PLAN])
    wrap(<Dashboard />)
    expect(await screen.findByTestId('load-error')).toHaveTextContent("Couldn't load your dashboard figures")
    expect(screen.queryByText('Planned hires')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Retry/ }))
    expect(await screen.findByText('Planned hires')).toBeInTheDocument()
    expect(screen.queryByTestId('load-error')).toBeNull()
  })

  it('with both loads working there is no error', async () => {
    reply('/api/workspace/stats', STATS)
    reply('/api/headcount', [])
    wrap(<Dashboard />)
    expect(await screen.findByText('Total headcount')).toBeInTheDocument()
    expect(screen.queryByTestId('load-error')).toBeNull()
  })
})

describe('Headcount page', () => {
  it('a failed load shows the error with Retry, not an empty board or an Add hire button, and Retry recovers', async () => {
    reply('/api/headcount', FAIL(), [PLAN])
    reply('/api/workspace/departments', [DEPT])
    wrap(<HeadcountView />)
    expect(await screen.findByTestId('load-error')).toHaveTextContent("Couldn't load your headcount plans")
    expect(screen.queryByRole('button', { name: /Add hire/ })).toBeNull()
    expect(screen.queryByText(/^Q2 /)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Retry/ }))
    expect(await screen.findByText('Platform Engineer')).toBeInTheDocument()
    expect(screen.queryByTestId('load-error')).toBeNull()
    expect(screen.getAllByRole('button', { name: /Add hire/ }).length).toBeGreaterThan(0)
  })

  it('a load that works with no plans shows the empty board, not an error', async () => {
    reply('/api/headcount', [])
    wrap(<HeadcountView />)
    expect(await screen.findAllByRole('button', { name: /Add hire/ })).not.toHaveLength(0)
    expect(screen.queryByTestId('load-error')).toBeNull()
  })
})

describe('Role template library', () => {
  it('a failed load shows the error with Retry, not "No role templates yet", and Retry recovers', async () => {
    reply('/api/templates', FAIL(), [TEMPLATE])
    reply('/api/workspace/departments', [DEPT])
    wrap(<RolesView />)
    expect(await screen.findByTestId('load-error')).toHaveTextContent("Couldn't load your template library")
    expect(screen.queryByText('No role templates yet')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Retry/ }))
    expect(await screen.findByText('Senior Engineer')).toBeInTheDocument()
    expect(screen.queryByTestId('load-error')).toBeNull()
  })

  it('an empty library that loaded fine still says "No role templates yet"', async () => {
    reply('/api/templates', [])
    wrap(<RolesView />)
    expect(await screen.findByText('No role templates yet')).toBeInTheDocument()
    expect(screen.queryByTestId('load-error')).toBeNull()
  })

  it('the template form says departments could not be loaded, with Retry, and recovers', async () => {
    reply('/api/templates', [TEMPLATE])
    reply('/api/workspace/departments', FAIL(), [DEPT])
    wrap(<RolesView />)
    await screen.findByText('Senior Engineer')
    await waitFor(() => expect(useWorkspaceDepartmentStore.getState().error).toBe(true))

    fireEvent.click(screen.getAllByRole('button', { name: /New template/ })[0])
    const dialog = await screen.findByRole('dialog')
    const note = within(dialog).getByTestId('inline-load-error')
    expect(note).toHaveTextContent("Couldn't load departments")
    expect(within(dialog).queryByText('No departments yet')).toBeNull()

    fireEvent.click(within(note).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(within(dialog).queryByTestId('inline-load-error')).toBeNull())
    expect(within(dialog).getByRole('option', { name: 'Engineering' })).toBeInTheDocument()
  })
})

describe('New blank chart', () => {
  it('is not created when the workspace departments could not be loaded: the modal stays open and a toast says why', async () => {
    reply('/api/workspace/departments', FAIL())
    const createChart = vi.fn().mockResolvedValue(null)
    useChartStore.setState({ createChart } as never)
    useUserStore.setState({ permission: 'editor' })
    wrap(<ChartView />)

    fireEvent.click(screen.getAllByRole('button', { name: /new chart/i })[0])
    fireEvent.change(await screen.findByLabelText('Chart name'), { target: { value: 'Plan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create chart' }))

    await waitFor(() => expect(useToastStore.getState().toasts.some(t => /Couldn't load your departments/.test(t.message))).toBe(true))
    expect(createChart).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('is created when the departments load', async () => {
    reply('/api/workspace/departments', [DEPT])
    const createChart = vi.fn().mockResolvedValue({ id: 'new' })
    useChartStore.setState({ createChart } as never)
    useUserStore.setState({ permission: 'editor' })
    wrap(<ChartView />)

    fireEvent.click(screen.getAllByRole('button', { name: /new chart/i })[0])
    fireEvent.change(await screen.findByLabelText('Chart name'), { target: { value: 'Plan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create chart' }))

    await waitFor(() => expect(createChart).toHaveBeenCalledTimes(1))
  })
})
