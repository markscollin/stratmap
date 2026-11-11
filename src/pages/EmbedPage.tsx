// Embeddable read-only chart (roadmap Phase 5). The only page that may be shown inside someone else's
// <iframe>: vercel.json drops the frame-blocking headers for /embed/* and keeps them everywhere else.
// It reads the same public share code as /share/:code, so turning sharing off (or revoking the link)
// empties every embed at once. It shows the chart name and the chart only: no toolbar, no sign-in.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { OrgChart } from '../features/canvas/OrgChart'
import type { OrgNode, OrgEdge, Department } from '../types'

interface EmbeddedChart {
  name: string
  nodes: OrgNode[]
  edges: OrgEdge[]
  departments: Department[]
  branding?: boolean
}

export function EmbedPage() {
  const { code } = useParams()
  const [data, setData] = useState<EmbeddedChart | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Embeds only ever use server-side short codes (never the legacy URL-token links).
    if (!code || code.length > 20) { setError('This chart is not available'); return }
    fetch(`/api/share/${code}`)
      .then(async (r) => {
        if (r.status === 404) throw new Error('This chart is no longer shared')
        if (r.status === 410) throw new Error('This link has expired')
        if (r.status === 429) throw new Error('Too many requests, please try again in a minute')
        if (!r.ok) throw new Error('This chart could not be loaded')
        return r.json() as Promise<EmbeddedChart>
      })
      .then(setData)
      .catch((e) => setError((e as Error).message))
  }, [code])

  useEffect(() => { if (data) document.title = `${data.name} — StratMap` }, [data])

  if (error || !data) {
    return (
      <div data-testid="embed-message" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: 'var(--bg)', color: 'var(--muted)', fontSize: 14, padding: 16, textAlign: 'center' }}>
        {error ?? 'Loading…'}
      </div>
    )
  }

  const branding = data.branding !== false
  return (
    <div style={{ height: '100dvh', position: 'relative', overflow: 'hidden', background: 'var(--bg)' }}>
      <OrgChart chartName={data.name} initialNodes={data.nodes} initialEdges={data.edges} departments={data.departments} readOnly brandExports={branding} />
      {branding && (
        <a
          href={`/share/${code}`} target="_blank" rel="noopener noreferrer" data-testid="embed-branding"
          style={{ position: 'absolute', bottom: 8, right: 8, zIndex: 20, fontSize: 11, color: 'var(--muted)', textDecoration: 'none', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '3px 10px' }}
        >
          Made with <strong style={{ color: 'var(--brand)' }}>StratMap</strong>
        </a>
      )}
    </div>
  )
}
