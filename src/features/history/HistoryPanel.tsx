import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, GitCompare, RotateCcw, GitBranch, Trash2 } from 'lucide-react'
import { api, ApiError } from '../../lib/apiClient'
import { diffSnapshots, type DiffState, type SnapshotDiff } from '../../lib/snapshotDiff'
import { timeAgo } from '../../lib/comments'
import { usePermission } from '../../hooks/usePermission'
import { usePlanLimits } from '../../hooks/usePlanLimits'
import { useChartLimit } from '../../hooks/useChartLimit'
import { useUserStore } from '../../store/userStore'
import { useToastStore } from '../../store/toastStore'
import { useChartStore } from '../../store'
import { LockedFeatureCard } from '../../components/ui/FeatureLock'

// Version history and scenarios (roadmap 5). Save a named version of the chart, compare two versions (or one with today),
// restore an earlier one (today's is saved first, so it can be undone) or branch one into a NEW chart: that is a scenario.
// Everyone can look and compare; saving, restoring and branching are for editors on the Growth plan. A version holds roles,
// reporting lines and departments, never job-description text or salaries.

export interface VersionRow {
  id: string; name: string; kind: 'manual' | 'auto'; createdBy: string; createdAt: string
  nodeCount: number; edgeCount: number; authorName: string | null
}
interface ChartLike { nodes: DiffState['nodes']; edges: DiffState['edges']; departments: DiffState['departments'] }

const TODAY = 'today'
const btn = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 9px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text)', fontSize: 11, fontWeight: 600, cursor: 'pointer' } as const
const primary = (on: boolean) => ({ ...btn, background: on ? 'var(--grad-brand)' : 'var(--raised)', color: on ? '#fff' : 'var(--dim)', border: 'none', cursor: on ? 'pointer' : 'default' }) as const
const select = { padding: '6px 8px', fontSize: 12, background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text)', maxWidth: '100%' } as const
const MAX_LISTED = 50

