import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import {
  PUBLIC_PAGES, APP_PAGE, SEO_START, SEO_END, escapeHtml, siteUrl, DEFAULT_SITE_URL,
  renderSeoBlock, injectSeo, sitemapXml, robotsTxt, shareMeta, APP_ROUTE_PREFIXES,
} from '../seo'

const BASE = 'https://app.example.com'

describe('siteUrl', () => {
  it('prefers APP_URL (trailing slash removed), then the production URL, then the deployment URL, then the default', () => {
    expect(siteUrl({ APP_URL: 'https://stratmap.app/', VERCEL_PROJECT_PRODUCTION_URL: 'x.vercel.app' })).toBe('https://stratmap.app')
    expect(siteUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'prod.vercel.app', VERCEL_URL: 'dep.vercel.app' })).toBe('https://prod.vercel.app')
    expect(siteUrl({ VERCEL_URL: 'dep.vercel.app' })).toBe('https://dep.vercel.app')
    expect(siteUrl({})).toBe(DEFAULT_SITE_URL)
  })
  it('ignores a malformed APP_URL or host rather than putting it in every tag', () => {
    expect(siteUrl({ APP_URL: 'javascript:alert(1)' })).toBe(DEFAULT_SITE_URL)
    expect(siteUrl({ APP_URL: 'not a url' })).toBe(DEFAULT_SITE_URL)
    expect(siteUrl({ VERCEL_URL: 'evil.com"><script>' })).toBe(DEFAULT_SITE_URL)
  })
})

describe('renderSeoBlock', () => {
  const home = PUBLIC_PAGES[0]
  it('has title, description, canonical, Open Graph and Twitter tags with absolute URLs', () => {
    const block = renderSeoBlock(PUBLIC_PAGES[1], BASE)
    expect(block).toContain('<title>Pricing — StratMap</title>')
    expect(block).toContain('<meta name="description"')
    expect(block).toContain(`<link rel="canonical" href="${BASE}/pricing" />`)
    expect(block).toContain(`<meta property="og:url" content="${BASE}/pricing" />`)
    expect(block).toContain(`<meta property="og:image" content="${BASE}/og-image.png" />`)
    expect(block).toContain('<meta name="twitter:card" content="summary_large_image" />')
    expect(block).not.toContain('noindex')
    expect(block.startsWith(SEO_START)).toBe(true)
    expect(block.endsWith(SEO_END)).toBe(true)
  })
  it('the home page canonical is the bare origin plus a slash', () => {
    expect(renderSeoBlock(home, BASE)).toContain(`<link rel="canonical" href="${BASE}/" />`)
  })
  it('noindex pages say so and carry no canonical', () => {
    const block = renderSeoBlock(APP_PAGE, BASE)
    expect(block).toContain('<meta name="robots" content="noindex, nofollow" />')
    expect(block).not.toContain('rel="canonical"')
  })
  it('escapes everything dynamic, so a chart name cannot break out of an attribute or add a tag', () => {
    const evil = `"><script>alert(1)</script> & 'x'`
    const block = renderSeoBlock({ path: '/share/abc', title: evil, description: evil, noindex: true }, BASE)
    expect(block).not.toContain('<script>')
    expect(block).not.toMatch(/content="[^"]*"[^/>]*>[^<]*<script/)
    expect(block).toContain('&lt;script&gt;')
    expect(block).toContain('&quot;&gt;')
    expect(block).toContain('&amp;')
    expect(block).toContain('&#39;x&#39;')
  })
  it('public pages have sensible lengths for search results', () => {
    for (const p of PUBLIC_PAGES) {
      expect(p.title.length, p.path).toBeLessThanOrEqual(65)
      expect(p.description.length, p.path).toBeLessThanOrEqual(200)
      expect(p.description.length, p.path).toBeGreaterThan(20)
    }
    expect(new Set(PUBLIC_PAGES.map(p => p.title)).size).toBe(PUBLIC_PAGES.length)
  })
})

