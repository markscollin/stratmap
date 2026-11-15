import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// R-36: what ships to production, and what keeps it up to date.
const root = join(__dirname, '../../..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { dependencies: Record<string, string>; devDependencies: Record<string, string> }

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    if (name === 'node_modules' || name === '__tests__') return []
    return statSync(p).isDirectory() ? sourceFiles(p) : /\.tsx?$/.test(name) ? [p] : []
  })
}

describe('dependencies (R-36)', () => {
  it('@vercel/node is a dev dependency, which is only safe while api/ and src/ use it for types', () => {
    expect(pkg.dependencies['@vercel/node']).toBeUndefined()
    expect(pkg.devDependencies['@vercel/node']).toBeDefined()
    const valueImports = [...sourceFiles(join(root, 'api')), ...sourceFiles(join(root, 'src'))]
      .filter(f => /^import (?!type)[^\n]*from '@vercel\/node'/m.test(readFileSync(f, 'utf8')))
    expect(valueImports).toEqual([]) // a runtime import would need it installed in production
  })

  it('the TipTap packages move together (a mix of versions breaks the editor and npm\'s peer rules)', () => {
    const versions = Object.entries(pkg.dependencies).filter(([k]) => k.startsWith('@tiptap/')).map(([, v]) => v)
    expect(versions.length).toBeGreaterThan(3)
    expect(new Set(versions).size).toBe(1)
  })

  it('Dependabot is configured for npm and for the GitHub workflows', () => {
    const yml = readFileSync(join(root, '.github/dependabot.yml'), 'utf8')
    expect(yml).toMatch(/package-ecosystem: npm/)
    expect(yml).toMatch(/package-ecosystem: github-actions/)
    expect(yml).toMatch(/interval: weekly/)
  })
})
