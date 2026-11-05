import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useUser, useClerk } from '@clerk/clerk-react'
import { Users } from 'lucide-react'
import { switchWorkspace } from '../lib/workspaceSelection'
import { api, ApiError } from '../lib/apiClient'
import { IS_DEV_BYPASS } from '../features/auth/useAuth'
import { rememberInviteToken, forgetInviteToken } from '../features/auth/pendingInvite'
import type { Permission } from '../types'

interface InvitePreview {
  workspaceName: string
  inviterName: string | null
  email: string
  permission: Permission
  expiresAt: string | null
}

const ROLE_LABEL: Record<Permission, string> = {
  owner: 'Owner', admin: 'Admin', editor: 'Editor', commenter: 'Commenter', viewer: 'Viewer',
}

// /invite/:token — public. Shows who invited you, then either sends you to
// sign up / sign in (and back here), or accepts the invite if you're signed in.
export function InvitePage() {
  // Dev bypass: no Clerk, so no account switching; the server decides as u-dev.
  if (IS_DEV_BYPASS) return <InviteCard signedIn userEmail={null} />
  return <ClerkInvite />
}

function ClerkInvite() {
  const { isLoaded, isSignedIn, user } = useUser()
  if (!isLoaded) return <Shell><p style={muted}>Loading…</p></Shell>
  return <InviteCard signedIn={!!isSignedIn} userEmail={user?.primaryEmailAddress?.emailAddress ?? null} />
}

function InviteCard({ signedIn, userEmail }: { signedIn: boolean; userEmail: string | null }) {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [acceptError, setAcceptError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    document.title = 'Join workspace · StratMap'
    rememberInviteToken(token)
    api.get<InvitePreview>(`/api/invites/${encodeURIComponent(token)}`)
      .then(setPreview)
      .catch((err: unknown) => {
        const code = err instanceof ApiError ? err.message : ''
        setLoadError(code === 'invite-expired'
          ? 'This invite has expired. Ask the person who invited you to resend it.'
          : 'This invite link is invalid or has already been used.')
        forgetInviteToken()
      })
  }, [token])

  async function accept() {
    setAccepting(true)
    setAcceptError(null)
    try {
      const joined = await api.post<{ workspaceId: string }>('/api/invites/accept', { token })
      forgetInviteToken()
      // Switch to the joined workspace (you may belong to others too) and reload,
      // so AuthProvider re-reads the workspace and your role.
      switchWorkspace(joined.workspaceId)
    } catch (err) {
      setAcceptError(err instanceof ApiError ? err.userMessage : 'Something went wrong. Please try again.')
      setAccepting(false)
    }
  }

  if (loadError) {
    return (
      <Shell>
        <h1 style={heading}>Invite unavailable</h1>
        <p style={muted}>{loadError}</p>
        <Link to="/" style={{ ...linkBtn, marginTop: 20 }}>Go to StratMap</Link>
      </Shell>
    )
  }
  if (!preview) return <Shell><p style={muted}>Loading invite…</p></Shell>

  const back = encodeURIComponent(`/invite/${token}`)
  const wrongAccount = signedIn && userEmail && userEmail.toLowerCase() !== preview.email.toLowerCase()

  return (
    <Shell>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--brand-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <Users size={22} color="var(--brand)" />
      </div>
      <h1 style={heading}>Join {preview.workspaceName}</h1>
      <p style={muted}>
        {preview.inviterName ? <><strong style={{ color: 'var(--text)' }}>{preview.inviterName}</strong> invited you</> : 'You have been invited'}
        {' '}to collaborate as {/^[AEIOU]/.test(ROLE_LABEL[preview.permission]) ? 'an' : 'a'} <strong style={{ color: 'var(--text)' }}>{ROLE_LABEL[preview.permission]}</strong>.
      </p>
      <p style={{ ...muted, fontSize: 12, marginTop: 6 }}>Invite sent to {preview.email}</p>

      {signedIn ? (
        <>
          {wrongAccount && (
            <p style={warnBox}>
              You're signed in as {userEmail}. If that address isn't verified on your account, accepting will fail.
              Sign in as {preview.email} instead.
            </p>
          )}
          <button onClick={accept} disabled={accepting} style={{ ...primaryBtn, opacity: accepting ? 0.7 : 1 }}>
            {accepting ? 'Joining…' : `Join ${preview.workspaceName}`}
          </button>
          {wrongAccount && <SwitchAccount back={back} />}
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
          <button onClick={() => navigate(`/sign-up?redirect_url=${back}`)} style={primaryBtn}>Create an account to join</button>
          <button onClick={() => navigate(`/sign-in?redirect_url=${back}`)} style={secondaryBtn}>I already have an account</button>
          <p style={{ ...muted, fontSize: 12 }}>Use {preview.email} so we can match your invite.</p>
        </div>
      )}

      {acceptError && <p style={errorBox}>{acceptError}</p>}
    </Shell>
  )
}

function SwitchAccount({ back }: { back: string }) {
  const clerk = useClerk()
  return (
    <button onClick={() => clerk.signOut({ redirectUrl: `/sign-in?redirect_url=${back}` })} style={{ ...secondaryBtn, marginTop: 8 }}>
      Use a different account
    </button>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 420, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 32, boxShadow: 'var(--shadow-sm)', textAlign: 'center' }}>
        {children}
      </div>
    </div>
  )
}

const heading: React.CSSProperties = { fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 8, letterSpacing: '-.3px' }
const muted: React.CSSProperties = { fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }
const primaryBtn: React.CSSProperties = { width: '100%', marginTop: 20, padding: '11px 16px', background: 'var(--grad-brand)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }
const secondaryBtn: React.CSSProperties = { width: '100%', padding: '10px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }
const linkBtn: React.CSSProperties = { display: 'inline-block', color: 'var(--brand)', fontSize: 14, fontWeight: 600, textDecoration: 'none' }
const warnBox: React.CSSProperties = { marginTop: 16, padding: '10px 12px', background: 'var(--warn-bg)', color: 'var(--warn)', borderRadius: 10, fontSize: 12, lineHeight: 1.5, textAlign: 'left' }
const errorBox: React.CSSProperties = { marginTop: 16, padding: '10px 12px', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 10, fontSize: 13, lineHeight: 1.5, textAlign: 'left' }
