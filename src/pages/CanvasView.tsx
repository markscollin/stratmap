import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useChartStore } from '../store'
import { StatusBadge } from '../components/ui/StatusBadge'
import { VersionPill } from '../components/ui/VersionPill'
import { OrgChart } from '../features/canvas/OrgChart'
import { usePermission } from '../hooks/usePermission'
import { useChartLimit } from '../hooks/useChartLimit'
import { useIsPhone } from '../hooks/useMediaQuery'
import { api } from '../lib/apiClient'
import { useChartConflict } from '../lib/chartRevision'
import { ChartConflictBanner } from '../features/canvas/ChartConflictBanner'
import { SampleChartBanner } from '../features/onboarding/SampleChartBanner'
import type { OrgNode, OrgEdge, Department } from '../types'

interface FullChart {
  id: string
  name: string
  status: string
  version: number
  isSample?: boolean
  nodes: OrgNode[]
  edges: OrgEdge[]
  departments: Department[]
}

export function CanvasView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { charts, deleteChart } = useChartStore()
  const { canEdit, canAdmin } = usePermission()
  // Over the chart limit after a downgrade, every chart is view-only (roadmap 1.6).
  const { frozen } = useChartLimit()
  // Phones are view-only (roadmap 2.8): pan and pinch, no editing. Tablets edit as usual.
  const isPhone = useIsPhone()
  // Someone else changed this chart since we loaded it (roadmap 2.4): read-only until reloaded.
  const conflicted = useChartConflict(s => s.chartId) === id

  // Metadata from the store (name, status, version for the header)
  const chartMeta = charts.find(c => c.id === id)

  const [fullChart, setFullChart] = useState<FullChart | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(false)

  // Bumped after people are imported into this chart to reload it from the server.
  const [reloadKey, setReloadKey] = useState(0)
  // The canvas keeps its own copy of the nodes, so after a reload it must remount once
  // the NEW data has arrived (not when the reload starts, or it would remount with the
  // old data). The first load doesn't remount: the canvas isn't mounted until it ends.
  const [canvasKey, setCanvasKey] = useState(0)

  useEffect(() => {
    if (!id) return
    // Keep the canvas on screen during a reload; only the first load shows the spinner.
    if (reloadKey === 0) setLoading(true)
    setError(false)
    api.get<FullChart>(`/api/charts/${id}`)
      .then(chart => {
        setFullChart(chart)
        if (reloadKey > 0) setCanvasKey(k => k + 1)
        useChartConflict.getState().clear()
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [id, reloadKey])

  // Open comment threads per role, for the badges on the canvas (roadmap 5). Held here so a chart reload keeps them.
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({})
  const refreshCommentCounts = useCallback(() => {
    if (!id) return
    api.get<{ counts: Record<string, number> }>(`/api/charts/${id}/comments?counts=1`)
      .then(r => setCommentCounts(r.counts))
      .catch(() => { /* badges are optional: stay quiet if they can't load */ })
  }, [id])
  useEffect(() => { refreshCommentCounts() }, [refreshCommentCounts])

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
  const depts   = fullChart.departments
  const isSample = chartMeta?.isSample ?? fullChart.isSample ?? false

  return (
    <div style={{ height: '100%', position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {isPhone ? (
        // Phones: the header sits above the canvas instead of floating over its toolbar (roadmap 2.8).
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <button
              aria-label="All charts"
              onClick={() => navigate('/charts')}
              style={{ width: 34, height: 34, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer' }}
            ><ChevronLeft size={16} /></button>
            <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
            <StatusBadge status={status} />
          </div>
          {canEdit && !frozen && (
            <div data-testid="phone-view-only" style={{ flexShrink: 0, padding: '6px 12px', fontSize: 12, color: 'var(--muted)', background: 'var(--raised)', borderBottom: '1px solid var(--border)' }}>
              View only on phones. Edit on a tablet or computer.
            </div>
          )}
        </>
      ) : (
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
      )}

      <ChartConflictBanner chartId={fullChart.id} onReload={() => setReloadKey(k => k + 1)} flow={isPhone} />
      {isSample && (
        <SampleChartBanner
          flow={isPhone}
          canDelete={canAdmin}
          onDelete={async () => { await deleteChart(fullChart.id); navigate('/charts') }}
        />
      )}

      <div style={isPhone ? { flex: 1, position: 'relative', minHeight: 0 } : { display: 'contents' }}>
      <OrgChart
        key={`${fullChart.id}:${canvasKey}`}
        onImported={() => setReloadKey(k => k + 1)}
        chartId={fullChart.id}
        chartName={name}
        initialNodes={fullChart.nodes}
        initialEdges={fullChart.edges}
        departments={depts}
        readOnly={!canEdit || frozen || conflicted || isPhone}
        isPublic={chartMeta?.isPublic ?? false}
        commentCounts={commentCounts}
        onCommentsChanged={refreshCommentCounts}
      />
      </div>
    </div>
  )
}
