// Regenerates public/og-image.png (1200x630) from scripts/og/og.html. Run by hand when the brand changes:
//   node scripts/og/make-og.mjs      (set PW_CHROMIUM_PATH=/path/to/chromium if Playwright's own isn't installed)
import { chromium } from '@playwright/test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {})
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
await page.goto(pathToFileURL(path.join(here, 'og.html')).href)
await page.screenshot({ path: path.join(here, '../../public/og-image.png') })
await browser.close()
console.log('wrote public/og-image.png')
