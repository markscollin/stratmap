import { createPortal } from 'react-dom'
// The canvas toolbar (split out of OrgChart.tsx, R-35).
import { MousePointer2, ZoomIn, Plus, Maximize2, GitBranch, Undo2, Redo2, LayoutGrid, Upload, History } from 'lucide-react'
import type { Department } from '../../types'
import type { ActiveFilters, ActiveTool } from './canvasTypes'
import { ExportBtn } from './ExportMenu'
import { ShareSettingsBtn } from './ShareSettings'
import { FilterBtn } from './FilterPanel'
import { ToolBtn } from './ToolBtn'

// ─── Toolbar ──────────────────────────────────────────────────────────────────

export function Toolbar({ slot, activeTool, setActiveTool, onAddNode, onImport, onHistory, onAutoLayout, onUndo, onRedo, canUndo, canRedo, readOnly, nodeCount, maxNodesPerChart, currentTier, onExport, chartId, isPublic, filterOpen, onFilterOpenChange, departments, filters, onFiltersChange }: {
  activeTool: ActiveTool; setActiveTool: (t: ActiveTool) => void
  onAddNode: () => void; onImport: () => void; onHistory?: () => void; onAutoLayout: () => void; onUndo: () => void; onRedo: () => void
  canUndo: boolean; canRedo: boolean; readOnly: boolean
  nodeCount: number; maxNodesPerChart: number; currentTier: string
  onExport: (format: 'png' | 'pdf' | 'csv') => void
  chartId: string; isPublic: boolean
  filterOpen: boolean; onFilterOpenChange: (open: boolean) => void
  departments: Department[]; filters: ActiveFilters; onFiltersChange: (f: ActiveFilters) => void
  /** Render into the page's header row instead of floating over the canvas (R-64). */
  slot?: HTMLElement | null
}) {
  const editTools: ActiveTool[] = readOnly
    ? ['select', 'pan', 'zoom']
    : ['select', 'pan', 'zoom', 'connect']
  const bar = (
    <div data-export-ignore data-testid="canvas-toolbar" style={{
      ...(slot ? { position: 'relative' } : { position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 20 }),
      display: 'flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap',
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '4px 6px', boxShadow: 'var(--shadow-sm)',
    }}>
      {!readOnly && <>
        <ToolBtn Icon={Undo2} label="Undo (⌘Z)"  active={false} disabled={!canUndo} onClick={onUndo} />
        <ToolBtn Icon={Redo2} label="Redo (⌘⇧Z)" active={false} disabled={!canRedo} onClick={onRedo} />
        <Divider />
      </>}
      {editTools.map(id => {
        const map: Record<ActiveTool, { Icon: React.FC<{ size?: number }>; label: string }> = {
          select:  { Icon: MousePointer2, label: 'Select (V)'  },
          pan:     { Icon: Maximize2,     label: 'Pan (H)'     },
          zoom:    { Icon: ZoomIn,        label: 'Zoom (Z)'    },
          connect: { Icon: GitBranch,     label: 'Connect (C)' },
        }
        const { Icon, label } = map[id]
        return <ToolBtn key={id} Icon={Icon} label={label} active={activeTool === id} onClick={() => setActiveTool(id)} />
      })}
      <Divider />
      <FilterBtn
        open={filterOpen} onOpenChange={onFilterOpenChange}
        departments={departments} filters={filters} onFiltersChange={onFiltersChange}
      />
      {!readOnly && <>
        <ToolBtn
          Icon={LayoutGrid}
          label={currentTier === 'free' ? 'Auto-layout (Starter+)' : 'Auto-layout'}
          active={false}
          onClick={onAutoLayout}
        />
      </>}
      {!readOnly && <ToolBtn Icon={Upload} label="Import people (CSV or Excel)" active={false} onClick={onImport} />}
      <ExportBtn onExport={onExport} />
      {onHistory && <ToolBtn Icon={History} label="Version history" active={false} onClick={onHistory} />}
      {/* Share settings are an editor action (enforced by the API too) */}
      {!readOnly && <ShareSettingsBtn chartId={chartId} isPublic={isPublic} />}
      {!readOnly ? <>
        <Divider />
        <button onClick={onAddNode} style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px',
          borderRadius: 6, background: 'var(--brand-bg)', border: '1px solid var(--brand)',
          color: 'var(--brand)', fontSize: 12, cursor: 'pointer',
        }}>
          <Plus size={12} /> Add role
        </button>
        {currentTier === 'free' && (
          <>
            <Divider />
            <span style={{ fontSize: 11, color: 'var(--dim)', padding: '4px 10px', fontWeight: 500 }}>
              {nodeCount} / {maxNodesPerChart}
            </span>
          </>
        )}
      </> : <>
        <Divider />
        <span style={{ fontSize: 11, color: 'var(--muted)', padding: '4px 10px', background: 'var(--nav-hover)', borderRadius: 6, fontWeight: 500, whiteSpace: 'nowrap' }}>
          View only
        </span>
      </>}
    </div>
  )
  return slot ? createPortal(bar, slot) : bar
}

export function Divider() {
  return <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 3px' }} />
}
