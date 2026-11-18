import { useId, useState } from 'react'
import { api, ApiError } from '../../lib/apiClient'
import { useUserStore } from '../../store/userStore'

// Settings → General, owner only: hand the workspace to one of its admins. The server enforces every rule (owner only,
// target must be an admin, typed name, one owned workspace per person); this only makes them easy to follow.

const small = { fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 14px' } as const
const ghostBtn = { padding: '8px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' } as const
const primaryBtn = (enabled: boolean) => ({ padding: '8px 14px', background: enabled ? 'var(--brand)' : 'var(--raised)', border: 'none', borderRadius: 8, color: enabled ? '#fff' : 'var(--dim)', fontSize: 13, fontWeight: 600, cursor: enabled ? 'pointer' : 'default' }) as const
const field = { width: '100%', boxSizing: 'border-box', padding: '9px 12px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14, marginBottom: 10 } as const

export function TransferOwnership() {
  const workspace = useUserStore(s => s.workspace)
  const me = useUserStore(s => s.user?.id)
  const selectId = useId()
  const nameId = useId()
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState('')
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!workspace) return null
  const admins = (workspace.members ?? []).filter(m => m.permission === 'admin' && m.user.id !== me)
  const ready = !!target && typed.trim() === workspace.name && !busy

  async function submit() {
    setBusy(true); setError(null)
    try {
      await api.post('/api/workspace/transfer-ownership', { userId: target, confirmName: typed.trim() })
      window.location.assign('/dashboard') // reloads every store: you are an admin now
    } catch (err) {
      setError(err instanceof ApiError ? err.userMessage : 'Could not transfer ownership')
      setBusy(false)
    }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <p style={small}>
        <strong>Transfer ownership.</strong> Make one of your admins the owner. You become an admin, and can then leave the workspace if you want to.
        Billing stays with the workspace and every admin can manage it. A person can own only one workspace.
      </p>
      {!open ? (
        <button style={ghostBtn} onClick={() => setOpen(true)}>Transfer ownership…</button>
      ) : admins.length === 0 ? (
        <>
          <p style={small}>There is no other admin yet. Make someone an admin under Members first, then come back here.</p>
          <button style={ghostBtn} onClick={() => setOpen(false)}>Close</button>
        </>
      ) : (
        <div>
          <label htmlFor={selectId} style={{ fontSize: 12, color: 'var(--text)', display: 'block', marginBottom: 6 }}>New owner</label>
          <select id={selectId} style={field} value={target} onChange={e => setTarget(e.target.value)}>
            <option value="">Choose an admin…</option>
            {admins.map(m => <option key={m.user.id} value={m.user.id}>{m.user.name || m.user.email}</option>)}
          </select>
          <label htmlFor={nameId} style={{ fontSize: 12, color: 'var(--text)', display: 'block', marginBottom: 6 }}>Type <strong>{workspace.name}</strong> to confirm</label>
          <input id={nameId} style={field} value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" />
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={primaryBtn(ready)} disabled={!ready} onClick={() => void submit()}>{busy ? 'Transferring…' : 'Transfer ownership'}</button>
            <button style={ghostBtn} onClick={() => { setOpen(false); setTarget(''); setTyped(''); setError(null) }}>Cancel</button>
          </div>
          {error && <p role="alert" style={{ fontSize: 12, color: 'var(--danger)', margin: '12px 0 0' }}>{error}</p>}
        </div>
      )}
    </div>
  )
}
