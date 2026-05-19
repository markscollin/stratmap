import { useRef, useEffect, useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MousePointer2, ZoomIn, Layers, Plus, Minus, Maximize2, GitBranch, Undo2, Redo2, LayoutGrid, Download } from 'lucide-react'
import { exportAsPNG, exportAsPDF } from '../../utils/export'
import type { OrgNode, OrgEdge, Department } from '../../types'
import { NODE_W, NODE_H } from '../../data/mockNodes'
import { useCanvasState } from './useCanvasState'
import { NodeCard } from '../nodes/NodeCard'
import { NodeModal } from '../nodes/NodeModal'
import { JDPanel } from '../panel/JDPanel'
import { UpgradeModal } from '../../components/ui/UpgradeModal'
import { usePlanLimits } from '../../hooks/usePlanLimits'
import { useBillingStore } from '../../store/billingStore'
import { useToastStore } from '../../store/toastStore'
import { calculateLayout } from '../../utils/layout'
import { api } from '../../lib/apiClient'

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Transform = { x: number; y: number; scale: number }

function toScreen(cx: number, cy: number, t: Transform) {
  return { x: cx * t.scale + t.x, y: cy * t.scale + t.y }
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// ─── Edge SVG ─────────────────────────────────────────────────────────────────

function EdgePath({
  source, target, transform, selected, hovered, deptColour,
  onClick, onMouseEnter, onMouseLeave, onDelete,
}: {
  source: OrgNode; target: OrgNode
  transform: Transform
  selected: boolean; hovered: boolean
  deptColour: string
  onClick: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
  onDelete: () => void
}) {
  const s  = toScreen(source.x + NODE_W / 2, source.y + NODE_H, transform)
  const e  = toScreen(target.x + NODE_W / 2, target.y,          transform)
  const dy = Math.max((e.y - s.y) * 0.45, 30)
  const d  = `M ${s.x} ${s.y} C ${s.x} ${s.y+dy} ${e.x} ${e.y-dy} ${e.x} ${e.y}`

  const baseColour = selected ? 'var(--brand)' : hovered ? deptColour : hexToRgba(deptColour, 0.6)
  const width      = selected || hovered ? 2.5 : 1.5

  // Midpoint of the bezier (approximated as line midpoint — works for our vertical curves)
  const mid = { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 }

  // Arrowhead: our bezier always arrives vertically, so arrow points down (or up)
  const arrowDir = e.y >= s.y ? 1 : -1
  const arrowPath = `M ${e.x} ${e.y} L ${e.x - 5} ${e.y - 9 * arrowDir} L ${e.x + 5} ${e.y - 9 * arrowDir} Z`

  return (
    <g>
      {/* Invisible wide hit area */}
      <path d={d} fill="none" stroke="transparent" strokeWidth={14}
        style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
        onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
      />
      {/* Visible path */}
      <path d={d} fill="none" stroke={baseColour} strokeWidth={width}
        strokeLinecap="round"
        style={{ pointerEvents: 'none', transition: 'stroke .15s, stroke-width .15s' }}
      />
      {/* Arrowhead */}
      <path d={arrowPath} fill={baseColour}
        style={{ pointerEvents: 'none', transition: 'fill .15s' }}
      />
      {/* Delete button at midpoint — only when selected */}
      {selected && (
        <g onClick={e => { e.stopPropagation(); onDelete() }} style={{ cursor: 'pointer' }}>
          <circle cx={mid.x} cy={mid.y} r={10}
            fill="var(--surface)" stroke="var(--danger)" strokeWidth={1.5}
          />
          <text x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="central"
            fontSize={13} fill="var(--danger)"
            style={{ pointerEvents: 'none', fontFamily: 'DM Sans, sans-serif', fontWeight: 700 }}
          >×</text>
        </g>
      )}
    </g>
  )
}

// ─── Minimap ──────────────────────────────────────────────────────────────────

const MM_W = 160
const MM_H = 90

function Minimap({ nodes, transform, vpW, vpH, onPanTo }: {
  nodes: OrgNode[]; transform: Transform; vpW: number; vpH: number
  onPanTo: (x: number, y: number) => void
}) {
  if (nodes.length === 0) return null
  const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y)
  const minX = Math.min(...xs) - 40, minY = Math.min(...ys) - 40
  const maxX = Math.max(...xs) + NODE_W + 40, maxY = Math.max(...ys) + NODE_H + 40
  const cW = maxX - minX, cH = maxY - minY
  const mmScale = Math.min(MM_W / cW, MM_H / cH)
  const vpCX = -transform.x / transform.scale, vpCY = -transform.y / transform.scale
  const vpCW = vpW / transform.scale,           vpCH = vpH / transform.scale
  const vpMMX = (vpCX - minX) * mmScale, vpMMY = (vpCY - minY) * mmScale
  const vpMMW = vpCW * mmScale,          vpMMH = vpCH * mmScale

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const mx   = (e.clientX - rect.left)  / mmScale + minX
    const my   = (e.clientY - rect.top)   / mmScale + minY
    onPanTo(-(mx * transform.scale - vpW / 2), -(my * transform.scale - vpH / 2))
  }

  const deptColors: Record<string,string> = { eng:'#0EA5E9', product:'#10B981', design:'#8B5CF6', go:'#F59E0B', ops:'#EF4444', finance:'#06B6D4' }

  return (
    <div data-export-ignore style={{
      position: 'absolute', bottom: 56, left: 16, zIndex: 20,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, overflow: 'hidden', boxShadow: 'var(--shadow-sm)',
    }}>
      <svg width={MM_W} height={MM_H} style={{ display: 'block', cursor: 'crosshair' }} onClick={handleClick}>
        {nodes.map(n => (
          <rect key={n.id}
            x={(n.x - minX) * mmScale} y={(n.y - minY) * mmScale}
            width={NODE_W * mmScale} height={NODE_H * mmScale}
            rx={2} fill={deptColors[n.departmentId] ?? '#94A3B8'} fillOpacity={0.55}
          />
        ))}
        <rect x={vpMMX} y={vpMMY} width={vpMMW} height={vpMMH}
          fill="rgba(14,165,233,0.08)" stroke="var(--brand)" strokeWidth={1.5}
          rx={2} style={{ pointerEvents: 'none' }}
        />
      </svg>
    </div>
  )
}