function DiffView({ diff, aName, bName }: { diff: SnapshotDiff; aName: string; bName: string }) {
  const { headcount: h } = diff
  const changedDepartments = h.byDepartment.filter(d => d.before !== d.after)
  const delta = (a: number, b: number) => (b === a ? `${b}` : `${a} → ${b} (${b > a ? '+' : ''}${b - a})`)
  const list = <T,>(items: T[], render: (item: T) => React.ReactNode) => (
    <>{items.slice(0, MAX_LISTED).map(render)}{items.length > MAX_LISTED && <li style={{ color: 'var(--dim)' }}>…and {items.length - MAX_LISTED} more</li>}</>
  )
  return (
    <div data-testid="compare-result" style={{ marginTop: 12, padding: 12, background: 'var(--raised)', borderRadius: 10, border: '1px solid var(--border)' }}>
      <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--muted)' }}>{aName} → {bName}</p>
      {diff.identical ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text)' }}>No differences. (Where boxes sit on the canvas is ignored.)</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 10, fontSize: 12, color: 'var(--text)' }}>
            <span>Roles: <strong data-testid="diff-roles">{delta(h.roles.before, h.roles.after)}</strong></span>
            <span>Open roles: <strong data-testid="diff-open">{delta(h.open.before, h.open.after)}</strong></span>
          </div>
          {changedDepartments.length > 0 && (
            <div style={{ marginBottom: 10, fontSize: 12 }}>
              <div style={{ color: 'var(--dim)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Headcount by department</div>
              {changedDepartments.map(d => <div key={d.name} data-testid="diff-department" style={{ color: 'var(--text)' }}>{d.name}: {delta(d.before, d.after)}</div>)}
            </div>
          )}
          {([['Added', diff.added, 'var(--success)'], ['Removed', diff.removed, 'var(--danger)']] as const).map(([title, rows, colour]) => rows.length > 0 && (
            <div key={title} style={{ marginBottom: 10 }}>
              <div style={{ color: colour, fontSize: 11, fontWeight: 700, marginBottom: 3 }}>{title} ({rows.length})</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>
                {list([...rows], r => <li key={r.id} data-testid={`diff-${title.toLowerCase()}`}>{r.label} <span style={{ color: 'var(--dim)' }}>· {r.department}</span></li>)}
              </ul>
            </div>
          ))}
          {diff.changed.length > 0 && (
            <div>
              <div style={{ color: 'var(--brand)', fontSize: 11, fontWeight: 700, marginBottom: 3 }}>Changed ({diff.changed.length})</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>
                {list([...diff.changed], c => (
                  <li key={c.id} data-testid="diff-changed">
                    <strong>{c.label}</strong>
                    {c.changes.map(ch => <div key={ch.field} style={{ color: 'var(--muted)' }}>{ch.field}: {ch.from} → {ch.to}</div>)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function HistoryPanel({ chartId, chartName, onClose, onRestored }: { chartId: string; chartName: string; onClose: () => void; onRestored: () => void }) {
  const navigate = useNavigate()
  const { canEdit, canAdmin } = usePermission()
  const { hasFeature } = usePlanLimits()
  const { frozen } = useChartLimit()
  const me = useUserStore(s => s.user?.id ?? '')
  const addToast = useToastStore(s => s.addToast)

  const hasFeatureAccess = hasFeature('version-history')
  const canSave = canEdit && hasFeatureAccess
  const canChange = canSave && !frozen          // restore and branch change the chart or add one

  const [versions, setVersions] = useState<VersionRow[]>([])
  const [limit, setLimit] = useState(50)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ kind: 'restore' | 'delete' | 'branch'; id: string } | null>(null)
  const [branchName, setBranchName] = useState('')
  const [compare, setCompare] = useState<{ a: string; b: string } | null>(null)
  const [states, setStates] = useState<Record<string, DiffState>>({})

  const fail = (err: unknown, fallback: string) => setError(err instanceof ApiError ? err.userMessage : fallback)

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ snapshots: VersionRow[]; limit: number }>(`/api/charts/${chartId}/snapshots`)
      setVersions(r.snapshots); setLimit(r.limit); setError(null)
    } catch (err) { fail(err, 'Could not load the versions') } finally { setLoading(false) }
  }, [chartId])

  useEffect(() => {
    let alive = true
    api.get<{ snapshots: VersionRow[]; limit: number }>(`/api/charts/${chartId}/snapshots`)
      .then(r => { if (alive) { setVersions(r.snapshots); setLimit(r.limit) } })
      .catch(err => { if (alive) fail(err, 'Could not load the versions') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [chartId])

  // A comparison needs a saved version's contents, or the chart as it is today.
  async function startCompare(a: string, b: string) {
    setError(null); setCompare({ a, b })
    try {
      // Always a fresh look: today's chart can change while the panel is open.
      await Promise.all([loadState(a), loadState(b)])
    } catch (err) { fail(err, 'Could not load the comparison'); setCompare(null) }
  }
  async function loadState(id: string) {
    const data = id === TODAY
      ? await api.get<ChartLike>(`/api/charts/${chartId}`)
      : (await api.get<{ data: ChartLike }>(`/api/charts/${chartId}/snapshots/${id}`)).data
    setStates(s => ({ ...s, [id]: { nodes: data.nodes, edges: data.edges, departments: data.departments } }))
  }

  const nameOf = (id: string) => (id === TODAY ? 'Today' : versions.find(v => v.id === id)?.name ?? 'Version')
  const diff = useMemo(() => (compare && states[compare.a] && states[compare.b] ? diffSnapshots(states[compare.a], states[compare.b]) : null), [compare, states])

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key); setError(null)
    try { await action() } catch (err) { fail(err, 'Something went wrong. Please try again.') } finally { setBusy(null) }
  }

  const saveVersion = () => run('save', async () => {
    await api.post(`/api/charts/${chartId}/snapshots`, { name: name.trim() })
    setName(''); await load()
    addToast('Version saved.', 'success')
  })
  const restore = (id: string) => run(`restore-${id}`, async () => {
    await api.post(`/api/charts/${chartId}/snapshots/${id}/restore`, {})
    addToast(`Restored “${nameOf(id)}”. The chart as it was is saved as an automatic version, so you can undo this.`, 'success')
    onRestored(); onClose()
  })
  const remove = (id: string) => run(`delete-${id}`, async () => {
    await api.delete(`/api/charts/${chartId}/snapshots/${id}`)
    setConfirm(null); if (compare && (compare.a === id || compare.b === id)) setCompare(null)
    await load()
  })
  const branch = (id: string) => run(`branch-${id}`, async () => {
    const created = await api.post<{ id: string }>(`/api/charts/${chartId}/snapshots/${id}/branch`, branchName.trim() ? { name: branchName.trim() } : {})
    await useChartStore.getState().fetchCharts()
    addToast('New chart created from that version.', 'success')
    onClose(); navigate(`/charts/${created.id}`)
  })

  const manualCount = versions.filter(v => v.kind === 'manual').length

  return (
    <div data-export-ignore style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Version history" data-testid="history-panel" onClick={e => e.stopPropagation()}
        style={{ width: 'min(720px, 100%)', maxHeight: '88vh', overflow: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, boxShadow: 'var(--shadow-lg, 0 10px 40px rgba(0,0,0,.3))' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Version history</h2>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
              Save {chartName} as it is now, compare versions, go back to an earlier one, or turn one into a new chart to try a different plan.
              Versions hold roles, reporting lines and departments, never salaries.
            </p>
          </div>
          <button aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}><X size={16} /></button>
        </div>

        {!hasFeatureAccess && <LockedFeatureCard feature="version-history" />}

        {canSave && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <input aria-label="Version name" value={name} onChange={e => setName(e.target.value)} maxLength={100} placeholder="Name this version, e.g. Before the Q3 reorg"
              onKeyDown={e => { if (e.key === 'Enter' && name.trim() && !busy) void saveVersion() }}
              style={{ ...select, flex: 1, minWidth: 200, padding: '8px 10px' }} />
            <button style={primary(!!name.trim() && busy === null && manualCount < limit)} disabled={!name.trim() || busy !== null || manualCount >= limit} onClick={() => void saveVersion()}>
              {busy === 'save' ? 'Saving…' : 'Save version'}
            </button>
          </div>
        )}
        {canSave && manualCount >= limit && <p style={{ fontSize: 11, color: 'var(--warn)', margin: '-6px 0 12px' }}>This chart has {limit} saved versions. Delete an old one to save another.</p>}

        {error && <p role="alert" style={{ fontSize: 12, color: 'var(--danger)', margin: '0 0 10px' }}>{error}</p>}
        {loading && <p style={{ fontSize: 12, color: 'var(--muted)' }}>Loading…</p>}
        {!loading && !error && versions.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>No versions yet.{canSave ? ' Name one above to keep this chart as it is now.' : ''}</p>
        )}

        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {versions.map(v => (
            <li key={v.id} data-testid="version-row" style={{ padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflowWrap: 'anywhere' }}>{v.name}</span>
                {v.kind === 'auto' && <span style={{ fontSize: 10, color: 'var(--dim)', border: '1px solid var(--border)', borderRadius: 10, padding: '0 6px' }}>Automatic</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--dim)', margin: '2px 0 6px' }}>
                {timeAgo(v.createdAt)} · {v.authorName ?? 'A former member'} · {v.nodeCount} role{v.nodeCount === 1 ? '' : 's'}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button style={btn} onClick={() => void startCompare(v.id, TODAY)}><GitCompare size={11} /> Compare with today</button>
                {canChange && <button style={btn} onClick={() => { setConfirm({ kind: 'restore', id: v.id }) }}><RotateCcw size={11} /> Restore</button>}
                {canChange && <button style={btn} onClick={() => { setBranchName(`${chartName} (${v.name})`.slice(0, 100)); setConfirm({ kind: 'branch', id: v.id }) }}><GitBranch size={11} /> New chart from this</button>}
                {(v.createdBy === me || canAdmin) && <button style={{ ...btn, color: 'var(--muted)' }} onClick={() => setConfirm({ kind: 'delete', id: v.id })}><Trash2 size={11} /> Delete</button>}
              </div>

              {confirm?.id === v.id && confirm.kind === 'restore' && (
                <div style={{ marginTop: 8, padding: 10, background: 'var(--raised)', borderRadius: 8, fontSize: 12, color: 'var(--text)' }}>
                  Restore “{v.name}”? The chart goes back to how it was. Today's chart is saved first as an automatic version, so you can undo this. Comments stay on roles that exist in both.
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button style={primary(busy === null)} disabled={busy !== null} onClick={() => void restore(v.id)}>{busy === `restore-${v.id}` ? 'Restoring…' : 'Restore this version'}</button>
                    <button style={btn} onClick={() => setConfirm(null)}>Cancel</button>
                  </div>
                </div>
              )}
              {confirm?.id === v.id && confirm.kind === 'branch' && (
                <div style={{ marginTop: 8, padding: 10, background: 'var(--raised)', borderRadius: 8, fontSize: 12, color: 'var(--text)' }}>
                  Creates a new chart from “{v.name}”. This chart is not changed.
                  <input aria-label="New chart name" value={branchName} onChange={e => setBranchName(e.target.value)} maxLength={100} style={{ ...select, display: 'block', width: '100%', boxSizing: 'border-box', margin: '8px 0' }} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={primary(busy === null)} disabled={busy !== null} onClick={() => void branch(v.id)}>{busy === `branch-${v.id}` ? 'Creating…' : 'Create chart'}</button>
                    <button style={btn} onClick={() => setConfirm(null)}>Cancel</button>
                  </div>
                </div>
              )}
              {confirm?.id === v.id && confirm.kind === 'delete' && (
                <div style={{ marginTop: 8, padding: 10, background: 'var(--raised)', borderRadius: 8, fontSize: 12, color: 'var(--text)' }}>
                  Delete “{v.name}” for everyone?
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button style={{ ...primary(busy === null), background: busy === null ? 'var(--danger)' : 'var(--raised)' }} disabled={busy !== null} onClick={() => void remove(v.id)}>Delete version</button>
                    <button style={btn} onClick={() => setConfirm(null)}>Keep</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>

        {compare && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
              Compare
              <select aria-label="First version" style={select} value={compare.a} onChange={e => void startCompare(e.target.value, compare.b)}>
                {versions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              with
              <select aria-label="Second version" style={select} value={compare.b} onChange={e => void startCompare(compare.a, e.target.value)}>
                <option value={TODAY}>Today (the chart now)</option>
                {versions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              <button style={btn} onClick={() => setCompare(null)}>Close comparison</button>
            </div>
            {diff ? <DiffView diff={diff} aName={nameOf(compare.a)} bName={nameOf(compare.b)} /> : <p style={{ fontSize: 12, color: 'var(--muted)' }}>Comparing…</p>}
          </div>
        )}
      </div>
    </div>
  )
}
