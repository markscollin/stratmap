import { toCanvas } from 'html-to-image'
import jsPDF from 'jspdf'

const BACKGROUND = '#060D18'

interface CaptureOptions { width?: number; height?: number }

function filter(node: HTMLElement): boolean {
  return !node.hasAttribute?.('data-export-ignore')
}

async function captureElement(el: HTMLElement, opts: CaptureOptions = {}): Promise<HTMLCanvasElement> {
  return toCanvas(el, {
    backgroundColor: BACKGROUND,
    pixelRatio: 2,
    filter,
    ...opts,
  })
}

export const WATERMARK_TEXT = 'Made with StratMap'

/**
 * Stamps the "Made with StratMap" mark into the bottom-right corner of an already captured
 * canvas (roadmap 2.6). It is drawn into the pixels, not added to the page, so it is part of the image.
 * Sized from the canvas so it stays legible on small and large charts.
 */
export function drawWatermark(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const unit = Math.max(1, Math.min(canvas.width, canvas.height) / 400)   // 1 at 400px, grows with the chart
  const fontSize = Math.round(Math.min(26, Math.max(12, 12 * unit)))
  const padX = Math.round(fontSize * 0.8)
  const padY = Math.round(fontSize * 0.5)
  const margin = Math.round(fontSize * 1.1)

  ctx.save()
  ctx.font = `600 ${fontSize}px 'DM Sans Variable', system-ui, sans-serif`
  const textW = ctx.measureText(WATERMARK_TEXT).width
  const w = Math.ceil(textW + padX * 2)
  const h = Math.ceil(fontSize + padY * 2)
  const x = canvas.width - w - margin
  const y = canvas.height - h - margin

  ctx.fillStyle = 'rgba(13, 27, 42, 0.85)'
  ctx.strokeStyle = 'rgba(14, 165, 233, 0.55)'
  ctx.lineWidth = Math.max(1, fontSize / 12)
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, h / 2)
  else ctx.rect(x, y, w, h)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#F0F6FF'
  ctx.textBaseline = 'middle'
  ctx.fillText(WATERMARK_TEXT, x + padX, y + h / 2 + 1)
  ctx.restore()
}

interface PngOptions extends CaptureOptions { watermark?: boolean }

export async function exportAsPNG(el: HTMLElement, filename: string, opts: PngOptions = {}): Promise<void> {
  const { watermark, ...capture } = opts
  const canvas = await captureElement(el, capture)
  if (watermark) drawWatermark(canvas)
  const link = document.createElement('a')
  link.download = `${filename}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

export async function exportAsPDF(el: HTMLElement, filename: string, opts: CaptureOptions = {}): Promise<void> {
  const canvas = await captureElement(el, opts)
  const w = canvas.width / 2
  const h = canvas.height / 2
  const pdf = new jsPDF({
    orientation: w >= h ? 'landscape' : 'portrait',
    unit: 'px',
    format: [w, h],
    hotfixes: ['px_scaling'],
  })
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, h)
  pdf.save(`${filename}.pdf`)
}
