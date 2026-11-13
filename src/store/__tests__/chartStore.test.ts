import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../lib/apiClient', () => {
  class ApiError extends Error {
    status: number
    body: Record<string, unknown>
    constructor(status: number, body: Record<string, unknown>) { super(String(body.error)); this.status = status; this.body = body }
    get userMessage() { return typeof this.body.message === 'string' ? this.body.message : this.message }
  }
  return { ApiError, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }
})

import { api, ApiError } from '../../lib/apiClient'
import { useChartStore } from '../chartStore'
import { useToastStore } from '../toastStore'
import type { OrgChart } from '../../types'

const source = { id: 'c1', name: 'Plan A', nodeCount: 5, deptCount: 2, nodes: [], edges: [], departments: [] } as unknown as OrgChart
const copyRow = { id: 'c2', name: 'Plan A (copy)', status: 'draft', version: 1, isPublic: false, ownerId: 'u', creatorId: 'u', createdAt: '2026-11-13T10:00:00Z', updatedAt: '2026-11-13T10:00:00Z' }

beforeEach(() => {
  vi.mocked(api.post).mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  useChartStore.setState({ charts: [source], loaded: true })
  useToastStore.setState({ toasts: [] })
})

// Launch review R-10: Duplicate chart copied the list's empty node arrays. The server makes the copy now.
describe('duplicateChart', () => {
  it('asks the server to copy the chart (not the empty arrays the list holds) and adds the copy to the list', async () => {
    vi.mocked(api.post).mockResolvedValue(copyRow)
    await useChartStore.getState().duplicateChart('c1')
    expect(api.post).toHaveBeenCalledTimes(1)
    expect(vi.mocked(api.post).mock.calls[0][0]).toBe('/api/charts/c1/duplicate')
    const { charts } = useChartStore.getState()
    expect(charts.map(c => c.id)).toEqual(['c2', 'c1'])
    expect(charts[0]).toMatchObject({ name: 'Plan A (copy)', status: 'draft', isPublic: false, nodeCount: 5, deptCount: 2 })
    expect(useToastStore.getState().toasts[0]).toMatchObject({ variant: 'success' })
  })

  it('shows the plan-limit message when the server refuses, and adds nothing', async () => {
    vi.mocked(api.post).mockRejectedValue(new ApiError(402, { error: 'plan-limit', message: 'Your Free plan allows 1 chart.' }))
    await useChartStore.getState().duplicateChart('c1')
    expect(useChartStore.getState().charts).toHaveLength(1)
    expect(useToastStore.getState().toasts[0]).toMatchObject({ variant: 'warning', message: 'Your Free plan allows 1 chart.' })
  })

  it('says so when the copy failed for any other reason', async () => {
    vi.mocked(api.post).mockRejectedValue(new TypeError('Failed to fetch'))
    await useChartStore.getState().duplicateChart('c1')
    expect(useChartStore.getState().charts).toHaveLength(1)
    expect(useToastStore.getState().toasts[0]).toMatchObject({ variant: 'error' })
    expect(useToastStore.getState().toasts[0].message).toMatch(/duplicate/i)
  })
})
