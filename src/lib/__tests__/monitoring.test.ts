import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { sentryOptions } from '../monitoring'

const root = resolve(__dirname, '../../..')

describe('no tracking before consent (roadmap 4.5)', () => {
  it('Sentry sends no default PII and installs no replay, tracing or feedback integration', () => {
    const opts = sentryOptions('https://k@o0.ingest.sentry.io/1', 'production')
    expect(opts.sendDefaultPii).toBe(false)
    expect(opts.defaultIntegrations).toBe(false)
    const names = (opts.integrations as { name: string }[]).map(i => i.name.toLowerCase())
    for (const n of names) expect(n).not.toMatch(/replay|tracing|feedback|breadcrumbs|httpcontext/)
  })

  it('the app shell and bundled CSS request nothing from third-party hosts', () => {
    const files = ['index.html', 'src/styles/fonts.css', 'src/styles/globals.css']
    for (const f of files) {
      const text = readFileSync(resolve(root, f), 'utf8')
      const external = text.match(/(?:href|src)=["']https?:\/\/[^"']+|@import[^;]*https?:\/\/|url\(\s*["']?https?:\/\//g)
      expect(external, `${f} loads a third-party resource`).toBeNull()
    }
  })

  it('the CSP no longer allows Google Fonts', () => {
    expect(readFileSync(resolve(root, 'vercel.json'), 'utf8')).not.toMatch(/fonts\.(googleapis|gstatic)\.com/)
  })
})