// ─── Connect mode indicator ───────────────────────────────────────────────────

function ConnectingLine({ fromNode, mousePos, transform }: {
  fromNode: OrgNode; mousePos: { x: number; y: number }; transform: Transform
}) {
  const s  = toScreen(fromNode.x + NODE_W / 2, fromNode.y + NODE_H, transform)
  const e  = toScreen(mousePos.x, mousePos.y, transform)
  const dy = Math.abs(e.y - s.y) * 0.45
  const d  = `M ${s.x} ${s.y} C ${s.x} ${s.y+dy} ${e.x} ${e.y-dy} ${e.x} ${e.y}`
  return (
    <path d={d} fill="none" stroke="var(--purple)" strokeWidth={1.5}
      strokeDasharray="6 3" style={{ pointerEvents: 'none' }}
    />
  )
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

type ActiveTool = 'select' | 'pan' | 'zoom' | 'connect'

function ExportBtn({ onExport }: { onExport: (format: 'png' | 'pdf') => void }) {
  const [open, setOpen] = useState(false)
  const [hov, setHov] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <button
        title="Export"
        onClick={() => setOpen(o => !o)}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 30, height: 30, borderRadius: 6,
          background: hov ? 'var(--nav-hover)' : 'transparent',
          border: '1px solid transparent',
          color: hov ? 'var(--text)' : 'var(--muted)',
          cursor: 'pointer', transition: 'all .12s',
        }}
      >
        <Download size={13} />
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: 36, left: '50%', transform: 'translateX(-50%)',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, padding: 4, zIndex: 50,
            boxShadow: 'var(--shadow-sm)', minWidth: 110,
          }}>
            {(['png', 'pdf'] as const).map(fmt => (
              <button
                key={fmt}
                onClick={() => { setOpen(false); onExport(fmt) }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '6px 10px', borderRadius: 5, border: 'none',
                  background: 'transparent', color: 'var(--text)',
                  fontSize: 12, cursor: 'pointer',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--nav-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                Export as {fmt.toUpperCase()}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Toolbar({ activeTool, setActiveTool, onAddNode, onAutoLayout, onUndo, onRedo, canUndo, canRedo, readOnly, nodeCount, maxNodesPerChart, currentTier, onExport }: {
  activeTool: ActiveTool; setActiveTool: (t: ActiveTool) => void
  onAddNode: () => void; onAutoLayout: () => void; onUndo: () => void; onRedo: () => void
  canUndo: boolean; canRedo: boolean; readOnly: boolean
  nodeCount: number; maxNodesPerChart: number; currentTier: string
  onExport: (format: 'png' | 'pdf') => void
}) {
  const editTools: ActiveTool[] = readOnly
    ? ['select', 'pan', 'zoom']
    : ['select', 'pan', 'zoom', 'connect']
  return (
    <div data-export-ignore style={{
      position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', alignItems: 'center', gap: 2, zIndex: 20,
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
      <ToolBtn Icon={Layers} label="Filter (F)" active={false} onClick={() => {}} />
      {!readOnly && <>
        <ToolBtn
          Icon={LayoutGrid}
          label={currentTier === 'free' ? 'Auto-layout (Starter+)' : 'Auto-layout'}
          active={false}
          onClick={onAutoLayout}
        />
      </>}
      <ExportBtn onExport={onExport} />
      {!readOnly ? <>
        <Divider />
        <button onClick={onAddNode} style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px',
          borderRadius: 6, background: 'var(--brand-bg)', border: '1px solid var(--brand)',
          color: 'var(--brand)', fontSize: 12, cursor: 'pointer',
        }}>
          <Plus size={12} /> Add node
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
        <span style={{ fontSize: 11, color: 'var(--muted)', padding: '4px 10px', background: 'var(--nav-hover)', borderRadius: 6, fontWeight: 500 }}>
          View only
        </span>
      </>}
    </div>
  )
}

function Divider() {
  return <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 3px' }} />
}

function ToolBtn({ Icon, label, active, disabled, onClick }: {
  Icon: React.FC<{ size?: number }>; label: string; active: boolean; disabled?: boolean; onClick: () => void
}) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick} title={label} disabled={disabled}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 30, height: 30, borderRadius: 6,
        background: active ? 'var(--brand-bg)' : hov ? 'var(--nav-hover)' : 'transparent',
        border: active ? '1px solid var(--brand)' : '1px solid transparent',
        color: active ? 'var(--brand)' : disabled ? 'var(--dim)' : hov ? 'var(--text)' : 'var(--muted)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'all .12s',
      }}
    >
      <Icon size={13} />
    </button>
  )
}

