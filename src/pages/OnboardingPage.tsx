import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, X, Zap } from 'lucide-react'
import { useUserStore } from '../store/userStore'
import { useToastStore } from '../store/toastStore'
import { useChartStore } from '../store/chartStore'
import { useAuth } from '../features/auth/useAuth'
import { api } from '../lib/apiClient'
import type { Permission, CompanySize, WorkspaceRole } from '../types'
import { mockDepartments } from '../data/mockOrg'

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
  const { addChart } = useChartStore()

  useEffect(() => { document.title = 'Get started — StratMap' }, [])

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

  function buildWorkspace(sendInvites: boolean) {
    const now = new Date().toISOString()
    const filledInvites = sendInvites ? invites.filter((r) => r.email.trim()) : []
    setWorkspace({
      id: `ws-${Date.now()}`,
      name: workspaceName.trim(),
      ownerRole, size,
      members: user
        ? [{ user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl }, permission: 'owner', joinedAt: now }]
        : [],
      pendingInvites: filledInvites.map((r) => ({ email: r.email.trim(), permission: r.permission, sentAt: now })),
      createdAt: now,
    })
  }

  async function complete(sendInvites: boolean) {
    const filledInvites = sendInvites ? invites.filter(r => r.email.trim()) : []
    try {
      const ws = await api.post<{ id: string; name: string; ownerRole: string; size: string; createdAt: string }>(
        '/api/workspace',
        { name: workspaceName.trim(), ownerRole, size, email: user?.email ?? '', userName: user?.name ?? '' }
      )
      const now = new Date().toISOString()
      setWorkspace({
        id: ws.id,
        name: ws.name,
        ownerRole: ws.ownerRole as WorkspaceRole,
        size: ws.size as CompanySize,
        members: user
          ? [{ user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl }, permission: 'owner', joinedAt: now }]
          : [],
        pendingInvites: filledInvites.map(r => ({ email: r.email.trim(), permission: r.permission, sentAt: now })),
        createdAt: ws.createdAt ?? now,
      })
      const firstName = user?.name.split(' ')[0] ?? 'there'
      addToast(`Welcome to StratMap, ${firstName}!`, 'success')
      navigate('/charts')
    } catch (err) {
      console.error('[onboarding] workspace creation failed:', err)
      addToast('Failed to create workspace. Please try again.', 'error')
    }
  }

  function completeWithQuickStart(sendInvites: boolean) {
    buildWorkspace(sendInvites)
    const now = new Date().toISOString()
    const dept = mockDepartments[0]
    const nodes = [
      { id: 'qs-1', name: 'CEO',             title: 'Chief Executive Officer',  departmentId: dept?.id ?? 'eng', managerId: null,   status: 'active' as const, employmentType: 'full-time' as const, x: 400, y: 0   },
      { id: 'qs-2', name: 'CTO',             title: 'Chief Technology Officer', departmentId: dept?.id ?? 'eng', managerId: 'qs-1', status: 'active' as const, employmentType: 'full-time' as const, x: 0,   y: 200 },
      { id: 'qs-3', name: 'CPO',             title: 'Chief Product Officer',    departmentId: dept?.id ?? 'eng', managerId: 'qs-1', status: 'active' as const, employmentType: 'full-time' as const, x: 260, y: 200 },
      { id: 'qs-4', name: 'Head of Sales',   title: 'Head of Sales',            departmentId: dept?.id ?? 'eng', managerId: 'qs-1', status: 'open'   as const, employmentType: 'full-time' as const, x: 520, y: 200 },
      { id: 'qs-5', name: 'Head of Ops',     title: 'Head of Operations',       departmentId: dept?.id ?? 'eng', managerId: 'qs-1', status: 'planned' as const, employmentType: 'full-time' as const, x: 780, y: 200 },
    ]
    const edges = [
      { id: 'qe-1', sourceId: 'qs-1', targetId: 'qs-2' },
      { id: 'qe-2', sourceId: 'qs-1', targetId: 'qs-3' },
      { id: 'qe-3', sourceId: 'qs-1', targetId: 'qs-4' },
      { id: 'qe-4', sourceId: 'qs-1', targetId: 'qs-5' },
    ]
    const chartId = `chart-qs-${Date.now()}`
    addChart({
      id: chartId, name: 'Current Structure', status: 'editing', version: 1, isPublic: false,
      departments: mockDepartments, nodes, edges,
      owner: user?.id ?? 'dev', creator: user?.id ?? 'dev',
      collaborators: [], createdAt: now, updatedAt: now,
    })
    const firstName = user?.name.split(' ')[0] ?? 'there'
    addToast(`Welcome to StratMap, ${firstName}! Your starter chart is ready.`, 'success')
    navigate(`/charts/${chartId}`)
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
            onQuickStart={() => completeWithQuickStart(false)}
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
  onSkip, onSend, onQuickStart, canAddMore,
}: {
  invites: InviteRow[]
  updateInvite: (idx: number, field: keyof InviteRow, value: string) => void
  addInviteRow: () => void
  removeInviteRow: (idx: number) => void
  onSkip: () => void
  onSend: () => void
  onQuickStart: () => void
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

      {/* Quick start option */}
      <div style={{
        marginTop: canAddMore ? 0 : 28, marginBottom: 12,
        padding: '14px 16px', background: 'var(--raised)', borderRadius: 10,
        border: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
              Start with a starter chart
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Creates a 5-node "Current Structure" chart — CEO, CTO, CPO, Head of Sales &amp; Ops
            </div>
          </div>
          <button
            onClick={onQuickStart}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', flexShrink: 0,
              background: 'var(--brand-bg)', border: '1px solid var(--brand)',
              borderRadius: 8, color: 'var(--brand)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Zap size={13} /> Quick start
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
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
