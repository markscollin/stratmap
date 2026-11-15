// Launch review R-42 item 2: a div, span, img, li or similar with an onClick is invisible to the keyboard and to screen readers unless
// it also has a role and tabIndex (or is a real button/link). iconButtonNames.test.ts only looks at <button>/<a>; this looks at the rest.
// Two honest exceptions are allowed, each marked in the source with `data-a11y-ok="reason"` on the element:
//   - a backdrop that only closes a dialog that already closes on Escape, and
//   - a wrapper whose onClick only stops a click reaching the backdrop.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

function files(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'test') files(p, out) }
    else if (e.name.endsWith('.tsx') && !e.name.endsWith('.test.tsx')) out.push(p)
  }
  return out
}

const NATIVE = new Set(['button', 'a', 'input', 'select', 'textarea', 'summary', 'label', 'option'])
const CLICK = new Set(['onClick', 'onMouseDown', 'onPointerDown'])

export function findClickableNonButtons(source: string, fileName = 'x.tsx'): string[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found: string[] = []
  const check = (el: ts.JsxOpeningLikeElement) => {
    const tag = el.tagName.getText()
    if (!/^[a-z]/.test(tag) || NATIVE.has(tag)) return // components are checked where their <button> is built
    const names = new Set<string>()
    let spread = false
    el.attributes.properties.forEach(a => { if (ts.isJsxAttribute(a)) names.add(a.name.getText()); else spread = true })
    if (![...CLICK].some(c => names.has(c))) return
    if (names.has('data-a11y-ok') || spread) return
    if (names.has('role') && names.has('tabIndex')) return
    const { line } = sf.getLineAndCharacterOfPosition(el.getStart())
    found.push(`${fileName}:${line + 1} <${tag}> has a click handler but no role and tabIndex (use a <button>, or mark data-a11y-ok="why")`)
  }
  const visit = (n: ts.Node) => {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) check(n)
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return found
}

describe('clickable non-buttons', () => {
  it('the scanner flags a clickable div and accepts the allowed shapes', () => {
    expect(findClickableNonButtons(`export const A = () => <div onClick={f}>x</div>`)).toHaveLength(1)
    expect(findClickableNonButtons(`export const A = () => <img onClick={f} />`)).toHaveLength(1)
    for (const ok of [
      `export const A = () => <div role="button" tabIndex={0} onClick={f}>x</div>`,
      `export const A = () => <button onClick={f}>x</button>`,
      `export const A = () => <div data-a11y-ok="backdrop; Escape closes" onClick={f} />`,
      `export const A = () => <Card onClick={f} />`,
      `export const A = () => <div>x</div>`,
    ]) expect(findClickableNonButtons(ok), ok).toEqual([])
  })

  it('every component in src/', () => {
    const problems = files('src').flatMap(f => findClickableNonButtons(fs.readFileSync(f, 'utf8'), f))
    expect(problems, `\n${problems.join('\n')}\n`).toEqual([])
  })
})
