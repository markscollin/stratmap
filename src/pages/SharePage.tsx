import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { OrgChart } from '../features/canvas/OrgChart'
import { isShareCode } from '../lib/shareCode'
import { useIsPhone } from '../hooks/useMediaQuery'
import type { OrgNode, OrgEdge, Department } from '../types'

interface SharedChartData {
  name: string
  nodes: OrgNode[]
  edges: OrgEdge[]
  departments: Department[]
  /** Server-side shares: true while the chart's workspace is on the Free plan (roadmap 2.6). */
  branding?: boolean
}

export function SharePage() {
  const { token } = useParams()
  const [data, setData] = useState<SharedChartData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isPhone = useIsPhone()

  useEffect(() => {
    if (!token) { setError('Invalid link'); return }

    // Only server-side share codes work (R-25). The old links that carried the whole chart inside the URL could not be
    // revoked and are no longer read at all: a long token is refused without being decoded or sent anywhere.
    if (!isShareCode(token)) { setError('This link is no longer supported. Ask the owner for a new share link.'); return }
    fetch(`/api/share/${token}`)
      .then(async r => {
        // The server answers 404 for unknown, private, revoked and expired links alike (R-26), so the page cannot tell them apart either.
        if (r.status === 404) throw new Error('This link is not available. It may have been turned off or may have expired.')
        if (r.status === 429) throw new Error('Too many requests — please try again in a minute')
        if (!r.ok) throw new Error('Failed to load')
        return r.json() as Promise<SharedChartData>
      })
      .then(setData)
      .catch(e => setError((e as Error).message))
  }, [token])

  useEffect(() => {
    if (data) document.title = `${data.name} — StratMap`
  }, [data])

  if (error) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100vh', gap: 12, background: 'var(--bg)',
      }}>
        <p style={{ fontSize: 15, color: 'var(--muted)' }}>{error}</p>
        <a href="/" style={{ fontSize: 13, color: 'var(--brand)' }}>Open StratMap</a>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', color: 'var(--muted)', fontSize: 14, background: 'var(--bg)',
      }}>
        Loading…
      </div>
    )
  }

  const depts = data.departments
  const branding = data.branding !== false

  const chips = (
    <>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '7px 14px', boxShadow: 'var(--shadow-sm)', minWidth: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.name}</span>
      </div>
      {/* No "View only" pill here: the chart's toolbar already says it (R-66). */}
    </>
  )

  const footer = (
    <div data-testid="share-footer" style={{
      ...(isPhone
        ? { flexShrink: 0, justifyContent: 'center', borderWidth: '1px 0 0 0', borderRadius: 0, padding: '8px 12px' }
        : { position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 20, borderRadius: 20, padding: '6px 14px', boxShadow: 'var(--shadow-sm)' }),
      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      background: 'var(--surface)', border: '1px solid var(--border)',
    }}>
      {branding && (
        <>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Made with</span>
          <a href="/" data-testid="share-branding" style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand)', textDecoration: 'none', letterSpacing: '-.2px' }}>
            StratMap
          </a>
          <span style={{ fontSize: 12, color: 'var(--dim)' }}>·</span>
        </>
      )}
      <a href="/privacy" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>Privacy</a>
      <a href="/terms" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>Terms</a>
    </div>
  )

  const chart = (
    <OrgChart
      chartName={data.name}
      initialNodes={data.nodes}
      initialEdges={data.edges}
      departments={depts}
      readOnly
      brandExports={branding}
    />
  )

  // Phones: header above, footer below, the canvas in between (roadmap 2.8), so nothing floats over the chart.
  if (isPhone) {
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>{chips}</div>
        <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>{chart}</div>
        {footer}
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', position: 'relative', overflow: 'hidden', background: 'var(--bg)' }}>
      <div style={{
        position: 'absolute', top: 16, left: 16, zIndex: 20,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>{chips}</div>
      {chart}
      {footer}
    </div>
  )
}
