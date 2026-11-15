import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// The canvas is heavy and tested elsewhere; here only what SharePage hands to it matters.
const orgChartProps = vi.fn()
vi.mock('../../features/canvas/OrgChart', () => ({
  OrgChart: (props: Record<string, unknown>) => { orgChartProps(props); return <div data-testid="canvas" /> },
}))

import { SharePage } from '../SharePage'
import { installMatchMedia, setScreen, removeMatchMedia } from '../../test/matchMedia'

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

describe('SharePage on a phone (roadmap 2.8)', () => {
  beforeEach(() => { installMatchMedia(); setScreen('phone') })
  afterEach(removeMatchMedia)

  it('puts the title above the canvas and the footer below it, so nothing floats over the chart', async () => {
    mockShare({ branding: true })
    renderShare()
    const footer = await screen.findByTestId('share-footer')
    expect(footer.style.position).not.toBe('absolute')
    expect(screen.getByText('Q3 Plan')).toBeTruthy()
    expect(screen.getByText('View only')).toBeTruthy()
    expect(screen.getByTestId('canvas')).toBeTruthy()
    // header, canvas, footer in that order
    const root = footer.parentElement!
    const kids = [...root.children]
    expect(kids.indexOf(footer)).toBe(kids.length - 1)
  })

  it('keeps the paid/Free branding rule', async () => {
    mockShare({ branding: false })
    renderShare()
    await screen.findByTestId('share-footer')
    expect(screen.queryByTestId('share-branding')).toBeNull()
    expect(screen.getByText('Privacy')).toBeTruthy()
  })

  it('on a desktop the footer floats over the canvas as before', async () => {
    setScreen('desktop')
    mockShare({ branding: true })
    renderShare()
    expect((await screen.findByTestId('share-footer')).style.position).toBe('absolute')
  })
})

describe('SharePage links (R-25, R-26)', () => {
  function renderAt(token: string) {
    return render(
      <MemoryRouter initialEntries={[`/share/${token}`]}>
        <Routes><Route path="/share/:token" element={<SharePage />} /></Routes>
      </MemoryRouter>,
    )
  }

  it('a long legacy URL token is refused without being decoded or sent anywhere', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    renderAt('H4sIAAAAAAAAA' + 'x'.repeat(400))
    expect(await screen.findByText(/no longer supported/i)).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(screen.queryByTestId('canvas')).toBeNull()
  })

  it('an unknown, private, revoked or expired link shows one message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
    renderAt('abcdefghij123456')
    expect(await screen.findByText(/not available/i)).toBeInTheDocument()
  })

  it('isShareCode accepts the codes the server issues and nothing else', async () => {
    const { isShareCode } = await import('../../lib/shareCode')
    expect(isShareCode('abcDEF1234567890')).toBe(true)
    expect(isShareCode('a'.repeat(33))).toBe(false)
    expect(isShareCode('has space')).toBe(false)
    expect(isShareCode('')).toBe(false)
  })
})
