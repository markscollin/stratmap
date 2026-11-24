// Launch review R-14: if the chart list cannot be loaded the Dashboard must say so, not show a page of zeros.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../lib/apiClient', async () => {
  const actual = await vi.importActual<typeof import('../../lib/apiClient')>('../../lib/apiClient')
  return { ...actual, api: { get: vi.fn().mockResolvedValue({}), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }
})

import { Dashboard } from '../Dashboard'
import { useChartStore } from '../../store/chartStore'

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })

describe('Dashboard — a failed chart list', () => {
  it('shows "Couldn\'t load your dashboard" with Retry, not zeros and not the empty welcome', () => {
    const fetchCharts = vi.fn().mockResolvedValue(undefined)
    useChartStore.setState({ charts: [], loaded: false, loading: false, error: true, fetchCharts } as never)
    render(<MemoryRouter><Dashboard /></MemoryRouter>)
    expect(screen.getByTestId('load-error')).toHaveTextContent("Couldn't load your dashboard")
    expect(screen.queryByText('Welcome to StratMap')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }))
    expect(fetchCharts).toHaveBeenCalledTimes(1)
  })
})

// R-57: with no live chart the figures cover the draft charts, and the card says so.
describe('Dashboard — which charts the figures cover', () => {
  it('shows the headcount of a draft-only workspace with "across 1 chart"', async () => {
    const { api } = await import('../../lib/apiClient')
    const { useHeadcountStore } = await import('../../store/headcountStore')
    vi.mocked(api.get).mockImplementation(async (url: string) => (url === '/api/workspace/stats'
      ? { totalHeadcount: 3, totalOpen: 0, deptBreakdown: [], roleTypeBreakdown: { 'new-headcount': 0, backfill: 0, contractor: 0, tbd: 0 }, scope: 'all', chartCount: 1 }
      : {}) as never)
    useHeadcountStore.setState({ plans: [], loaded: true, loading: false, error: false, fetch: vi.fn() } as never)
    useChartStore.setState({ charts: [{ id: 'c1', name: 'Org', status: 'draft' }], loaded: true, loading: false, error: false, fetchCharts: vi.fn() } as never)
    render(<MemoryRouter><Dashboard /></MemoryRouter>)
    expect(await screen.findByText('active roles across 1 chart')).toBeInTheDocument()
    expect(screen.getByText('unfilled across 1 chart')).toBeInTheDocument()
  })
})
