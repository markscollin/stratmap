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

export async function exportAsPNG(el: HTMLElement, filename: string, opts: CaptureOptions = {}): Promise<void> {
  const canvas = await captureElement(el, opts)
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
