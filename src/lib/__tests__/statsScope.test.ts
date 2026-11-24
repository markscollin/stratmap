import { describe, it, expect } from 'vitest'
import { statsScopeLabel } from '../statsScope'

describe('statsScopeLabel (R-57)', () => {
  it('says which charts the dashboard figures cover', () => {
    expect(statsScopeLabel({ scope: 'live', chartCount: 1 })).toBe('in 1 live chart')
    expect(statsScopeLabel({ scope: 'live', chartCount: 2 })).toBe('in 2 live charts')
    expect(statsScopeLabel({ scope: 'all', chartCount: 1 })).toBe('across 1 chart')
    expect(statsScopeLabel({ scope: 'all', chartCount: 3 })).toBe('across 3 charts')
    expect(statsScopeLabel(null)).toBe('in your charts')
  })
})
