/// <reference types="node" />
import type { VercelRequest, VercelResponse } from '@vercel/node'
import fs from 'node:fs'
import path from 'node:path'
import { eq, count } from 'drizzle-orm'
import { db } from './_lib/db'
import { hitRateLimit, clientIp } from './_lib/rateLimit'
import { sharedLinks, charts, nodes, workspaces } from '../src/lib/db/schema'
import { injectSeo, renderSeoBlock, shareMeta, siteUrl } from '../src/lib/seo'

// GET /share/:code (rewritten here by vercel.json). Serves the app's HTML with link-preview tags for
// that share link (roadmap 2.5), so pasting a link into Slack/LinkedIn/WhatsApp shows the chart name and
// role count. The React app then loads and renders the chart exactly as before.
//
// Privacy (owner-decided): the preview shows the chart name and role count only, never people, titles,
// departments or salaries. A link that is private, revoked, expired or unknown gets the same generic
// preview, so a preview never confirms that a link ever existed. The page is always noindex.

let cachedTemplate: string | null = null

async function loadTemplate(): Promise<string> {
  if (cachedTemplate) return cachedTemplate
  // app.html is the no-index shell written by the build (vite.config.ts). The build output is bundled
  // with this function (vercel.json includeFiles); in local dev there is no dist, so use the source page.
  for (const file of ['dist/app.html', 'dist/index.html', 'index.html']) {
    try {
      cachedTemplate = fs.readFileSync(path.join(process.cwd(), file), 'utf8')
      return cachedTemplate
    } catch { /* try the next */ }
  }
  // Last resort on Vercel: read the deployed static file over HTTP.
  if (process.env.VERCEL_URL) {
    const res = await fetch(`https://${process.env.VERCEL_URL}/app.html`)
    if (res.ok) {
      cachedTemplate = await res.text()
      return cachedTemplate
    }
  }
  throw new Error('app.html template not found')
}

async function lookup(code: string): Promise<{ name: string; roleCount: number } | null> {
  const [link] = await db.select().from(sharedLinks).where(eq(sharedLinks.id, code)).limit(1)
  if (!link || (link.expiresAt && link.expiresAt < new Date())) return null
  const [chart] = await db.select().from(charts).where(eq(charts.id, link.chartId)).limit(1)
  if (!chart || !chart.isPublic) return null
  const [owner] = await db.select({ deletedAt: workspaces.deletedAt }).from(workspaces).where(eq(workspaces.id, chart.workspaceId)).limit(1)
  if (!owner || owner.deletedAt) return null // a deleted workspace's links show the generic preview (roadmap 4.2)
  const [{ value }] = await db.select({ value: count() }).from(nodes).where(eq(nodes.chartId, chart.id))
  return { name: chart.name, roleCount: value }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const raw = req.query.code
    const code = typeof raw === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(raw) ? raw : null

    // Public and unauthenticated: throttle per IP like /api/share/:code. Over the limit we still serve the
    // page (so the app works) but with the generic preview and no database lookup.
    let chart: { name: string; roleCount: number } | null = null
    if (code) {
      const limit = await hitRateLimit(`sharepage:${clientIp(req)}`, 120, 60)
      if (limit.allowed) chart = await lookup(code)
    }

    const meta = shareMeta(code ?? '', chart)
    const html = injectSeo(await loadTemplate(), renderSeoBlock(meta, siteUrl(process.env)))

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    return res.status(200).send(html)
  } catch (err) {
    console.error('/share/[code] preview', err)
    return res.status(500).send('Something went wrong')
  }
}