describe('injectSeo', () => {
  it('replaces only the marked block', () => {
    const html = `<head><meta charset="utf-8" />\n${SEO_START}\n<title>old</title>\n${SEO_END}\n<script></script></head>`
    const out = injectSeo(html, renderSeoBlock(PUBLIC_PAGES[2], BASE))
    expect(out).toContain('<title>Privacy Policy — StratMap</title>')
    expect(out).not.toContain('<title>old</title>')
    expect(out.startsWith('<head><meta charset="utf-8" />')).toBe(true)
    expect(out.endsWith('<script></script></head>')).toBe(true)
  })
  it('keeps "$&" and "$1" in a chart name literal', () => {
    const block = renderSeoBlock({ path: '/share/a', title: 'Cost $& $1 $`', description: 'd', noindex: true }, BASE)
    expect(injectSeo(`${SEO_START}x${SEO_END}`, block)).toContain('Cost $&amp; $1 $`')
  })
  it('fails loudly if the template lost its markers', () => {
    expect(() => injectSeo('<head></head>', 'x')).toThrow(/seo:start/)
  })
  it('the real index.html has the markers', () => {
    expect(() => injectSeo(fs.readFileSync('index.html', 'utf8'), renderSeoBlock(PUBLIC_PAGES[0], BASE))).not.toThrow()
  })
})

describe('sitemap.xml and robots.txt', () => {
  it('lists exactly the public pages with absolute URLs', () => {
    const xml = sitemapXml(BASE, '2026-11-06')
    for (const p of PUBLIC_PAGES) expect(xml).toContain(`<loc>${BASE}${p.path}</loc>`)
    expect(xml.match(/<url>/g)).toHaveLength(PUBLIC_PAGES.length)
    expect(xml).not.toContain('/dashboard')
    expect(xml).not.toContain('/share')
  })
  it('blocks the app but NOT share links (Slack/X/LinkedIn bots obey robots.txt and must read the preview)', () => {
    const txt = robotsTxt(BASE)
    for (const prefix of APP_ROUTE_PREFIXES) expect(txt).toContain(`Disallow: ${prefix}`)
    expect(txt).toContain('Disallow: /api/')
    expect(txt).not.toMatch(/Disallow: \/share/)
    expect(txt).toContain(`Sitemap: ${BASE}/sitemap.xml`)
    expect(txt).toMatch(/^User-agent: \*\nAllow: \//)
  })
  it('never blocks a public page', () => {
    for (const p of PUBLIC_PAGES.filter(p => p.path !== '/')) {
      expect(APP_ROUTE_PREFIXES.some(prefix => p.path.startsWith(prefix))).toBe(false)
    }
  })
})

describe('shareMeta', () => {
  it('shows the chart name and role count, nothing else, and is noindex', () => {
    const m = shareMeta('abc123', { name: 'Q3 Hiring Plan', roleCount: 31 })
    expect(m.title).toBe('Q3 Hiring Plan · StratMap')
    expect(m.description).toBe('Org chart with 31 roles. View it on StratMap.')
    expect(m.path).toBe('/share/abc123')
    expect(m.noindex).toBe(true)
  })
  it('says "1 role" for one', () => {
    expect(shareMeta('a', { name: 'N', roleCount: 1 }).description).toContain('1 role.')
  })
  it('truncates very long names', () => {
    const m = shareMeta('a', { name: 'x'.repeat(300), roleCount: 2 })
    expect(m.title.length).toBeLessThan(100)
    expect(m.title).toContain('…')
  })
  it('is generic when there is no chart', () => {
    const m = shareMeta('a', null)
    expect(m.title).toBe('Shared org chart · StratMap')
    expect(m.description).not.toMatch(/\d+ roles?/)
  })
})

describe('escapeHtml', () => {
  it('escapes the five dangerous characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })
})
