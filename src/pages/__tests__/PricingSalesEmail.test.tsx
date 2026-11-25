// R-63: "Talk to sales" goes to the configured address.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../lib/contact', () => ({ SUPPORT_EMAIL: 'help@example.com', SALES_EMAIL: 'sales@example.com' }))

import { PricingRoute } from '../PricingPage'

describe('Talk to sales', () => {
  it('uses the configured address', () => {
    render(<MemoryRouter><PricingRoute /></MemoryRouter>)
    expect(screen.getByTestId('talk-to-sales').getAttribute('href')).toBe('mailto:sales@example.com')
  })
})
