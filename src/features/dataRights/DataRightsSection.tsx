import { useState } from 'react'
import { Download } from 'lucide-react'
import { api, ApiError } from '../../lib/apiClient'
import { downloadText } from '../../lib/csvSafe'
import { setSelectedWorkspaceId } from '../../lib/workspaceSelection'
import { useUserStore } from '../../store/userStore'
import { usePermission } from '../../hooks/usePermission'
import { useSignOut } from '../auth/useSignOut'

// Settings → General (roadmap 4.2): export the workspace's data, delete the workspace (owner), delete my account.
// The server enforces every rule (roles, typed confirmation); this screen only makes them easy to follow.

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, boxShadow: 'var(--shadow-sm)', marginTop: 20 } as const
const h3 = { fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 6px' } as const
const small = { fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 14px' } as const
const ghostBtn = { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' } as const
const dangerBtn = (enabled: boolean) => ({ padding: '8px 14px', background: enabled ? 'var(--danger)' : 'var(--raised)', border: 'none', borderRadius: 8, color: enabled ? '#fff' : 'var(--dim)', fontSize: 13, fontWeight: 600, cursor: enabled ? 'pointer' : 'default' }) as const
const input = { width: '100%', boxSizing: 'border-box', padding: '9px 12px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14, marginBottom: 10 } as const

export function DataRightsSection() {
  const { workspace } = useUserStore()
  const { permission, canAdmin } = usePermission()
  const isOwner = permission === 'owner'
  const signOut = useSignOut()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [open, setOpen] = useState<'workspace' | 'account' | 'leave' | null>(null)
  const [typed, setTyped] = useState('')

  const fail = (err: unknown, fallback: string) => setError(err instanceof ApiError ? err.userMessage : fallback)

  async function download(kind: 'json' | 'csv') {
    setBusy(kind); setError(null)
    try {
      const text = await api.getText(kind === 'csv' ? '/api/workspace/export?format=csv' : '/api/workspace/export')
      downloadText(kind === 'csv' ? 'stratmap-roles.csv' : 'stratmap-workspace.json', text, kind === 'csv' ? 'text/csv;charset=utf-8' : 'application/json')
    } catch (err) { fail(err, 'Could not export the workspace') } finally { setBusy(null) }
  }

  async function deleteWorkspace() {
    setBusy('workspace'); setError(null)
    try {
      await api.delete('/api/workspace', { confirmName: typed.trim() })
      setSelectedWorkspaceId(null)
      window.location.assign('/dashboard') // reloads every store; the deleted workspace is gone, so this lands on onboarding or another workspace
    } catch (err) { fail(err, 'Could not delete the workspace'); setBusy(null) }
  }

  async function deleteAccount() {
    setBusy('account'); setError(null)
    try {
      await api.delete('/api/account', { confirm: 'DELETE' })
      setSelectedWorkspaceId(null)
      await signOut('/')
    } catch (err) { fail(err, 'Could not delete the account'); setBusy(null) }
  }

  async function leaveWorkspace() {
    setBusy('leave'); setError(null)
    try {
      await api.post('/api/workspace/leave', {})
      setSelectedWorkspaceId(null)
      window.location.assign('/dashboard')   // another workspace if there is one, otherwise onboarding
    } catch (err) { fail(err, 'Could not leave the workspace'); setBusy(null) }
  }

  const toggle = (which: 'workspace' | 'account' | 'leave') => { setOpen(o => (o === which ? null : which)); setTyped(''); setError(null) }

  return (
    <div style={{ maxWidth: 500 }}>
      {canAdmin && (
        <div style={card}>
          <h3 style={h3}>Export your data</h3>
          <p style={small}>Download everything in this workspace: charts, roles, reporting lines, job descriptions with salary bands, templates, headcount plans, members and the activity log. Free on every plan.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={ghostBtn} onClick={() => void download('json')} disabled={busy !== null}><Download size={13} /> {busy === 'json' ? 'Preparing…' : 'All data (JSON)'}</button>
            <button style={ghostBtn} onClick={() => void download('csv')} disabled={busy !== null}><Download size={13} /> {busy === 'csv' ? 'Preparing…' : 'All roles (CSV)'}</button>
          </div>
        </div>
      )}

      <div style={{ ...card, borderColor: 'var(--danger)' }}>
        <h3 style={{ ...h3, color: 'var(--danger)' }}>Danger zone</h3>

        {isOwner && workspace && (
          <div style={{ marginBottom: 20 }}>
            <p style={small}>
              <strong>Delete this workspace.</strong> Everyone loses access immediately, the subscription is cancelled and members are emailed.
              You can restore it for 30 days (on the Free plan); after that everything in it is permanently erased.
            </p>
            {open !== 'workspace' ? (
              <button style={dangerBtn(true)} onClick={() => toggle('workspace')}>Delete workspace…</button>
            ) : (
              <div>
                <label htmlFor="confirm-workspace" style={{ fontSize: 12, color: 'var(--text)', display: 'block', marginBottom: 6 }}>Type <strong>{workspace.name}</strong> to confirm</label>
                <input id="confirm-workspace" style={input} value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={dangerBtn(typed.trim() === workspace.name && busy === null)} disabled={typed.trim() !== workspace.name || busy !== null} onClick={() => void deleteWorkspace()}>
                    {busy === 'workspace' ? 'Deleting…' : 'Delete this workspace'}
                  </button>
                  <button style={ghostBtn} onClick={() => toggle('workspace')}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}

        {!isOwner && workspace && (
          <div style={{ marginBottom: 20 }}>
            <p style={small}>
              <strong>Leave this workspace.</strong> You lose access to it and to everything in it. Your account and your other workspaces are not affected.
              What you wrote here (comments, for example) stays with the workspace. An admin can invite you back.
            </p>
            {open !== 'leave' ? (
              <button style={dangerBtn(true)} onClick={() => toggle('leave')}>Leave workspace…</button>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={dangerBtn(busy === null)} disabled={busy !== null} onClick={() => void leaveWorkspace()}>
                  {busy === 'leave' ? 'Leaving…' : `Leave ${workspace.name}`}
                </button>
                <button style={ghostBtn} onClick={() => toggle('leave')}>Cancel</button>
              </div>
            )}
          </div>
        )}

        <div>
          <p style={small}>
            <strong>Delete my account.</strong> You leave every workspace and your sign-in account is deleted.
            {isOwner && <> <strong>You own {workspace?.name ? `“${workspace.name}”` : 'this workspace'}, so it is deleted with you</strong> (members are emailed). Because you will no longer be able to sign in, you cannot restore it, and it is erased after 30 days.</>}
          </p>
          {open !== 'account' ? (
            <button style={dangerBtn(true)} onClick={() => toggle('account')}>Delete my account…</button>
          ) : (
            <div>
              <label htmlFor="confirm-account" style={{ fontSize: 12, color: 'var(--text)', display: 'block', marginBottom: 6 }}>Type <strong>DELETE</strong> to confirm</label>
              <input id="confirm-account" style={input} value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" />
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={dangerBtn(typed === 'DELETE' && busy === null)} disabled={typed !== 'DELETE' || busy !== null} onClick={() => void deleteAccount()}>
                  {busy === 'account' ? 'Deleting…' : 'Delete my account'}
                </button>
                <button style={ghostBtn} onClick={() => toggle('account')}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        {error && <p role="alert" style={{ fontSize: 12, color: 'var(--danger)', margin: '12px 0 0' }}>{error}</p>}
      </div>
    </div>
  )
}
