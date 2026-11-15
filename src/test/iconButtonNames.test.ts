// Launch review R-32 (item 2): every button, link or role="button" whose content is only an icon must have an accessible name
// (aria-label, aria-labelledby or title). This reads the source of every component with the TypeScript parser, so a new unnamed
// icon button fails the build instead of reaching a screen-reader user as "button".
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

const NAME_ATTRS = new Set(['aria-label', 'aria-labelledby', 'title'])

/** Names of the components imported from an icon library (lucide-react), plus raw <svg>. */
function iconNames(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>(['svg'])
  sf.forEachChild(n => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier) && n.moduleSpecifier.text === 'lucide-react') {
      const nb = n.importClause?.namedBindings
      if (nb && ts.isNamedImports(nb)) nb.elements.forEach(el => names.add(el.name.text))
    }
  })
  return names
}

function tagName(el: ts.JsxOpeningLikeElement): string { return el.tagName.getText() }

function attrNames(el: ts.JsxOpeningLikeElement): Set<string> {
  const out = new Set<string>()
  el.attributes.properties.forEach(a => {
    if (ts.isJsxAttribute(a)) out.add(a.name.getText())
    else out.add('...spread') // a spread may carry a name; treated as named so we do not guess
  })
  return out
}

/** True when the children are only icons (and whitespace): nothing a screen reader could read. */
function onlyIcons(children: readonly ts.JsxChild[], icons: Set<string>): boolean {
  let sawIcon = false
  for (const c of children) {
    if (ts.isJsxText(c)) { if (c.text.trim()) return false; continue }
    if (ts.isJsxSelfClosingElement(c) && icons.has(tagName(c))) { sawIcon = true; continue }
    if (ts.isJsxElement(c) && icons.has(tagName(c.openingElement)) && onlyIcons(c.children, icons)) { sawIcon = true; continue }
    return false // an expression, a nested element with text, a fragment, ...: assume it can carry text
  }
  return sawIcon
}

export function findUnnamedIconButtons(source: string, fileName = 'x.tsx'): string[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const icons = iconNames(sf)
  const found: string[] = []
  const visit = (n: ts.Node) => {
    if (ts.isJsxElement(n)) {
      const open = n.openingElement
      const tag = tagName(open)
      const attrs = attrNames(open)
      const isControl = tag === 'button' || tag === 'a' || (attrs.has('role') && /role=["']button["']/.test(open.getText()))
      if (isControl && ![...NAME_ATTRS].some(a => attrs.has(a)) && !attrs.has('...spread') && onlyIcons(n.children, icons)) {
        const { line } = sf.getLineAndCharacterOfPosition(open.getStart())
        found.push(`${fileName}:${line + 1} <${tag}> contains only an icon and has no aria-label`)
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return found
}

describe('icon-only buttons have accessible names', () => {
  it('the scanner itself finds an unnamed icon button, and accepts named ones', () => {
    const bad = `import { X } from 'lucide-react'\nexport const A = () => <button onClick={f}><X size={16} /></button>`
    expect(findUnnamedIconButtons(bad)).toHaveLength(1)
    const ok = [
      `import { X } from 'lucide-react'\nexport const A = () => <button aria-label="Close"><X /></button>`,
      `import { X } from 'lucide-react'\nexport const A = () => <button title="Close"><X /></button>`,
      `import { X } from 'lucide-react'\nexport const A = () => <button><X /> Close</button>`,
      `import { X } from 'lucide-react'\nexport const A = () => <button>{label}<X /></button>`,
      `import { X } from 'lucide-react'\nexport const A = () => <button {...props}><X /></button>`,
      `export const A = () => <button>Close</button>`,
    ]
    for (const src of ok) expect(findUnnamedIconButtons(src), src).toEqual([])
  })

  it('every component in src/', () => {
    const problems = files('src').flatMap(f => findUnnamedIconButtons(fs.readFileSync(f, 'utf8'), f))
    expect(problems, `\n${problems.join('\n')}\n`).toEqual([])
  })
})
