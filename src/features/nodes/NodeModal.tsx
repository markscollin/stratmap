import { useState, useEffect } from 'react'
import { X, ChevronDown, MapPin } from 'lucide-react'
import type { OrgNode, OrgEdge, Department, EmploymentType, NodeStatus, RoleType } from '../../types'

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '.4px' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function TextInput({ value, onChange, placeholder, autoFocus, hasError }: {
  value: string; onChange: (v: string) => void
  placeholder?: string; autoFocus?: boolean; hasError?: boolean
}) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      autoFocus={autoFocus}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        width: '100%', padding: '9px 12px',
        background: 'var(--input-bg)',
        border: `1px solid ${hasError ? 'var(--danger)' : focused ? 'var(--brand)' : 'var(--border)'}`,
        boxShadow: focused ? `0 0 0 3px var(--brand-bg)` : 'none',
        borderRadius: 9, color: 'var(--text)', fontSize: 14, transition: 'all .15s',
        boxSizing: 'border-box',
      }}
    />
  )
}

function SegmentedControl<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 2, background: 'var(--raised)', borderRadius: 8, padding: 2 }}>
      {options.map(opt => (
        <button key={opt.value} type="button" onClick={() => onChange(opt.value)} style={{
          flex: 1, padding: '6px 4px', borderRadius: 6, border: 'none', fontSize: 12,
          fontWeight: 500, cursor: 'pointer', transition: 'all .12s',
          background: value === opt.value ? 'var(--surface)' : 'transparent',
          color: value === opt.value ? 'var(--text)' : 'var(--muted)',
          boxShadow: value === opt.value ? 'var(--shadow-sm)' : 'none',
        }}>
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function DeptSelect({ departments, value, onChange }: {
  departments: Department[]; value: string; onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = departments.find(d => d.id === value)
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
        padding: '9px 12px', background: 'var(--input-bg)',
        border: `1px solid ${open ? 'var(--brand)' : 'var(--border)'}`,
        boxShadow: open ? '0 0 0 3px var(--brand-bg)' : 'none',
        borderRadius: 9, cursor: 'pointer', color: 'var(--text)', fontSize: 14, textAlign: 'left',
        transition: 'all .15s',
      }}>
        {selected && <span style={{ width: 8, height: 8, borderRadius: '50%', background: selected.colour, flexShrink: 0 }} />}
        <span style={{ flex: 1 }}>{selected?.name ?? 'Select department'}</span>
        <ChevronDown size={13} color="var(--muted)" />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100,
          background: 'var(--surface)', border: '1px solid var(--border-hover)',
          borderRadius: 9, boxShadow: 'var(--shadow)', overflow: 'hidden',
          animation: 'slideDown .12s ease-out',
        }}>
          {departments.map(dept => (
            <button key={dept.id} type="button" onClick={() => { onChange(dept.id); setOpen(false) }} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 12px', background: dept.id === value ? 'var(--brand-bg)' : 'transparent',
              border: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: 14, textAlign: 'left',
            }}
              onMouseEnter={e => { if (dept.id !== value) e.currentTarget.style.background = 'var(--raised)' }}
              onMouseLeave={e => { e.currentTarget.style.background = dept.id === value ? 'var(--brand-bg)' : 'transparent' }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: dept.colour, flexShrink: 0 }} />
              {dept.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ReportsToSelect({ nodes, value, onChange }: {
  nodes: OrgNode[]; value: string; onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = nodes.find(n => n.id === value)
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
        padding: '9px 12px', background: 'var(--input-bg)',
        border: `1px solid ${open ? 'var(--brand)' : 'var(--border)'}`,
        boxShadow: open ? '0 0 0 3px var(--brand-bg)' : 'none',
        borderRadius: 9, cursor: 'pointer', color: selected ? 'var(--text)' : 'var(--dim)',
        fontSize: 14, textAlign: 'left', transition: 'all .15s',
      }}>
        <span style={{ flex: 1 }}>{selected ? `${selected.name} · ${selected.title}` : 'None (root node)'}</span>
        <ChevronDown size={13} color="var(--muted)" />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100,
          background: 'var(--surface)', border: '1px solid var(--border-hover)',
          borderRadius: 9, boxShadow: 'var(--shadow)', overflow: 'hidden', maxHeight: 220, overflowY: 'auto',
          animation: 'slideDown .12s ease-out',
        }}>
          <button type="button" onClick={() => { onChange(''); setOpen(false) }} style={{
            width: '100%', display: 'flex', alignItems: 'center',
            padding: '9px 12px', background: !value ? 'var(--brand-bg)' : 'transparent',
            border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 13, textAlign: 'left',
          }}>None (root node)</button>
          {nodes.map(n => (
            <button key={n.id} type="button" onClick={() => { onChange(n.id); setOpen(false) }} style={{
              width: '100%', display: 'flex', flexDirection: 'column',
              padding: '8px 12px', background: n.id === value ? 'var(--brand-bg)' : 'transparent',
              border: 'none', cursor: 'pointer', textAlign: 'left',
            }}
              onMouseEnter={e => { if (n.id !== value) e.currentTarget.style.background = 'var(--raised)' }}
              onMouseLeave={e => { e.currentTarget.style.background = n.id === value ? 'var(--brand-bg)' : 'transparent' }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{n.name}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{n.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!value)} style={{
      width: 42, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
      background: value ? 'var(--brand)' : 'var(--raised)',
      position: 'relative', transition: 'background .2s', flexShrink: 0,
    }}>
      <span style={{
        position: 'absolute', top: 3, left: value ? 21 : 3, width: 18, height: 18,
        borderRadius: '50%', background: '#fff', transition: 'left .2s',
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
      }} />
    </button>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export interface NodeModalProps {
  isOpen: boolean
  onClose: () => void
  mode: 'add' | 'edit'
  node?: OrgNode
  departments: Department[]
  allNodes: OrgNode[]
  allEdges: OrgEdge[]
  onAdd: (data: Omit<OrgNode, 'id'>, reportsToId: string) => void
  onUpdate: (id: string, updates: Partial<OrgNode>, reportsToId: string) => void
  onDelete: (id: string) => void
}

const EMPLOYMENT_OPTIONS: { value: EmploymentType; label: string }[] = [
  { value: 'full-time',  label: 'Full-time'  },
  { value: 'part-time',  label: 'Part-time'  },
  { value: 'contractor', label: 'Contractor' },
  { value: 'advisor',    label: 'Advisor'    },
]

const STATUS_OPTIONS: { value: NodeStatus; label: string }[] = [
  { value: 'active',   label: 'Active'   },
  { value: 'open',     label: 'Open'     },
  { value: 'planned',  label: 'Planned'  },
  { value: 'backfill', label: 'Backfill' },
]

const ROLE_TYPE_OPTIONS: { value: RoleType; label: string; color: string }[] = [
  { value: 'existing',      label: 'Existing',  color: 'var(--muted)'   },
  { value: 'new-headcount', label: 'New HC',    color: 'var(--success)' },
  { value: 'backfill',      label: 'Backfill',  color: 'var(--warn)'    },
  { value: 'contractor',    label: 'Contract',  color: 'var(--purple)'  },
  { value: 'tbd',           label: 'TBD',       color: 'var(--dim)'     },
]

function RoleTypeControl({ value, onChange }: { value: RoleType; onChange: (v: RoleType) => void }) {
  return (
    <div style={{ display: 'flex', gap: 2, background: 'var(--raised)', borderRadius: 8, padding: 2 }}>
      {ROLE_TYPE_OPTIONS.map(opt => (
        <button key={opt.value} type="button" onClick={() => onChange(opt.value)} style={{
          flex: 1, padding: '6px 4px', borderRadius: 6, border: 'none', fontSize: 11,
          fontWeight: 500, cursor: 'pointer', transition: 'all .12s',
          background: value === opt.value ? 'var(--surface)' : 'transparent',
          color: value === opt.value ? opt.color : 'var(--muted)',
          boxShadow: value === opt.value ? 'var(--shadow-sm)' : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: value === opt.value ? opt.color : 'var(--dim)', flexShrink: 0, display: 'inline-block' }} />
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function NodeModal({
  isOpen, onClose, mode, node, departments, allNodes, allEdges,
  onAdd, onUpdate, onDelete,
}: NodeModalProps) {
  const fallbackDept = departments[0]?.id ?? 'eng'

  // Find the current manager edge for this node (edit mode)
  const currentManagerId = mode === 'edit' && node
    ? (allEdges.find(e => e.targetId === node.id)?.sourceId ?? '')
    : ''

  const [name,           setName]           = useState('')
  const [jobTitle,       setJobTitle]       = useState('')
  const [deptId,         setDeptId]         = useState(fallbackDept)
  const [employment,     setEmployment]     = useState<EmploymentType>('full-time')
  const [status,         setStatus]         = useState<NodeStatus>('active')
  const [roleType,       setRoleType]       = useState<RoleType>('existing')
  const [reportsTo,      setReportsTo]      = useState('')
  const [location,       setLocation]       = useState('')
  const [isNew,          setIsNew]          = useState(false)
  const [submitted,      setSubmitted]      = useState(false)
  const [deleteConfirm,  setDeleteConfirm]  = useState(false)

  // Populate fields when modal opens in edit mode
  useEffect(() => {
    if (!isOpen) { setSubmitted(false); setDeleteConfirm(false); return }
    if (mode === 'edit' && node) {
      setName(node.name)
      setJobTitle(node.title)
      setDeptId(node.departmentId)
      setEmployment(node.employmentType)
      setStatus(node.status)
      setRoleType(node.roleType ?? 'existing')
      setReportsTo(currentManagerId)
      setLocation(node.location ?? '')
      setIsNew(node.isNew ?? false)
    } else {
      setName(''); setJobTitle(''); setDeptId(fallbackDept)
      setEmployment('full-time'); setStatus('active')
      setRoleType('existing')
      setReportsTo(''); setLocation(''); setIsNew(false)
    }
  }, [isOpen, mode, node?.id]) // eslint-disable-line

  if (!isOpen) return null

  const isValid  = name.trim() !== '' && jobTitle.trim() !== ''
  const nameErr  = submitted && !name.trim()
  const titleErr = submitted && !jobTitle.trim()

  const handleSubmit = () => {
    setSubmitted(true)
    if (!isValid) return
    const data = {
      name: name.trim(),
      title: jobTitle.trim(),
      departmentId: deptId,
      employmentType: employment,
      status,
      roleType,
      managerId: reportsTo || null,
      location: location.trim() || undefined,
      isNew,
      x: 0, y: 0,
    }
    if (mode === 'add') {
      onAdd(data, reportsTo)
    } else if (mode === 'edit' && node) {
      onUpdate(node.id, { ...data, x: node.x, y: node.y }, reportsTo)
    }
    onClose()
  }

  // Nodes available for "reports to" — exclude the node being edited
  const reportingOptions = allNodes.filter(n => n.id !== node?.id)

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        onWheel={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: 20,
          border: '1px solid var(--border-hover)',
          padding: '28px 28px 24px',
          width: 480, maxHeight: '90vh', overflowY: 'auto',
          boxShadow: 'var(--shadow)',
          animation: 'nodePop .22s cubic-bezier(.34,1.56,.64,1)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', letterSpacing: '-.3px' }}>
            {mode === 'add' ? 'Add node' : 'Edit role'}
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <Field label="Name or role title">
          <TextInput
            autoFocus
            value={name}
            onChange={setName}
            placeholder="e.g. Sarah Chen, or Head of Product (if open)"
            hasError={nameErr}
          />
          {nameErr && <p style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>Name is required</p>}
        </Field>

        <Field label="Job title">
          <TextInput
            value={jobTitle}
            onChange={setJobTitle}
            placeholder="e.g. Senior Engineer"
            hasError={titleErr}
          />
          {titleErr && <p style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>Job title is required</p>}
        </Field>

        <Field label="Department">
          <DeptSelect departments={departments} value={deptId} onChange={setDeptId} />
        </Field>

        <Field label="Employment type">
          <SegmentedControl options={EMPLOYMENT_OPTIONS} value={employment} onChange={setEmployment} />
        </Field>

        <Field label="Status">
          <SegmentedControl options={STATUS_OPTIONS} value={status} onChange={setStatus} />
        </Field>

        <Field label="Role type">
          <RoleTypeControl value={roleType} onChange={setRoleType} />
        </Field>

        <Field label="Reports to">
          <ReportsToSelect nodes={reportingOptions} value={reportsTo} onChange={setReportsTo} />
        </Field>

        <Field label="Location">
          <div style={{ position: 'relative' }}>
            <MapPin size={13} color="var(--dim)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="e.g. London, Remote"
              style={{
                width: '100%', padding: '9px 12px 9px 32px',
                background: 'var(--input-bg)', border: '1px solid var(--border)',
                borderRadius: 9, color: 'var(--text)', fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
          </div>
        </Field>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, padding: '12px 14px', background: 'var(--raised)', borderRadius: 9 }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>New role</p>
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>Shows ★ NEW badge on the node card</p>
          </div>
          <Toggle value={isNew} onChange={setIsNew} />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {mode === 'edit' && node && (
            <div style={{ flex: 1 }}>
              {!deleteConfirm ? (
                <button type="button" onClick={() => setDeleteConfirm(true)} style={{
                  padding: '10px 14px', background: 'var(--danger-bg)', border: '1px solid var(--danger)',
                  borderRadius: 9, color: 'var(--danger)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}>
                  Delete
                </button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 600 }}>Are you sure?</span>
                  <button type="button" onClick={() => { onDelete(node.id); onClose() }} style={{
                    padding: '6px 10px', background: 'var(--danger)', border: 'none',
                    borderRadius: 7, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}>Confirm</button>
                  <button type="button" onClick={() => setDeleteConfirm(false)} style={{
                    padding: '6px 10px', background: 'transparent', border: '1px solid var(--border)',
                    borderRadius: 7, color: 'var(--muted)', fontSize: 12, cursor: 'pointer',
                  }}>Cancel</button>
                </div>
              )}
            </div>
          )}

          {!deleteConfirm && (
            <>
              {mode === 'add' && (
                <button type="button" onClick={onClose} style={{
                  flex: 1, padding: '11px', background: 'transparent',
                  border: '1px solid var(--border)', borderRadius: 9,
                  color: 'var(--muted)', fontSize: 14, cursor: 'pointer',
                }}>
                  Cancel
                </button>
              )}
              <button type="button" onClick={handleSubmit} style={{
                flex: 2, padding: '11px',
                background: isValid ? 'var(--grad-brand)' : 'var(--raised)',
                border: 'none', borderRadius: 9,
                color: isValid ? '#fff' : 'var(--dim)',
                fontSize: 14, fontWeight: 600,
                cursor: isValid ? 'pointer' : 'default',
                transition: 'all .2s',
                boxShadow: isValid ? '0 4px 14px var(--brand-glow)' : 'none',
              }}>
                {mode === 'add' ? 'Create node' : 'Save changes'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
