import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePlanLimits } from '../usePlanLimits'
import { useBillingStore, FREE_PLAN, STARTER_PLAN, GROWTH_PLAN } from '../../store/billingStore'
import { useChartStore } from '../../store/chartStore'
import type { OrgChart } from '../../types'

const mockChart: OrgChart = {
  id: 'chart-1',
  name: 'Test Chart',
  status: 'draft',
  version: 1,
  departments: [],
  nodes: Array(25)
    .fill(null)
    .map((_, i) => ({
      id: `node-${i}`,
      name: `Node ${i}`,
      title: 'Test Title',
      departmentId: 'dept-1',
      managerId: null,
      status: 'active' as const,
      employmentType: 'full-time' as const,
      x: 0,
      y: 0,
    })),
  edges: [],
  owner: 'owner-1',
  creator: 'creator-1',
  collaborators: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

describe('usePlanLimits', () => {
  beforeEach(() => {
    useBillingStore.setState({
      plan: FREE_PLAN,
      usage: { chartsUsed: 0, seatsUsed: 1, aiDraftsUsed: 0, aiDraftsLimit: 0 },
      isLoading: false,
    })
    useChartStore.setState({ charts: [] })
  })

  it('reports not at chart limit when free plan with 0 charts', () => {
    const { result } = renderHook(() => usePlanLimits())
    expect(result.current.isAtChartLimit()).toBe(false)
  })

  it('reports at chart limit when free plan with 1 chart', () => {
    useBillingStore.setState({ usage: { chartsUsed: 1, seatsUsed: 1, aiDraftsUsed: 0, aiDraftsLimit: 0 } })
    const { result } = renderHook(() => usePlanLimits())
    expect(result.current.isAtChartLimit()).toBe(true)
  })

  it('never reports at chart limit for growth plan', () => {
    useBillingStore.setState({ plan: GROWTH_PLAN, usage: { chartsUsed: 100, seatsUsed: 1, aiDraftsUsed: 0, aiDraftsLimit: -1 } })
    const { result } = renderHook(() => usePlanLimits())
    expect(result.current.isAtChartLimit()).toBe(false)
  })

  it('checks node limit for specific chart', () => {
    useChartStore.setState({ charts: [mockChart] })
    let { result } = renderHook(() => usePlanLimits())
    // Chart has 25 nodes, free plan limit is 30
    expect(result.current.isAtNodeLimit('chart-1')).toBe(false)
    // Add more nodes
    useChartStore.setState({
      charts: [{ ...mockChart, nodes: Array(31).fill(mockChart.nodes[0]).map((n, i) => ({ ...n, id: `node-${i}` })) }],
    })
    ;({ result } = renderHook(() => usePlanLimits()))
    expect(result.current.isAtNodeLimit('chart-1')).toBe(true)
  })

  it('reports at seat limit correctly', () => {
    let { result } = renderHook(() => usePlanLimits())
    expect(result.current.isAtSeatLimit()).toBe(false)
    useBillingStore.setState({ usage: { chartsUsed: 0, seatsUsed: 3, aiDraftsUsed: 0, aiDraftsLimit: 0 } })
    ;({ result } = renderHook(() => usePlanLimits()))
    expect(result.current.isAtSeatLimit()).toBe(true)
  })

  it('prevents AI drafting on free plan', () => {
    const { result } = renderHook(() => usePlanLimits())
    expect(result.current.canUseAIDrafting()).toBe(false)
  })

  it('allows AI drafting on starter when within quota', () => {
    useBillingStore.setState({
      plan: STARTER_PLAN,
      usage: { chartsUsed: 0, seatsUsed: 1, aiDraftsUsed: 1, aiDraftsLimit: 3 },
    })
    const { result } = renderHook(() => usePlanLimits())
    expect(result.current.canUseAIDrafting()).toBe(true)
  })

  it('prevents AI drafting on starter when at quota', () => {
    useBillingStore.setState({
      plan: STARTER_PLAN,
      usage: { chartsUsed: 0, seatsUsed: 1, aiDraftsUsed: 3, aiDraftsLimit: 3 },
    })
    const { result } = renderHook(() => usePlanLimits())
    expect(result.current.canUseAIDrafting()).toBe(false)
  })

  it('allows unlimited AI drafting on growth plan', () => {
    useBillingStore.setState({
      plan: GROWTH_PLAN,
      usage: { chartsUsed: 0, seatsUsed: 1, aiDraftsUsed: 100, aiDraftsLimit: -1 },
    })
    const { result } = renderHook(() => usePlanLimits())
    expect(result.current.canUseAIDrafting()).toBe(true)
  })

  it('tracks current tier correctly', () => {
    let { result } = renderHook(() => usePlanLimits())
    expect(result.current.currentTier).toBe('free')
    useBillingStore.setState({ plan: STARTER_PLAN })
    ;({ result } = renderHook(() => usePlanLimits()))
    expect(result.current.currentTier).toBe('starter')
  })

  it('reports upgrade requirements correctly', () => {
    const { result } = renderHook(() => usePlanLimits())
    expect(result.current.upgradeRequired('headcount-planning')).toBe(true)
    expect(result.current.upgradeRequired('pdf-export')).toBe(true)
    expect(result.current.upgradeRequired('auto-layout')).toBe(true)
  })

  it('no upgrade required for features available on current tier', () => {
    useBillingStore.setState({ plan: GROWTH_PLAN })
    const { result } = renderHook(() => usePlanLimits())
    expect(result.current.upgradeRequired('headcount-planning')).toBe(false)
    expect(result.current.upgradeRequired('pdf-export')).toBe(false)
  })
})
