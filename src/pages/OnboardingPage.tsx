import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, X } from 'lucide-react'
import { useUserStore } from '../store/userStore'
import { useToastStore } from '../store/toastStore'
import { useAuth } from '../features/auth/useAuth'
import type { Permission, CompanySize, WorkspaceRole } from '../types'

type Step = 1 | 2

interface InviteRow {
  email: string
  permission: Permission
}

const ROLES: WorkspaceRole[] = ['Founder/CEO', 'HR Leader', 'Operations', 'Finance', 'Other']
const SIZES: CompanySize[] = ['1-10', '11-50', '51-200', '201-1000', '1000+']
const PERMISSIONS: Permission[] = ['admin', 'editor', 'viewer']

export function OnboardingPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { setWorkspace } = useUserStore()
  const { addToast } = useToastStore()

  const [step, setStep] = useState<Step>(1)
  const [workspaceName, setWorkspaceName] = useState('')
  const [ownerRole, setOwnerRole] = useState<WorkspaceRole>('Founder/CEO')
  const [size, setSize] = useState<CompanySize>('11-50')
  const [focus, setFocus] = useState<string | null>(null)
  const [invites, setInvites] = useState<InviteRow[]>([
    { email: '', permission: 'editor' },
    { email: '', permission: 'editor' },
    { email: '', permission: 'editor' },
  ])

  function handleContinue() {
    if (!workspaceName.trim()) return
    setStep(2)
  }

  function updateInvite(idx: number, field: keyof InviteRow, value: string) {
    setInvites((rows) => rows.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  function addInviteRow() {
    if (invites.length >= 5) return
    setInvites((rows) => [...rows, { email: '', permission: 'editor' }])
  }

  function removeInviteRow(idx: number) {
    setInvites((rows) => rows.filter((_, i) => i !== idx))
  }

  function complete(sendInvites: boolean) {
    const now = new Date().toISOString()
    const filledInvites = sendInvites
      ? invites.filter((r) => r.email.trim())
      : []

    setWorkspace({
      id: `ws-${Date.now()}`,
      name: workspaceName.trim(),
      ownerRole,
      size,
      members: user
        ? [{ user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl }, permission: 'owner', joinedAt: now }]
        : [],
      pendingInvites: filledInvites.map((r) => ({
        email: r.email.trim(),
        permission: r.permission,
        sentAt: now,
      })),
      createdAt: now,
    })

    const firstName = user?.name.split(' ')[0] ?? 'there'
    addToast(`Welcome to StratMap, ${firstName}!`, 'success')
    navigate('/charts')
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 36 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'var(--grad-brand)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 800, color: '#fff',
          boxShadow: '0 4px 14px var(--brand-glow)',
        }}>SM</div>
        <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', letterSpacing: '-.4px' }}>StratMap</span>
      </div>

      {/* Step dots */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
        {([1, 2] as Step[]).map((s) => (
          <div key={s} style={{
            width: 8, height: 8, borderRadius: '50%',
            background: step >= s ? 'var(--brand)' : 'var(--dim)',
            transition: 'background .2s',
          }} />
        ))}
      </div>

      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 480,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 20, padding: 32,
        boxShadow: 'var(--shadow)',
        animation: 'nodePop .25s ease-out',
      }}>
        {step === 1 ? (
          <Step1
            workspaceName={workspaceName}
            setWorkspaceName={setWorkspaceName}
            ownerRole={ownerRole}
            setOwnerRole={setOwnerRole}
            size={size}
            setSize={setSize}
            focus={focus}
            setFocus={setFocus}
            onContinue={handleContinue}
          />
        ) : (
          <Step2
            invites={invites}
            updateInvite={updateInvite}
            addInviteRow={addInviteRow}
            removeInviteRow={removeInviteRow}
            onSkip={() => complete(false)}
            onSend={() => complete(true)}
            canAddMore={invites.length < 5}
          />
        )}
      </div>
    </div>
  )
}

