import { describe, it, expect } from 'vitest'
import { LEGAL, missingLegalDetails } from '../../lib/legalDetails'

// Launch gate (R-04). Skipped in the normal test run, because the owner has to supply the facts first.
// Run it with `npm run check:legal`: it fails until src/lib/legalDetails.ts is completely filled in.
// Once the details are in, add it to CI so they cannot be blanked by accident.
describe.runIf(process.env.LEGAL_GATE === '1')('legal details are filled in', () => {
  it('has every field', () => {
    expect(missingLegalDetails(), 'fill these in src/lib/legalDetails.ts').toEqual([])
  })
  it('has no placeholder-looking value', () => {
    for (const [k, v] of Object.entries(LEGAL)) expect(v, k).not.toMatch(/\[|yourdomain|example\.com|TODO/i)
  })
})
