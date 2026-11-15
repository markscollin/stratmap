// The filter panel (split out of OrgChart.tsx, R-35).
import { useState } from 'react'
import { Layers } from 'lucide-react'
import type { Department, RoleType, NodeStatus } from '../../types'
import { EMPTY_FILTERS } from './canvasTypes'
import type { ActiveFilters } from './canvasTypes'
import { ToolBtn } from './ToolBtn'

// ─── Filter ───────────────────────────────────────────────────────────────────

const STATUS_FILTER_OPTIONS: Array<{ value: NodeStatus; label: string; dot: string }> = [
  { value: 'active',   label: 'Active',   dot: 'var(--success)' },
  { value: 'open',     label: 'Open',     dot: 'var(--warn)'    },
  { value: 'planned',  label: 'Planned',  dot: 'var(--purple)'  },
  { value: 'backfill', label: 'Backfill', dot: 'var(--brand)'   },
]

const ROLE_TYPE_FILTER_OPTIONS: Array<{ value: RoleType; label: string; dot: string }> = [
  { value: 'existing',      label: 'Existing',   dot: 'var(--muted)'   },
  { value: 'new-headcount', label: 'New HC',     dot: 'var(--success)' },
  { value: 'backfill',      label: 'Backfill',   dot: 'var(--warn)'    },
  { value: 'contractor',    label: 'Contractor', dot: 'var(--purple)'  },
  { value: 'tbd',           label: 'TBD',        dot: 'var(--dim)'     },
]

export function FilterRow({ checked, onChange, dot, label }: {
  checked: boolean; onChange: () => void; dot: string; label: string
}) {
  const [hov, setHov] = useState(false)
  return (
    <label
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '3px 6px', borderRadius: 5, cursor: 'pointer',
        background: hov ? 'var(--nav-hover)' : 'transparent',
      }}
    >
      <input
        type="checkbox" checked={checked} onChange={onChange}
        style={{ accentColor: 'var(--brand)', width: 12, height: 12, margin: 0, flexShrink: 0, cursor: 'pointer' }}
      />
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: 'var(--text)' }}>{label}</span>
    </label>
  )
}

export function FilterBtn({
  open, onOpenChange, departments, filters, onFiltersChange,
}: {
  open: boolean; onOpenChange: (open: boolean) => void
  departments: Department[]; filters: ActiveFilters; onFiltersChange: (f: ActiveFilters) => void
}) {
  const hasFilters = filters.depts.size > 0 || filters.roleTypes.size > 0 || filters.statuses.size > 0

  const toggleDept = (id: string) => {
    const next = new Set(filters.depts)
    if (next.has(id)) next.delete(id); else next.add(id)
    onFiltersChange({ ...filters, depts: next })
  }
  const toggleRoleType = (rt: RoleType) => {
    const next = new Set(filters.roleTypes)
    if (next.has(rt)) next.delete(rt); else next.add(rt)
    onFiltersChange({ ...filters, roleTypes: next })
  }
  const toggleStatus = (s: NodeStatus) => {
    const next = new Set(filters.statuses)
    if (next.has(s)) next.delete(s); else next.add(s)
    onFiltersChange({ ...filters, statuses: next })
  }

  return (
    <div style={{ position: 'relative' }}>
      <ToolBtn Icon={Layers} label="Filter (F)" active={hasFilters || open} onClick={() => onOpenChange(!open)} />
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => onOpenChange(false)} />
          <div
            data-canvas-overlay
            style={{
              position: 'absolute', top: 36, left: '50%', transform: 'translateX(-50%)',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '12px 14px', zIndex: 50,
              boxShadow: 'var(--shadow)', minWidth: 200,
              maxHeight: 'calc(100vh - 120px)', overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Filters</span>
              {hasFilters && (
                <button
                  onClick={() => onFiltersChange(EMPTY_FILTERS)}
                  style={{ fontSize: 11, color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Clear all
                </button>
              )}
            </div>

            {departments.length > 0 && (
              <>
                <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.5px', margin: '0 0 4px' }}>Department</p>
                {departments.map(d => (
                  <FilterRow key={d.id} checked={filters.depts.has(d.id)} onChange={() => toggleDept(d.id)} dot={d.colour} label={d.name} />
                ))}
                <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
              </>
            )}

            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.5px', margin: '0 0 4px' }}>Status</p>
            {STATUS_FILTER_OPTIONS.map(s => (
              <FilterRow key={s.value} checked={filters.statuses.has(s.value)} onChange={() => toggleStatus(s.value)} dot={s.dot} label={s.label} />
            ))}

            <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />

            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.5px', margin: '0 0 4px' }}>Role type</p>
            {ROLE_TYPE_FILTER_OPTIONS.map(r => (
              <FilterRow key={r.value} checked={filters.roleTypes.has(r.value)} onChange={() => toggleRoleType(r.value)} dot={r.dot} label={r.label} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

