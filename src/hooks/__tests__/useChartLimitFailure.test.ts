// A failed chart-list load used to be retried in a tight loop (each failure flipped `loading` back off, which re-ran the
// effect that fetches). Found while building the R-14 error state: it hammered the server for as long as it was down.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../lib/apiClient', async () => {
  const actual = await vi.importActual<typeof import('../../lib/apiClient')>('../../lib/apiClient')
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }
})

import { api } from '../../lib/apiClient'
import { useChartLimit } from '../useChartLimit'
import { useChartStore } from '../../store/chartStore'
import { useUserStore } from '../../store/userStore'

beforeEach(() => {
  vi.mocked(api.get).mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  useChartStore.setState({ charts: [], loaded: false, loading: false, error: false })
  useUserStore.setState({ workspace: { id: 'w' } as never })
})

describe('useChartLimit', () => {
  it('asks for the charts once, and does not retry on its own after a failure', async () => {
    vi.mocked(api.get).mockRejectedValue(new TypeError('Failed to fetch'))
    renderHook(() => useChartLimit())
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(useChartStore.getState().error).toBe(true)
  })

  it('an explicit retry asks again', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new TypeError('x')).mockResolvedValueOnce([])
    renderHook(() => useChartLimit())
    await act(async () => { await new Promise(r => setTimeout(r, 20)) })
    await act(async () => { await useChartStore.getState().fetchCharts() })
    expect(api.get).toHaveBeenCalledTimes(2)
    expect(useChartStore.getState()).toMatchObject({ loaded: true, error: false })
  })
})
