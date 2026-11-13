import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { NotFoundPage } from '../NotFoundPage'
import { useUserStore } from '../../store/userStore'

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/dashboard" element={<p>dashboard</p>} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  </MemoryRouter>,
)

// Launch review R-15: an unknown URL used to render a blank page.
describe('NotFoundPage', () => {
  beforeEach(() => { useUserStore.setState({ isAuthenticated: false }) })

  it('says the page was not found and links to the home page for a visitor', () => {
    renderAt('/nope')
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to the home page' })).toHaveAttribute('href', '/')
    expect(document.title).toMatch(/not found/i)
  })

  it('links a signed-in person to their dashboard', () => {
    useUserStore.setState({ isAuthenticated: true })
    renderAt('/nope')
    expect(screen.getByRole('link', { name: 'Go to your dashboard' })).toHaveAttribute('href', '/dashboard')
  })

  it('is what an unknown URL shows, and a known one is not swallowed by it', () => {
    renderAt('/dashboard')
    expect(screen.getByText('dashboard')).toBeInTheDocument()
    expect(screen.queryByText('Page not found')).toBeNull()
  })
})
