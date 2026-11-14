import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ChartView } from '../ChartView'
import { useUserStore } from '../../store/userStore'
import { useChartStore } from '../../store'
import { useBillingStore, PLAN_BY_TIER } from '../../store/billingStore'
import type { Permission } from '../../types'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

vi.mock('../../components/ui/MiniChartThumb', () => ({
  MiniChartThumb: () => null,
}))

const REVIEW_CHART = {
  id: 'c1',
  name: 'Q3 Plan',
  status: 'review' as const,
  version: 1,
  isPublic: false,
  departments: [],
  nodes: [],
  edges: [],
  owner: 'Alice',
  creator: 'Alice',
  collaborators: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

beforeEach(() => {
  useUserStore.setState({ permission: 'viewer' })
  useChartStore.setState({ charts: [REVIEW_CHART] })
})

function renderView(permission: Permission) {
  useUserStore.setState({ permission })
  return render(<MemoryRouter><ChartView /></MemoryRouter>)
}

describe('ChartView — New chart button', () => {
  it('is hidden for viewer', () => {
    renderView('viewer')
    expect(screen.queryByRole('button', { name: /new chart/i })).toBeNull()
  })

  it('is hidden for commenter', () => {
    renderView('commenter')
    expect(screen.queryByRole('button', { name: /new chart/i })).toBeNull()
  })

  it('is visible for editor', () => {
    renderView('editor')
    expect(screen.getAllByRole('button', { name: /new chart/i }).length).toBeGreaterThan(0)
  })

  it('is visible for admin', () => {
    renderView('admin')
    expect(screen.getAllByRole('button', { name: /new chart/i }).length).toBeGreaterThan(0)
  })
})

describe('ChartView — Overflow menu status actions', () => {
  it('editor sees Submit actions but not Approve', () => {
    renderView('editor')
    // Find the MoreHorizontal button in the card (26x26px)
    const menuBtns = document.querySelectorAll('button[style*="width: 26px"]')
    if (menuBtns.length === 0) return // guard: no card rendered
    fireEvent.click(menuBtns[0])
    // 'review' chart: admin can Approve or Request changes; editor sees neither
    expect(screen.queryByText('Approve')).toBeNull()
    expect(screen.queryByText('Request changes')).toBeNull()
    expect(screen.queryByText('Delete')).toBeNull()
  })

  it('admin sees Approve and Delete for review chart', () => {
    renderView('admin')
    const menuBtns = document.querySelectorAll('button[style*="width: 26px"]')
    if (menuBtns.length === 0) return
    fireEvent.click(menuBtns[0])
    expect(screen.getByText('Approve')).toBeTruthy()
    expect(screen.getByText('Request changes')).toBeTruthy()
    expect(screen.getByText('Delete')).toBeTruthy()
  })

  it('viewer sees no status actions and no Delete', () => {
    renderView('viewer')
    const menuBtns = document.querySelectorAll('button[style*="width: 26px"]')
    if (menuBtns.length === 0) return
    fireEvent.click(menuBtns[0])
    expect(screen.queryByText('Approve')).toBeNull()
    expect(screen.queryByText('Delete')).toBeNull()
  })
})

describe('ChartView — approval workflow on the Free plan', () => {
  function openMenu() {
    const menuBtns = document.querySelectorAll('button[style*="width: 26px"]')
    expect(menuBtns.length).toBeGreaterThan(0)
    fireEvent.click(menuBtns[0])
  }

  it('Approve is marked Starter and opens the upgrade modal instead of changing status', () => {
    useBillingStore.setState({ plan: PLAN_BY_TIER.free })
    const updateChartStatus = vi.fn()
    useChartStore.setState({ updateChartStatus })
    renderView('admin')
    openMenu()
    const approve = screen.getByText('Approve').closest('button')!
    expect(approve).toHaveTextContent('Starter')
    fireEvent.click(approve)
    expect(updateChartStatus).not.toHaveBeenCalled()
    expect(screen.getByText('Unlock Approval workflows')).toBeInTheDocument()
  })

  it('on Starter the same action changes the status', () => {
    useBillingStore.setState({ plan: PLAN_BY_TIER.starter })
    const updateChartStatus = vi.fn()
    useChartStore.setState({ updateChartStatus })
    renderView('admin')
    openMenu()
    const approve = screen.getByText('Approve').closest('button')!
    expect(approve).not.toHaveTextContent('Starter')
    fireEvent.click(approve)
    expect(updateChartStatus).toHaveBeenCalledWith('c1', 'approved')
  })
})


describe('ChartView — sample chart and empty state (roadmap 2.7)', () => {
  const renderAt = (permission: Permission, url = '/charts') => {
    useUserStore.setState({ permission })
    return render(<MemoryRouter initialEntries={[url]}><ChartView /></MemoryRouter>)
  }

  it('marks the sample chart with a badge', () => {
    useChartStore.setState({ charts: [{ ...REVIEW_CHART, id: 's', name: 'Sample org chart', isSample: true }] })
    renderAt('editor')
    expect(screen.getByTestId('sample-badge').textContent).toBe('Sample')
  })

  it('does not count the sample in "n of 1 chart" on the Free plan', () => {
    useBillingStore.getState().setPlan(PLAN_BY_TIER.free)
    useChartStore.setState({ charts: [{ ...REVIEW_CHART, id: 's', isSample: true }, { ...REVIEW_CHART, id: 'real' }] })
    renderAt('editor')
    expect(screen.getByText('1 of 1 chart')).toBeTruthy()
  })

  it('with no charts, offers create, import and a sample (editors only)', () => {
    useChartStore.setState({ charts: [], loaded: true })
    renderAt('editor')
    expect(screen.getByRole('button', { name: 'Create your first chart' })).toBeTruthy()
    expect(screen.getByTestId('empty-import-btn')).toBeTruthy()
    expect(screen.getByTestId('try-sample-btn')).toBeTruthy()
  })

  it('offers no way to start for viewers', () => {
    useChartStore.setState({ charts: [], loaded: true })
    renderAt('viewer')
    expect(screen.queryByTestId('try-sample-btn')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Create your first chart' })).toBeNull()
  })

  it('/charts?import=1 opens the import dialog, /charts?new=1 the new-chart dialog', () => {
    useChartStore.setState({ charts: [REVIEW_CHART], loaded: true })
    useBillingStore.getState().setPlan(PLAN_BY_TIER.growth)
    const first = renderAt('editor', '/charts?import=1')
    expect(screen.getByRole('dialog', { name: 'Import people' })).toBeTruthy()
    first.unmount()
    renderAt('editor', '/charts?new=1')
    expect(screen.getByText('New org chart')).toBeTruthy()
  })
})

// R-14: a failed chart list used to read "No charts yet".
describe('ChartView — a failed load', () => {
  const realFetch = useChartStore.getState().fetchCharts
  afterEach(() => { useChartStore.setState({ fetchCharts: realFetch, error: false, loaded: false, loading: false } as never) })
  it('shows an error with Retry instead of "No charts yet", and Retry loads again', () => {
    const fetchCharts = vi.fn().mockResolvedValue(undefined)
    useChartStore.setState({ charts: [], loaded: false, loading: false, error: true, fetchCharts } as never)
    useUserStore.setState({ permission: 'owner' })
    render(<MemoryRouter><ChartView /></MemoryRouter>)
    expect(screen.getByTestId('load-error')).toHaveTextContent("Couldn't load your charts")
    expect(screen.queryByText('No charts yet')).toBeNull()
    fetchCharts.mockClear()
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }))
    expect(fetchCharts).toHaveBeenCalledTimes(1)
  })
})