// ── Step 1 ──────────────────────────────────────────────────────────────────
function Step1({
  workspaceName, setWorkspaceName,
  ownerRole, setOwnerRole,
  size, setSize,
  focus, setFocus,
  onContinue,
}: {
  workspaceName: string
  setWorkspaceName: (v: string) => void
  ownerRole: WorkspaceRole
  setOwnerRole: (v: WorkspaceRole) => void
  size: CompanySize
  setSize: (v: CompanySize) => void
  focus: string | null
  setFocus: (v: string | null) => void
  onContinue: () => void
}) {
  const valid = workspaceName.trim().length > 0

  return (
    <>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Step 1 of 2</p>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-.4px', marginBottom: 6 }}>Set up your workspace</h2>
      <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 28 }}>Tell us a bit about your organisation</p>

      {/* Workspace name */}
      <div style={{ marginBottom: 18 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>
          Workspace name <span style={{ color: 'var(--danger)' }}>*</span>
        </label>
        <input
          data-testid="workspace-name"
          type="text"
          placeholder="e.g. Acme Corp, My Startup"
          value={workspaceName}
          onChange={(e) => setWorkspaceName(e.target.value)}
          onFocus={() => setFocus('name')}
          onBlur={() => setFocus(null)}
          style={{
            width: '100%', padding: '10px 12px',
            background: 'var(--input-bg)',
            border: `1px solid ${focus === 'name' ? 'var(--brand)' : 'var(--border)'}`,
            boxShadow: focus === 'name' ? '0 0 0 3px var(--brand-bg)' : 'none',
            borderRadius: 8, color: 'var(--text)', fontSize: 14, transition: 'all .15s',
          }}
        />
      </div>

      {/* Your role */}
      <div style={{ marginBottom: 18 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>Your role</label>
        <select
          data-testid="owner-role"
          value={ownerRole}
          onChange={(e) => setOwnerRole(e.target.value as WorkspaceRole)}
          style={{
            width: '100%', padding: '10px 12px',
            background: 'var(--input-bg)',
            border: '1px solid var(--border)',
            borderRadius: 8, color: 'var(--text)', fontSize: 14,
          }}
        >
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {/* Company size */}
      <div style={{ marginBottom: 32 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>Company size</label>
        <select
          data-testid="company-size"
          value={size}
          onChange={(e) => setSize(e.target.value as CompanySize)}
          style={{
            width: '100%', padding: '10px 12px',
            background: 'var(--input-bg)',
            border: '1px solid var(--border)',
            borderRadius: 8, color: 'var(--text)', fontSize: 14,
          }}
        >
          {SIZES.map((s) => <option key={s} value={s}>{s} people</option>)}
        </select>
      </div>

      <button
        data-testid="continue-btn"
        onClick={onContinue}
        disabled={!valid}
        style={{
          width: '100%', padding: '11px 20px',
          background: valid ? 'var(--grad-brand)' : 'var(--raised)',
          border: 'none', borderRadius: 8,
          color: valid ? '#fff' : 'var(--dim)',
          fontSize: 14, fontWeight: 600,
          cursor: valid ? 'pointer' : 'not-allowed',
          transition: 'all .15s',
        }}
      >
        Continue
      </button>
    </>
  )
}

// ── Step 2 ──────────────────────────────────────────────────────────────────
function Step2({
  invites, updateInvite, addInviteRow, removeInviteRow,
  onSkip, onSend, canAddMore,
}: {
  invites: InviteRow[]
  updateInvite: (idx: number, field: keyof InviteRow, value: string) => void
  addInviteRow: () => void
  removeInviteRow: (idx: number) => void
  onSkip: () => void
  onSend: () => void
  canAddMore: boolean
}) {
  return (
    <>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Step 2 of 2</p>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-.4px', marginBottom: 6 }}>Invite your team</h2>
      <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 28 }}>StratMap is better with your team — you can always do this later</p>

      {invites.map((row, idx) => (
        <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
          <input
            data-testid={`invite-email-${idx}`}
            type="email"
            placeholder="colleague@company.com"
            value={row.email}
            onChange={(e) => updateInvite(idx, 'email', e.target.value)}
            style={{
              flex: 1, padding: '9px 12px',
              background: 'var(--input-bg)',
              border: '1px solid var(--border)',
              borderRadius: 8, color: 'var(--text)', fontSize: 13,
            }}
          />
          <select
            data-testid={`invite-role-${idx}`}
            value={row.permission}
            onChange={(e) => updateInvite(idx, 'permission', e.target.value as Permission)}
            style={{
              padding: '9px 10px',
              background: 'var(--input-bg)',
              border: '1px solid var(--border)',
              borderRadius: 8, color: 'var(--text)', fontSize: 13,
              flexShrink: 0,
            }}
          >
            {PERMISSIONS.map((p) => (
              <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
            ))}
          </select>
          {invites.length > 1 && (
            <button
              onClick={() => removeInviteRow(idx)}
              style={{
                width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                background: 'transparent', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'var(--muted)',
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>
      ))}

      {canAddMore && (
        <button
          onClick={addInviteRow}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'transparent', border: 'none',
            color: 'var(--brand)', fontSize: 13, cursor: 'pointer',
            marginBottom: 28, marginTop: 4, padding: 0,
          }}
        >
          <Plus size={13} /> Add another
        </button>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: canAddMore ? 0 : 28 }}>
        <button
          data-testid="skip-btn"
          onClick={onSkip}
          style={{
            flex: 1, padding: '10px 16px',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 8, color: 'var(--muted)',
            fontSize: 14, fontWeight: 500, cursor: 'pointer',
          }}
        >
          Skip for now
        </button>
        <button
          data-testid="send-invites-btn"
          onClick={onSend}
          style={{
            flex: 2, padding: '10px 16px',
            background: 'var(--grad-brand)',
            border: 'none', borderRadius: 8,
            color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Send invites &amp; get started
        </button>
      </div>
    </>
  )
}
