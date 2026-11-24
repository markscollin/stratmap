import { describe, it, expect } from 'vitest'
import { priceTaxNote, PRICE_TAX_MODE } from '../taxDetails'

// D-6: the pricing page says whether prices include VAT only once the owner has decided.
describe('priceTaxNote', () => {
  it('says nothing while undecided, and the right thing for each decision', () => {
    expect(priceTaxNote(null)).toBeNull()
    expect(priceTaxNote('inclusive')).toBe('Prices include VAT where it applies.')
    expect(priceTaxNote('exclusive')).toMatch(/exclude VAT.*added at checkout/)
  })
  it('is undecided in the repository until the owner fills it in', () => {
    expect([null, 'inclusive', 'exclusive']).toContain(PRICE_TAX_MODE)
  })
})
