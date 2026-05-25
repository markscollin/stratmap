import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { OrgChart } from '../features/canvas/OrgChart'
import { decodeSharePayload } from '../utils/shareLink'
import { mockDepartments } from '../data/mockOrg'
import type { OrgNode, OrgEdge, Department } from '../types'

interface SharedChartData {
  name: string
  nodes: OrgNode[]
  edges: OrgEdge[]
  departments: Department[]
}

export function SharePage() {
  const { token } = useParams()
  const [data, setData] = useState<SharedChartData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) { setError('Invalid link'); return }

    // Short codes (≤ 20 chars) are server-side shared links; longer strings are legacy URL tokens
    if (token.length <= 20) {
      fetch(`/api/share/${token}`)
        .then(async r => {
          if (r.status === 404) throw new Error('Link not found or revoked')
          if (r.status === 410) throw new Error('This link has expired')
          if (!r.ok) throw new Error('Failed to load')
          return r.json() as Promise<SharedChartData>
        })
        .then(setData)
        .catch(e => setError((e as Error).message))
    } else {
      decodeSharePayload(token)
        .then(payload => setData({
          name: payload.name,
          nodes: payload.nodes,
          edges: payload.edges,
          departments: payload.departments,
        }))
        .catch(() => setError('This share link is invalid or could not be decoded'))
    }
  }, [token])

  useEffect(() => {
    if (data) document.title = `${data.name} — StratMap`
  }, [data?.name])

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

  const depts = data.departments.length ? data.departments : mockDepartments

  return (
    <div style={{ height: '100vh', position: 'relative', overflow: 'hidden', background: 'var(--bg)' }}>
      <div style={{
        position: 'absolute', top: 16, left: 16, zIndex: 20,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '7px 14px', boxShadow: 'var(--shadow-sm)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{data.name}</span>
        </div>
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '5px 10px', boxShadow: 'var(--shadow-sm)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>View only</span>
        </div>
      </div>

      <OrgChart
        chartName={data.name}
        initialNodes={data.nodes}
        initialEdges={data.edges}
        departments={depts}
        readOnly
      />

      <div style={{
        position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        zIndex: 20, display: 'flex', alignItems: 'center', gap: 6,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 20, padding: '6px 14px', boxShadow: 'var(--shadow-sm)',
      }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Made with</span>
        <a href="/" style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand)', textDecoration: 'none', letterSpacing: '-.2px' }}>
          StratMap
        </a>
        <span style={{ fontSize: 12, color: 'var(--dim)' }}>·</span>
        <a href="/privacy" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>Privacy</a>
        <a href="/terms" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>Terms</a>
      </div>
    </div>
  )
}
