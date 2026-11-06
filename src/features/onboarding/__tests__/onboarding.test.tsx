import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../../lib/apiClient', () => ({ api: { get: vi.fn(), put: vi.fn(), post: vi.fn() }, ApiError: class extends Error {} }))
const navigate = vi.fn()
vi.mock('react-router-dom', async () => ({ ...(await vi.importActual<typeof import('react-router-dom')>('react-router-dom')), useNavigate: () => navigate }))

import { api } from '../../../lib/apiClient'
import { useUserStore } from '../../../store/userStore'
import { useChartStore, countOwnCharts, SAMPLE_CHART_NAME } from '../../../store/chartStore'
import { useBillingStore, PLAN_BY_TIER } from '../../../store/billingStore'
import { usePlanLimits } from '../../../hooks/usePlanLimits'
import { renderHook } from '@testing-library/react'
import { OnboardingChecklist } from '../OnboardingChecklist'
import { DashboardEmpty } from '../DashboardEmpty'
import { SampleChartBanner } from '../SampleChartBanner'
import { EmptyCanvasCard } from '../EmptyCanvasCard'
import type { Permission, OrgChart } from '../../../types'

const chart = (over: Partial<OrgChart> = {}): OrgChart => ({
  id: 'c1', name: 'Q3', status: 'draft', version: 1, isPublic: false, departments: [], nodes: [], edges: [],
  owner: 'a', creator: 'a', collaborators: [], createdAt: '2026-01-01', updatedAt: '2026-01-01', ...over,
})
const realCreateSampleChart = useChartStore.getState().createSampleChart
const as = (permission: Permission) => useUserStore.setState({ permission })
const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)
const state = (steps: Partial<Record<'chart' | 'invite' | 'share', boolean>> = {}, extra: Record<string, unknown> = {}) => {
  const s = { chart: false, invite: false, share: false, ...steps }
  return { steps: s, complete: s.chart && s.invite && s.share, dismissed: false, ...extra }
}

beforeEach(() => {
  vi.mocked(api.get).mockReset(); vi.mocked(api.put).mockReset().mockResolvedValue({}); vi.mocked(api.post).mockReset()
  navigate.mockReset()
  as('owner')
  useChartStore.setState({ charts: [], loaded: true, loading: false, createSampleChart: realCreateSampleChart })
  useBillingStore.getState().setPlan(PLAN_BY_TIER.free)
})

describe('OnboardingChecklist', () => {
  it('shows the three steps with progress, ticked from the server', async () => {
    vi.mocked(api.get).mockResolvedValue(state({ chart: true }))
    wrap(<OnboardingChecklist />)
    expect(await screen.findByTestId('onboarding-checklist')).toBeTruthy()
    expect(screen.getByTestId('checklist-progress').textContent).toBe('1 of 3 done')
    expect(screen.getByTestId('checklist-chart').getAttribute('data-done')).toBe('true')
    expect(screen.getByTestId('checklist-invite').getAttribute('data-done')).toBe('false')
    expect(api.get).toHaveBeenCalledWith('/api/workspace/onboarding')
  })

  it('a done step has no button; an open one navigates to where you do it', async () => {
    vi.mocked(api.get).mockResolvedValue(state({ chart: true }))
    wrap(<OnboardingChecklist />)
    await screen.findByTestId('onboarding-checklist')
    expect(screen.queryByRole('button', { name: 'Open charts' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }))
    expect(navigate).toHaveBeenCalledWith('/settings')
  })

  it('is hidden once everything is done, or when dismissed', async () => {
    vi.mocked(api.get).mockResolvedValue(state({ chart: true, invite: true, share: true }))
    const { unmount } = wrap(<OnboardingChecklist />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(screen.queryByTestId('onboarding-checklist')).toBeNull()
    unmount()
    vi.mocked(api.get).mockResolvedValue(state({}, { dismissed: true }))
    wrap(<OnboardingChecklist />)
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
    expect(screen.queryByTestId('onboarding-checklist')).toBeNull()
  })

  it('is hidden for people who cannot edit, and does not even ask the server', () => {
    as('viewer')
    wrap(<OnboardingChecklist />)
    expect(screen.queryByTestId('onboarding-checklist')).toBeNull()
    expect(api.get).not.toHaveBeenCalled()
  })

  it('admins can hide it for the workspace; editors cannot', async () => {
    vi.mocked(api.get).mockResolvedValue(state())
    const first = wrap(<OnboardingChecklist />)
    fireEvent.click(await screen.findByTestId('checklist-dismiss'))
    expect(api.put).toHaveBeenCalledWith('/api/workspace/onboarding', { dismissed: true })
    expect(screen.queryByTestId('onboarding-checklist')).toBeNull()
    first.unmount()

    as('editor')
    wrap(<OnboardingChecklist />)
    await screen.findByTestId('onboarding-checklist')
    expect(screen.queryByTestId('checklist-dismiss')).toBeNull()
  })

  it('puts it back if hiding fails on the server', async () => {
    vi.mocked(api.get).mockResolvedValue(state())
    vi.mocked(api.put).mockRejectedValue(new Error('boom'))
    wrap(<OnboardingChecklist />)
    fireEvent.click(await screen.findByTestId('checklist-dismiss'))
    expect(await screen.findByTestId('onboarding-checklist')).toBeTruthy()
  })

  it('stays out of the way if the request fails', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('down'))
    wrap(<OnboardingChecklist />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(screen.queryByTestId('onboarding-checklist')).toBeNull()
  })
})

