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
