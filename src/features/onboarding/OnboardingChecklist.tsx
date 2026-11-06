import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { api } from '../../lib/apiClient'
import { usePermission } from '../../hooks/usePermission'

interface ChecklistState {
  steps: { chart: boolean; invite: boolean; share: boolean }
  complete: boolean
  dismissed: boolean
}

const STEPS = [
  { key: 'chart',  title: 'Build your first chart',  body: 'Create a chart with at least 3 roles, or import your people from a spreadsheet.', cta: 'Open charts',  path: '/charts' },
  { key: 'invite', title: 'Invite a teammate',        body: 'StratMap works best with HR, finance and leadership looking at the same chart.',    cta: 'Invite',       path: '/settings' },
  { key: 'share',  title: 'Share a chart',            body: 'Turn on a public link so anyone can view a chart without signing in.',              cta: 'Pick a chart', path: '/charts' },
] as const

/**
 * Getting-started checklist at the top of the Dashboard (roadmap 2.7). Steps tick from real data, not clicks.
 * Shown to people who can edit, until all three are done or an admin dismisses it for the workspace.
 */
export function OnboardingChecklist() {
  const navigate = useNavigate()
  const { canEdit, canAdmin } = usePermission()
  const [state, setState] = useState<ChecklistState | null>(null)

  useEffect(() => {
    if (!canEdit) return
    api.get<ChecklistState>('/api/workspace/onboarding').then(setState).catch(() => { /* optional UI: stay hidden */ })
  }, [canEdit])

  if (!canEdit || !state || state.complete || state.dismissed) return null

  const done = STEPS.filter(s => state.steps[s.key]).length
  const dismiss = () => {
    setState({ ...state, dismissed: true })
    api.put('/api/workspace/onboarding', { dismissed: true }).catch(() => setState(s => (s ? { ...s, dismissed: false } : s)))
  }

  return (
    <section
      data-testid="onboarding-checklist"
      aria-label="Getting started"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 22, marginBottom: 24, boxShadow: 'var(--shadow-sm)' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Get started with StratMap</h2>
          <p data-testid="checklist-progress" style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{done} of {STEPS.length} done</p>
        </div>
        {canAdmin && (
          <button
            data-testid="checklist-dismiss"
            onClick={dismiss}
            title="Hide this for everyone in the workspace"
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', color: 'var(--dim)', fontSize: 12, cursor: 'pointer' }}
          ><X size={13} /> Hide</button>
        )}
      </div>
      <div style={{ height: 5, background: 'var(--raised)', borderRadius: 3, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ width: `${(done / STEPS.length) * 100}%`, height: '100%', background: 'var(--grad-brand)', transition: 'width .4s ease-out' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {STEPS.map(step => {
          const isDone = state.steps[step.key]
          return (
            <div
              key={step.key}
              data-testid={`checklist-${step.key}`}
              data-done={isDone}
              style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px', background: 'var(--raised)', borderRadius: 11, opacity: isDone ? 0.7 : 1 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 18, height: 18, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isDone ? 'var(--success)' : 'transparent', border: isDone ? 'none' : '1.5px solid var(--border-hover)',
                }}>{isDone && <Check size={11} color="#fff" strokeWidth={3} />}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', textDecoration: isDone ? 'line-through' : 'none' }}>{step.title}</span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{step.body}</p>
              {!isDone && (
                <button
                  onClick={() => navigate(step.path)}
                  style={{ alignSelf: 'flex-start', marginTop: 2, padding: '5px 12px', background: 'var(--brand-bg)', border: '1px solid var(--brand)', borderRadius: 7, color: 'var(--brand)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >{step.cta}</button>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
