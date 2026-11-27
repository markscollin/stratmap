import { useState, useEffect, useRef } from 'react'
import { greetingName } from '../lib/greetingName'
import { useNavigate } from 'react-router-dom'
import { Plus, X, Zap, Upload } from 'lucide-react'
import { useUserStore } from '../store/userStore'
import { useBillingStore, PLAN_BY_TIER } from '../store/billingStore'
import { useToastStore } from '../store/toastStore'
import { useChartStore } from '../store/chartStore'
import { useAuth } from '../features/auth/useAuth'
import { setSelectedWorkspaceId } from '../lib/workspaceSelection'
import { api } from '../lib/apiClient'
import { DeletedWorkspaceNotice } from '../features/dataRights/DeletedWorkspaceNotice'
import { PendingInvitesChoice } from '../features/onboarding/PendingInvitesChoice'
import type { Permission, CompanySize, WorkspaceRole, Workspace, PlanTier } from '../types'
import { onboardingStart, type OnboardingStart } from '../lib/onboardingStart'
import { buildChartTemplate } from '../lib/chartTemplates'
import { PLAN_LIMITS } from '../lib/plans'

// New workspaces start on Free; the API rejects invites beyond the plan's seats
// (owner + invitees), so onboarding only offers as many rows as will fit.
const MAX_ONBOARDING_INVITES = Math.min(5, PLAN_LIMITS.free.seats - 1)

type Step = 1 | 2

interface InviteRow {
  email: string
  permission: Permission
}

const SIZES: CompanySize[] = ['1-10', '11-50', '51-200', '201-1000', '1000+']
const PERMISSIONS: Permission[] = ['admin', 'editor', 'viewer']

export function OnboardingPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { setWorkspace, setPermission } = useUserStore()
  const { addToast } = useToastStore()
  const { createChart } = useChartStore()

  useEffect(() => { document.title = 'Get started — StratMap' }, [])

  const [step, setStep] = useState<Step>(1)
  const [workspaceName, setWorkspaceName] = useState('')
  const [size, setSize] = useState<CompanySize>('11-50')
  const [focus, setFocus] = useState<string | null>(null)
  // One finish at a time (R-34): a double click used to send the invites and create the starter chart twice.
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [invites, setInvites] = useState<InviteRow[]>(() =>
    Array.from({ length: Math.min(2, MAX_ONBOARDING_INVITES) }, () => ({ email: '', permission: 'editor' as Permission })),
  )

  function handleContinue() {
    if (!workspaceName.trim()) return
    setStep(2)
  }

  function updateInvite(idx: number, field: keyof InviteRow, value: string) {
    setInvites((rows) => rows.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  function addInviteRow() {
    if (invites.length >= MAX_ONBOARDING_INVITES) return
    setInvites((rows) => [...rows, { email: '', permission: 'editor' }])
  }

  function removeInviteRow(idx: number) {
    setInvites((rows) => rows.filter((_, i) => i !== idx))
  }

  const start = onboardingStart(size)

  async function complete(sendInvites: boolean, then: 'charts' | 'quick-start' | 'import' = 'charts') {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      await finish(sendInvites, then)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function finish(sendInvites: boolean, then: 'charts' | 'quick-start' | 'import') {
    const filledInvites = sendInvites ? invites.filter(r => r.email.trim()) : []
    try {
      const ws = await api.post<{ id: string; name: string; ownerRole: string; size: string; createdAt: string; myPermission?: Permission; planTier?: PlanTier; trialPlan?: PlanTier | null; trialEndsAt?: string | null }>(
        '/api/workspace',
        // "Your role" is no longer asked (R-80: nothing used it); the size picks how the workspace starts.
        { name: workspaceName.trim(), size }
      )
      setSelectedWorkspaceId(ws.id)
      const now = new Date().toISOString()
      const created: Workspace = {
        id: ws.id,
        name: ws.name,
        ownerRole: ws.ownerRole as WorkspaceRole,
        size: ws.size as CompanySize,
        members: user
          ? [{ user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl }, permission: ws.myPermission ?? 'owner', joinedAt: now }]
          : [],
        pendingInvites: filledInvites.map(r => ({ email: r.email.trim(), permission: r.permission, sentAt: now })),
        createdAt: ws.createdAt ?? now,
      }
      setWorkspace(created)
      // The plan the new workspace actually has (it starts on a free trial of a paid plan, R-18), so nothing waits for a reload.
      useBillingStore.getState().setPlan(PLAN_BY_TIER[ws.planTier ?? 'free'])
      useBillingStore.getState().setTrial(ws.trialPlan && ws.trialEndsAt ? { plan: ws.trialPlan, endsAt: ws.trialEndsAt } : null)
      // You created it, so you own it (AuthProvider starts everyone as viewer until the server says otherwise).
      setPermission(ws.myPermission ?? 'owner') // what the server says this person is (an invited viewer is not the owner)
      // Persist + email invites (best-effort — failure shouldn't block onboarding)
      if (filledInvites.length > 0) {
        try {
          await api.post('/api/workspace/invites', {
            invites: filledInvites.map(r => ({ email: r.email.trim(), permission: r.permission })),
          })
        } catch (inviteErr) {
          console.error('[onboarding] sending invites failed:', inviteErr)
          // Nothing was sent, so do not list them as pending (R-14), and say where to send them from.
          setWorkspace({ ...created, pendingInvites: [] })
          addToast("Your workspace is ready, but the invitations couldn't be sent. Invite people again from Settings → Members.", 'warning')
        }
      }

      const firstName = greetingName(user?.name)
      if (then === 'import') {
        addToast(`Welcome to StratMap, ${firstName}! Choose your file to import your people.`, 'success')
        navigate('/charts?import=1')
        return
      }
      if (then === 'quick-start') {
        const { nodes, edges, departments } = buildChartTemplate(start.template)
        const chart = await createChart('Current Structure', nodes, edges, departments)
        if (chart) {
          addToast(`Welcome to StratMap, ${firstName}! Your starter chart is ready.`, 'success')
          navigate(`/charts/${chart.id}`)
          return
        }
      }
      addToast(`Welcome to StratMap, ${firstName}!`, 'success')
      navigate('/charts')
    } catch (err) {
      console.error('[onboarding] workspace creation failed:', err)
      addToast('Failed to create workspace. Please try again.', 'error')
    }
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

      {/* A workspace they deleted can be restored for 30 days (roadmap 4.2) */}
      <DeletedWorkspaceNotice />

      {/* Invites to their address: accepted only on a click (R-56) */}
      <PendingInvitesChoice />

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
            onQuickStart={() => complete(false, 'quick-start')}
            onImport={() => complete(false, 'import')}
            start={start}
            canAddMore={invites.length < MAX_ONBOARDING_INVITES}
            busy={busy}
          />
        )}
      </div>

      <div style={{ marginTop: 24, display: 'flex', gap: 14, fontSize: 12, color: 'var(--muted)' }}>
        <a href="/privacy" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Privacy Policy</a>
        <a href="/terms" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Terms of Service</a>
      </div>
    </div>
  )
}

