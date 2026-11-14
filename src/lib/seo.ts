// Search and social metadata (roadmap 2.5). Pure string code with no DOM and no Node APIs, so it
// runs in three places: the Vite build (per-page HTML, sitemap, robots), the share-link function
// (api/share-page.ts) and the tests.
//
// index.html holds a marked block of <title>/<meta>/<link> tags. Each public page gets its own copy
// of the built index.html with that block swapped for page-specific tags.

import { resolveOrigin, type OriginEnv } from './siteOrigin'

export const SITE_NAME = 'StratMap'
export const SEO_START = '<!--seo:start-->'
export const SEO_END = '<!--seo:end-->'
/** Used only when nothing says where the app lives (set APP_URL once there is a custom domain). */
export const DEFAULT_SITE_URL = 'https://stratmap-seven.vercel.app'

export interface PageMeta {
  title: string
  description: string
  /** Path on the site, e.g. "/pricing". */
  path: string
  /** Keep out of search results (app pages, share links). */
  noindex?: boolean
}

const HOME_DESCRIPTION =
  'The collaborative org chart and people-planning tool for founders, HR and operations leaders. Visualise your organisation, attach job descriptions to every role and plan headcount.'

/** Pages search engines should index. Each is also written to its own HTML file at build time. */
export const PUBLIC_PAGES: PageMeta[] = [
  { path: '/', title: 'StratMap — Map your organisation. Build it deliberately.', description: HOME_DESCRIPTION },
  {
    path: '/pricing',
    title: 'Pricing — StratMap',
    description: 'Start free, then upgrade for job descriptions, approval workflows, PDF export, AI drafting and headcount planning. Simple monthly or annual plans.',
  },
  {
    path: '/privacy',
    title: 'Privacy Policy — StratMap',
    description: 'How StratMap collects, uses and protects your information.',
  },
  {
    path: '/terms',
    title: 'Terms of Service — StratMap',
    description: 'The terms that apply when you use StratMap.',
  },
]

/** What every signed-in/app route (and any unknown URL) is served with: not for search results. */
export const APP_PAGE: PageMeta = {
  path: '/',
  title: SITE_NAME,
  description: HOME_DESCRIPTION,
  noindex: true,
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** The site's public origin, no trailing slash. The order (APP_URL, the production domain, the deployment host) is in siteOrigin.ts. */
export function siteUrl(env: OriginEnv): string {
  return resolveOrigin(env) ?? DEFAULT_SITE_URL
}

/** The tags between the markers for one page. Every dynamic value is escaped. */
export function renderSeoBlock(meta: PageMeta, base: string): string {
  const url = `${base}${meta.path}`
  const image = `${base}/og-image.png`
  const title = escapeHtml(meta.title)
  const description = escapeHtml(meta.description)
  const lines = [
    SEO_START,
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    meta.noindex
      ? '<meta name="robots" content="noindex, nofollow" />'
      : `<link rel="canonical" href="${escapeHtml(url)}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    `<meta property="og:image:alt" content="${SITE_NAME}: an interactive org chart" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    SEO_END,
  ]
  return lines.join('\n    ')
}

/** Swaps the marked block in `html` for `block`. Throws if the markers are missing, so a broken template fails the build. */
export function injectSeo(html: string, block: string): string {
  const start = html.indexOf(SEO_START)
  const end = html.indexOf(SEO_END)
  if (start === -1 || end === -1 || end < start) throw new Error('index.html is missing the <!--seo:start--> … <!--seo:end--> block')
  // A function replacement keeps "$&"-style sequences in chart names literal.
  return html.slice(0, start) + block + html.slice(end + SEO_END.length)
}

export function sitemapXml(base: string, lastmod: string): string {
  const urls = PUBLIC_PAGES.map(p =>
    `  <url><loc>${escapeHtml(base + p.path)}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

/** App routes are behind sign-in. /share/ is deliberately NOT blocked: link-preview bots (Slack, X, LinkedIn)
 *  obey robots.txt and must be able to read the preview; share pages are kept out of search with noindex instead. */
export const APP_ROUTE_PREFIXES = [
  '/api/', '/dashboard', '/charts', '/roles', '/headcount', '/settings',
  '/onboarding', '/invite/', '/billing/', '/sign-in', '/sign-up',
]

export function robotsTxt(base: string): string {
  return [
    'User-agent: *',
    'Allow: /',
    ...APP_ROUTE_PREFIXES.map(p => `Disallow: ${p}`),
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n')
}

// ─── Share links ─────────────────────────────────────────────────────────────

const MAX_NAME = 80

/** Preview for /share/:code. Reveals the chart name and role count only (owner-decided); never people or salaries. */
export function shareMeta(code: string, chart: { name: string; roleCount: number } | null): PageMeta {
  const path = `/share/${code}`
  if (!chart) {
    return {
      path, noindex: true,
      title: `Shared org chart · ${SITE_NAME}`,
      description: `View this org chart on ${SITE_NAME}, the collaborative org chart and people-planning tool.`,
    }
  }
  const name = chart.name.trim().length > MAX_NAME ? `${chart.name.trim().slice(0, MAX_NAME - 1)}…` : chart.name.trim()
  const roles = `${chart.roleCount} ${chart.roleCount === 1 ? 'role' : 'roles'}`
  return {
    path, noindex: true,
    title: `${name} · ${SITE_NAME}`,
    description: `Org chart with ${roles}. View it on ${SITE_NAME}.`,
  }
}
