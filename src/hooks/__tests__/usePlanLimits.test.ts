import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePlanLimits } from '../usePlanLimits'
import { useBillingStore, FREE_PLAN, STARTER_PLAN, GROWTH_PLAN, ENTERPRISE_PLAN } from '../../store/billingStore'
import { useChartStore } from '../../store/chartStore'
import type { OrgChart } from '../../types'

const mockChart: OrgChart = {
  id: 'chart-1',
  name: 'Test Chart',
  status: 'draft',
  version: 1,
  isPublic: false,
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

  it('reports at chart limit when free plan with 1 chart (counted from the chart list)', () => {
    useChartStore.setState({ charts: [mockChart] })
    const { result } = renderHook(() => usePlanLimits())
    expect(result.current.isAtChartLimit()).toBe(true)
  })

  it('never reports at chart limit for growth plan', () => {
    useBillingStore.setState({ plan: GROWTH_PLAN, usage: { chartsUsed: 0, seatsUsed: 1, aiDraftsUsed: 0, aiDraftsLimit: -1 } })
    useChartStore.setState({ charts: Array(100).fill(mockChart) })
    const { result } = renderHook(() => usePlanLimits())
    expect(result.current.isAtChartLimit()).toBe(false)
  })

  it('checks a chart\'s node count against the plan', () => {
    const { result } = renderHook(() => usePlanLimits())
    // Free plan limit is 30 roles per chart
    expect(result.current.isAtNodeLimit(25)).toBe(false)
    expect(result.current.isAtNodeLimit(30)).toBe(true)
    expect(result.current.isAtNodeLimit(31)).toBe(true)
  })

  it('never reports at node or seat limit for enterprise plan (-1 = unlimited)', () => {
    useBillingStore.setState({
      plan: ENTERPRISE_PLAN,
      usage: { chartsUsed: 0, seatsUsed: 999, aiDraftsUsed: 0, aiDraftsLimit: -1 },
    })
    useChartStore.setState({ charts: Array(50).fill(mockChart) })
    const { result } = renderHook(() => usePlanLimits())
    expect(result.current.isAtNodeLimit(1000)).toBe(false)
    expect(result.current.isAtSeatLimit()).toBe(false)
    expect(result.current.isAtChartLimit()).toBe(false)
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

  it('allows AI drafting on the growth plan until its monthly cap (R-07: no longer unlimited)', () => {
    useBillingStore.setState({ plan: GROWTH_PLAN, usage: { chartsUsed: 0, seatsUsed: 1, aiDraftsUsed: 299, aiDraftsLimit: 300 } })
    expect(renderHook(() => usePlanLimits()).result.current.canUseAIDrafting()).toBe(true)
    useBillingStore.setState({ usage: { chartsUsed: 0, seatsUsed: 1, aiDraftsUsed: 300, aiDraftsLimit: 300 } })
    expect(renderHook(() => usePlanLimits()).result.current.canUseAIDrafting()).toBe(false)
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
    for (const f of ['jd-editor', 'approval-workflow', 'pdf-export', 'ai-drafting', 'auto-layout'] as const) {
      expect(result.current.upgradeRequired(f)).toBe(true)
      expect(result.current.hasFeature(f)).toBe(false)
    }
    // Unknown feature names are never locked
    expect(result.current.upgradeRequired('not-a-feature')).toBe(false)
  })

  it('no upgrade required for features available on current tier', () => {
    useBillingStore.setState({ plan: GROWTH_PLAN })
    const { result } = renderHook(() => usePlanLimits())
    expect(result.current.upgradeRequired('pdf-export')).toBe(false)
    expect(result.current.hasFeature('jd-editor')).toBe(true)
  })

  it('Starter unlocks job descriptions, approvals and PDF export', () => {
    useBillingStore.setState({ plan: STARTER_PLAN })
    const { result } = renderHook(() => usePlanLimits())
    expect(result.current.hasFeature('jd-editor')).toBe(true)
    expect(result.current.hasFeature('approval-workflow')).toBe(true)
    expect(result.current.hasFeature('pdf-export')).toBe(true)
    // …but headcount planning needs Growth
    expect(result.current.hasFeature('headcount-planning')).toBe(false)
  })

  it('Growth unlocks headcount planning', () => {
    useBillingStore.setState({ plan: GROWTH_PLAN })
    const { result } = renderHook(() => usePlanLimits())
    expect(result.current.hasFeature('headcount-planning')).toBe(true)
  })
})
