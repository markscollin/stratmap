// vercel.json replaces the old public/404.html redirect hack (roadmap 2.5). Vercel serves real files first and
// only then applies rewrites, so these checks cover which of the *remaining* paths each rule claims.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'

const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8')) as {
  rewrites: { source: string; destination: string }[]
  functions: Record<string, { includeFiles?: string }>
}

const spa = config.rewrites.find(r => r.destination === '/app.html')!
// Vercel's path-to-regexp group: "/(<regex>)" → anchored regex on the path without its leading slash.
const spaRegex = new RegExp(`^/(${/^\/\((.*)\)$/.exec(spa.source)![1]})$`)

describe('vercel.json rewrites', () => {
  it('sends share links to the preview function, before the catch-all', () => {
    expect(config.rewrites[0]).toEqual({ source: '/share/:code', destination: '/api/share-page?code=:code' })
  })

  it('bundles the HTML shell with the preview function', () => {
    expect(config.functions['api/share-page.ts'].includeFiles).toBe('dist/app.html')
  })

  it.each(['/dashboard', '/charts', '/charts/3f2a-uuid', '/roles', '/headcount', '/settings', '/onboarding',
    '/invite/AbC_dEf-123', '/billing/success', '/sign-in', '/sign-in/factor-one', '/sign-up', '/some/unknown/url'])(
    'app route %s falls back to the app shell', (p) => expect(spaRegex.test(p)).toBe(true))

  it.each(['/api/workspace', '/api/charts/abc/nodes', '/assets/index-abc123.js', '/favicon.svg', '/robots.txt',
    '/sitemap.xml', '/og-image.png', '/index.html', '/app.html'])(
    '%s is NOT swallowed by the app fallback', (p) => expect(spaRegex.test(p)).toBe(false))

  it('every route in the app has a home for deep links (no 404.html redirect needed any more)', () => {
    expect(fs.existsSync('public/404.html')).toBe(false)
    expect(fs.readFileSync('src/main.tsx', 'utf8')).not.toContain('spa-redirect')
  })
})