// ── Step 1 ──────────────────────────────────────────────────────────────────
function Step1({
  workspaceName, setWorkspaceName,
  size, setSize,
  focus, setFocus,
  onContinue,
}: {
  workspaceName: string
  setWorkspaceName: (v: string) => void
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

      {/* Company size */}
      <div style={{ marginBottom: 32 }}>
        <label htmlFor="company-size" style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>How many people work there?</label>
        <select
          id="company-size"
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
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>We use this to suggest how to start your first chart.</p>
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
  onSkip, onSend, onQuickStart, onImport, start, canAddMore, busy,
}: {
  invites: InviteRow[]
  updateInvite: (idx: number, field: keyof InviteRow, value: string) => void
  addInviteRow: () => void
  removeInviteRow: (idx: number) => void
  onSkip: () => void
  onSend: () => void
  onQuickStart: () => void
  onImport: () => void
  start: OnboardingStart
  canAddMore: boolean
  busy: boolean
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
            <button aria-label="Remove this invitation"
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

      {/* How to start (R-80): a bigger company is offered its own people first, then an example structure that fits its size. */}
      <div style={{ marginTop: canAddMore ? 0 : 28 }}>
        {start.suggestImport && (
          <StartOption
            testId="import-start-btn" title="Import your people"
            body="From a CSV or Excel export of your HR system or a spreadsheet. You check every row before anything is added."
            icon={<Upload size={13} />} label="Import" onClick={onImport} busy={busy} primary
          />
        )}
        <StartOption
          testId="quick-start-btn" title={start.suggestImport ? 'Or start from an example' : 'Start with a starter chart'}
          body={`Creates a ${start.roles}-role "Current Structure" chart: ${start.summary}. Rename and change anything.`}
          icon={<Zap size={13} />} label="Quick start" onClick={onQuickStart} busy={busy}
        />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          data-testid="skip-btn"
          onClick={onSkip}
          disabled={busy}
          style={{
            flex: 1, padding: '10px 16px',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 8, color: 'var(--muted)',
            fontSize: 14, fontWeight: 500, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1,
          }}
        >
          Skip for now
        </button>
        <button
          data-testid="send-invites-btn"
          onClick={onSend}
          disabled={busy}
          style={{
            flex: 2, padding: '10px 16px',
            background: 'var(--grad-brand)',
            border: 'none', borderRadius: 8,
            color: '#fff', fontSize: 14, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? 'Setting up…' : 'Send invites & get started'}
        </button>
      </div>
    </>
  )
}

function StartOption({ testId, title, body, icon, label, onClick, busy, primary }: {
  testId: string; title: string; body: string; icon: React.ReactNode; label: string; onClick: () => void; busy: boolean; primary?: boolean
}) {
  return (
    <div style={{ marginBottom: 12, padding: '14px 16px', background: 'var(--raised)', borderRadius: 10, border: `1px solid ${primary ? 'var(--brand)' : 'var(--border)'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{body}</div>
        </div>
        <button
          data-testid={testId}
          onClick={onClick}
          disabled={busy}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', flexShrink: 0,
            background: 'var(--brand-bg)', border: '1px solid var(--brand)',
            borderRadius: 8, color: 'var(--brand)',
            fontSize: 13, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1,
          }}
        >
          {icon} {label}
        </button>
      </div>
    </div>
  )
}
