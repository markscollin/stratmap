import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom'

// The chrome around the drawer is covered elsewhere; here only the phone behaviour matters.
vi.mock('../TopNav', async () => {
  const { useUIStore } = await import('../../../store')
  const { useIsPhone } = await import('../../../hooks/useMediaQuery')
  return { TopNav: () => {
    const isPhone = useIsPhone()
    const open = useUIStore(s => s.setMobileNavOpen)
    return <div>{isPhone && <button data-testid="nav-menu" onClick={() => open(true)}>menu</button>}</div>
  } }
})
vi.mock('../WorkspaceSwitcher', () => ({ WorkspaceSwitcher: () => null }))
vi.mock('../../../features/billing/PaymentBanner', () => ({ PaymentBanner: () => null }))
vi.mock('../../../features/billing/ChartLimitBanner', () => ({ ChartLimitBanner: () => null }))

import { Layout } from '../Layout'
import { useUIStore } from '../../../store'
import { installMatchMedia, setScreen, removeMatchMedia } from '../../../test/matchMedia'

function Go({ to }: { to: string }) { const nav = useNavigate(); return <button onClick={() => nav(to)}>go {to}</button> }

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<div>dash <Go to="/roles" /></div>} />
          <Route path="/roles" element={<div>roles page</div>} />
          <Route path="/charts" element={<div>charts page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => { installMatchMedia(); setScreen('desktop'); useUIStore.setState({ mobileNavOpen: false }); sessionStorage.clear() })
afterEach(removeMatchMedia)

describe('Layout on a desktop screen', () => {
  it('shows the sidebar, no drawer and no desktop hint', () => {
    renderAt('/roles')
    expect(screen.getByTestId('sidebar')).toBeTruthy()
    expect(screen.queryByTestId('nav-menu')).toBeNull()
    expect(screen.queryByTestId('desktop-hint')).toBeNull()
  })
})

describe('Layout on a phone (roadmap 2.8)', () => {
  beforeEach(() => setScreen('phone'))

  it('hides the sidebar and opens it as a drawer from the menu button', () => {
    renderAt('/dashboard')
    expect(screen.queryByTestId('sidebar')).toBeNull()
    expect(screen.queryByTestId('nav-drawer')).toBeNull()
    fireEvent.click(screen.getByTestId('nav-menu'))
    expect(screen.getByRole('dialog', { name: 'Navigation' })).toBeTruthy()
    expect(screen.getByTestId('nav-drawer')).toBeTruthy()
    expect(screen.getByText('Org Charts')).toBeTruthy() // full labels, never the collapsed icon rail
  })

  it('closes on the backdrop, on Escape and when you pick a page', () => {
    renderAt('/dashboard')
    fireEvent.click(screen.getByTestId('nav-menu'))
    fireEvent.click(screen.getByTestId('nav-backdrop'))
    expect(screen.queryByTestId('nav-drawer')).toBeNull()

    fireEvent.click(screen.getByTestId('nav-menu'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByTestId('nav-drawer')).toBeNull()

    fireEvent.click(screen.getByTestId('nav-menu'))
    fireEvent.click(screen.getByText('Org Charts'))
    expect(screen.queryByTestId('nav-drawer')).toBeNull()
    expect(screen.getByText('charts page')).toBeTruthy()
  })

  it('closes when the route changes some other way', () => {
    renderAt('/dashboard')
    fireEvent.click(screen.getByTestId('nav-menu'))
    fireEvent.click(screen.getByText('go /roles', { exact: false }) as HTMLElement)
    expect(screen.queryByTestId('nav-drawer')).toBeNull()
  })

  it('closes if the screen grows past phone width', () => {
    renderAt('/dashboard')
    fireEvent.click(screen.getByTestId('nav-menu'))
    setScreen('desktop')
    expect(screen.queryByTestId('nav-drawer')).toBeNull()
    expect(screen.getByTestId('sidebar')).toBeTruthy()
  })

  it('says desktop-first pages work best on a larger screen, once per session', () => {
    const first = renderAt('/roles')
    expect(screen.getByTestId('desktop-hint')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByTestId('desktop-hint')).toBeNull()
    first.unmount()
    renderAt('/roles')
    expect(screen.queryByTestId('desktop-hint')).toBeNull()
  })

  it('does not nag on pages that are built for phones', () => {
    renderAt('/charts')
    expect(screen.queryByTestId('desktop-hint')).toBeNull()
  })
})
