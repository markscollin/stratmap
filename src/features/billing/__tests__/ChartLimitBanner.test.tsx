import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../../lib/apiClient', () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, ApiError: class extends Error {} }))

import { ChartLimitBanner } from '../ChartLimitBanner'
import { useChartLimit } from '../../../hooks/useChartLimit'
import { usePlanLimits } from '../../../hooks/usePlanLimits'
import { useBillingStore, PLAN_BY_TIER } from '../../../store/billingStore'
import { useChartStore } from '../../../store/chartStore'
import { useUserStore, MOCK_WORKSPACE } from '../../../store/userStore'
import type { OrgChart, Permission } from '../../../types'

function chart(i: number): OrgChart {
  return {
    id: `c${i}`, name: `Chart ${i}`, status: 'draft', version: 1, isPublic: false, departments: [], nodes: [], edges: [],
    owner: 'u', creator: 'u', collaborators: [], createdAt: '2026-11-01', updatedAt: '2026-11-01',
  }
}

function setup(tier: 'free' | 'starter' | 'growth', charts: number, permission: Permission = 'admin') {
  useUserStore.setState({ user: { id: 'u', name: 'U', email: 'u@co.com' }, permission, isAuthenticated: true, workspace: MOCK_WORKSPACE })
  useBillingStore.setState({ plan: PLAN_BY_TIER[tier] })
  useChartStore.setState({ charts: Array.from({ length: charts }, (_, i) => chart(i)), loaded: true, loading: false })
}

function renderBanner() {
  return render(<MemoryRouter><ChartLimitBanner /></MemoryRouter>)
}

beforeEach(() => { vi.clearAllMocks() })

describe('useChartLimit', () => {
  it('is at the limit but not frozen with exactly the allowed number of charts', () => {
    setup('starter', 5)
    const { result } = renderHook(() => useChartLimit())
    expect(result.current).toMatchObject({ count: 5, max: 5, atLimit: true, frozen: false })
  })

  it('is frozen with more charts than the plan allows', () => {
    setup('free', 3)
    const { result } = renderHook(() => useChartLimit())
    expect(result.current).toMatchObject({ count: 3, max: 1, frozen: true })
  })

  it('never freezes an unlimited plan', () => {
    setup('growth', 40)
    expect(renderHook(() => useChartLimit()).result.current.frozen).toBe(false)
  })

  it('does not decide before the chart list has loaded', () => {
    setup('free', 3)
    useChartStore.setState({ loaded: false, loading: true })
    expect(renderHook(() => useChartLimit()).result.current.frozen).toBe(false)
  })

  it('drives usePlanLimits().isAtChartLimit from the real chart list', () => {
    setup('free', 1)
    expect(renderHook(() => usePlanLimits()).result.current.isAtChartLimit()).toBe(true)
  })
})

describe('ChartLimitBanner', () => {
  it('renders nothing within the limit', () => {
    setup('starter', 5)
    const { container } = renderBanner()
    expect(container).toBeEmptyDOMElement()
  })

  it('tells admins how many charts to delete, with Manage charts and Upgrade', () => {
    setup('free', 3)
    renderBanner()
    expect(screen.getByRole('alert')).toHaveTextContent('Your Free plan allows 1 chart and this workspace has 3, so all charts are view-only. Delete 2 charts or upgrade to edit again.')
    expect(screen.getByText('Manage charts')).toBeInTheDocument()
    expect(screen.getByText('Upgrade')).toBeInTheDocument()
  })

  it('tells everyone else to ask an admin', () => {
    setup('free', 2, 'editor')
    renderBanner()
    expect(screen.getByRole('alert')).toHaveTextContent('Ask a workspace admin to delete charts or upgrade.')
    expect(screen.queryByText('Manage charts')).not.toBeInTheDocument()
  })
})
