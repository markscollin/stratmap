// D-6: once the owner sets how prices relate to VAT, the pricing page says so under the plan cards.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../lib/taxDetails', async () => {
  const actual = await vi.importActual<typeof import('../../lib/taxDetails')>('../../lib/taxDetails')
  return { ...actual, priceTaxNote: () => actual.priceTaxNote('exclusive') }
})

import { PricingRoute } from '../PricingPage'

describe('pricing page VAT line', () => {
  it('shows the decided wording', () => {
    render(<MemoryRouter><PricingRoute /></MemoryRouter>)
    expect(screen.getByTestId('price-tax-note')).toHaveTextContent('Prices exclude VAT')
  })
})
