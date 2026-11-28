import { useCallback, useEffect, useId, useState } from 'react'
import { X, RefreshCw, Link2 } from 'lucide-react'
import { Dialog } from '../../components/ui/Dialog'
import { LockedFeatureCard } from '../../components/ui/FeatureLock'
import { ChangeList } from '../import/ChangeList'
import { api, ApiError } from '../../lib/apiClient'
import { usePermission } from '../../hooks/usePermission'
import { usePlanLimits } from '../../hooks/usePlanLimits'
import { useToastStore } from '../../store/toastStore'
import { CHANGED_FIELD_LABEL, type FieldChange } from '../../lib/updateFromFile'
import { resultLine, type SyncResult } from '../../lib/hrSyncText'

// R-78: connect a chart to BambooHR, look at what a sync would change, apply it, and optionally let the daily job do it.
// The server works the changes out from BambooHR's data; this only shows them. The API key is typed once and never shown again.

type Status =
  | { connected: false; available: boolean }
  | { connected: true; available: boolean; subdomain: string; keyHint: string; autoSync: boolean; lastSyncAt: string | null; lastResult: SyncResult | null }
interface Preview {
  blocked: boolean; hasChanges: boolean
  issues: { row: number | null; severity: 'error' | 'warning'; message: string }[]
  joiners: { label: string; manager: string | null }[]
  leavers: { label: string }[]
  moves: { label: string; from: string | null; to: string | null }[]
  edits: { label: string; changes: FieldChange[] }[]
  unchanged: number; kept: number
}

export interface HrSyncDialogProps {
  chart: { id: string; name: string }
  onClose: () => void
  /** Called after a sync changed the chart, so the canvas reloads it. */
  onSynced: () => void
}

const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.userMessage : fallback)

