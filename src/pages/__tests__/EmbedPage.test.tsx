import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { EmbedPage } from '../EmbedPage'

vi.mock('../../features/canvas/OrgChart', () => ({
  OrgChart: (p: { chartName: string; readOnly?: boolean; initialNodes: unknown[] }) => (
    <div data-testid="chart" data-readonly={String(p.readOnly)}>{p.chartName}:{p.initialNodes.length}</div>
  ),
}))

const show = (code: string) => render(
  <MemoryRouter initialEntries={[`/embed/${code}`]}><Routes><Route path="/embed/:code" element={<EmbedPage />} /></Routes></MemoryRouter>,
)
const reply = (status: number, body: unknown = {}) => vi.fn().mockResolvedValue({ ok: status < 300, status, json: async () => body })

describe('EmbedPage', () => {
  beforeEach(() => vi.stubGlobal('fetch', reply(200)))
  afterEach(() => vi.unstubAllGlobals())

  it('shows the chart read-only, with the StratMap mark on a free workspace', async () => {
    vi.stubGlobal('fetch', reply(200, { name: 'Acme', nodes: [{}], edges: [], departments: [], branding: true }))
    show('abc123')
    expect(await screen.findByTestId('chart')).toHaveTextContent('Acme:1')
    expect(screen.getByTestId('chart')).toHaveAttribute('data-readonly', 'true')
    expect(screen.getByTestId('embed-branding')).toHaveAttribute('target', '_blank')
  })

  it('has no mark on a paid workspace', async () => {
    vi.stubGlobal('fetch', reply(200, { name: 'Acme', nodes: [], edges: [], departments: [], branding: false }))
    show('abc123')
    await screen.findByTestId('chart')
    expect(screen.queryByTestId('embed-branding')).toBeNull()
  })

  it.each([[404, 'no longer shared'], [410, 'expired'], [429, 'Too many']])('%i shows a plain message and no chart', async (status, text) => {
    vi.stubGlobal('fetch', reply(status))
    show('abc123')
    expect(await screen.findByTestId('embed-message')).toHaveTextContent(text)
    expect(screen.queryByTestId('chart')).toBeNull()
  })

  it('refuses a long legacy token without calling the server', async () => {
    const f = reply(200); vi.stubGlobal('fetch', f)
    show('x'.repeat(40))
    await waitFor(() => expect(screen.getByTestId('embed-message')).toHaveTextContent('not available'))
    expect(f).not.toHaveBeenCalled()
  })
})
