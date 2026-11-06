import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/apiClient'
import { switchWorkspace } from '../../lib/workspaceSelection'

// Workspaces the person owns that were deleted and can still be restored (roadmap 4.2). Shown on the onboarding
// page (right after deleting, there is no workspace to land in) and in Settings → General.

interface Deleted { id: string; name: string; eraseOn: string }

export function DeletedWorkspaceNotice() {
  const [items, setItems] = useState<Deleted[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api.get<{ deleted?: Deleted[] }>('/api/workspaces')
      .then(r => { if (alive) setItems(r.deleted ?? []) })
      .catch(() => { /* optional notice: stay quiet if the list can't load */ })
    return () => { alive = false }
  }, [])

  async function restore(id: string) {
    setBusy(id)
    setError(null)
    try {
      await api.post('/api/workspace/restore', { workspaceId: id })
      switchWorkspace(id)
    } catch (err) {
      setError(err instanceof ApiError ? err.userMessage : 'Could not restore the workspace')
      setBusy(null)
    }
  }

  if (items.length === 0) return null
  return (
    <div data-testid="deleted-workspaces" style={{ width: '100%', maxWidth: 520, marginBottom: 20 }}>
      {items.map(w => (
        <div key={w.id} style={{ background: 'var(--surface)', border: '1px solid var(--warn)', borderRadius: 12, padding: '14px 16px', marginBottom: 8 }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--text)' }}>
            <strong>{w.name}</strong> was deleted. You can restore it until{' '}
            <strong>{new Date(w.eraseOn).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</strong>, after which it is permanently erased.
            A restored workspace starts on the Free plan.
          </p>
          <button
            onClick={() => void restore(w.id)}
            disabled={busy !== null}
            style={{ marginTop: 10, padding: '7px 14px', background: 'var(--grad-brand)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}
          >
            {busy === w.id ? 'Restoring…' : 'Restore workspace'}
          </button>
        </div>
      ))}
      {error && <p role="alert" style={{ fontSize: 12, color: 'var(--danger)', margin: '4px 0 0' }}>{error}</p>}
    </div>
  )
}
