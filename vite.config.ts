import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { PUBLIC_PAGES, APP_PAGE, renderSeoBlock, injectSeo, sitemapXml, robotsTxt, siteUrl } from './src/lib/seo'

// After the build: one HTML file per public page with its own title, description and social tags, plus
// app.html (the no-index shell every app route is served from), sitemap.xml and robots.txt (roadmap 2.5).
function seoFiles(): Plugin {
  let outDir = 'dist'
  return {
    name: 'stratmap-seo',
    apply: 'build',
    configResolved(config) { outDir = path.resolve(config.root, config.build.outDir) },
    closeBundle() {
      const indexPath = path.join(outDir, 'index.html')
      if (!fs.existsSync(indexPath)) return
      const template = fs.readFileSync(indexPath, 'utf8')
      const base = siteUrl(process.env)
      for (const page of PUBLIC_PAGES) {
        const html = injectSeo(template, renderSeoBlock(page, base))
        const file = page.path === '/' ? indexPath : path.join(outDir, page.path, 'index.html')
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, html)
      }
      fs.writeFileSync(path.join(outDir, 'app.html'), injectSeo(template, renderSeoBlock(APP_PAGE, base)))
      fs.writeFileSync(path.join(outDir, 'sitemap.xml'), sitemapXml(base, new Date().toISOString().slice(0, 10)))
      fs.writeFileSync(path.join(outDir, 'robots.txt'), robotsTxt(base))
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), seoFiles()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
})
