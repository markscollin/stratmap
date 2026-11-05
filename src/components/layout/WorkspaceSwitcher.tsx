import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { api } from '../../lib/apiClient'
import { switchWorkspace } from '../../lib/workspaceSelection'
import { useUserStore } from '../../store/userStore'
import { useUIStore } from '../../store/uiStore'
import type { Permission, PlanTier } from '../../types'

interface WorkspaceSummary {
  id: string
  name: string
  myPermission: Permission
  planTier: PlanTier
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Sidebar workspace switcher (roadmap 1.2). Lists every workspace the user
 * belongs to; picking one remembers it and reloads into that workspace.
 * Plans are per workspace, so each row shows its own plan.
 */
export function WorkspaceSwitcher() {
  const workspace = useUserStore(s => s.workspace)
  const { sidebarCollapsed, toggleSidebar } = useUIStore()
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<WorkspaceSummary[] | null>(null)
  const [failed, setFailed] = useState(false)

  if (!workspace) return null

  async function toggle() {
    if (sidebarCollapsed) toggleSidebar()
    const next = !open
    setOpen(next)
    if (next && !list) {
      try {
        const res = await api.get<{ workspaces: WorkspaceSummary[] }>('/api/workspaces')
        setList(res.workspaces)
      } catch {
        setFailed(true)
      }
    }
  }

  const initial = workspace.name.trim().charAt(0).toUpperCase() || 'W'

  return (
    <div style={{ borderBottom: '1px solid var(--border)', padding: sidebarCollapsed ? '8px 10px' : '8px 10px' }}>
      <button
        onClick={toggle}
        aria-expanded={open}
        aria-label="Switch workspace"
        title={sidebarCollapsed ? workspace.name : undefined}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 9,
          padding: '6px 6px', borderRadius: 8, border: 'none', cursor: 'pointer',
          background: open ? 'var(--raised)' : 'transparent', color: 'var(--text)', textAlign: 'left',
        }}
      >
        <span style={avatar}>{initial}</span>
        {!sidebarCollapsed && (
          <>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {workspace.name}
            </span>
            <ChevronsUpDown size={14} color="var(--dim)" />
          </>
        )}
      </button>

      {open && !sidebarCollapsed && (
        <div role="listbox" aria-label="Workspaces" style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {!list && !failed && <p style={hint}>Loading…</p>}
          {failed && <p style={hint}>Couldn't load your workspaces.</p>}
          {list?.map(w => {
            const current = w.id === workspace.id
            return (
              <button
                key={w.id}
                role="option"
                aria-selected={current}
                onClick={() => (current ? setOpen(false) : switchWorkspace(w.id))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '7px 6px', borderRadius: 7,
                  border: 'none', background: current ? 'var(--brand-bg)' : 'transparent',
                  color: 'var(--text)', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{ ...avatar, width: 22, height: 22, fontSize: 11 }}>{w.name.trim().charAt(0).toUpperCase() || 'W'}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>{cap(w.planTier)} · {cap(w.myPermission)}</span>
                </span>
                {current && <Check size={14} color="var(--brand)" />}
              </button>
            )
          })}
          {list && list.length === 1 && (
            <p style={hint}>Accept an invite to another workspace and it shows up here.</p>
          )}
        </div>
      )}
    </div>
  )
}

const avatar: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 7, flexShrink: 0,
  background: 'var(--grad-purple)', color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 12, fontWeight: 800,
}

const hint: React.CSSProperties = { fontSize: 11, color: 'var(--muted)', padding: '4px 6px', lineHeight: 1.5 }
