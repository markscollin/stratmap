// Launch review R-32 (item 3): the secondary text colours must be readable (WCAG AA, 4.5:1) on every background they sit on,
// in both themes. `--dim` used to be about 2.3:1.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'

const css = fs.readFileSync('src/styles/globals.css', 'utf8')

function block(selector: RegExp): Record<string, string> {
  const m = selector.exec(css)
  if (!m) throw new Error(`no block for ${selector}`)
  const body = css.slice(m.index + m[0].length, css.indexOf('}', m.index))
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)].map(x => [x[1], x[2]]))
}
const dark = block(/:root\s*\{/)
const light = { ...dark, ...block(/:root\[data-theme='light'\]\s*\{/) }

function lum(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('theme contrast (WCAG AA 4.5:1 for text)', () => {
  it('the helper matches known values', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 0)
    expect(contrast('#777777', '#FFFFFF')).toBeCloseTo(4.48, 1)
  })

  for (const [name, theme] of [['dark', dark], ['light', light]] as const) {
    for (const text of ['text', 'muted', 'dim']) {
      for (const bg of ['bg', 'surface', 'raised']) {
        it(`${name}: --${text} on --${bg}`, () => {
          expect(contrast(theme[text], theme[bg]), `${theme[text]} on ${theme[bg]}`).toBeGreaterThanOrEqual(4.5)
        })
      }
    }
    it(`${name}: --dim stays quieter than --muted, which stays quieter than --text`, () => {
      const against = theme.surface
      expect(contrast(theme.dim, against)).toBeLessThan(contrast(theme.muted, against))
      expect(contrast(theme.muted, against)).toBeLessThan(contrast(theme.text, against))
    })
  }
})
