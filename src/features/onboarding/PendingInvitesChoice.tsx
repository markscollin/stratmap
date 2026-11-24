import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/apiClient'
import { switchWorkspace } from '../../lib/workspaceSelection'
import { useToastStore } from '../../store/toastStore'

// R-56: invites sent to the person's verified address are offered here, on onboarding, and never accepted without a click.
// Each shows the workspace, who invited them (name and email: a workspace name alone is easy to fake) and the role.
// Accept joins it; Decline deletes the invite; the onboarding form below makes their own workspace instead.

export interface MyInvite {
  id: string
  workspaceName: string
  inviterName: string | null
  inviterEmail: string | null
  permission: string
  expiresAt: string | null
}

const ROLE_LABEL: Record<string, string> = { admin: 'an admin', editor: 'an editor', commenter: 'a commenter', viewer: 'a viewer' }

export function PendingInvitesChoice() {
  const [invites, setInvites] = useState<MyInvite[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api.get<{ invites: MyInvite[] }>('/api/invites/mine')
      .then(r => { if (alive) setInvites(r.invites ?? []) })
      .catch(() => { /* the person can still create their own workspace; invite links keep working */ })
    return () => { alive = false }
  }, [])

  const toastError = (err: unknown, fallback: string) =>
    useToastStore.getState().addToast(err instanceof ApiError ? err.userMessage : fallback, 'error')

  async function accept(id: string) {
    setBusy(id)
    try {
      const joined = await api.post<{ workspaceId: string }>('/api/invites/accept', { inviteId: id })
      switchWorkspace(joined.workspaceId)
    } catch (err) {
      toastError(err, "Couldn't accept the invite. Please try again.")
      setBusy(null)
    }
  }

  async function decline(invite: MyInvite) {
    setBusy(invite.id)
    try {
      await api.post('/api/invites/decline', { inviteId: invite.id })
      setInvites(list => list.filter(i => i.id !== invite.id))
      useToastStore.getState().addToast(`Declined the invite to ${invite.workspaceName}.`, 'success')
    } catch (err) {
      toastError(err, "Couldn't decline the invite. Please try again.")
    } finally {
      setBusy(null)
    }
  }

  if (invites.length === 0) return null
  return (
    <section data-testid="pending-invites" aria-label="Invitations" style={{ width: '100%', maxWidth: 480, marginBottom: 20 }}>
      {invites.map(inv => {
        const who = inv.inviterName && inv.inviterEmail ? `${inv.inviterName} (${inv.inviterEmail})` : inv.inviterName || inv.inviterEmail || 'Someone'
        return (
          <div key={inv.id} data-testid="pending-invite" style={{ background: 'var(--surface)', border: '1px solid var(--brand)', borderRadius: 12, padding: '14px 16px', marginBottom: 8 }}>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--text)' }}>
              {who} invited you to <strong>{inv.workspaceName}</strong> as {ROLE_LABEL[inv.permission] ?? inv.permission}.
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>
              Only accept if you know them. Anything you add there belongs to that workspace.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                onClick={() => void accept(inv.id)}
                disabled={busy !== null}
                aria-label={`Accept the invite to ${inv.workspaceName}`}
                style={{ padding: '7px 14px', background: 'var(--grad-brand)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}
              >
                {busy === inv.id ? 'Working…' : 'Accept'}
              </button>
              <button
                onClick={() => void decline(inv)}
                disabled={busy !== null}
                aria-label={`Decline the invite to ${inv.workspaceName}`}
                style={{ padding: '7px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}
              >
                Decline
              </button>
            </div>
          </div>
        )
      })}
      <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>Or create your own workspace below.</p>
    </section>
  )
}