describe('DashboardEmpty', () => {
  it('offers create, import and a sample', () => {
    wrap(<DashboardEmpty />)
    fireEvent.click(screen.getByTestId('dashboard-empty-new'))
    expect(navigate).toHaveBeenLastCalledWith('/charts?new=1')
    fireEvent.click(screen.getByTestId('dashboard-empty-import'))
    expect(navigate).toHaveBeenLastCalledWith('/charts?import=1')
    expect(screen.getByTestId('dashboard-empty-sample')).toBeTruthy()
  })

  it('"sample" creates the sample chart and opens it', async () => {
    const create = vi.fn().mockResolvedValue(chart({ id: 'sample-1', isSample: true }))
    useChartStore.setState({ createSampleChart: create })
    wrap(<DashboardEmpty />)
    fireEvent.click(screen.getByTestId('dashboard-empty-sample'))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/charts/sample-1'))
  })

  it('viewers get a plain message, not buttons that would be refused', () => {
    as('viewer')
    wrap(<DashboardEmpty />)
    expect(screen.queryByTestId('dashboard-empty-new')).toBeNull()
    expect(screen.getByTestId('dashboard-empty').textContent).toMatch(/edit access/)
  })
})

describe('SampleChartBanner', () => {
  it('says it is sample data and asks twice before deleting', () => {
    const onDelete = vi.fn()
    render(<SampleChartBanner canDelete onDelete={onDelete} />)
    expect(screen.getByTestId('sample-banner').textContent).toMatch(/sample data/i)
    fireEvent.click(screen.getByTestId('sample-delete'))
    expect(onDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('sample-delete-confirm'))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('"Keep it" backs out', () => {
    const onDelete = vi.fn()
    render(<SampleChartBanner canDelete onDelete={onDelete} />)
    fireEvent.click(screen.getByTestId('sample-delete'))
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(screen.queryByTestId('sample-delete-confirm')).toBeNull()
    expect(screen.getByTestId('sample-delete')).toBeTruthy()
  })

  it('people who cannot delete a chart are told to ask an admin, with no delete button', () => {
    render(<SampleChartBanner canDelete={false} onDelete={vi.fn()} />)
    expect(screen.queryByTestId('sample-delete')).toBeNull()
    expect(screen.getByTestId('sample-banner').textContent).toMatch(/ask a workspace admin/i)
  })
})

describe('EmptyCanvasCard', () => {
  it('offers to add a role or import', () => {
    const onAdd = vi.fn(), onImport = vi.fn()
    render(<EmptyCanvasCard onAdd={onAdd} onImport={onImport} />)
    fireEvent.click(screen.getByTestId('empty-add-role'))
    fireEvent.click(screen.getByTestId('empty-import'))
    expect(onAdd).toHaveBeenCalled()
    expect(onImport).toHaveBeenCalled()
  })

  it('is left out of exports', () => {
    render(<EmptyCanvasCard onAdd={vi.fn()} onImport={vi.fn()} />)
    expect(screen.getByTestId('empty-canvas').hasAttribute('data-export-ignore')).toBe(true)
  })
})

describe('sample charts in the store', () => {
  it('createSampleChart posts the 5-role starter flagged as a sample', async () => {
    vi.mocked(api.post).mockResolvedValue({ id: 's1', name: SAMPLE_CHART_NAME, status: 'draft', isSample: true, createdAt: 'x', updatedAt: 'x' })
    const created = await useChartStore.getState().createSampleChart()
    const [url, body] = vi.mocked(api.post).mock.calls[0] as [string, Record<string, unknown>]
    expect(url).toBe('/api/charts')
    expect(body).toMatchObject({ name: SAMPLE_CHART_NAME, isSample: true })
    expect((body.templateNodes as unknown[]).length).toBe(5)
    expect(created?.isSample).toBe(true)
  })

  it('an ordinary chart is not sent as a sample', async () => {
    vi.mocked(api.post).mockResolvedValue({ id: 'c', name: 'X', status: 'draft', createdAt: 'x', updatedAt: 'x' })
    await useChartStore.getState().createChart('X', [], [], [])
    expect(vi.mocked(api.post).mock.calls[0][1]).not.toHaveProperty('isSample')
  })

  it('the sample does not count toward the plan: one real chart plus a sample is not "at the limit" twice over', () => {
    expect(countOwnCharts([chart(), chart({ id: 's', isSample: true })])).toBe(1)
    useChartStore.setState({ charts: [chart({ id: 's', isSample: true })] })
    const { result } = renderHook(() => usePlanLimits())
    expect(result.current.isAtChartLimit()).toBe(false)   // Free allows 1 and only the sample exists
    useChartStore.setState({ charts: [chart({ id: 's', isSample: true }), chart()] })
    expect(renderHook(() => usePlanLimits()).result.current.isAtChartLimit()).toBe(true)
  })
})
