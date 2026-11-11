import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../../lib/apiClient', () => ({ api: { get: vi.fn().mockResolvedValue({ snapshots: [], limit: 50 }), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, ApiError: class extends Error {} }))

import { OrgChart } from '../OrgChart'
import { useUserStore } from '../../../store/userStore'
import { useBillingStore, PLAN_BY_TIER } from '../../../store/billingStore'
import { installMatchMedia, setScreen, removeMatchMedia } from '../../../test/matchMedia'

// A view-only canvas (viewers, commenters, phones) pans when you drag on it. That must not swallow clicks on the
// toolbar: before this was fixed a viewer could not open the filter, export or history buttons.
const setPointerCapture = vi.fn()
beforeEach(() => {
  installMatchMedia(); setScreen('desktop')
  setPointerCapture.mockClear()
  HTMLElement.prototype.setPointerCapture = setPointerCapture
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never
  useUserStore.setState({ permission: 'viewer' })
  useBillingStore.setState({ plan: PLAN_BY_TIER.growth })
})
afterEach(removeMatchMedia)

const renderChart = (readOnly: boolean) => render(
  <MemoryRouter><OrgChart chartId="c1" chartName="Org" initialNodes={[]} initialEdges={[]} departments={[]} readOnly={readOnly} onVersionRestored={() => {}} commentCounts={{}} /></MemoryRouter>,
)

describe('a view-only canvas', () => {
  it('a press on a toolbar button is not a pan, so the click reaches the button (history opens)', async () => {
    renderChart(true)
    const button = screen.getByTitle('Version history')
    fireEvent.pointerDown(button, { button: 0, pointerId: 1 })
    expect(setPointerCapture).not.toHaveBeenCalled()
    fireEvent.click(button)
    expect(await screen.findByTestId('history-panel')).toBeInTheDocument()
  })

  it('a press on the empty canvas still pans', () => {
    const { container } = renderChart(true)
    const canvas = container.firstElementChild as HTMLElement
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1 })
    expect(setPointerCapture).toHaveBeenCalledTimes(1)
  })

  it('the History button is offered to a viewer, and only where the page can reload the chart (not on a public share page)', () => {
    const { unmount } = renderChart(true)
    expect(screen.getByTitle('Version history')).toBeInTheDocument()
    unmount()
    render(<MemoryRouter><OrgChart chartId="c1" chartName="Org" initialNodes={[]} initialEdges={[]} departments={[]} readOnly /></MemoryRouter>)
    expect(screen.queryByTitle('Version history')).toBeNull()
  })
})
