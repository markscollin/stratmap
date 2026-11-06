import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('../../lib/apiClient', () => ({ api: { get: vi.fn() }, ApiError: class extends Error {} }))
const orgChart = vi.fn()
vi.mock('../../features/canvas/OrgChart', () => ({
  OrgChart: (props: Record<string, unknown>) => { orgChart(props); return <div data-testid="canvas" /> },
}))

import { api } from '../../lib/apiClient'
import { CanvasView } from '../CanvasView'
import { useUserStore } from '../../store/userStore'
import { useChartStore } from '../../store'
import { useBillingStore, PLAN_BY_TIER } from '../../store/billingStore'
import { installMatchMedia, setScreen, removeMatchMedia } from '../../test/matchMedia'
import { resetChartRevisions } from '../../lib/chartRevision'
import type { Permission } from '../../types'

const CHART = { id: 'c1', name: 'Q3 Plan', status: 'draft', version: 1, isSample: false, nodes: [], edges: [], departments: [] }

function renderChart(permission: Permission) {
  useUserStore.setState({ permission })
  return render(
    <MemoryRouter initialEntries={['/charts/c1']}>
      <Routes><Route path="/charts/:id" element={<CanvasView />} /></Routes>
    </MemoryRouter>,
  )
}
const lastProps = () => orgChart.mock.calls[orgChart.mock.calls.length - 1][0] as { readOnly: boolean }

beforeEach(() => {
  installMatchMedia(); setScreen('desktop'); resetChartRevisions()
  orgChart.mockClear()
  vi.mocked(api.get).mockReset().mockResolvedValue(CHART)
  useChartStore.setState({ charts: [], loaded: true, loading: false })
  useBillingStore.getState().setPlan(PLAN_BY_TIER.growth)
})
afterEach(removeMatchMedia)

describe('CanvasView', () => {
  it('on a desktop an editor gets an editable canvas and no phone note', async () => {
    renderChart('editor')
    await waitFor(() => expect(screen.getByTestId('canvas')).toBeTruthy())
    expect(lastProps().readOnly).toBe(false)
    expect(screen.queryByTestId('phone-view-only')).toBeNull()
  })

  it('on a phone even an editor gets a view-only canvas, with a note saying why (roadmap 2.8)', async () => {
    setScreen('phone')
    renderChart('editor')
    await waitFor(() => expect(screen.getByTestId('canvas')).toBeTruthy())
    expect(lastProps().readOnly).toBe(true)
    expect(screen.getByTestId('phone-view-only').textContent).toMatch(/view only on phones/i)
    expect(screen.getByLabelText('All charts')).toBeTruthy()
    expect(screen.getByText('Q3 Plan')).toBeTruthy()
  })

  it('a viewer on a phone gets no "edit elsewhere" note (they could not edit anyway)', async () => {
    setScreen('phone')
    renderChart('viewer')
    await waitFor(() => expect(screen.getByTestId('canvas')).toBeTruthy())
    expect(lastProps().readOnly).toBe(true)
    expect(screen.queryByTestId('phone-view-only')).toBeNull()
  })

  it('turning the phone sideways into tablet width makes it editable again', async () => {
    setScreen('phone')
    renderChart('editor')
    await waitFor(() => expect(lastProps()?.readOnly).toBe(true))
    setScreen('desktop')
    await waitFor(() => expect(lastProps().readOnly).toBe(false))
  })

  it('a viewer on a desktop is still read-only', async () => {
    renderChart('viewer')
    await waitFor(() => expect(screen.getByTestId('canvas')).toBeTruthy())
    expect(lastProps().readOnly).toBe(true)
  })
})