// ─── Zoom controls ────────────────────────────────────────────────────────────

function ZoomControls({ scale, onZoom, onFit }: { scale: number; onZoom: (d: number) => void; onFit: () => void }) {
  return (
    <div data-export-ignore style={{
      position: 'absolute', bottom: 16, right: 16, zIndex: 20,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '5px 8px',
      display: 'flex', alignItems: 'center', gap: 6, boxShadow: 'var(--shadow-sm)',
    }}>
      <button onClick={() => onZoom(-0.1)} style={zoomBtnStyle}><Minus size={11} /></button>
      <button onClick={onFit} style={{ ...zoomBtnStyle, minWidth: 46, fontSize: 11, color: 'var(--muted)' }}>
        {Math.round(scale * 100)}%
      </button>
      <button onClick={() => onZoom(+0.1)} style={zoomBtnStyle}><Plus size={11} /></button>
    </div>
  )
}

const zoomBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 24, height: 24, borderRadius: 5,
  border: '1px solid var(--border)', background: 'transparent',
  color: 'var(--muted)', cursor: 'pointer', fontSize: 14,
}

// ─── Main canvas ──────────────────────────────────────────────────────────────

export function OrgChart({ chartId = '', chartName = 'chart', initialNodes = [], initialEdges = [], departments = [], readOnly = false }: {
  chartId?: string
  chartName?: string
  initialNodes?: OrgNode[]
  initialEdges?: OrgEdge[]
  departments?: Department[]
  readOnly?: boolean
}) {
  const {
    nodes, edges, transform, setTransform,
    selectedId, setSelectedId,
    selectedEdgeId, setSelectedEdgeId,
    connectingFrom, setConnectingFrom,
    activeTool, setActiveTool,
    moveNode, commitDrag,
    addNode, updateNode, deleteNode,
    addEdge, removeEdge,
    applyLayout,
    undo, redo, canUndo, canRedo,
  } = useCanvasState(initialNodes, initialEdges)

  const addToast = useToastStore(s => s.addToast)

  const containerRef = useRef<HTMLDivElement>(null)
  const viewportRef  = useRef<HTMLDivElement>(null)

  const interactionRef = useRef({
    mode: 'idle' as 'idle' | 'dragging' | 'panning',
    nodeId:   null as string | null,
    lastX: 0, lastY: 0, hasMoved: false, startX: 0, startY: 0,
  })
  const scaleRef   = useRef(transform.scale)
  scaleRef.current = transform.scale
  const nodesRef   = useRef(nodes)
  nodesRef.current = nodes

  const [mouseCanvas, setMouseCanvas] = useState({ x: 0, y: 0 })
  const [hovEdgeId,   setHovEdgeId]   = useState<string | null>(null)
  const [vpSize,      setVpSize]      = useState({ w: 1100, h: 600 })

  // Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingNodeId,  setEditingNodeId]  = useState<string | null>(null)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const addNodePosRef = useRef({ x: 400, y: 200 })

  // Plan limits
  const { isAtNodeLimit, currentTier, upgradeRequired } = usePlanLimits()
  const plan = useBillingStore((state) => state.plan)
  const navigate = useNavigate()

  // Single vs double click disambiguation
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(entries => {
      for (const e of entries) setVpSize({ w: e.contentRect.width, h: e.contentRect.height })
    })
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  // ── Fit to view ────────────────────────────────────────────────────────────

  const fitToView = useCallback(() => {
    const ns = nodesRef.current
    if (ns.length === 0) return
    const { w, h } = vpSize
    const xs = ns.map(n => n.x), ys = ns.map(n => n.y)
    const minX = Math.min(...xs) - 60, minY = Math.min(...ys) - 60
    const maxX = Math.max(...xs) + NODE_W + 60, maxY = Math.max(...ys) + NODE_H + 60
    const cW = maxX - minX, cH = maxY - minY
    const scale = Math.min((w - 40) / cW, (h - 40) / cH, 1)
    const tx = (w - cW * scale) / 2 - minX * scale
    const ty = (h - cH * scale) / 2 - minY * scale
    setTransform({ x: tx, y: ty, scale })
  }, [vpSize, setTransform])

  useEffect(() => { fitToView() }, [vpSize.w]) // eslint-disable-line

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.target instanceof HTMLElement && e.target.isContentEditable) return
      const mod = e.ctrlKey || e.metaKey
      if (!readOnly) {
        if (mod && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo() }
        if (mod &&  e.shiftKey && e.key === 'z') { e.preventDefault(); redo() }
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEdgeId) {
          removeEdge(selectedEdgeId)
          if (chartId) {
            api.delete(`/api/charts/${chartId}/edges/${selectedEdgeId}`)
              .catch(err => console.error('[canvas] removeEdge failed:', err))
          }
        }
        if (e.key === 'c' && !mod) setActiveTool('connect')
      }
      if (e.key === 'Escape') { setConnectingFrom(null); setSelectedId(null) }
      if (e.key === 'v' && !mod) setActiveTool('select')
      if (e.key === 'h' && !mod) setActiveTool('pan')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo, removeEdge, selectedEdgeId, setConnectingFrom, setSelectedId, setActiveTool])

  // ── Zoom ───────────────────────────────────────────────────────────────────

  const applyZoom = useCallback((delta: number, cx?: number, cy?: number) => {
    setTransform(t => {
      const factor   = delta > 0 ? 1.1 : 0.9
      const newScale = Math.max(0.1, Math.min(3, t.scale * factor))
      const mouseX   = cx ?? vpSize.w / 2
      const mouseY   = cy ?? vpSize.h / 2
      return {
        x:     mouseX - (mouseX - t.x) * (newScale / t.scale),
        y:     mouseY - (mouseY - t.y) * (newScale / t.scale),
        scale: newScale,
      }
    })
  }, [vpSize, setTransform])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      applyZoom(-e.deltaY, e.clientX - rect.left, e.clientY - rect.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [applyZoom])

  // ── Pointer events ─────────────────────────────────────────────────────────

  const handleNodePointerDown = useCallback((e: React.PointerEvent, nodeId: string) => {
    if (e.button !== 0) return
    e.stopPropagation()
    if (readOnly || activeTool !== 'select') return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    interactionRef.current = { mode: 'dragging', nodeId, lastX: e.clientX, lastY: e.clientY, startX: e.clientX, startY: e.clientY, hasMoved: false }
  }, [activeTool, readOnly])

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    if (connectingFrom) { setConnectingFrom(null); return }
    if (activeTool === 'pan') {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      interactionRef.current = { mode: 'panning', nodeId: null, lastX: e.clientX, lastY: e.clientY, startX: e.clientX, startY: e.clientY, hasMoved: false }
    } else if (activeTool === 'select') {
      setSelectedId(null); setSelectedEdgeId(null)
    }
  }, [activeTool, connectingFrom, setConnectingFrom, setSelectedId, setSelectedEdgeId])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const ia   = interactionRef.current
    const rect = containerRef.current!.getBoundingClientRect()
    setMouseCanvas({
      x: (e.clientX - rect.left - transform.x) / transform.scale,
      y: (e.clientY - rect.top  - transform.y) / transform.scale,
    })
    if (ia.mode === 'dragging' && ia.nodeId) {
      const dx = (e.clientX - ia.lastX) / scaleRef.current
      const dy = (e.clientY - ia.lastY) / scaleRef.current
      if (!ia.hasMoved && (Math.abs(e.clientX - ia.startX) > 3 || Math.abs(e.clientY - ia.startY) > 3)) ia.hasMoved = true
      if (ia.hasMoved) moveNode(ia.nodeId, dx, dy)
      ia.lastX = e.clientX; ia.lastY = e.clientY
    } else if (ia.mode === 'panning') {
      const dx = e.clientX - ia.lastX, dy = e.clientY - ia.lastY
      ia.lastX = e.clientX; ia.lastY = e.clientY
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        ia.hasMoved = true
        setTransform(t => ({ ...t, x: t.x + dx, y: t.y + dy }))
      }
    }
  }, [moveNode, setTransform, transform])

  const handlePointerUp = useCallback(() => {
    const ia = interactionRef.current
    if (ia.mode === 'dragging' && ia.hasMoved) {
      commitDrag(nodesRef.current)
      if (chartId) {
        const positions = nodesRef.current.map(n => ({ id: n.id, x: n.x, y: n.y }))
        api.put(`/api/charts/${chartId}/nodes`, positions).catch(err =>
          console.error('[canvas] position sync failed:', err)
        )
      }
    }
    interactionRef.current = { mode: 'idle', nodeId: null, lastX: 0, lastY: 0, hasMoved: false, startX: 0, startY: 0 }
  }, [commitDrag, chartId])

  const handleNodeClick = useCallback((e: React.MouseEvent, nodeId: string) => {
    if (interactionRef.current.hasMoved) return
    e.stopPropagation()

    if (activeTool === 'connect' || connectingFrom) {
      if (!connectingFrom) {
        setConnectingFrom(nodeId)
      } else if (connectingFrom !== nodeId) {
        addEdge(connectingFrom, nodeId)
        if (chartId) {
          api.post(`/api/charts/${chartId}/edges`, { sourceId: connectingFrom, targetId: nodeId })
            .catch(err => console.error('[canvas] addEdge failed:', err))
        }
        setConnectingFrom(null)
        setActiveTool('select')
      }
      return
    }

    clearTimeout(clickTimerRef.current)
    clickTimerRef.current = setTimeout(() => {
      setSelectedId(prev => prev === nodeId ? null : nodeId)
      setSelectedEdgeId(null)
    }, 220)
  }, [activeTool, connectingFrom, setConnectingFrom, addEdge, setSelectedId, setSelectedEdgeId, setActiveTool])

  const handleNodeDoubleClick = useCallback((e: React.MouseEvent, nodeId: string) => {
    if (interactionRef.current.hasMoved || readOnly) return
    e.stopPropagation()
    clearTimeout(clickTimerRef.current)
    setSelectedId(null)
    setEditingNodeId(nodeId)
  }, [setSelectedId, readOnly])

  const handleOpenAddModal = useCallback(() => {
    if (isAtNodeLimit(chartId)) {
      setShowUpgradeModal(true)
      return
    }
    const cx = (-transform.x + vpSize.w / 2) / transform.scale - NODE_W / 2
    const cy = (-transform.y + vpSize.h / 2) / transform.scale - NODE_H / 2
    addNodePosRef.current = { x: cx, y: cy }
    setIsAddModalOpen(true)
  }, [transform, vpSize, chartId, isAtNodeLimit])

  const handleAddSubmit = useCallback((data: Omit<import('../../types').OrgNode, 'id'>, reportsToId: string) => {
    const pos = addNodePosRef.current
    const newId = addNode({ ...data, x: pos.x, y: pos.y })
    if (reportsToId && newId) addEdge(reportsToId, newId)
    if (chartId && newId) {
      api.post(`/api/charts/${chartId}/nodes`, { ...data, id: newId, x: pos.x, y: pos.y })
        .catch(err => console.error('[canvas] addNode failed:', err))
      if (reportsToId) {
        api.post(`/api/charts/${chartId}/edges`, { sourceId: reportsToId, targetId: newId })
          .catch(err => console.error('[canvas] addEdge (reports-to) failed:', err))
      }
    }
    setIsAddModalOpen(false)
  }, [addNode, addEdge, chartId])

  const handleUpdateSubmit = useCallback((nodeId: string, updates: Partial<import('../../types').OrgNode>, reportsToId: string) => {
    updateNode(nodeId, updates)
    const oldEdge = edges.find(e => e.targetId === nodeId)
    const oldManagerId = oldEdge?.sourceId ?? ''
    if (oldManagerId !== reportsToId) {
      if (oldEdge) removeEdge(oldEdge.id)
      if (reportsToId) addEdge(reportsToId, nodeId)
    }
    if (chartId) {
      api.put(`/api/charts/${chartId}/nodes/${nodeId}`, updates)
        .catch(err => console.error('[canvas] updateNode failed:', err))
      if (oldManagerId !== reportsToId) {
        if (oldEdge) {
          api.delete(`/api/charts/${chartId}/edges/${oldEdge.id}`)
            .catch(err => console.error('[canvas] removeEdge (update) failed:', err))
        }
        if (reportsToId) {
          api.post(`/api/charts/${chartId}/edges`, { sourceId: reportsToId, targetId: nodeId })
            .catch(err => console.error('[canvas] addEdge (update) failed:', err))
        }
      }
    }
    setEditingNodeId(null)
  }, [updateNode, deleteNode, edges, removeEdge, addEdge, chartId]) // eslint-disable-line

  const handleDeleteNode = useCallback((nodeId: string) => {
    deleteNode(nodeId)
    setEditingNodeId(null)
    if (chartId) {
      api.delete(`/api/charts/${chartId}/nodes/${nodeId}`)
        .catch(err => console.error('[canvas] deleteNode failed:', err))
    }
  }, [deleteNode, chartId])

  const handleAutoLayout = useCallback(() => {
    if (upgradeRequired('auto-layout')) {
      setShowUpgradeModal(true)
      return
    }
    const positions = calculateLayout(nodesRef.current, edges)
    applyLayout(positions)
    setTimeout(fitToView, 50)
    addToast('Layout applied', 'success')
    if (chartId) {
      const posArr = nodesRef.current.map(n => {
        const p = positions.get(n.id)
        return { id: n.id, x: p?.x ?? n.x, y: p?.y ?? n.y }
      })
      api.put(`/api/charts/${chartId}/nodes`, posArr)
        .catch(err => console.error('[canvas] layout sync failed:', err))
    }
  }, [upgradeRequired, edges, applyLayout, fitToView, addToast])

  const [isExporting,    setIsExporting]    = useState(false)
  const [exportOverflow, setExportOverflow] = useState(false)

  const handleExport = useCallback(async (format: 'png' | 'pdf') => {
    if (!containerRef.current || isExporting) return
    const ns = nodesRef.current
    if (ns.length === 0) return
    setIsExporting(true)

    const PAD = 60
    const xs = ns.map(n => n.x), ys = ns.map(n => n.y)
    const minX = Math.min(...xs),     minY = Math.min(...ys)
    const maxX = Math.max(...xs) + NODE_W, maxY = Math.max(...ys) + NODE_H
    const chartW = maxX - minX + PAD * 2
    const chartH = maxY - minY + PAD * 2

    const savedTransform = { ...transform }

    // Use React state for overflow so the container's pixel dimensions never
    // change — direct DOM mutation would fire ResizeObserver → vpSize update
    // → fitToView effect → transform override after restore.
    setExportOverflow(true)
    setTransform({ x: PAD - minX, y: PAD - minY, scale: 1 })

    // Wait for React to commit both state updates and the browser to paint.
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))

    try {
      const slug = chartName.replace(/[^a-z0-9]/gi, '-').toLowerCase() || 'chart'
      if (format === 'png') await exportAsPNG(containerRef.current, slug, { width: chartW, height: chartH })
      else await exportAsPDF(containerRef.current, slug, { width: chartW, height: chartH })
    } finally {
      setExportOverflow(false)
      setTransform(savedTransform)
      setIsExporting(false)
    }
  }, [containerRef, nodesRef, isExporting, transform, setTransform, chartName])

  const nodeMap      = Object.fromEntries(nodes.map(n => [n.id, n]))
  const selectedNode = selectedId ? nodeMap[selectedId] ?? null : null
  const editingNode  = editingNodeId ? nodeMap[editingNodeId] ?? null : null

  // Dept colour lookup for edges
  const deptColourMap = Object.fromEntries(departments.map(d => [d.id, d.colour]))

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative', width: '100%', height: '100%', overflow: exportOverflow ? 'visible' : 'hidden',
        background: 'var(--bg)',
        cursor: activeTool === 'pan' ? 'grab' : activeTool === 'zoom' ? 'zoom-in' : connectingFrom ? 'crosshair' : 'default',
      }}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div data-export-ignore>
        <UpgradeModal
          isOpen={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          onUpgrade={() => navigate('/pricing')}
          feature="More nodes"
          requiredTier="starter"
          currentTier={currentTier}
        />
      </div>

      {/* Grid background */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <defs>
          <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse"
            patternTransform={`translate(${transform.x % 28},${transform.y % 28})`}>
            <circle cx="0" cy="0" r="0.8" fill="rgba(148,163,184,0.12)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Edge SVG layer */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
        <g style={{ pointerEvents: 'all' }}>
          {edges.map(edge => {
            const src = nodeMap[edge.sourceId]
            const tgt = nodeMap[edge.targetId]
            if (!src || !tgt) return null
            const deptColour = deptColourMap[src.departmentId] ?? '#94A3B8'
            return (
              <EdgePath
                key={edge.id}
                source={src} target={tgt}
                transform={transform}
                selected={edge.id === selectedEdgeId}
                hovered={edge.id === hovEdgeId}
                deptColour={deptColour}
                onClick={() => { setSelectedEdgeId(edge.id); setSelectedId(null) }}
                onMouseEnter={() => setHovEdgeId(edge.id)}
                onMouseLeave={() => setHovEdgeId(null)}
                onDelete={() => removeEdge(edge.id)}
              />
            )
          })}
          {connectingFrom && nodeMap[connectingFrom] && (
            <ConnectingLine fromNode={nodeMap[connectingFrom]} mousePos={mouseCanvas} transform={transform} />
          )}
        </g>
      </svg>

      {/* Node viewport */}
      <div
        ref={viewportRef}
        style={{
          position: 'absolute', transformOrigin: '0 0',
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          willChange: 'transform',
        }}
      >
        {nodes.map(node => (
          <NodeCard
            key={node.id}
            node={node}
            selected={node.id === selectedId}
            connecting={node.id === connectingFrom}
            isConnectTarget={!!connectingFrom && node.id !== connectingFrom}
            onPointerDown={e => handleNodePointerDown(e, node.id)}
            onClick={e => handleNodeClick(e, node.id)}
            onDoubleClick={e => handleNodeDoubleClick(e, node.id)}
          />
        ))}
      </div>

      <Toolbar
        activeTool={activeTool} setActiveTool={setActiveTool}
        onAddNode={handleOpenAddModal}
        onAutoLayout={handleAutoLayout}
        onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo}
        readOnly={readOnly}
        nodeCount={nodes.length}
        maxNodesPerChart={plan.maxNodesPerChart}
        currentTier={currentTier}
        onExport={handleExport}
      />

      {/* 80% node limit warning banner */}
      {!readOnly && currentTier === 'free' && nodes.length >= Math.floor(plan.maxNodesPerChart * 0.8) && nodes.length < plan.maxNodesPerChart && (
        <div data-export-ignore style={{
          position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--warn-bg)', border: '1px solid var(--warn)',
          borderRadius: 8, padding: '7px 16px', zIndex: 19,
          display: 'flex', alignItems: 'center', gap: 10, fontSize: 12,
          color: 'var(--text)', boxShadow: 'var(--shadow-sm)',
        }}>
          <span>You're using <strong>{nodes.length}</strong> of <strong>{plan.maxNodesPerChart}</strong> nodes.</span>
          <button onClick={() => navigate('/pricing')} style={{
            background: 'var(--warn)', border: 'none', borderRadius: 6,
            color: '#fff', fontSize: 11, fontWeight: 600, padding: '3px 10px', cursor: 'pointer',
          }}>Upgrade</button>
        </div>
      )}
      <ZoomControls scale={transform.scale} onZoom={d => applyZoom(d)} onFit={fitToView} />
      <Minimap nodes={nodes} transform={transform} vpW={vpSize.w} vpH={vpSize.h}
        onPanTo={(x, y) => setTransform(t => ({ ...t, x, y }))}
      />

      {/* Connect mode banner */}
      {connectingFrom && (
        <div data-export-ignore style={{
          position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--purple)', borderRadius: 20, padding: '6px 16px',
          fontSize: 12, fontWeight: 600, color: '#fff', zIndex: 20,
          boxShadow: '0 4px 14px rgba(139,92,246,.4)',
        }}>
          Click a target node to connect · Esc to cancel
        </div>
      )}

      {/* Selected edge hint */}
      {selectedEdgeId && !connectingFrom && (
        <div data-export-ignore style={{
          position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 20, padding: '6px 16px', fontSize: 12, color: 'var(--muted)', zIndex: 20,
          boxShadow: 'var(--shadow-sm)',
        }}>
          Reporting line selected · <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Delete</span> to remove
        </div>
      )}

      {/* JD panel */}
      <div data-export-ignore>
        <JDPanel
          node={selectedNode}
          allNodes={nodes}
          onClose={() => setSelectedId(null)}
          onEditNode={node => setEditingNodeId(node.id)}
        />
      </div>

      {/* Add node modal */}
      <div data-export-ignore>
        <NodeModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          mode="add"
          departments={departments}
          allNodes={nodes}
          allEdges={edges}
          onAdd={handleAddSubmit}
          onUpdate={() => {}}
          onDelete={() => {}}
        />
      </div>

      {/* Edit node modal */}
      {editingNode && (
        <div data-export-ignore>
          <NodeModal
            isOpen={!!editingNodeId}
            onClose={() => setEditingNodeId(null)}
            mode="edit"
            node={editingNode}
            departments={departments}
            allNodes={nodes}
            allEdges={edges}
            onAdd={() => {}}
            onUpdate={handleUpdateSubmit}
            onDelete={handleDeleteNode}
          />
        </div>
      )}
    </div>
  )
}
