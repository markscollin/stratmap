import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Network, LayoutDashboard, GitBranch, Users, BarChart2, Settings } from 'lucide-react'
import { useChartStore } from '../../store'
import { useUIStore } from '../../store/uiStore'
import { mockDepartments } from '../../data/mockOrg'

interface Result {
  id: string
  type: 'node' | 'chart' | 'page'
  label: string
  sublabel?: string
  chartId?: string
  deptColour?: string
  icon?: React.ReactNode
}

const PAGES: Result[] = [
  { id: 'p-dashboard', type: 'page', label: 'Dashboard',  icon: <LayoutDashboard size={13} /> },
  { id: 'p-charts',    type: 'page', label: 'Org Charts', icon: <GitBranch size={13} /> },
  { id: 'p-roles',     type: 'page', label: 'Roles',      icon: <Users size={13} /> },
  { id: 'p-headcount', type: 'page', label: 'Headcount',  icon: <BarChart2 size={13} /> },
  { id: 'p-settings',  type: 'page', label: 'Settings',   icon: <Settings size={13} /> },
]

const PAGE_ROUTES: Record<string, string> = {
  'p-dashboard': '/dashboard', 'p-charts': '/charts',
  'p-roles': '/roles', 'p-headcount': '/headcount', 'p-settings': '/settings',
}

export function Spotlight() {
  const navigate  = useNavigate()
  const { charts } = useChartStore()
  const { spotlightOpen, setSpotlightOpen } = useUIStore()

  const [query,     setQuery]     = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef   = useRef<HTMLInputElement>(null)
  const listRef    = useRef<HTMLDivElement>(null)

  // Cmd+K to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSpotlightOpen(true)
      }
      if (e.key === 'Escape') setSpotlightOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setSpotlightOpen])

  useEffect(() => {
    if (spotlightOpen) {
      setQuery('')
      setActiveIdx(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [spotlightOpen])

  const results = useCallback((): { nodes: Result[]; charts: Result[]; pages: Result[] } => {
    const q = query.toLowerCase().trim()

    const nodeResults: Result[] = []
    charts.forEach(chart => {
      chart.nodes.forEach(node => {
        if (!q || node.name.toLowerCase().includes(q) || node.title.toLowerCase().includes(q)) {
          const dept = mockDepartments.find(d => d.id === node.departmentId)
          nodeResults.push({
            id: `node-${chart.id}-${node.id}`,
            type: 'node',
            label: node.name || node.title,
            sublabel: `${node.title} · ${chart.name}`,
            chartId: chart.id,
            deptColour: dept?.colour ?? '#94A3B8',
          })
        }
      })
    })

    const chartResults: Result[] = charts
      .filter(c => !q || c.name.toLowerCase().includes(q))
      .map(c => ({
        id: `chart-${c.id}`,
        type: 'chart' as const,
        label: c.name,
        sublabel: c.status,
        chartId: c.id,
        icon: <Network size={13} />,
      }))

    const pageResults: Result[] = PAGES.filter(p => !q || p.label.toLowerCase().includes(q))

    return { nodes: nodeResults.slice(0, 6), charts: chartResults.slice(0, 4), pages: pageResults }
  }, [query, charts])

  const { nodes: nodeResults, charts: chartResults, pages: pageResults } = results()
  const allResults = [...nodeResults, ...chartResults, ...pageResults]
  const total = allResults.length

  const handleSelect = (result: Result) => {
    setSpotlightOpen(false)
    if (result.type === 'node' && result.chartId) navigate(`/charts/${result.chartId}`)
    else if (result.type === 'chart' && result.chartId) navigate(`/charts/${result.chartId}`)
    else if (result.type === 'page') navigate(PAGE_ROUTES[result.id] ?? '/')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, total - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && allResults[activeIdx]) handleSelect(allResults[activeIdx])
  }

  useEffect(() => { setActiveIdx(0) }, [query])

  if (!spotlightOpen) return null

  function ResultItem({ result, globalIdx }: { result: Result; globalIdx: number }) {
    const isActive = globalIdx === activeIdx
    return (
      <button
        onClick={() => handleSelect(result)}
        onMouseEnter={() => setActiveIdx(globalIdx)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 12px', background: isActive ? 'var(--brand-bg)' : 'transparent',
          border: 'none', cursor: 'pointer', textAlign: 'left', borderRadius: 7,
          transition: 'background .1s',
        }}
      >
        {result.type === 'node' && result.deptColour ? (
          <span style={{
            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
            background: result.deptColour + '30', border: `1.5px solid ${result.deptColour}60`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, fontWeight: 700, color: result.deptColour,
          }}>
            {result.label.slice(0, 2).toUpperCase()}
          </span>
        ) : (
          <span style={{ color: isActive ? 'var(--brand)' : 'var(--muted)', display: 'flex', flexShrink: 0 }}>
            {result.icon}
          </span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {result.label}
          </div>
          {result.sublabel && (
            <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {result.sublabel}
            </div>
          )}
        </div>
      </button>
    )
  }

  function Section({ title, items, offset }: { title: string; items: Result[]; offset: number }) {
    if (items.length === 0) return null
    return (
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', letterSpacing: '.5px', textTransform: 'uppercase', padding: '6px 12px 4px' }}>
          {title}
        </div>
        {items.map((r, i) => <ResultItem key={r.id} result={r} globalIdx={offset + i} />)}
      </div>
    )
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '14vh' }}
      onClick={() => setSpotlightOpen(false)}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 560, background: 'var(--surface)', borderRadius: 16,
          border: '1px solid var(--border-hover)', boxShadow: 'var(--shadow)',
          overflow: 'hidden', animation: 'nodePop .18s cubic-bezier(.34,1.56,.64,1)',
        }}
      >
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <Search size={16} color="var(--muted)" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search people, charts, pages…"
            style={{
              flex: 1, background: 'transparent', border: 'none',
              color: 'var(--text)', fontSize: 16, outline: 'none',
            }}
          />
          <kbd style={{ fontSize: 10, color: 'var(--dim)', background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 6px' }}>Esc</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ maxHeight: 360, overflowY: 'auto', padding: '8px 4px' }}>
          {total === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
              No results for "{query}"
            </div>
          ) : (
            <>
              <Section title="People & Roles" items={nodeResults} offset={0} />
              <Section title="Charts"         items={chartResults} offset={nodeResults.length} />
              <Section title="Pages"          items={pageResults}  offset={nodeResults.length + chartResults.length} />
            </>
          )}
        </div>

        {/* Footer hint */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '8px 16px', display: 'flex', gap: 16, alignItems: 'center' }}>
          {[['↑↓', 'Navigate'], ['↵', 'Open'], ['Esc', 'Dismiss']].map(([key, label]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <kbd style={{ fontSize: 10, color: 'var(--dim)', background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px' }}>{key}</kbd>
              <span style={{ fontSize: 11, color: 'var(--dim)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
