import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { EmbedPage } from '../EmbedPage'

vi.mock('../../features/canvas/OrgChart', () => ({
  OrgChart: (p: { chartName: string; readOnly?: boolean; initialNodes: unknown[] }) => (
    <div data-testid="chart" data-readonly={String(p.readOnly)} data-nodes={JSON.stringify(p.initialNodes)}>{p.chartName}:{p.initialNodes.length}</div>
  ),
}))

const show = (code: string, query = '') => render(
  <MemoryRouter initialEntries={[`/embed/${code}${query}`]}><Routes><Route path="/embed/:code" element={<EmbedPage />} /></Routes></MemoryRouter>,
)
const reply = (status: number, body: unknown = {}) => vi.fn().mockResolvedValue({ ok: status < 300, status, json: async () => body })

describe('EmbedPage', () => {
  beforeEach(() => vi.stubGlobal('fetch', reply(200)))
  afterEach(() => { vi.unstubAllGlobals(); document.documentElement.removeAttribute('data-theme') })

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

  it.each([[404, 'no longer shared'], [429, 'Too many']])('%i shows a plain message and no chart', async (status, text) => {
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

  describe('embed options in the address', () => {
    const body = { name: 'Acme', nodes: [{ id: 'n1', name: 'Ada Lovelace', title: 'CTO', avatarUrl: 'https://img/a.png' }], edges: [], departments: [], branding: false }

    it('draws people as usual by default', async () => {
      vi.stubGlobal('fetch', reply(200, body))
      show('abc123')
      expect((await screen.findByTestId('chart')).getAttribute('data-nodes')).toContain('Ada Lovelace')
      expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    })

    it('names=hide draws role titles only: no name and no photo reach the chart', async () => {
      vi.stubGlobal('fetch', reply(200, body))
      show('abc123', '?names=hide')
      const nodes = (await screen.findByTestId('chart')).getAttribute('data-nodes')!
      expect(nodes).not.toContain('Ada')
      expect(nodes).not.toContain('a.png')
      expect(nodes).toContain('CTO')
    })

    it('theme=light shows the chart in the light theme, theme=dark in the dark one, whatever was saved', async () => {
      vi.stubGlobal('fetch', reply(200, body))
      show('abc123', '?theme=light')
      await screen.findByTestId('chart')
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    })

    it('theme=dark overrides a saved light theme', async () => {
      document.documentElement.setAttribute('data-theme', 'light')
      vi.stubGlobal('fetch', reply(200, body))
      show('abc123', '?theme=dark')
      await screen.findByTestId('chart')
      expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    })

    it('an unknown value is ignored', async () => {
      vi.stubGlobal('fetch', reply(200, body))
      show('abc123', '?theme=neon&names=please')
      expect((await screen.findByTestId('chart')).getAttribute('data-nodes')).toContain('Ada Lovelace')
      expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    })
  })
})
