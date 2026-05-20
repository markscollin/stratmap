import { useState, useEffect, useMemo } from 'react'
import { Plus, X, ChevronLeft, ChevronRight, ChevronDown, Settings, Check, Trash2, Pencil } from 'lucide-react'
import { useHeadcountStore, type HeadcountPlan, type HeadcountStatus } from '../store/headcountStore'
import { useWorkspaceDepartmentStore, type WorkspaceDepartment } from '../store/workspaceDepartmentStore'
import { useChartStore } from '../store'
import { usePermission } from '../hooks/usePermission'
import type { RoleType } from '../types'

// ─── Constants ────────────────────────────────────────────────────────────────

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'] as const
const QUARTER_LABELS: Record<string, string> = { Q1: 'Jan–Mar', Q2: 'Apr–Jun', Q3: 'Jul–Sep', Q4: 'Oct–Dec' }

const ROLE_TYPE_OPTIONS: Array<{ value: RoleType; label: string; colour: string }> = [
  { value: 'new-headcount', label: 'New HC',     colour: 'var(--success)' },
  { value: 'backfill',      label: 'Backfill',   colour: 'var(--warn)'    },
  { value: 'contractor',    label: 'Contractor', colour: 'var(--purple)'  },
  { value: 'tbd',           label: 'TBD',        colour: 'var(--dim)'     },
]

const DEPT_COLOURS = [
  '#0EA5E9', '#10B981', '#8B5CF6', '#F59E0B',
  '#EF4444', '#06B6D4', '#F97316', '#EC4899',
]

const STATUS_META: Record<HeadcountStatus, { label: string; colour: string; bg: string }> = {
  planned:  { label: 'Planned',  colour: 'var(--muted)',   bg: 'var(--raised)'      },
  approved: { label: 'Approved', colour: 'var(--success)', bg: 'var(--success-bg)'  },
  filled:   { label: 'Filled',   colour: 'var(--brand)',   bg: 'var(--brand-bg)'    },
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function RoleTypeBadge({ roleType }: { roleType: RoleType }) {
  const opt = ROLE_TYPE_OPTIONS.find(o => o.value === roleType)
  if (!roleType || roleType === 'existing' || !opt) return null
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '.4px',
      padding: '2px 6px', borderRadius: 4,
      color: opt.colour, background: `color-mix(in srgb, ${opt.colour} 15%, transparent)`,
    }}>{opt.label.toUpperCase()}</span>
  )
}

function StatusPill({ status }: { status: HeadcountStatus }) {
  const m = STATUS_META[status]
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20,
      color: m.colour, background: m.bg,
    }}>{m.label}</span>
  )
}

// ─── Department selector (workspace-aware + inline create) ────────────────────