export function HrSyncDialog({ chart, onClose, onSynced }: HrSyncDialogProps) {
  const { canAdmin } = usePermission()
  const { hasFeature } = usePlanLimits()
  const addToast = useToastStore(s => s.addToast)
  const [status, setStatus] = useState<Status | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<null | 'connect' | 'preview' | 'sync' | 'disconnect' | 'auto'>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [subdomain, setSubdomain] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [autoSync, setAutoSync] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const subId = useId(), keyId = useId(), autoId = useId()
  const allowed = hasFeature('hr-sync')

  const load = useCallback(async () => {
    try { setStatus(await api.get<Status>(`/api/charts/${chart.id}/integration`)); setLoadError(null) }
    catch (err) { setLoadError(message(err, "Couldn't load the BambooHR connection.")) }
  }, [chart.id])
  useEffect(() => {
    if (!allowed) return
    let live = true
    api.get<Status>(`/api/charts/${chart.id}/integration`).then(
      st => { if (live) setStatus(st) },
      err => { if (live) setLoadError(message(err, "Couldn't load the BambooHR connection.")) },
    )
    return () => { live = false }
  }, [allowed, chart.id])

  async function run<T>(what: NonNullable<typeof busy>, task: () => Promise<T>, failure: string): Promise<T | undefined> {
    setBusy(what); setError(null)
    try { return await task() } catch (err) { setError(message(err, failure)); return undefined } finally { setBusy(null) }
  }

  const doConnect = () => run('connect', async () => {
    const s = await api.put<Status>(`/api/charts/${chart.id}/integration`, { subdomain: subdomain.trim().toLowerCase(), apiKey: apiKey.trim(), autoSync })
    setApiKey('')
    setStatus(s)
    addToast(`${chart.name} is connected to BambooHR.`, 'success')
  }, "Couldn't connect to BambooHR.")

  const doPreview = () => run('preview', async () => setPreview(await api.post<Preview>(`/api/charts/${chart.id}/integration/preview`, {})), "Couldn't read BambooHR.")

  const doSync = () => run('sync', async () => {
    const { result } = await api.post<{ result: SyncResult }>(`/api/charts/${chart.id}/integration/sync`, {})
    setPreview(null)
    await load()
    if (result.status === 'ok') { addToast(`${chart.name} is up to date with BambooHR.`, 'success'); onSynced() }
    else addToast('The chart already matches BambooHR.', 'info')
  }, "Couldn't sync with BambooHR.")

  const doAuto = (value: boolean) => run('auto', async () => {
    if (status?.connected) setStatus(await api.put<Status>(`/api/charts/${chart.id}/integration`, { subdomain: status.subdomain, autoSync: value }))
  }, "Couldn't change the daily sync.")

  const doDisconnect = () => run('disconnect', async () => {
    await api.delete(`/api/charts/${chart.id}/integration`)
    setConfirmDisconnect(false); setPreview(null)
    await load()
  }, "Couldn't disconnect.")

  const total = preview ? preview.joiners.length + preview.leavers.length + preview.moves.length + preview.edits.length : 0

  return (
    <Dialog label="BambooHR sync" onClose={() => { if (!busy) onClose() }} zIndex={210}
      panelStyle={{ borderRadius: 20, padding: 28, width: 600, maxHeight: '90vh', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>BambooHR sync</h2>
        <button aria-label="Close" onClick={onClose} disabled={!!busy} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 16 }}>
        Keep <strong>{chart.name}</strong> in step with BambooHR. People are matched by their BambooHR employee id, then their work email.
        Open and planned roles you made here stay.
      </p>

      {!allowed && <LockedFeatureCard feature="hr-sync" />}
      {allowed && loadError && (
        <p role="alert" style={errorBox}>{loadError} <button onClick={() => void load()} style={linkBtn}>Retry</button></p>
      )}
      {allowed && !loadError && !status && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Loading…</p>}

      {allowed && status && !status.available && (
        <p role="status" style={noteBox}>BambooHR connections are not set up on this server yet (the owner sets INTEGRATION_ENCRYPTION_KEY).</p>
      )}

      {allowed && status && status.available && !status.connected && (canAdmin ? (
        <div>
          <label htmlFor={subId} style={label}>BambooHR subdomain</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <input id={subId} value={subdomain} onChange={e => setSubdomain(e.target.value)} placeholder="yourcompany" autoComplete="off" style={input} />
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>.bamboohr.com</span>
          </div>
          <p style={hint}>The part before .bamboohr.com in your BambooHR address.</p>
          <label htmlFor={keyId} style={label}>API key</label>
          <input id={keyId} type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="off" style={{ ...input, marginBottom: 4 }} />
          <p style={hint}>
            In BambooHR: your photo, then API Keys, then Add New Key. Use a key of a user who can see every employee and their manager. We store it
            encrypted, never show it again, and only read from BambooHR.
          </p>
          <label htmlFor={autoId} style={{ ...label, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
            <input id={autoId} type="checkbox" checked={autoSync} onChange={e => setAutoSync(e.target.checked)} />
            Sync every day (it waits for a review when many people would leave at once)
          </label>
          <button onClick={() => void doConnect()} disabled={!subdomain.trim() || apiKey.trim().length < 8 || !!busy} style={{ ...primaryBtn, marginTop: 12, opacity: !subdomain.trim() || apiKey.trim().length < 8 ? 0.5 : 1 }}>
            <Link2 size={14} /> {busy === 'connect' ? 'Checking the key…' : 'Connect'}
          </button>
        </div>
      ) : (
        <p role="status" style={noteBox}>This chart is not connected to BambooHR. Ask a workspace admin to connect it.</p>
      ))}

      {allowed && status?.connected && (
        <div>
          <p style={{ fontSize: 13, color: 'var(--text)', marginBottom: 6 }}>
            Connected to <strong>{status.subdomain}.bamboohr.com</strong> · key ending {status.keyHint}
          </p>
          {resultLine(status.lastResult) && (
            <p data-testid="hr-last-result" style={{ fontSize: 12, color: status.lastResult?.status === 'failed' || status.lastResult?.status === 'held' ? 'var(--warn)' : 'var(--muted)', marginBottom: 10, lineHeight: 1.5 }}>
              {resultLine(status.lastResult)}
            </p>
          )}
          {canAdmin && (
            <label htmlFor={autoId} style={{ ...label, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
              <input id={autoId} type="checkbox" checked={status.autoSync} disabled={!!busy} onChange={e => void doAuto(e.target.checked)} />
              Sync every day (it waits for a review when many people would leave at once)
            </label>
          )}

          {!preview && (
            <button onClick={() => void doPreview()} disabled={!!busy} style={{ ...primaryBtn, marginTop: 12 }}>
              <RefreshCw size={14} /> {busy === 'preview' ? 'Reading BambooHR…' : 'Preview changes'}
            </button>
          )}

          {preview && (
            <div style={{ marginTop: 14 }}>
              {preview.issues.filter(i => i.severity === 'error').map((i, n) => <p key={n} role="alert" style={{ ...errorBox, marginBottom: 8 }}>{i.message}</p>)}
              {!preview.blocked && !preview.hasChanges && <p role="status" style={noteBox}>The chart already matches BambooHR.</p>}
              {!preview.blocked && (
                <div aria-label="Changes" style={{ display: 'grid', gap: 10 }}>
                  <ChangeList title="Joiners" items={preview.joiners.map((j, i) => ({ id: `j${i}`, text: j.label, note: j.manager ? `reports to ${j.manager}` : 'top of the chart' }))} />
                  <ChangeList title="Leavers (removed)" items={preview.leavers.map((l, i) => ({ id: `l${i}`, text: l.label }))} />
                  <ChangeList title="Moves" items={preview.moves.map((m, i) => ({ id: `m${i}`, text: m.label, note: `${m.from ?? 'nobody'} → ${m.to ?? 'nobody'}` }))} />
                  <ChangeList title="Changed" items={preview.edits.map((e, i) => ({
                    id: `e${i}`, text: e.label, note: e.changes.map(c => `${CHANGED_FIELD_LABEL[c.field]}: ${c.from || '(none)'} → ${c.to || '(none)'}`).join('; '),
                  }))} />
                </div>
              )}
              <p style={{ ...hint, marginTop: 10 }}>Leavers can be restored for 3 days, and the chart is saved as a version first.</p>
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button onClick={() => setPreview(null)} disabled={!!busy} style={secondaryBtn}>Back</button>
                <button onClick={() => void doSync()} disabled={!!busy || preview.blocked || !preview.hasChanges} style={{ ...primaryBtn, flex: 2, opacity: preview.blocked || !preview.hasChanges ? 0.5 : 1 }}>
                  {busy === 'sync' ? 'Syncing…' : `Apply ${total} change${total === 1 ? '' : 's'}`}
                </button>
              </div>
            </div>
          )}

          {canAdmin && !preview && (
            <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              {!confirmDisconnect
                ? <button onClick={() => setConfirmDisconnect(true)} style={linkBtn}>Disconnect from BambooHR…</button>
                : (
                  <p style={{ fontSize: 13, color: 'var(--text)' }}>
                    The chart stays as it is and the stored key is deleted.{' '}
                    <button onClick={() => void doDisconnect()} disabled={!!busy} style={{ ...linkBtn, color: 'var(--danger)' }}>Disconnect</button>{' '}
                    <button onClick={() => setConfirmDisconnect(false)} style={linkBtn}>Keep it</button>
                  </p>
                )}
            </div>
          )}
        </div>
      )}

      {error && <p role="alert" style={{ ...errorBox, marginTop: 12 }}>{error}</p>}
    </Dialog>
  )
}

const label: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }
const hint: React.CSSProperties = { fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 12 }
const input: React.CSSProperties = { flex: 1, width: '100%', padding: '8px 10px', background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14 }
const primaryBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 16px', background: 'var(--grad-brand)', border: 'none', borderRadius: 9, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }
const secondaryBtn: React.CSSProperties = { flex: 1, padding: '10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--muted)', fontSize: 14, cursor: 'pointer' }
const linkBtn: React.CSSProperties = { background: 'transparent', border: 'none', color: 'var(--brand)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }
const errorBox: React.CSSProperties = { padding: '10px 12px', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 10, fontSize: 13, lineHeight: 1.5 }
const noteBox: React.CSSProperties = { padding: '10px 12px', background: 'var(--raised)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, lineHeight: 1.5 }
