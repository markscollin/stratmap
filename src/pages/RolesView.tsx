import { useState, useEffect } from 'react'
import { BookOpen, Search, Plus, FileText, X, MoreHorizontal, Copy, Trash2 } from 'lucide-react'
import { mockRoleSearchResults } from '../data/mockJDs'
import { useTemplateStore, type Template } from '../store/templateStore'
import { useWorkspaceDepartmentStore } from '../store/workspaceDepartmentStore'
import { JDEditor } from '../features/jd/JDEditor'

const FALLBACK_COLOUR = '#94A3B8'

const ROLE_STATUS_META = {
  active:  { label: 'Active',  color: 'var(--success)', bg: 'var(--success-bg)' },
  open:    { label: 'Open',    color: 'var(--warn)',    bg: 'var(--warn-bg)'    },
  planned: { label: 'Planned', color: 'var(--purple)',  bg: 'var(--purple-bg)'  },
} as const

type RoleTab = 'templates' | 'search'

// ─── Template modal ────────────────────────────────────────────────────────────

type ModalMode = 'create' | 'edit'

function TemplateModal({ mode, template, onSave, onClose }: {
  mode: ModalMode
  template?: Template
  onSave: (data: Pick<Template, 'title' | 'department' | 'tags' | 'responsibilities' | 'requirements' | 'uses' | 'updatedBy'>) => void
  onClose: () => void
}) {
  const { departments: wsDepts } = useWorkspaceDepartmentStore()
  const deptNames = wsDepts.map(d => d.name)

  const [title,            setTitle]    = useState(template?.title ?? '')
  const [department,       setDept]     = useState(template?.department ?? (wsDepts[0]?.name ?? ''))
  const [tagInput,         setTagInput] = useState(template?.tags.join(', ') ?? '')
  const [responsibilities, setResp]     = useState(template?.responsibilities ?? '')
  const [requirements,     setReq]      = useState(template?.requirements ?? '')

  const tags = tagInput.split(',').map(t => t.trim()).filter(Boolean)

  const handleSave = () => {
    if (!title.trim()) return
    onSave({ title: title.trim(), department, tags, responsibilities, requirements, uses: template?.uses ?? 0, updatedBy: 'You' })
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '40px 20px', overflow: 'auto',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560,
          background: 'var(--surface)', borderRadius: 16,
          border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
          animation: 'nodePop .2s ease-out',
          overflow: 'hidden',
        }}
      >
        {/* Modal header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
            {mode === 'create' ? 'New template' : 'Edit template'}
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex' }}>
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Field label="Title" required>
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Senior Software Engineer"
              style={inputStyle}
            />
          </Field>

          <Field label="Department">
            <select value={department} onChange={e => setDept(e.target.value)} style={inputStyle}>
              {deptNames.length === 0
                ? <option value="">No departments yet</option>
                : deptNames.map(d => <option key={d} value={d}>{d}</option>)
              }
            </select>
          </Field>

          <Field label="Tags" hint="comma-separated">
            <input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              placeholder="e.g. IC, Leadership, Technical"
              style={inputStyle}
            />
            {tags.length > 0 && (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
                {tags.map(t => (
                  <span key={t} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'var(--raised)', border: '1px solid var(--border)', color: 'var(--muted)' }}>{t}</span>
                ))}
              </div>
            )}
          </Field>

          <Field label="Responsibilities">
            <JDEditor
              content={responsibilities}
              onSave={setResp}
              editable
              placeholder="Outline the key responsibilities…"
            />
          </Field>

          <Field label="Requirements">
            <JDEditor
              content={requirements}
              onSave={setReq}
              editable
              placeholder="List qualifications and experience…"
            />
          </Field>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, padding: '16px 24px', borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '9px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            style={{
              flex: 2, padding: '9px',
              background: title.trim() ? 'var(--grad-brand)' : 'var(--raised)',
              border: 'none', borderRadius: 8,
              color: title.trim() ? '#fff' : 'var(--dim)',
              fontSize: 13, fontWeight: 600,
              cursor: title.trim() ? 'pointer' : 'default',
            }}
          >
            {mode === 'create' ? 'Create template' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode
}) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', marginBottom: 7 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{label}</span>
        {required && <span style={{ fontSize: 11, color: 'var(--danger)' }}>*</span>}
        {hint && <span style={{ fontSize: 11, color: 'var(--dim)' }}>{hint}</span>}
      </div>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px',
  background: 'var(--input-bg)', border: '1px solid var(--border)',
  borderRadius: 8, color: 'var(--text)', fontSize: 13,
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
}

// ─── Delete confirm ────────────────────────────────────────────────────────────

function DeleteConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '28px 32px', width: 360, textAlign: 'center', boxShadow: 'var(--shadow)', animation: 'nodePop .2s ease-out' }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Delete template?</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.5 }}>This cannot be undone. Charts that used this template won't be affected.</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '9px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: '9px', background: 'var(--danger)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Delete</button>
        </div>
      </div>
    </div>
  )
}

// ─── Overflow menu ─────────────────────────────────────────────────────────────

function CardMenu({ onEdit, onDuplicate, onDelete }: {
  onEdit: () => void; onDuplicate: () => void; onDelete: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--dim)', display: 'flex', borderRadius: 6 }}
      >
        <MoreHorizontal size={15} />
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 50,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, boxShadow: 'var(--shadow)', minWidth: 140,
            overflow: 'hidden', animation: 'slideDown .15s ease-out',
          }}>
            {[
              { Icon: FileText, label: 'Edit',      action: onEdit,      color: 'var(--text)' },
              { Icon: Copy,     label: 'Duplicate',  action: onDuplicate, color: 'var(--text)' },
              { Icon: Trash2,   label: 'Delete',     action: onDelete,    color: 'var(--danger)' },
            ].map(({ Icon, label, action, color }) => (
              <button
                key={label}
                onClick={e => { e.stopPropagation(); action(); setOpen(false) }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', background: 'transparent', border: 'none',
                  color, fontSize: 13, cursor: 'pointer', textAlign: 'left',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--raised)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function RolesView() {
  useEffect(() => { document.title = 'StratMap — Roles' }, [])
  const [tab,         setTab]         = useState<RoleTab>('templates')
  const [search,      setSearch]      = useState('')
  const [searchInput, setInput]       = useState('')
  const [focusSearch, setFocusSearch] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [hovTemplate, setHovTemplate] = useState<string | null>(null)

  const [modalMode,    setModalMode]    = useState<ModalMode>('create')
  const [modalOpen,    setModalOpen]    = useState(false)
  const [editingId,    setEditingId]    = useState<string | null>(null)
  const [deletingId,   setDeletingId]   = useState<string | null>(null)

  const { templates, loading, fetchTemplates, addTemplate, updateTemplate, deleteTemplate, duplicateTemplate } = useTemplateStore()
  const { departments: wsDepts, fetch: fetchDepts } = useWorkspaceDepartmentStore()
  const templateList = Object.values(templates)

  useEffect(() => { fetchTemplates(); fetchDepts() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const tabs = [
    { id: 'templates' as RoleTab, Icon: BookOpen, label: 'Template library' },
    { id: 'search'    as RoleTab, Icon: Search,   label: 'Find roles' },
  ]

  const openCreate = () => { setEditingId(null); setModalMode('create'); setModalOpen(true) }
  const openEdit   = (id: string) => { setEditingId(id); setModalMode('edit'); setModalOpen(true) }

  const handleSave = (data: Parameters<typeof addTemplate>[0]) => {
    if (modalMode === 'edit' && editingId) {
      updateTemplate(editingId, data)
    } else {
      addTemplate(data)
    }
  }

  const handleDelete = () => {
    if (deletingId) { deleteTemplate(deletingId); setDeletingId(null) }
  }

  const editingTemplate = editingId ? templates[editingId] : undefined

  return (
    <div style={{ padding: '28px 32px', animation: 'fadeUp .3s ease-out' }}>
      {modalOpen && (
        <TemplateModal
          mode={modalMode}
          template={editingTemplate}
          onSave={handleSave}
          onClose={() => setModalOpen(false)}
        />
      )}
      {deletingId && (
        <DeleteConfirm
          onConfirm={handleDelete}
          onCancel={() => setDeletingId(null)}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-.4px', marginBottom: 4 }}>Roles</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>Role templates and cross-chart role intelligence</p>
        </div>
        {tab === 'templates' && (
          <button
            onClick={openCreate}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: 'var(--grad-brand)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            <Plus size={14} /> New template
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {tabs.map(({ id, Icon, label }) => {
          const active = tab === id
          return (
            <button key={id} onClick={() => setTab(id)} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 18px', background: 'transparent', border: 'none',
              borderBottom: `2px solid ${active ? 'var(--brand)' : 'transparent'}`,
              color: active ? 'var(--brand)' : 'var(--muted)',
              fontSize: 14, fontWeight: active ? 600 : 400,
              cursor: 'pointer', marginBottom: -1, transition: 'all .15s',
            }}>
              <Icon size={15} />{label}
            </button>
          )
        })}
      </div>

      {/* ── Template library ─────────────────── */}
      {tab === 'templates' && (
        <>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', marginBottom: 20, boxShadow: 'var(--shadow-sm)' }}>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.65 }}>
              <strong style={{ color: 'var(--text)' }}>Templates</strong> are reusable job descriptions that can be applied to any node in any org chart. Changes to a template don't automatically update charts — they act as a starting point that can be customised per role.
            </p>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--dim)', fontSize: 13 }}>Loading templates…</div>
          ) : templateList.length === 0 ? (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '56px 40px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--brand-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <FileText size={24} color="var(--brand)" />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>No role templates yet</h3>
              <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 20 }}>Create templates to reuse job descriptions across your org charts.</p>
              <button onClick={openCreate} style={{ padding: '9px 20px', background: 'var(--grad-brand)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Create your first template
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {templateList.map((role, i) => {
                const colour = wsDepts.find(d => d.name === role.department)?.colour ?? FALLBACK_COLOUR
                const isHov  = hovTemplate === role.id
                return (
                  <div
                    key={role.id}
                    onMouseEnter={() => setHovTemplate(role.id)}
                    onMouseLeave={() => setHovTemplate(null)}
                    style={{
                      background: 'var(--surface)',
                      border: `1px solid ${isHov ? 'var(--border-hover)' : 'var(--border)'}`,
                      borderRadius: 12, padding: '16px 20px',
                      display: 'flex', alignItems: 'center', gap: 16,
                      boxShadow: isHov ? 'var(--shadow-sm)' : 'none',
                      transition: 'all .15s',
                      animation: `cardIn .3s ease-out ${i * 0.04}s both`,
                    }}
                  >
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: `${colour}20`, border: `1px solid ${colour}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <FileText size={17} color={colour} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>{role.title}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{role.department}</span>
                        <span style={{ fontSize: 11, color: 'var(--dim)' }}>Updated by {role.updatedBy} · {new Date(role.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <div style={{ display: 'flex', gap: 5 }}>
                        {role.tags.map(tag => (
                          <span key={tag} style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--raised)', border: '1px solid var(--border)', padding: '2px 7px', borderRadius: 10 }}>{tag}</span>
                        ))}
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--muted)', background: 'var(--raised)', padding: '3px 10px', borderRadius: 20, border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                        Used in {role.uses} chart{role.uses !== 1 ? 's' : ''}
                      </span>
                      <button
                        onClick={() => openEdit(role.id)}
                        style={{ padding: '6px 14px', background: 'var(--brand-bg)', border: '1px solid var(--brand)', borderRadius: 7, color: 'var(--brand)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Edit
                      </button>
                      <CardMenu
                        onEdit={() => openEdit(role.id)}
                        onDuplicate={() => duplicateTemplate(role.id)}
                        onDelete={() => setDeletingId(role.id)}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── Find roles ──────────────────────── */}
      {tab === 'search' && (
        <>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', marginBottom: 20, boxShadow: 'var(--shadow-sm)' }}>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.65 }}>
              <strong style={{ color: 'var(--text)' }}>Find roles</strong> searches across every org chart in your workspace — active headcount, open positions, and planned hires. Ask questions like <em>"how many QAs do we have and where do they work?"</em>
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--surface)',
              border: `1px solid ${focusSearch ? 'var(--brand)' : 'var(--border)'}`,
              boxShadow: focusSearch ? '0 0 0 3px var(--brand-bg)' : 'none',
              borderRadius: 10, padding: '10px 14px', transition: 'all .15s',
            }}>
              <Search size={15} color="var(--dim)" />
              <input
                value={searchInput}
                onChange={e => setInput(e.target.value)}
                onFocus={() => setFocusSearch(true)}
                onBlur={() => setFocusSearch(false)}
                onKeyDown={e => { if (e.key === 'Enter' && searchInput) { setSearch(searchInput); setShowResults(true) } }}
                placeholder='Search by job title, e.g. "QA Engineer", "Product Manager"…'
                style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 14, flex: 1, width: '100%' }}
              />
              {searchInput && (
                <button onClick={() => { setInput(''); setSearch(''); setShowResults(false) }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--dim)', display: 'flex' }}>
                  <X size={12} />
                </button>
              )}
            </div>
            <button
              onClick={() => { if (searchInput) { setSearch(searchInput); setShowResults(true) } }}
              style={{ padding: '10px 20px', background: 'var(--grad-brand)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 14px var(--brand-glow)' }}
            >
              Search
            </button>
          </div>

          {!showResults ? (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '48px 40px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--brand-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Search size={24} color="var(--brand)" />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Search across all your org charts</h3>
              <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.7, maxWidth: 400, margin: '0 auto' }}>
                Find out how many people hold a given role, which departments they're in, and whether there are open or planned positions for that title — all in one place.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 20 }}>
                {['QA Engineer','Product Manager','Head of Engineering','Sales Development Rep'].map(q => (
                  <QuickSearch key={q} label={q} onSelect={() => { setInput(q); setSearch(q); setShowResults(true) }} />
                ))}
              </div>
            </div>
          ) : (
            <SearchResults query={search} />
          )}
        </>
      )}
    </div>
  )
}

function QuickSearch({ label, onSelect }: { label: string; onSelect: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '6px 14px',
        background: 'var(--raised)',
        border: `1px solid ${hov ? 'var(--brand)' : 'var(--border)'}`,
        borderRadius: 20, color: hov ? 'var(--brand)' : 'var(--muted)',
        fontSize: 12, cursor: 'pointer', transition: 'all .15s',
      }}
    >{label}</button>
  )
}

function SearchResults({ query }: { query: string }) {
  const results = mockRoleSearchResults
  const uniqueCharts = new Set(results.map(r => r.chart)).size
  const counts = { active: 0, open: 0, planned: 0 }
  results.forEach(r => { counts[r.status]++ })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
            Results for <span style={{ color: 'var(--brand)' }}>"{query}"</span>
          </h3>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{results.length} results across {uniqueCharts} charts</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {([['active','var(--success)','var(--success-bg)'],['open','var(--warn)','var(--warn-bg)'],['planned','var(--purple)','var(--purple-bg)']] as const).map(([s,c,bg]) =>
            counts[s] > 0 && (
              <span key={s} style={{ padding: '4px 12px', background: bg, border: `1px solid ${c}40`, borderRadius: 20, fontSize: 12, fontWeight: 600, color: c }}>
                {counts[s]} {ROLE_STATUS_META[s].label.toLowerCase()}
              </span>
            )
          )}
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', padding: '10px 20px', background: 'var(--raised)', borderBottom: '1px solid var(--border)' }}>
          {['Role title','Chart','Department','Status'].map(h => (
            <span key={h} style={{ fontSize: 11, fontWeight: 600, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.4px' }}>{h}</span>
          ))}
        </div>
        {results.map((r, i) => {
          const sm = ROLE_STATUS_META[r.status]
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', padding: '14px 20px', borderBottom: i < results.length-1 ? '1px solid var(--border)' : 'none', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{r.title}</div>
                {r.person && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{r.person}</div>}
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                {r.chart} <span style={{ fontSize: 10, color: 'var(--dim)' }}>v{r.version}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>{r.dept}</div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 20, background: sm.bg, color: sm.color, fontSize: 11, fontWeight: 600, width: 'fit-content' }}>
                {sm.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
