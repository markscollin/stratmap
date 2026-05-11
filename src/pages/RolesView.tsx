import { useState } from 'react'
import { BookOpen, Search, Plus, FileText, X } from 'lucide-react'
import { mockRoleTemplates, mockRoleSearchResults } from '../data/mockJDs'
import { DEPT_COLOURS } from '../data/mockOrg'

const DEPT_IDS: Record<string, string> = {
  'Engineering':  'eng',
  'Product':      'product',
  'Design':       'design',
  'Go-to-Market': 'go',
  'Operations':   'ops',
  'Finance':      'finance',
}

const ROLE_STATUS_META = {
  active:  { label: 'Active',  color: 'var(--success)', bg: 'var(--success-bg)' },
  open:    { label: 'Open',    color: 'var(--warn)',    bg: 'var(--warn-bg)'    },
  planned: { label: 'Planned', color: 'var(--purple)',  bg: 'var(--purple-bg)'  },
} as const

type RoleTab = 'templates' | 'search'

export function RolesView() {
  const [tab, setTab]               = useState<RoleTab>('templates')
  const [search, setSearch]         = useState('')
  const [searchInput, setInput]     = useState('')
  const [focusSearch, setFocusSearch] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [hovTemplate, setHovTemplate] = useState<string | null>(null)

  const tabs = [
    { id: 'templates' as RoleTab, Icon: BookOpen, label: 'Template library' },
    { id: 'search'    as RoleTab, Icon: Search,   label: 'Find roles' },
  ]

  return (
    <div style={{ padding: '28px 32px', animation: 'fadeUp .3s ease-out' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-.4px', marginBottom: 4 }}>Roles</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>Role templates and cross-chart role intelligence</p>
        </div>
        {tab === 'templates' && (
          <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: 'var(--grad-brand)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
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

      {/* ── Template library ───────────────────────── */}
      {tab === 'templates' && (
        <>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', marginBottom: 20, boxShadow: 'var(--shadow-sm)' }}>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.65 }}>
              <strong style={{ color: 'var(--text)' }}>Templates</strong> are reusable job descriptions that can be applied to any node in any org chart. Changes to a template don't automatically update charts — they act as a starting point that can be customised per role.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {mockRoleTemplates.map((role, i) => {
              const deptId  = DEPT_IDS[role.dept]
              const colour  = DEPT_COLOURS[deptId] ?? DEPT_COLOURS.eng
              const isHov   = hovTemplate === role.id
              return (
                <div key={role.id}
                  onMouseEnter={() => setHovTemplate(role.id)}
                  onMouseLeave={() => setHovTemplate(null)}
                  style={{
                    background: 'var(--surface)',
                    border: `1px solid ${isHov ? 'var(--border-hover)' : 'var(--border)'}`,
                    borderRadius: 12, padding: '16px 20px',
                    display: 'flex', alignItems: 'center', gap: 16,
                    boxShadow: isHov ? 'var(--shadow-sm)' : 'none',
                    transition: 'all .15s', cursor: 'pointer',
                    animation: `cardIn .3s ease-out ${i * 0.04}s both`,
                  }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: `${colour}20`, border: `1px solid ${colour}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <FileText size={17} color={colour} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>{role.title}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{role.dept}</span>
                      <span style={{ fontSize: 11, color: 'var(--dim)' }}>Updated by {role.updatedBy} · {role.updated}</span>
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
                    <button style={{ padding: '6px 14px', background: 'var(--brand-bg)', border: '1px solid var(--brand)', borderRadius: 7, color: 'var(--brand)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      Edit
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ── Find roles ─────────────────────────────── */}
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
