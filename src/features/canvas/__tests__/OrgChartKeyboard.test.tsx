import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../../lib/apiClient', () => ({ api: { get: vi.fn().mockResolvedValue({}), post: vi.fn().mockResolvedValue({}), put: vi.fn().mockResolvedValue({}), delete: vi.fn() }, ApiError: class extends Error {} }))

import { OrgChart } from '../OrgChart'
import { useUserStore } from '../../../store/userStore'
import { useBillingStore, PLAN_BY_TIER } from '../../../store/billingStore'
import { installMatchMedia, setScreen, removeMatchMedia } from '../../../test/matchMedia'
import type { OrgNode } from '../../../types'

// R-32 item 4: the canvas works without a mouse.
const role = (id: string, name: string, title: string, x: number, y: number, status: OrgNode['status'] = 'active'): OrgNode => ({
  id, name, title, departmentId: 'd', managerId: null, status, employmentType: 'full-time', x, y,
})
// Created in a scrambled order on purpose: Tab must follow the screen, not the array.
const nodes = [
  role('dev', 'Dee', 'Developer', 0, 400),
  role('cfo', 'Cy', 'CFO', 300, 200),
  role('ceo', 'Ada', 'CEO', 150, 0),
  role('cto', 'Bo', 'CTO', 0, 200),
  role('open', 'Designer', 'Designer', 300, 400, 'open'),
]
const edges = [
  { id: 'e1', sourceId: 'ceo', targetId: 'cto' }, { id: 'e2', sourceId: 'ceo', targetId: 'cfo' },
  { id: 'e3', sourceId: 'cto', targetId: 'dev' }, { id: 'e4', sourceId: 'cfo', targetId: 'open' },
]

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
const card = (name: RegExp | string) => screen.getByRole('button', { name })

