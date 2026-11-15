// Normalises a Content-Security-Policy violation report (R-23). Browsers send one of two shapes:
//   `application/csp-report`   { "csp-report": { "document-uri": …, "violated-directive": …, "blocked-uri": … } }   (report-uri)
//   `application/reports+json` [ { "type": "csp-violation", "body": { "documentURL": …, "effectiveDirective": … } } ]  (report-to)
// Reports come from anyone on the internet and the page URLs can hold secrets (an invite token or a share code is in the path),
// so only the origin and the first path segment are kept, never a query, fragment or later segment, and every field is length-capped.

export interface CspViolation {
  page: string
  blocked: string
  directive: string
  disposition: string
  source: string
  line: number | null
}

const MAX = 200

/** `https://app.example.com/invite/abc123?x=1` → `https://app.example.com/invite`. Non-URL values such as "inline" or "eval" pass through capped. */
export function coarseUrl(value: unknown): string {
  if (typeof value !== 'string' || !value) return ''
  try {
    const u = new URL(value)
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      const first = u.pathname.split('/').filter(Boolean)[0]
      return `${u.origin}${first ? `/${first}` : ''}`.slice(0, MAX)
    }
    return `${u.protocol}`.slice(0, MAX) // data:, blob:, chrome-extension: … only the kind
  } catch {
    return value.replace(/[^\w:./-]/g, '').slice(0, 40)
  }
}

const text = (v: unknown, max = 80) => (typeof v === 'string' ? v.replace(/[^\w\- .:/*']/g, '').slice(0, max) : '')

function fromLegacy(r: Record<string, unknown>): CspViolation {
  return {
    page: coarseUrl(r['document-uri']), blocked: coarseUrl(r['blocked-uri']),
    directive: text(r['effective-directive'] ?? r['violated-directive']), disposition: text(r['disposition'], 20) || 'report',
    source: coarseUrl(r['source-file']), line: typeof r['line-number'] === 'number' ? r['line-number'] : null,
  }
}

function fromReportingApi(b: Record<string, unknown>): CspViolation {
  return {
    page: coarseUrl(b.documentURL), blocked: coarseUrl(b.blockedURL),
    directive: text(b.effectiveDirective ?? b.violatedDirective), disposition: text(b.disposition, 20) || 'report',
    source: coarseUrl(b.sourceFile), line: typeof b.lineNumber === 'number' ? b.lineNumber : null,
  }
}

/** Up to 10 violations from a parsed request body; anything that is not a CSP report yields an empty list. */
export function parseCspReports(body: unknown): CspViolation[] {
  let data = body
  if (Buffer.isBuffer(data)) data = data.toString('utf8')
  if (typeof data === 'string') { try { data = JSON.parse(data) } catch { return [] } }
  if (!data || typeof data !== 'object') return []
  const out: CspViolation[] = []
  const items = Array.isArray(data) ? data : [data]
  for (const item of items.slice(0, 10)) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    if (o['csp-report'] && typeof o['csp-report'] === 'object') out.push(fromLegacy(o['csp-report'] as Record<string, unknown>))
    else if (o.type === 'csp-violation' && o.body && typeof o.body === 'object') out.push(fromReportingApi(o.body as Record<string, unknown>))
  }
  return out
}