function DeptSelect({ value, onChange, placeholder = 'Select department' }: {
  value: string; onChange: (id: string) => void; placeholder?: string
}) {
  const { departments, create } = useWorkspaceDepartmentStore()
  const [open, setOpen]         = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName]   = useState('')
  const [newColour, setNewColour] = useState(DEPT_COLOURS[0])
  const [saving, setSaving]     = useState(false)

  const selected = departments.find(d => d.id === value)

  const handleCreate = async () => {
    if (!newName.trim()) return
    setSaving(true)
    const dept = await create(newName.trim(), newColour)
    setSaving(false)
    if (dept) { onChange(dept.id); setCreating(false); setNewName(''); setOpen(false) }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 11px', background: 'var(--input-bg)',
        border: `1px solid ${open ? 'var(--brand)' : 'var(--border)'}`,
        boxShadow: open ? '0 0 0 3px var(--brand-bg)' : 'none',
        borderRadius: 8, cursor: 'pointer', fontSize: 13, textAlign: 'left', transition: 'all .15s',
      }}>
        {selected
          ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: selected.colour, flexShrink: 0 }} />
          : <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--dim)', flexShrink: 0 }} />}
        <span style={{ flex: 1, color: selected ? 'var(--text)' : 'var(--dim)' }}>{selected?.name ?? placeholder}</span>
        <ChevronDown size={12} color="var(--muted)" />
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 198 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 199,
            background: 'var(--surface)', border: '1px solid var(--border-hover)',
            borderRadius: 9, boxShadow: 'var(--shadow)', overflow: 'hidden', maxHeight: 260, overflowY: 'auto',
          }}>
            {departments.map(d => (
              <button key={d.id} type="button" onClick={() => { onChange(d.id); setOpen(false); setCreating(false) }} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', background: d.id === value ? 'var(--brand-bg)' : 'transparent',
                border: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: 13, textAlign: 'left',
              }}
                onMouseEnter={e => { if (d.id !== value) e.currentTarget.style.background = 'var(--raised)' }}
                onMouseLeave={e => { e.currentTarget.style.background = d.id === value ? 'var(--brand-bg)' : 'transparent' }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.colour, flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{d.name}</span>
                {d.id === value && <Check size={11} color="var(--brand)" />}
              </button>
            ))}
            {departments.length > 0 && <div style={{ height: 1, background: 'var(--border)' }} />}
            {!creating ? (
              <button type="button" onClick={() => setCreating(true)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', background: 'transparent', border: 'none',
                cursor: 'pointer', color: 'var(--brand)', fontSize: 13,
              }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--raised)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <Plus size={11} /> New department
              </button>
            ) : (
              <div style={{ padding: '10px 12px' }}>
                <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  placeholder="Department name"
                  style={{ width: '100%', padding: '6px 9px', fontSize: 12, background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: 5, marginTop: 7, flexWrap: 'wrap' }}>
                  {DEPT_COLOURS.map(c => (
                    <button key={c} type="button" onClick={() => setNewColour(c)} style={{
                      width: 18, height: 18, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer',
                      outline: newColour === c ? `2px solid ${c}` : '2px solid transparent', outlineOffset: 2,
                    }} />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
                  <button type="button" onClick={() => { setCreating(false); setNewName('') }} style={{ flex: 1, padding: '5px', fontSize: 11, background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer' }}>Cancel</button>
                  <button type="button" onClick={handleCreate} disabled={!newName.trim() || saving} style={{ flex: 2, padding: '5px', fontSize: 11, fontWeight: 600, background: newName.trim() ? 'var(--brand)' : 'var(--raised)', border: 'none', borderRadius: 6, color: newName.trim() ? '#fff' : 'var(--dim)', cursor: newName.trim() ? 'pointer' : 'default' }}>
                    {saving ? 'Creating…' : 'Create'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Add / Edit hire panel ─────────────────────────────────────────────────────

function HireForm({ initialQuarter, plan, onSubmit, onCancel }: {
  initialQuarter: string
  plan?: HeadcountPlan
  onSubmit: (data: {
    title: string; departmentId: string; roleType: RoleType
    targetQuarter: string; chartId: string; notes: string
  }) => void
  onCancel: () => void
}) {
  const { charts } = useChartStore()
  const [title,    setTitle]    = useState(plan?.title ?? '')
  const [deptId,   setDeptId]   = useState(plan?.departmentId ?? '')
  const [roleType, setRoleType] = useState<RoleType>(plan?.roleType ?? 'new-headcount')
  const [quarter,  setQuarter]  = useState(plan?.targetQuarter ?? initialQuarter)
  const [chartId,  setChartId]  = useState(plan?.chartId ?? '')
  const [notes,    setNotes]    = useState(plan?.notes ?? '')

  const isValid = title.trim() !== ''

  return (
    <div style={{ padding: '14px 16px', background: 'var(--raised)', borderRadius: 10, border: '1px solid var(--border)' }}>
      <div style={{ marginBottom: 10 }}>
        <input
          autoFocus value={title} onChange={e => setTitle(e.target.value)}
          placeholder="Job title *"
          style={{ width: '100%', padding: '8px 11px', fontSize: 13, background: 'var(--input-bg)', border: `1px solid ${title ? 'var(--border)' : 'var(--danger)'}`, borderRadius: 8, color: 'var(--text)', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ marginBottom: 10 }}>
        <DeptSelect value={deptId} onChange={setDeptId} placeholder="Department (optional)" />
      </div>

      {/* Role type */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, background: 'var(--surface)', borderRadius: 7, padding: 2 }}>
        {ROLE_TYPE_OPTIONS.map(opt => (
          <button key={opt.value} type="button" onClick={() => setRoleType(opt.value)} style={{
            flex: 1, padding: '5px 4px', borderRadius: 5, border: 'none', fontSize: 11,
            background: roleType === opt.value ? 'var(--surface-elevated, var(--raised))' : 'transparent',
            color: roleType === opt.value ? opt.colour : 'var(--dim)',
            fontWeight: roleType === opt.value ? 700 : 400,
            cursor: 'pointer', transition: 'all .12s',
            boxShadow: roleType === opt.value ? 'var(--shadow-sm)' : 'none',
          }}>{opt.label}</button>
        ))}
      </div>

      {/* Quarter */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, background: 'var(--surface)', borderRadius: 7, padding: 2 }}>
        {QUARTERS.map(q => {
          const year = quarter.split('-')[0]
          const full = `${year}-${q}`
          return (
            <button key={q} type="button" onClick={() => setQuarter(full)} style={{
              flex: 1, padding: '5px 4px', borderRadius: 5, border: 'none', fontSize: 11,
              background: quarter === full ? 'var(--brand-bg)' : 'transparent',
              color: quarter === full ? 'var(--brand)' : 'var(--dim)',
              fontWeight: quarter === full ? 700 : 400, cursor: 'pointer',
            }}>{q}</button>
          )
        })}
      </div>

      {/* Link to chart */}
      <div style={{ marginBottom: 10 }}>
        <select value={chartId} onChange={e => setChartId(e.target.value)} style={{
          width: '100%', padding: '8px 11px', fontSize: 12, background: 'var(--input-bg)',
          border: '1px solid var(--border)', borderRadius: 8, color: chartId ? 'var(--text)' : 'var(--dim)',
        }}>
          <option value="">Link to chart (optional)</option>
          {charts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 12 }}>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)"
          rows={2}
          style={{ width: '100%', padding: '8px 11px', fontSize: 12, background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
        />
      </div>

      <div style={{ display: 'flex', gap: 7 }}>
        <button type="button" onClick={onCancel} style={{ flex: 1, padding: '8px', fontSize: 12, background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer' }}>Cancel</button>
        <button type="button" disabled={!isValid} onClick={() => onSubmit({ title: title.trim(), departmentId: deptId, roleType, targetQuarter: quarter, chartId, notes })}
          style={{ flex: 2, padding: '8px', fontSize: 12, fontWeight: 600, background: isValid ? 'var(--grad-brand)' : 'var(--raised)', border: 'none', borderRadius: 8, color: isValid ? '#fff' : 'var(--dim)', cursor: isValid ? 'pointer' : 'default' }}>
          {plan ? 'Save changes' : 'Add hire'}
        </button>
      </div>
    </div>
  )
}

// ─── Plan card ────────────────────────────────────────────────────────────────

function PlanCard({ plan, onEdit, onDelete, onStatusChange, canApprove }: {
  plan: HeadcountPlan
  onEdit: () => void
  onDelete: () => void
  onStatusChange: (status: HeadcountStatus) => void
  canApprove: boolean
}) {
  const { charts } = useChartStore()
  const linkedChart = plan.chartId ? charts.find(c => c.id === plan.chartId) : null
  const [hov, setHov] = useState(false)

  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, overflow: 'hidden',
        boxShadow: hov ? 'var(--shadow)' : 'var(--shadow-sm)',
        transition: 'box-shadow .12s',
        display: 'flex',
      }}
    >
      {/* Dept accent bar */}
      <div style={{ width: 3, background: plan.departmentColour ?? 'var(--dim)', flexShrink: 0 }} />

      <div style={{ flex: 1, padding: '11px 12px' }}>
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1, lineHeight: 1.35 }}>{plan.title}</span>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0, opacity: hov ? 1 : 0, transition: 'opacity .12s' }}>
            <button onClick={onEdit} title="Edit" style={{ padding: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', borderRadius: 4, display: 'flex' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--nav-hover)'; e.currentTarget.style.color = 'var(--text)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--muted)' }}
            ><Pencil size={11} /></button>
            <button onClick={onDelete} title="Delete" style={{ padding: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', borderRadius: 4, display: 'flex' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--danger-bg)'; e.currentTarget.style.color = 'var(--danger)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--muted)' }}
            ><Trash2 size={11} /></button>
          </div>
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
          {plan.departmentName && (
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{plan.departmentName}</span>
          )}
          <RoleTypeBadge roleType={plan.roleType} />
        </div>

        {linkedChart && (
          <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 8 }}>
            → {linkedChart.name}
          </div>
        )}

        {plan.notes && (
          <div style={{ fontSize: 11, color: 'var(--dim)', fontStyle: 'italic', marginBottom: 8 }}>{plan.notes}</div>
        )}

        {/* Status + actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <StatusPill status={plan.status} />
          {plan.status === 'planned' && canApprove && (
            <button onClick={() => onStatusChange('approved')} style={{
              fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
              background: 'transparent', border: '1px solid var(--success)',
              color: 'var(--success)', cursor: 'pointer',
            }}>Approve</button>
          )}
          {plan.status === 'approved' && (
            <button onClick={() => onStatusChange('filled')} style={{
              fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
              background: 'transparent', border: '1px solid var(--brand)',
              color: 'var(--brand)', cursor: 'pointer',
            }}>Mark filled</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Department manager modal ─────────────────────────────────────────────────

function DeptManagerModal({ onClose }: { onClose: () => void }) {
  const { departments, create, update, remove } = useWorkspaceDepartmentStore()
  const [newName, setNewName]     = useState('')
  const [newColour, setNewColour] = useState(DEPT_COLOURS[0])
  const [saving, setSaving]       = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName]   = useState('')
  const [editColour, setEditColour] = useState('')

  const handleCreate = async () => {
    if (!newName.trim()) return
    setSaving(true)
    await create(newName.trim(), newColour)
    setSaving(false)
    setNewName('')
    setNewColour(DEPT_COLOURS[0])
  }

  const startEdit = (d: WorkspaceDepartment) => {
    setEditingId(d.id); setEditName(d.name); setEditColour(d.colour)
  }

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return
    await update(editingId, { name: editName.trim(), colour: editColour })
    setEditingId(null)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: 18, border: '1px solid var(--border-hover)',
        padding: '24px 24px 20px', width: 420, maxHeight: '80vh', overflowY: 'auto',
        boxShadow: 'var(--shadow)', animation: 'nodePop .2s cubic-bezier(.34,1.56,.64,1)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>Manage departments</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex' }}><X size={16} /></button>
        </div>

        {/* Existing departments */}
        <div style={{ marginBottom: 16 }}>
          {departments.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--dim)', textAlign: 'center', padding: '16px 0' }}>No departments yet. Add one below.</p>
          )}
          {departments.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              {editingId === d.id ? (
                <>
                  <button onClick={() => setEditColour(editColour)} style={{ width: 20, height: 20, borderRadius: '50%', background: editColour, border: 'none', cursor: 'default', flexShrink: 0 }} />
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {DEPT_COLOURS.map(c => (
                      <button key={c} type="button" onClick={() => setEditColour(c)} style={{ width: 16, height: 16, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer', outline: editColour === c ? `2px solid ${c}` : 'none', outlineOffset: 2 }} />
                    ))}
                  </div>
                  <input value={editName} onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveEdit()}
                    autoFocus
                    style={{ flex: 1, padding: '4px 8px', fontSize: 12, background: 'var(--input-bg)', border: '1px solid var(--brand)', borderRadius: 6, color: 'var(--text)' }}
                  />
                  <button onClick={saveEdit} style={{ padding: '4px 8px', fontSize: 11, fontWeight: 600, background: 'var(--brand)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer' }}>Save</button>
                  <button onClick={() => setEditingId(null)} style={{ padding: '4px 8px', fontSize: 11, background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer' }}>×</button>
                </>
              ) : (
                <>
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: d.colour, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{d.name}</span>
                  <button onClick={() => startEdit(d)} style={{ padding: '3px 8px', fontSize: 11, background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}><Pencil size={10} /> Edit</button>
                  <button onClick={() => remove(d.id)} style={{ padding: '3px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--dim)', display: 'flex' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--dim)' }}
                  ><Trash2 size={13} /></button>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Add new */}
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Add department</p>
        <div style={{ display: 'flex', gap: 5, marginBottom: 8, flexWrap: 'wrap' }}>
          {DEPT_COLOURS.map(c => (
            <button key={c} type="button" onClick={() => setNewColour(c)} style={{ width: 22, height: 22, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer', outline: newColour === c ? `2px solid ${c}` : '2px solid transparent', outlineOffset: 2 }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="Department name"
            style={{ flex: 1, padding: '8px 11px', fontSize: 13, background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}
          />
          <button onClick={handleCreate} disabled={!newName.trim() || saving} style={{
            padding: '8px 14px', fontSize: 13, fontWeight: 600,
            background: newName.trim() ? 'var(--brand)' : 'var(--raised)',
            border: 'none', borderRadius: 8, color: newName.trim() ? '#fff' : 'var(--dim)',
            cursor: newName.trim() ? 'pointer' : 'default',
          }}>{saving ? '…' : 'Add'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Quarter column ────────────────────────────────────────────────────────────

function QuarterColumn({ quarter, plans, year, onAdd, onEdit, onDelete, onStatusChange, canApprove }: {
  quarter: string; plans: HeadcountPlan[]; year: number
  onAdd: (quarter: string) => void
  onEdit: (plan: HeadcountPlan) => void
  onDelete: (id: string) => void
  onStatusChange: (id: string, status: HeadcountStatus) => void
  canApprove: boolean
}) {
  const label = QUARTER_LABELS[quarter]
  const planCount = plans.length

  return (
    <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Column header */}
      <div style={{
        padding: '12px 14px 10px', background: 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: '10px 10px 0 0',
        borderBottom: 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{quarter} {year}</span>
          <span style={{ fontSize: 11, color: 'var(--dim)' }}>{label}</span>
        </div>
        {planCount > 0 && (
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
            {planCount} {planCount === 1 ? 'hire' : 'hires'}
          </div>
        )}
      </div>

      {/* Cards */}
      <div style={{
        flex: 1, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6,
        background: 'var(--bg)', border: '1px solid var(--border)', borderTop: 'none',
        minHeight: 120,
      }}>
        {plans.map(p => (
          <PlanCard
            key={p.id}
            plan={p}
            onEdit={() => onEdit(p)}
            onDelete={() => onDelete(p.id)}
            onStatusChange={status => onStatusChange(p.id, status)}
            canApprove={canApprove}
          />
        ))}
      </div>

      {/* Add button */}
      <button
        onClick={() => onAdd(`${year}-${quarter}`)}
        style={{
          width: '100%', padding: '9px', fontSize: 12, fontWeight: 500,
          background: 'var(--surface)', border: '1px solid var(--border)', borderTop: 'none',
          borderRadius: '0 0 10px 10px', color: 'var(--muted)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          transition: 'all .12s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--nav-hover)'; e.currentTarget.style.color = 'var(--text)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.color = 'var(--muted)' }}
      >
        <Plus size={12} /> Add hire
      </button>
    </div>
  )
}

// ─── Chart filter dropdown ─────────────────────────────────────────────────────

function ChartFilter({ value, onChange }: { value: Set<string>; onChange: (v: Set<string>) => void }) {
  const { charts } = useChartStore()
  const [open, setOpen] = useState(false)
  const count = value.size

  const toggle = (id: string) => {
    const next = new Set(value)
    next.has(id) ? next.delete(id) : next.add(id)
    onChange(next)
  }

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
        background: count > 0 ? 'var(--brand-bg)' : 'var(--surface)',
        border: `1px solid ${count > 0 ? 'var(--brand)' : 'var(--border)'}`,
        borderRadius: 8, cursor: 'pointer', fontSize: 12,
        color: count > 0 ? 'var(--brand)' : 'var(--text)',
      }}>
        Charts {count > 0 ? `(${count})` : 'All'}
        <ChevronDown size={12} />
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 50, minWidth: 200,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 9, boxShadow: 'var(--shadow)', overflow: 'hidden',
          }}>
            {count > 0 && (
              <button onClick={() => onChange(new Set())} style={{
                width: '100%', padding: '7px 12px', background: 'transparent', border: 'none',
                borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 11,
                color: 'var(--brand)', textAlign: 'left',
              }}>Clear filter</button>
            )}
            {charts.map(c => (
              <button key={c.id} onClick={() => toggle(c.id)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 12px', background: 'transparent', border: 'none',
                cursor: 'pointer', fontSize: 12, color: 'var(--text)', textAlign: 'left',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--nav-hover)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{
                  width: 14, height: 14, borderRadius: 3,
                  background: value.has(c.id) ? 'var(--brand)' : 'transparent',
                  border: `1.5px solid ${value.has(c.id) ? 'var(--brand)' : 'var(--border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {value.has(c.id) && <Check size={9} color="#fff" />}
                </span>
                {c.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function HeadcountView() {
  const { plans, loading, fetch, create, update, remove } = useHeadcountStore()
  const { fetch: fetchDepts } = useWorkspaceDepartmentStore()
  const { canAdmin } = usePermission()

  const currentYear = new Date().getFullYear()
  const [year, setYear]           = useState(currentYear)
  const [chartFilter, setChartFilter] = useState<Set<string>>(new Set())
  const [addingToQuarter, setAddingToQuarter] = useState<string | null>(null)
  const [editingPlan, setEditingPlan] = useState<HeadcountPlan | null>(null)
  const [showDeptManager, setShowDeptManager] = useState(false)

  useEffect(() => {
    document.title = 'StratMap — Headcount'
    fetch()
    fetchDepts()
  }, []) // eslint-disable-line

  // Filter to current year + selected charts
  const filteredPlans = useMemo(() => {
    return plans.filter(p => {
      if (!p.targetQuarter.startsWith(String(year))) return false
      if (chartFilter.size > 0 && p.chartId && !chartFilter.has(p.chartId)) return false
      return true
    })
  }, [plans, year, chartFilter])

  const plansByQuarter = useMemo(() => {
    const map: Record<string, HeadcountPlan[]> = {}
    QUARTERS.forEach(q => { map[q] = [] })
    filteredPlans.forEach(p => {
      const q = p.targetQuarter.split('-')[1]
      if (q && map[q]) map[q].push(p)
    })
    return map
  }, [filteredPlans])

  const totalPlanned  = filteredPlans.filter(p => p.status === 'planned').length
  const totalApproved = filteredPlans.filter(p => p.status === 'approved').length
  const totalFilled   = filteredPlans.filter(p => p.status === 'filled').length

  const handleAdd = async (data: { title: string; departmentId: string; roleType: RoleType; targetQuarter: string; chartId: string; notes: string }) => {
    await create({
      title: data.title,
      departmentId: data.departmentId || undefined,
      roleType: data.roleType,
      targetQuarter: data.targetQuarter,
      chartId: data.chartId || undefined,
      notes: data.notes || undefined,
    })
    setAddingToQuarter(null)
  }

  const handleEdit = async (data: { title: string; departmentId: string; roleType: RoleType; targetQuarter: string; chartId: string; notes: string }) => {
    if (!editingPlan) return
    await update(editingPlan.id, {
      title: data.title,
      departmentId: data.departmentId || null,
      roleType: data.roleType,
      targetQuarter: data.targetQuarter,
      chartId: data.chartId || null,
      notes: data.notes || null,
    })
    setEditingPlan(null)
  }

  const handleStatusChange = (id: string, status: HeadcountStatus) => {
    update(id, { status })
  }

  return (
    <div style={{ padding: '28px 32px', animation: 'fadeUp .3s ease-out', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-.4px' }}>Headcount</h1>
            <span style={{ padding: '2px 10px', borderRadius: 20, background: 'var(--purple-bg)', border: '1px solid rgba(139,92,246,.3)', fontSize: 10, fontWeight: 700, color: 'var(--purple)', letterSpacing: '.5px' }}>GROWTH</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>Plan your hiring by quarter and department</p>
        </div>

        {/* Summary pills */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {[
            { label: 'Planned',  count: totalPlanned,  colour: 'var(--muted)' },
            { label: 'Approved', count: totalApproved, colour: 'var(--success)' },
            { label: 'Filled',   count: totalFilled,   colour: 'var(--brand)' },
          ].map(({ label, count, colour }) => (
            <div key={label} style={{ textAlign: 'center', padding: '6px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: colour, lineHeight: 1 }}>{count}</div>
              <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        {/* Year picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <button onClick={() => setYear(y => y - 1)} style={{ padding: '6px 10px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex' }}><ChevronLeft size={14} /></button>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', padding: '6px 8px', minWidth: 48, textAlign: 'center' }}>{year}</span>
          <button onClick={() => setYear(y => y + 1)} style={{ padding: '6px 10px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex' }}><ChevronRight size={14} /></button>
        </div>

        <ChartFilter value={chartFilter} onChange={setChartFilter} />

        <div style={{ flex: 1 }} />

        <button onClick={() => setShowDeptManager(true)} style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, cursor: 'pointer', fontSize: 12, color: 'var(--muted)',
        }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)' }}
        >
          <Settings size={12} /> Departments
        </button>

        <button onClick={() => setAddingToQuarter(`${year}-Q1`)} style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px',
          background: 'var(--grad-brand)', border: 'none',
          borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#fff',
          boxShadow: '0 4px 14px var(--brand-glow)',
        }}>
          <Plus size={12} /> Add hire
        </button>
      </div>

      {/* Add / Edit form (shown above kanban when triggered from header button) */}
      {addingToQuarter && !editingPlan && (
        <div style={{ marginBottom: 16 }}>
          <HireForm
            initialQuarter={addingToQuarter}
            onSubmit={handleAdd}
            onCancel={() => setAddingToQuarter(null)}
          />
        </div>
      )}
      {editingPlan && (
        <div style={{ marginBottom: 16 }}>
          <HireForm
            initialQuarter={editingPlan.targetQuarter}
            plan={editingPlan}
            onSubmit={handleEdit}
            onCancel={() => setEditingPlan(null)}
          />
        </div>
      )}

      {/* Kanban */}
      {loading && plans.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)', fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', gap: 12, flex: 1, alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 8 }}>
          {QUARTERS.map(q => (
            <QuarterColumn
              key={q}
              quarter={q}
              year={year}
              plans={plansByQuarter[q] ?? []}
              onAdd={setAddingToQuarter}
              onEdit={setEditingPlan}
              onDelete={remove}
              onStatusChange={handleStatusChange}
              canApprove={canAdmin}
            />
          ))}
        </div>
      )}

      {showDeptManager && <DeptManagerModal onClose={() => setShowDeptManager(false)} />}
    </div>
  )
}
