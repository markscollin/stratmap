import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// The canvas is heavy and tested elsewhere; here only what SharePage hands to it matters.
const orgChartProps = vi.fn()
vi.mock('../../features/canvas/OrgChart', () => ({
  OrgChart: (props: Record<string, unknown>) => { orgChartProps(props); return <div data-testid="canvas" /> },
}))

import { SharePage } from '../SharePage'

const base = { name: 'Q3 Plan', nodes: [], edges: [], departments: [] }

function mockShare(body: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...base, ...body }), { status: 200 })))
}
function renderShare() {
  return render(
    <MemoryRouter initialEntries={['/share/abcdefghij123456']}>
      <Routes><Route path="/share/:token" element={<SharePage />} /></Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => orgChartProps.mockClear())
afterEach(() => vi.unstubAllGlobals())

describe('SharePage branding (roadmap 2.6)', () => {
  it('Free workspace: shows "Made with StratMap" linking to the landing page, and marks PNG exports', async () => {
    mockShare({ branding: true })
    renderShare()
    const link = await screen.findByTestId('share-branding')
    expect(link.getAttribute('href')).toBe('/')
    expect(screen.getByText('Made with')).toBeTruthy()
    expect(orgChartProps).toHaveBeenLastCalledWith(expect.objectContaining({ brandExports: true }))
  })

  it('paid workspace: no mark, no PNG watermark, but Privacy and Terms stay', async () => {
    mockShare({ branding: false })
    renderShare()
    await waitFor(() => expect(screen.getByTestId('canvas')).toBeTruthy())
    expect(screen.queryByTestId('share-branding')).toBeNull()
    expect(screen.queryByText('Made with')).toBeNull()
    expect(screen.getByText('Privacy')).toBeTruthy()
    expect(screen.getByText('Terms')).toBeTruthy()
    expect(orgChartProps).toHaveBeenLastCalledWith(expect.objectContaining({ brandExports: false }))
  })

  it('an older response without the flag keeps the mark', async () => {
    mockShare({})
    renderShare()
    expect(await screen.findByTestId('share-branding')).toBeTruthy()
  })
})
