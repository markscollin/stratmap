import { describe, it, expect } from 'vitest'
import { pinchTransform, midpoint, distance, MIN_SCALE, MAX_SCALE } from '../pinch'

const start = { x: 100, y: 50, scale: 1 }

describe('pinchTransform', () => {
  it('spreading the fingers zooms in by the ratio of their spacing', () => {
    const t = pinchTransform(start, { x: 200, y: 200 }, 100, { x: 200, y: 200 }, 200)
    expect(t.scale).toBe(2)
  })

  it('pinching in zooms out', () => {
    expect(pinchTransform(start, { x: 200, y: 200 }, 200, { x: 200, y: 200 }, 100).scale).toBe(0.5)
  })

  it('keeps the point under the fingers fixed while zooming', () => {
    const startMid = { x: 200, y: 200 }
    const chartPoint = { x: (startMid.x - start.x) / start.scale, y: (startMid.y - start.y) / start.scale }
    const t = pinchTransform(start, startMid, 100, startMid, 300)
    expect(chartPoint.x * t.scale + t.x).toBeCloseTo(startMid.x)
    expect(chartPoint.y * t.scale + t.y).toBeCloseTo(startMid.y)
  })

  it('moving both fingers together pans without changing the zoom', () => {
    const t = pinchTransform(start, { x: 200, y: 200 }, 100, { x: 230, y: 180 }, 100)
    expect(t.scale).toBe(1)
    expect(t.x).toBe(start.x + 30)
    expect(t.y).toBe(start.y - 20)
  })

  it('never zooms past the limits', () => {
    expect(pinchTransform(start, { x: 0, y: 0 }, 10, { x: 0, y: 0 }, 10_000).scale).toBe(MAX_SCALE)
    expect(pinchTransform(start, { x: 0, y: 0 }, 10_000, { x: 0, y: 0 }, 1).scale).toBe(MIN_SCALE)
  })

  it('ignores a zero starting spacing instead of dividing by it', () => {
    expect(pinchTransform(start, { x: 0, y: 0 }, 0, { x: 5, y: 5 }, 50)).toEqual(start)
  })

  it('helpers: midpoint and distance', () => {
    expect(midpoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 })
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })
})
