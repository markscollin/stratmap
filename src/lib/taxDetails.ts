// How prices are shown with respect to VAT (R-60, D-6: not a launch blocker; tax is off until this and STRIPE_AUTOMATIC_TAX are set).
//   'inclusive' : the £ prices on the pricing page include VAT (Stripe prices with tax behaviour "inclusive");
//   'exclusive' : VAT is added on top at checkout (Stripe prices with tax behaviour "exclusive", Stripe Tax on, STRIPE_AUTOMATIC_TAX=1);
//   null        : the pricing page says nothing about VAT.
// Change the Stripe prices' tax behaviour to match in the same release (docs/BILLING.md, "Stripe dashboard setup" step 4).
export type PriceTaxMode = 'inclusive' | 'exclusive' | null

export const PRICE_TAX_MODE: PriceTaxMode = null

/** The line under the plan cards, or null while undecided. */
export function priceTaxNote(mode: PriceTaxMode = PRICE_TAX_MODE): string | null {
  if (mode === 'inclusive') return 'Prices include VAT where it applies.'
  if (mode === 'exclusive') return 'Prices exclude VAT. Where VAT applies, it is added at checkout based on your billing address.'
  return null
}
