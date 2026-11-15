import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { computeAccessibleName } from 'dom-accessibility-api'

const signOut = vi.fn()
vi.mock('../../../features/auth/useSignOut', () => ({ useSignOut: () => signOut }))
vi.mock('../../../features/auth/useAuth', () => ({
  IS_DEV_BYPASS: true,
  useAuth: () => ({ user: { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', initials: 'AL' }, isSignedIn: true }),
}))

import { TopNav } from '../TopNav'
import { useUIStore } from '../../../store'
import { installMatchMedia, setScreen, removeMatchMedia } from '../../../test/matchMedia'

beforeEach(() => { installMatchMedia(); setScreen('desktop'); signOut.mockClear(); localStorage.clear(); useUIStore.setState({ isDark: true }) })
afterEach(removeMatchMedia)

const renderNav = () => render(<MemoryRouter><TopNav /></MemoryRouter>)

describe('TopNav (R-32, R-34)', () => {
  it('every button has an accessible name, on desktop and on a phone', () => {
    for (const screenSize of ['desktop', 'phone'] as const) {
      setScreen(screenSize)
      const { unmount } = renderNav()
      const unnamed = screen.getAllByRole('button').filter(b => !computeAccessibleName(b).trim())
      expect(unnamed.map(b => b.outerHTML.slice(0, 80))).toEqual([])
      unmount()
    }
  })

  it('the theme button says what it will do, and it works', () => {
    renderNav()
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }))
    expect(useUIStore.getState().isDark).toBe(false)
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument()
    expect(localStorage.getItem('stratmap_theme')).toBe('light')
  })

  it('signing out is a real button, named for the person', () => {
    renderNav()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out Ada Lovelace' }))
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('has no notification bell that does nothing', () => {
    renderNav()
    expect(screen.queryByRole('button', { name: /notification/i })).toBeNull()
  })
})
