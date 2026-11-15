import { describe, it, expect } from 'vitest'
import { buildReportingIndex, navTarget, panToReveal, readingOrder, roleAriaLabel, isNavKey } from '../keyboardNav'

//        ceo
//     /   |    \
//   cto  cfo   coo        (x order: cto 0, cfo 300, coo 600)
//  /   \
// dev1  dev2
const nodes = [
  { id: 'ceo', x: 300, y: 0 },
  { id: 'coo', x: 600, y: 200 }, { id: 'cto', x: 0, y: 200 }, { id: 'cfo', x: 300, y: 200 },
  { id: 'dev2', x: 250, y: 400 }, { id: 'dev1', x: -50, y: 400 },
  { id: 'solo', x: 900, y: 0 },
]
const edges = [
  { sourceId: 'ceo', targetId: 'coo' }, { sourceId: 'ceo', targetId: 'cto' }, { sourceId: 'ceo', targetId: 'cfo' },
  { sourceId: 'cto', targetId: 'dev2' }, { sourceId: 'cto', targetId: 'dev1' },
]
const index = buildReportingIndex(nodes, edges)

describe('arrow keys follow the reporting lines', () => {
  it('Up goes to the manager, nothing above a top-level role', () => {
    expect(navTarget(index, 'dev1', 'ArrowUp')).toBe('cto')
    expect(navTarget(index, 'cto', 'ArrowUp')).toBe('ceo')
    expect(navTarget(index, 'ceo', 'ArrowUp')).toBeNull()
  })
  it('Down goes to the leftmost direct report, nothing below a role with none', () => {
    expect(navTarget(index, 'ceo', 'ArrowDown')).toBe('cto')
    expect(navTarget(index, 'cto', 'ArrowDown')).toBe('dev1')
    expect(navTarget(index, 'cfo', 'ArrowDown')).toBeNull()
  })
  it('Left and Right move between peers under the same manager, in screen order not creation order', () => {
    expect(navTarget(index, 'cto', 'ArrowRight')).toBe('cfo')
    expect(navTarget(index, 'cfo', 'ArrowRight')).toBe('coo')
    expect(navTarget(index, 'coo', 'ArrowRight')).toBeNull()
    expect(navTarget(index, 'cfo', 'ArrowLeft')).toBe('cto')
    expect(navTarget(index, 'cto', 'ArrowLeft')).toBeNull()
    expect(navTarget(index, 'dev1', 'ArrowRight')).toBe('dev2')
  })
  it('top-level roles are peers of each other', () => {
    expect(navTarget(index, 'ceo', 'ArrowRight')).toBe('solo')
    expect(navTarget(index, 'solo', 'ArrowLeft')).toBe('ceo')
  })
  it('an unknown role goes nowhere', () => {
    expect(navTarget(index, 'ghost', 'ArrowLeft')).toBeNull()
  })
  it('lines to missing roles, to itself, and repeated lines are ignored', () => {
    const idx = buildReportingIndex(nodes, [...edges, { sourceId: 'ceo', targetId: 'nobody' }, { sourceId: 'cfo', targetId: 'cfo' }, { sourceId: 'ceo', targetId: 'cto' }])
    expect(idx.childrenOf.get('ceo')).toEqual(['cto', 'cfo', 'coo'])
    expect(idx.parentOf.get('cfo')).toBe('ceo')
  })
  it('isNavKey only accepts the four arrows', () => {
    expect(isNavKey('ArrowUp')).toBe(true)
    expect(isNavKey('Enter')).toBe(false)
  })
})

describe('Tab order', () => {
  it('is rows top to bottom, then left to right, and a few pixels of drift do not split a row', () => {
    const order = readingOrder([
      { id: 'b', x: 300, y: 3 }, { id: 'c', x: 0, y: 200 }, { id: 'a', x: 0, y: 0 },
    ]).map(n => n.id)
    expect(order).toEqual(['a', 'b', 'c'])
  })
  it('does not change the array it is given', () => {
    const input = [{ id: 'b', x: 1, y: 0 }, { id: 'a', x: 0, y: 0 }]
    readingOrder(input)
    expect(input[0].id).toBe('b')
  })
})

describe('panToReveal', () => {
  const vp = { w: 1000, h: 600 }
  it('does nothing for a role that is fully on screen', () => {
    expect(panToReveal({ id: 'a', x: 100, y: 100 }, { x: 0, y: 0, scale: 1 }, vp)).toBeNull()
  })
  it('pans just far enough for a role off to the right and below', () => {
    const t = panToReveal({ id: 'a', x: 1200, y: 700 }, { x: 0, y: 0, scale: 1 }, vp)!
    expect(1200 + t.x + 220).toBe(1000 - 32)
    expect(700 + t.y + 80).toBe(600 - 32)
    expect(t.scale).toBe(1)
  })
  it('pans the other way for a role off to the left and above, respecting zoom', () => {
    const t = panToReveal({ id: 'a', x: -500, y: -500 }, { x: 0, y: 0, scale: 0.5 }, vp)!
    expect(-500 * 0.5 + t.x).toBe(32)
    expect(-500 * 0.5 + t.y).toBe(32)
  })
  it('a role bigger than the view is centred instead of jumping between edges', () => {
    const t = panToReveal({ id: 'a', x: 0, y: 0 }, { x: 0, y: 0, scale: 10 }, vp)!
    expect(t.x + 110 * 10).toBe(500)
  })
})

describe('roleAriaLabel', () => {
  const names: Record<string, string> = { ceo: 'Ada', cto: 'Bo' }
  const nameOf = (id: string) => names[id] ?? id
  it('says who, what and where the role sits', () => {
    expect(roleAriaLabel({ id: 'cto', name: 'Bo', title: 'CTO', status: 'active' }, index, nameOf)).toBe('Bo, CTO, reports to Ada, 2 direct reports')
    expect(roleAriaLabel({ id: 'ceo', name: 'Ada', title: 'CEO', status: 'active' }, index, nameOf)).toBe('Ada, CEO, top level, 3 direct reports')
  })
  it('names the status of an open role once, and does not repeat a title used as the name', () => {
    expect(roleAriaLabel({ id: 'cfo', name: 'CFO', title: 'CFO', status: 'open' }, index, nameOf)).toBe('CFO, open, reports to Ada')
  })
  it('singular direct report', () => {
    const idx = buildReportingIndex(nodes, [{ sourceId: 'ceo', targetId: 'cto' }])
    expect(roleAriaLabel({ id: 'ceo', name: 'Ada', title: 'CEO', status: 'active' }, idx, nameOf)).toContain('1 direct report')
    expect(roleAriaLabel({ id: 'ceo', name: 'Ada', title: 'CEO', status: 'active' }, idx, nameOf)).not.toContain('reports,')
  })
})
