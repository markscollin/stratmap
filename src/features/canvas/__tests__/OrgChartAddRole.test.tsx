// R-64: a new role reports to the selected role (or the chart's one top role) by default, and lands under its manager.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../../lib/apiClient', () => ({ api: { get: vi.fn().mockResolvedValue({}), post: vi.fn().mockResolvedValue({}), put: vi.fn().mockResolvedValue({}), delete: vi.fn() }, ApiError: class extends Error {} }))

import { OrgChart } from '../OrgChart'
import { useUserStore } from '../../../store/userStore'
import { useBillingStore, PLAN_BY_TIER } from '../../../store/billingStore'
import { installMatchMedia, setScreen, removeMatchMedia } from '../../../test/matchMedia'
import type { OrgNode } from '../../../types'

const role = (id: string, name: string, title: string, x: number, y: number): OrgNode => ({
  id, name, title, departmentId: 'd', managerId: null, status: 'active', employmentType: 'full-time', x, y,
})
const nodes = [role('ceo', 'Ada', 'CEO', 300, 0), role('cto', 'Bo', 'CTO', 300, 200)]
const edges = [{ id: 'e1', sourceId: 'ceo', targetId: 'cto' }]

beforeEach(() => {
  installMatchMedia(); setScreen('desktop')
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never
  useUserStore.setState({ permission: 'editor' })
  useBillingStore.setState({ plan: PLAN_BY_TIER.growth })
})
afterEach(removeMatchMedia)

const renderChart = (readOnly = false) => render(
  <MemoryRouter><OrgChart chartId="c1" chartName="Org" initialNodes={nodes} initialEdges={edges} departments={[]} readOnly={readOnly} /></MemoryRouter>,
)

describe('adding a role (R-64)', () => {
  it('the toolbar says "Add role", and with nothing selected the new role reports to the chart\'s top role', async () => {
    renderChart()
    fireEvent.click(screen.getByRole('button', { name: /^Add role$/ }))
    expect(await screen.findByText('Ada · CEO')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create role' })).toBeInTheDocument()
  })

  it('"Add direct report" on a selected role adds one under it, next to nothing else', async () => {
    renderChart()
    fireEvent.keyDown(screen.getByRole('button', { name: /^Bo,/ }), { key: 'Enter' })
    fireEvent.click(await screen.findByRole('button', { name: 'Add direct report' }))
    expect(await screen.findByText('Bo · CTO')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText(/Sarah Chen/), { target: { value: 'Cy' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. Senior Engineer'), { target: { value: 'Engineer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create role' }))
    const added = await screen.findByRole('button', { name: /^Cy, Engineer, reports to Bo/ })
    // straight under Bo, one row down (cards are placed with left/top)
    const bo = screen.getByRole('button', { name: /^Bo,/ })
    expect(added.style.left).toBe(bo.style.left)
    expect(parseFloat(added.style.top)).toBeGreaterThan(parseFloat(bo.style.top))
  })

  it('a read-only canvas offers no "Add direct report"', async () => {
    renderChart(true)
    fireEvent.keyDown(screen.getByRole('button', { name: /^Bo,/ }), { key: 'Enter' })
    expect(await screen.findByRole('button', { name: 'Close' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add direct report' })).toBeNull()
  })
})

describe('minimap (R-64)', () => {
  it('is not shown on a small chart, and is from 20 roles up', () => {
    const { unmount } = renderChart()
    expect(document.querySelector('[data-testid="minimap"]')).toBeNull()
    unmount()
    const many = Array.from({ length: 20 }, (_, i) => role(`r${i}`, `P${i}`, 'T', i * 220, 0))
    render(<MemoryRouter><OrgChart chartId="c1" chartName="Org" initialNodes={many} initialEdges={[]} departments={[]} /></MemoryRouter>)
    expect(document.querySelector('[data-testid="minimap"]')).not.toBeNull()
  })
})
