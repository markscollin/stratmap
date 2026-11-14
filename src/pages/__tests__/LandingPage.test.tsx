// Launch review R-18: the landing page must not promise more than the product does, and must say which plan each feature is on.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LandingPage } from '../LandingPage'

const mount = () => render(<MemoryRouter><LandingPage /></MemoryRouter>)

describe('LandingPage', () => {
  it('marks which plan each feature is on', () => {
    mount()
    expect(screen.getAllByTestId('feature-plan').map(e => e.textContent)).toEqual(['Free', 'Starter and up', 'Growth'])
  })

  it('mentions the trial, and does not claim real-time sync or a "collaborative" editor that does not exist', () => {
    mount()
    expect(screen.getByText(/starts with 14 days of Growth/)).toBeTruthy()
    expect(screen.queryByText(/stay in sync/i)).toBeNull()
    expect(screen.queryByText(/collaborative org chart/i)).toBeNull()
  })
})
