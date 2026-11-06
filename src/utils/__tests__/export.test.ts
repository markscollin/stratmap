import { describe, it, expect, vi, beforeEach } from 'vitest'

const canvasOf = (w: number, h: number) => {
  const ctx = {
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), roundRect: vi.fn(), rect: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
    fillText: vi.fn(), measureText: vi.fn(() => ({ width: 100 })),
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 0, textBaseline: '',
  }
  const canvas = { width: w, height: h, getContext: vi.fn(() => ctx), toDataURL: vi.fn(() => 'data:image/png;base64,AAAA') }
  return { canvas, ctx }
}

const captured = canvasOf(1600, 1000)
vi.mock('html-to-image', () => ({ toCanvas: vi.fn(async () => captured.canvas) }))

import { drawWatermark, exportAsPNG, WATERMARK_TEXT } from '../export'
import { showsBranding } from '../../lib/plans'

describe('drawWatermark', () => {
  it('writes "Made with StratMap" in the bottom-right corner, inside the image', () => {
    const { canvas, ctx } = canvasOf(1600, 1000)
    drawWatermark(canvas as unknown as HTMLCanvasElement)
    expect(ctx.fillText).toHaveBeenCalledTimes(1)
    const [text, x, y] = ctx.fillText.mock.calls[0] as unknown as [string, number, number]
    expect(text).toBe(WATERMARK_TEXT)
    expect(text).toBe('Made with StratMap')
    expect(x).toBeGreaterThan(1600 / 2)
    expect(y).toBeGreaterThan(1000 / 2)
    expect(x + 100).toBeLessThan(1600)
    expect(y).toBeLessThan(1000)
    const [rx, ry, rw, rh] = ctx.roundRect.mock.calls[0] as unknown as number[]
    expect(rx + rw).toBeLessThan(1600)
    expect(ry + rh).toBeLessThan(1000)
  })

  it('stays legible on tiny charts and does not balloon on huge ones', () => {
    const size = (w: number, h: number) => {
      const { canvas, ctx } = canvasOf(w, h)
      drawWatermark(canvas as unknown as HTMLCanvasElement)
      return Number(/(\d+)px/.exec(ctx.font)![1])
    }
    expect(size(300, 200)).toBeGreaterThanOrEqual(12)
    expect(size(20000, 12000)).toBeLessThanOrEqual(26)
  })

  it('falls back to a plain rectangle where roundRect is unavailable', () => {
    const { canvas, ctx } = canvasOf(800, 600)
    ;(ctx as { roundRect?: unknown }).roundRect = undefined
    drawWatermark(canvas as unknown as HTMLCanvasElement)
    expect(ctx.rect).toHaveBeenCalled()
    expect(ctx.fillText).toHaveBeenCalled()
  })

  it('does nothing if the canvas has no 2d context', () => {
    expect(() => drawWatermark({ width: 10, height: 10, getContext: () => null } as unknown as HTMLCanvasElement)).not.toThrow()
  })
})

describe('exportAsPNG', () => {
  beforeEach(() => { captured.ctx.fillText.mockClear(); vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {}) })

  it('stamps the mark when asked (Free plan)', async () => {
    await exportAsPNG(document.createElement('div'), 'chart', { watermark: true })
    expect(captured.ctx.fillText).toHaveBeenCalledWith('Made with StratMap', expect.any(Number), expect.any(Number))
  })

  it('leaves the image clean when not asked (paid plan)', async () => {
    await exportAsPNG(document.createElement('div'), 'chart', { watermark: false })
    await exportAsPNG(document.createElement('div'), 'chart')
    expect(captured.ctx.fillText).not.toHaveBeenCalled()
  })
})

describe('showsBranding', () => {
  it('is Free only', () => {
    expect(showsBranding('free')).toBe(true)
    expect(showsBranding('starter')).toBe(false)
    expect(showsBranding('growth')).toBe(false)
    expect(showsBranding('enterprise')).toBe(false)
  })
})
