import { useEffect, useId, useState } from 'react'
import { Download } from 'lucide-react'
import { api, ApiError } from '../../lib/apiClient'
import { downloadText } from '../../lib/csvSafe'
import { useChartStore } from '../../store/chartStore'

// The workspace export lists saved versions without their contents (R-58: one reply must stay small). Their contents come here,
// one file per chart, so a workspace can keep its whole version history offline.

const ghostBtn = { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' } as const

export function VersionHistoryDownload({ disabled, onError }: { disabled: boolean; onError: (message: string) => void }) {
  const { charts, loaded, loading, error, fetchCharts } = useChartStore()
  const [chartId, setChartId] = useState('')
  const [busy, setBusy] = useState(false)
  const id = useId()

  useEffect(() => { if (!loaded && !loading && !error) void fetchCharts() }, [loaded, loading, error, fetchCharts])
  const selected = charts.find(c => c.id === chartId) ?? charts[0]
  if (!selected) return null

  async function download() {
    if (!selected) return
    setBusy(true)
    try {
      const text = await api.getText(`/api/workspace/export?format=versions&chartId=${encodeURIComponent(selected.id)}`)
      const slug = selected.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'chart'
      downloadText(`stratmap-versions-${slug}.json`, text, 'application/json')
    } catch (err) {
      onError(err instanceof ApiError ? err.userMessage : 'Could not download the version history')
    } finally { setBusy(false) }
  }

  return (
    <div data-testid="version-history-download" style={{ marginTop: 14 }}>
      <label htmlFor={id} style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
        Saved versions of a chart, with their contents (one file per chart)
      </label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select id={id} value={selected.id} onChange={e => setChartId(e.target.value)}
          style={{ padding: '7px 10px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, maxWidth: 240 }}>
          {charts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button style={ghostBtn} onClick={() => void download()} disabled={disabled || busy}>
          <Download size={13} /> {busy ? 'Preparing…' : 'Version history (JSON)'}
        </button>
      </div>
    </div>
  )
}
