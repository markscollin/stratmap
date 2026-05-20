import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useChartStore } from '../store'
import { StatusBadge } from '../components/ui/StatusBadge'
import { VersionPill } from '../components/ui/VersionPill'
import { OrgChart } from '../features/canvas/OrgChart'
import { usePermission } from '../hooks/usePermission'
import { mockDepartments } from '../data/mockOrg'
import { api } from '../lib/apiClient'
import type { OrgNode, OrgEdge, Department } from '../types'

interface FullChart {
  id: string
  name: string
  status: string
  version: number
  nodes: OrgNode[]
  edges: OrgEdge[]
  departments: Department[]
}

export function CanvasView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { charts } = useChartStore()
  const { canEdit } = usePermission()

  // Metadata from the store (name, status, version for the header)
  const chartMeta = charts.find(c => c.id === id)

  const [fullChart, setFullChart] = useState<FullChart | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(false)
    api.get<FullChart>(`/api/charts/${id}`)
      .then(setFullChart)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    const name = fullChart?.name ?? chartMeta?.name
    document.title = name ? `${name} — StratMap` : 'StratMap'
  }, [fullChart?.name, chartMeta?.name])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)', fontSize: 14 }}>
        Loading chart…
      </div>
    )
  }

  if (error || !fullChart) {
    return (
      <div style={{ padding: 40, color: 'var(--text)' }}>
        <p>{error ? 'Failed to load chart.' : 'Chart not found.'}</p>
        <button onClick={() => navigate('/charts')} style={{ marginTop: 12, color: 'var(--brand)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
          ← Back to library
        </button>
      </div>
    )
  }

  const name    = fullChart.name
  const status  = (chartMeta?.status ?? fullChart.status) as import('../types').ChartStatus
  const version = chartMeta?.version ?? fullChart.version
  const depts   = fullChart.departments.length ? fullChart.departments : mockDepartments

  return (
    <div style={{ height: '100%', position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top-left: back + chart meta */}
      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={() => navigate('/charts')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', fontSize: 13, cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}
        >
          <ChevronLeft size={13} /> All charts
        </button>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', boxShadow: 'var(--shadow-sm)' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{name}</span>
        </div>
        <StatusBadge status={status} />
        <VersionPill version={version} />
      </div>

      <OrgChart
        chartId={fullChart.id}
        chartName={name}
        initialNodes={fullChart.nodes}
        initialEdges={fullChart.edges}
        departments={depts}
        readOnly={!canEdit}
        isPublic={chartMeta?.isPublic ?? false}
      />
    </div>
  )
}
