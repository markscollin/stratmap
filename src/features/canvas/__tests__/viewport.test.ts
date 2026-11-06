import { describe, it, expect } from 'vitest'
import { viewRect, visibleNodeIds, edgeInView, movedPositions, shouldVirtualize, shouldUseChips, VIRTUALIZE_ABOVE, CHIP_BELOW_SCALE } from '../viewport'
import { NODE_W, NODE_H } from '../../nodes/nodeSize'

const here = { x: 0, y: 0, scale: 1 }
const vp = { w: 1000, h: 600 }
const noMargin = (t = here) => viewRect(t, vp, 0)

describe('thresholds', () => {
  it('big charts (more than 300 roles) are virtualised, 300 itself is not', () => {
    expect(VIRTUALIZE_ABOVE).toBe(300)
    expect(shouldVirtualize(300)).toBe(false)
    expect(shouldVirtualize(301)).toBe(true)
  })
  it('chips only for big charts that are zoomed far out', () => {
    expect(shouldUseChips(1000, CHIP_BELOW_SCALE - 0.01)).toBe(true)
    expect(shouldUseChips(1000, CHIP_BELOW_SCALE)).toBe(false)
    expect(shouldUseChips(50, 0.05)).toBe(false) // a small chart always gets full cards
  })
})

describe('viewRect', () => {
  it('is the screen at 100% zoom with no pan', () => {
    expect(noMargin()).toEqual({ x0: 0, y0: 0, x1: 1000, y1: 600 })
  })
  it('follows pan and zoom', () => {
    // panned left/up by 200/100 screen px and zoomed to 50%: the screen shows chart x 400..2400, y 200..1400
    expect(noMargin({ x: -200, y: -100, scale: 0.5 })).toEqual({ x0: 400, y0: 200, x1: 2400, y1: 1400 })
  })
  it('the margin is in screen pixels, so it covers fewer chart units when zoomed in', () => {
    const r = viewRect({ x: 0, y: 0, scale: 2 }, vp, 100)
    expect(r.x0).toBe(-50)
    expect(r.x1).toBe((1000 + 100) / 2)
  })
})

describe('visibleNodeIds', () => {
  const nodes = [
    { id: 'in', x: 100, y: 100 },
    { id: 'edgeLeft', x: -NODE_W + 1, y: 100 },       // overlaps the left edge by 1 unit
    { id: 'justOutLeft', x: -NODE_W - 1, y: 100 },
    { id: 'far', x: 5000, y: 5000 },
    { id: 'below', x: 100, y: 600 + 1 },
  ]
  it('keeps roles that touch the view and drops the rest', () => {
    expect([...visibleNodeIds(nodes, noMargin())].sort()).toEqual(['edgeLeft', 'in'])
  })
  it('a margin pulls in roles just off screen, so panning never shows a blank edge', () => {
    const ids = visibleNodeIds(nodes, viewRect(here, vp, 240))
    expect(ids.has('justOutLeft')).toBe(true)
    expect(ids.has('below')).toBe(true)
    expect(ids.has('far')).toBe(false)
  })
  it('zoomed out far enough, everything is visible', () => {
    // panned a little and at 10%: the screen shows chart x -1000..9000, y -1000..5000, which holds all five
    expect(visibleNodeIds(nodes, viewRect({ x: 100, y: 100, scale: 0.1 }, vp, 0)).size).toBe(nodes.length)
  })
})

describe('edgeInView', () => {
  const r = noMargin()
  it('draws a line when either end is on screen', () => {
    expect(edgeInView({ x: 100, y: 100 }, { x: 9000, y: 9000 }, r)).toBe(true)
    expect(edgeInView({ x: 9000, y: 9000 }, { x: 100, y: 100 }, r)).toBe(true)
  })
  it('draws a line that crosses the screen even though both ends are off it', () => {
    expect(edgeInView({ x: -3000, y: 300 }, { x: 4000, y: 300 }, r)).toBe(true)
    expect(edgeInView({ x: 300, y: -3000 }, { x: 300, y: 4000 }, r)).toBe(true)
  })
  it('skips a line wholly off screen', () => {
    expect(edgeInView({ x: 5000, y: 5000 }, { x: 6000, y: 5600 }, r)).toBe(false)
    expect(edgeInView({ x: -5000, y: 100 }, { x: -4000, y: 100 }, r)).toBe(false)
  })
  it('a line that leaves a role at its bottom edge counts from there', () => {
    // source card's bottom is below the view top even though its top is above it
    expect(edgeInView({ x: 100, y: -NODE_H - 50 }, { x: 100, y: -NODE_H - 10 }, r)).toBe(false)
    expect(edgeInView({ x: 100, y: -NODE_H + 10 }, { x: 100, y: -5 }, r)).toBe(true)
  })
})

describe('movedPositions', () => {
  const synced = new Map([['a', { x: 0, y: 0 }], ['b', { x: 10, y: 10 }]])
  it('sends only roles that moved', () => {
    expect(movedPositions([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 15, y: 10 }], synced)).toEqual([{ id: 'b', x: 15, y: 10 }])
  })
  it('sends nothing when nothing moved', () => {
    expect(movedPositions([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 10, y: 10 }], synced)).toEqual([])
  })
  it('sends roles the server has not seen positions for', () => {
    expect(movedPositions([{ id: 'new', x: 1, y: 2 }], synced)).toEqual([{ id: 'new', x: 1, y: 2 }])
  })
})