describe('keyboard on the canvas', () => {
  it('every role is a focusable button that says who it is and where it sits', () => {
    renderChart()
    expect(card('Bo, CTO, reports to Ada, 1 direct report')).toHaveAttribute('tabindex', '0')
    expect(card('Ada, CEO, top level, 2 direct reports')).toBeInTheDocument()
    expect(card('Designer, open, reports to Cy')).toBeInTheDocument()
  })

  it('cards are in reading order in the DOM, whatever order the roles were created in', () => {
    renderChart()
    const names = screen.getAllByTestId('node-card').map(c => c.getAttribute('data-node-id'))
    expect(names).toEqual(['ceo', 'cto', 'cfo', 'dev', 'open'])
  })

  it('arrow keys move focus along the reporting lines', () => {
    renderChart()
    const ceo = card(/^Ada/)
    ceo.focus()
    fireEvent.keyDown(ceo, { key: 'ArrowDown' })
    expect(card(/^Bo/)).toHaveFocus() // leftmost report
    fireEvent.keyDown(card(/^Bo/), { key: 'ArrowRight' })
    expect(card(/^Cy/)).toHaveFocus() // peer
    fireEvent.keyDown(card(/^Cy/), { key: 'ArrowDown' })
    expect(card(/^Designer/)).toHaveFocus()
    fireEvent.keyDown(card(/^Designer/), { key: 'ArrowUp' })
    fireEvent.keyDown(card(/^Cy/), { key: 'ArrowUp' })
    expect(card(/^Ada/)).toHaveFocus()
  })

  it('an arrow key with nowhere to go leaves focus alone', () => {
    renderChart()
    const ceo = card(/^Ada/)
    ceo.focus()
    fireEvent.keyDown(ceo, { key: 'ArrowUp' })
    fireEvent.keyDown(ceo, { key: 'ArrowLeft' })
    expect(ceo).toHaveFocus()
  })

  it('Enter opens the role and does not close it again on a second press', async () => {
    renderChart()
    const cto = card(/^Bo/)
    cto.focus()
    expect(cto).toHaveAttribute('aria-pressed', 'false')
    fireEvent.keyDown(cto, { key: 'Enter' })
    expect(card(/^Bo/)).toHaveAttribute('aria-pressed', 'true')
    fireEvent.keyDown(card(/^Bo/), { key: ' ' })
    expect(card(/^Bo/)).toHaveAttribute('aria-pressed', 'true')
  })

  it('F2 opens the edit form for an editor, and does nothing on a view-only canvas', async () => {
    const { unmount } = renderChart()
    fireEvent.keyDown(card(/^Bo/), { key: 'F2' })
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    unmount()
    renderChart(true)
    fireEvent.keyDown(card(/^Bo/), { key: 'F2' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keys typed inside a card (a field in it) are not taken as navigation, and shortcuts with a modifier are left alone', () => {
    renderChart()
    const ceo = card(/^Ada/)
    ceo.focus()
    fireEvent.keyDown(ceo, { key: 'ArrowDown', ctrlKey: true })
    expect(ceo).toHaveFocus()
    fireEvent.keyDown(ceo.firstElementChild!, { key: 'ArrowDown' }) // target is a child, not the card
    expect(ceo).toHaveFocus()
  })

  it('arrow keys work on a view-only canvas too', () => {
    renderChart(true)
    const ceo = card(/^Ada/)
    ceo.focus()
    fireEvent.keyDown(ceo, { key: 'ArrowDown' })
    expect(card(/^Bo/)).toHaveFocus()
  })
})

// R-45 / R-49: every way of deleting a reporting line saves it, and a read-only canvas deletes nothing.
describe('deleting a reporting line (R-45, R-49)', () => {
  const lineDeletes = async () => {
    const { api } = await import('../../../lib/apiClient')
    return (api.delete as unknown as ReturnType<typeof vi.fn>)
  }
  const lineCount = (c: HTMLElement) => c.querySelectorAll('path[stroke="transparent"]').length

  it('the × on a selected line removes it AND saves the delete (it used to only hide it until the next reload)', async () => {
    const del = await lineDeletes(); del.mockClear().mockResolvedValue({})
    const { container } = renderChart()
    expect(lineCount(container)).toBe(4)
    fireEvent.click(container.querySelectorAll('path[stroke="transparent"]')[0])
    fireEvent.click(screen.getByText('×'))
    expect(lineCount(container)).toBe(3)
    await vi.waitFor(() => expect(del).toHaveBeenCalledTimes(1))
    expect(String(del.mock.calls[0][0])).toMatch(/\/api\/charts\/c1\/edges\/e\d$/)
  })

  it('a read-only canvas cannot delete a line with the × (and does not save)', async () => {
    const del = await lineDeletes(); del.mockClear()
    const { container } = renderChart(true)
    fireEvent.click(container.querySelectorAll('path[stroke="transparent"]')[0])
    const bubble = screen.queryByText('×')
    if (bubble) fireEvent.click(bubble)
    expect(lineCount(container)).toBe(4)
    expect(del).not.toHaveBeenCalled()
  })

  it('the role edit form removes an extra line from the keyboard and saves it', async () => {
    const del = await lineDeletes(); del.mockClear().mockResolvedValue({})
    const extra = [...edges, { id: 'e9', sourceId: 'cfo', targetId: 'dev' }] // Dee now has a second manager
    const { container } = render(<MemoryRouter><OrgChart chartId="c1" chartName="Org" initialNodes={nodes} initialEdges={extra} departments={[]} /></MemoryRouter>)
    const dee = card(/^Dee/)
    dee.focus()
    fireEvent.keyDown(dee, { key: 'F2' })
    const remove = await screen.findByRole('button', { name: 'Remove reporting line: Reports to Cy' })
    fireEvent.click(remove)
    await vi.waitFor(() => expect(del).toHaveBeenCalledWith('/api/charts/c1/edges/e9'))
    expect(lineCount(container)).toBe(4)
  })
})
