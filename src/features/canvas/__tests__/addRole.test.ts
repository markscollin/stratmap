import { describe, it, expect } from 'vitest'
import { defaultReportsTo, placeUnderManager, fitScale, ROW_GAP, COLUMN_GAP } from '../addRole'
import type { OrgNode, OrgEdge } from '../../../types'

const role = (id: string, x = 0, y = 0): OrgNode => ({ id, name: id, title: 't', departmentId: '', managerId: null, status: 'active', employmentType: 'full-time', x, y })
const line = (s: string, t: string): OrgEdge => ({ id: `${s}-${t}`, sourceId: s, targetId: t })
const SIZE = { w: 200, h: 72 }

describe('defaultReportsTo (R-64)', () => {
  it('is the selected role', () => {
    expect(defaultReportsTo([role('ceo'), role('cto')], [line('ceo', 'cto')], 'cto')).toBe('cto')
  })
  it('without a selection, the one top role of the chart', () => {
    expect(defaultReportsTo([role('ceo'), role('cto')], [line('ceo', 'cto')], null)).toBe('ceo')
    expect(defaultReportsTo([role('ceo')], [], null)).toBe('ceo')
  })
  it('nobody on an empty chart, with several top roles, or when the selection is gone', () => {
    expect(defaultReportsTo([], [], null)).toBe('')
    expect(defaultReportsTo([role('a'), role('b')], [], null)).toBe('')
    expect(defaultReportsTo([role('a'), role('b')], [], 'gone')).toBe('')
  })
})

describe('placeUnderManager (R-64)', () => {
  it('puts the first report straight under the manager, the next ones to its right', () => {
    const ceo = role('ceo', 500, 0)
    expect(placeUnderManager('ceo', [ceo], [], SIZE)).toEqual({ x: 500, y: 72 + ROW_GAP })
    const cto = role('cto', 500, 72 + ROW_GAP)
    expect(placeUnderManager('ceo', [ceo, cto], [line('ceo', 'cto')], SIZE)).toEqual({ x: 500 + 200 + COLUMN_GAP, y: 72 + ROW_GAP })
  })
  it('moves past a card that is already in the spot', () => {
    const ceo = role('ceo', 0, 0)
    const stranger = role('x', 0, 72 + ROW_GAP)
    expect(placeUnderManager('ceo', [ceo, stranger], [], SIZE)).toEqual({ x: 200 + COLUMN_GAP, y: 72 + ROW_GAP })
  })
  it('null for a manager that is not on the chart', () => {
    expect(placeUnderManager('nope', [], [], SIZE)).toBeNull()
  })
})

describe('fitScale (R-64)', () => {
  it('never zooms a small chart out below 80%, never in above 100%', () => {
    expect(fitScale(0.58, 3)).toBe(0.8)
    expect(fitScale(1.6, 3)).toBe(1)
    expect(fitScale(0.9, 3)).toBe(0.9)
  })
  it('a big chart still fits however far out that needs', () => {
    expect(fitScale(0.3, 200)).toBe(0.3)
  })
})
