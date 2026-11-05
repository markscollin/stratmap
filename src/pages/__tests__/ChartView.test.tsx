import { describe, it, expect, beforeEach, vi } from 'vitest'
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

