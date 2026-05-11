import { useRef, useEffect, useCallback, useState } from 'react'
import { MousePointer2, ZoomIn, Layers, Plus, Minus, Maximize2, GitBranch, Undo2, Redo2 } from 'lucide-react'
import type { OrgNode } from '../../types'
import { NODE_W, NODE_H } from '../../data/mockNodes'
import { useCanvasState } from './useCanvasState'
import { NodeCard } from '../nodes/NodeCard'
import { JDPanel } from '../panel/JDPanel'

// ─── Edge SVG ────────────────────────────────────────────────────────────────

type Transform = { x: number; y: number; scale: number }

// All coordinates are in canvas space; we project to screen space here so the
// SVG can live outside the CSS-transformed viewport div (avoids overflow/clip issues).
function toScreen(cx: number, cy: number, t: Transform) {
  return { x: cx * t.scale + t.x, y: cy * t.scale + t.y }
}

function EdgePath({
  source, target, transform, selected, hovered,
  onClick, onMouseEnter, onMouseLeave,
}: {
  source: OrgNode; target: OrgNode
  transform: Transform
  selected: boolean; hovered: boolean
  onClick: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  const s = toScreen(source.x + NODE_W / 2, source.y + NODE_H, transform)
  const e = toScreen(target.x + NODE_W / 2, target.y,          transform)
  // keep the bezier arc proportional to zoom so curves don't flatten at low zoom
  const dy = Math.max((e.y - s.y) * 0.45, 30)
  const d  = `M ${s.x} ${s.y} C ${s.x} ${s.y+dy} ${e.x} ${e.y-dy} ${e.x} ${e.y}`

  const stroke = selected ? 'var(--brand)' : hovered ? 'var(--muted)' : 'rgba(148,163,184,0.55)'
  const width  = selected || hovered ? 2 : 1.5

  return (
    <g>
      <path d={d} fill="none" stroke="transparent" strokeWidth={14}
        style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
        onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
      />
      <path d={d} fill="none" stroke={stroke} strokeWidth={width}
        strokeLinecap="round"
        style={{ pointerEvents: 'none', transition: 'stroke .15s, stroke-width .15s' }}
      />
      <circle cx={e.x} cy={e.y} r={3.5}
        fill={stroke}
        style={{ pointerEvents: 'none', transition: 'fill .15s' }}
      />
    </g>
  )
}

// ─── Minimap ─────────────────────────────────────────────────────────────────

const MM_W = 160
const MM_H = 90

function Minimap({ nodes, transform, vpW, vpH, onPanTo }: {
  nodes: OrgNode[]
  transform: { x: number; y: number; scale: number }
  vpW: number; vpH: number
  onPanTo: (x: number, y: number) => void
}) {
  if (nodes.length === 0) return null

  const xs = nodes.map(n => n.x)
  const ys = nodes.map(n => n.y)
  const minX = Math.min(...xs) - 40
  const minY = Math.min(...ys) - 40
  const maxX = Math.max(...xs) + NODE_W + 40
  const maxY = Math.max(...ys) + NODE_H + 40
  const cW = maxX - minX
  const cH = maxY - minY

  const mmScale = Math.min(MM_W / cW, MM_H / cH)

  // Viewport rect in canvas space
  const vpCX = -transform.x / transform.scale
  const vpCY = -transform.y / transform.scale
  const vpCW = vpW / transform.scale
  const vpCH = vpH / transform.scale

  // In minimap space
  const vpMMX = (vpCX - minX) * mmScale
  const vpMMY = (vpCY - minY) * mmScale
  const vpMMW = vpCW * mmScale
  const vpMMH = vpCH * mmScale

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const mx = (e.clientX - rect.left) / mmScale + minX
    const my = (e.clientY - rect.top)  / mmScale + minY
    onPanTo(
      -(mx * transform.scale - vpW / 2),
      -(my * transform.scale - vpH / 2),
    )
  }

  return (
    <div style={{
      position: 'absolute', bottom: 56, left: 16, zIndex: 20,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, overflow: 'hidden', boxShadow: 'var(--shadow-sm)',
    }}>
      <svg width={MM_W} height={MM_H} style={{ display: 'block', cursor: 'crosshair' }} onClick={handleClick}>
        {/* Node rects */}
        {nodes.map(n => {
          const dept = n.departmentId
          const deptColors: Record<string,string> = { eng:'#0EA5E9', product:'#10B981', design:'#8B5CF6', go:'#F59E0B', ops:'#EF4444', finance:'#06B6D4' }
          const c = deptColors[dept] ?? '#94A3B8'
          return (
            <rect key={n.id}
              x={(n.x - minX) * mmScale} y={(n.y - minY) * mmScale}
              width={NODE_W * mmScale} height={NODE_H * mmScale}
              rx={2} fill={c} fillOpacity={0.55}
            />
          )
        })}
        {/* Viewport rect */}
        <rect
          x={vpMMX} y={vpMMY} width={vpMMW} height={vpMMH}
          fill="rgba(14,165,233,0.08)"
          stroke="var(--brand)" strokeWidth={1.5}
          rx={2}
          style={{ pointerEvents:'none' }}
        />
      </svg>
    </div>
  )
}

// ─── Connect mode indicator line ──────────────────────────────────────────────

// mousePos is in canvas space; transform projects it to screen space
function ConnectingLine({ fromNode, mousePos, transform }: {
  fromNode: OrgNode
  mousePos: { x: number; y: number }
  transform: Transform
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

// ─── Toolbar ─────────────────────────────────────────────────────────────────

type ActiveTool = 'select' | 'pan' | 'zoom' | 'connect'

function Toolbar({ activeTool, setActiveTool, onAddNode, onUndo, onRedo, canUndo, canRedo }: {
  activeTool: ActiveTool
  setActiveTool: (t: ActiveTool) => void
  onAddNode: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}) {
  const tools: { id: ActiveTool; Icon: React.FC<{ size?: number }>; label: string }[] = [
    { id: 'select',  Icon: MousePointer2, label: 'Select (V)'  },
    { id: 'pan',     Icon: Maximize2,     label: 'Pan (H)'     },
    { id: 'zoom',    Icon: ZoomIn,        label: 'Zoom (Z)'    },
    { id: 'connect', Icon: GitBranch,     label: 'Connect (C)' },
    { id: 'zoom',    Icon: Layers,        label: 'Filter (F)'  }, // visual only
  ]

  return (
    <div style={{
      position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', alignItems: 'center', gap: 2, zIndex: 20,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '4px 6px', boxShadow: 'var(--shadow-sm)',
    }}>
      {/* Undo/Redo */}
      <ToolBtn Icon={Undo2} label="Undo (⌘Z)" active={false} disabled={!canUndo} onClick={onUndo} />
      <ToolBtn Icon={Redo2} label="Redo (⌘⇧Z)" active={false} disabled={!canRedo} onClick={onRedo} />

      <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 3px' }} />

      {(['select','pan','zoom','connect'] as ActiveTool[]).map(id => {
        const map: Record<ActiveTool, { Icon: React.FC<{ size?: number }>; label: string }> = {
          select:  { Icon: MousePointer2, label: 'Select (V)' },
          pan:     { Icon: Maximize2,     label: 'Pan (H)'    },
          zoom:    { Icon: ZoomIn,        label: 'Zoom (Z)'   },
          connect: { Icon: GitBranch,     label: 'Connect (C)' },
        }
        const { Icon, label } = map[id]
        return <ToolBtn key={id} Icon={Icon} label={label} active={activeTool === id} onClick={() => setActiveTool(id)} />
      })}

      <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 3px' }} />

      {/* Filter */}
      <ToolBtn Icon={Layers} label="Filter (F)" active={false} onClick={() => {}} />

      <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 3px' }} />

      <button onClick={onAddNode} style={{
        display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px',
        borderRadius: 6, background: 'var(--brand-bg)', border: '1px solid var(--brand)',
        color: 'var(--brand)', fontSize: 12, cursor: 'pointer',
      }}>
        <Plus size={12} /> Add node
      </button>
    </div>
  )
}

function ToolBtn({ Icon, label, active, disabled, onClick }: {
  Icon: React.FC<{ size?: number }>; label: string; active: boolean; disabled?: boolean; onClick: () => void
}) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      title={label}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
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

function ZoomControls({ scale, onZoom, onFit }: {
  scale: number; onZoom: (delta: number) => void; onFit: () => void
}) {
  return (
    <div style={{
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

// ─── Main canvas ─────────────────────────────────────────────────────────────

export function OrgChart({ initialNodes = [], initialEdges = [] }: {
  initialNodes?: OrgNode[]
  initialEdges?: OrgEdge[]
}) {
  const {
    nodes, edges, transform, setTransform,
    selectedId, setSelectedId,
    selectedEdgeId, setSelectedEdgeId,
    connectingFrom, setConnectingFrom,
    activeTool, setActiveTool,
    moveNode, commitDrag, addEdge, removeEdge, addNode,
    undo, redo, canUndo, canRedo,
  } = useCanvasState(initialNodes, initialEdges)

  const containerRef = useRef<HTMLDivElement>(null)
  const viewportRef  = useRef<HTMLDivElement>(null)

  // Interaction refs — avoid stale closures in mousemove handlers
  const interactionRef = useRef({
    mode:    'idle' as 'idle' | 'dragging' | 'panning',
    nodeId:  null as string | null,
    lastX:   0,
    lastY:   0,
    hasMoved: false,
    startX:  0,
    startY:  0,
  })
  const scaleRef      = useRef(transform.scale)
  scaleRef.current    = transform.scale
  const nodesRef      = useRef(nodes)
  nodesRef.current    = nodes

  // Mouse pos in canvas space (for connect line)
  const [mouseCanvas, setMouseCanvas] = useState({ x: 0, y: 0 })
  const [hovEdgeId,   setHovEdgeId]   = useState<string | null>(null)

  // Viewport dimensions
  const [vpSize, setVpSize] = useState({ w: 1100, h: 600 })
  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(entries => {
      for (const e of entries) {
        setVpSize({ w: e.contentRect.width, h: e.contentRect.height })
      }
    })
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  // ── Fit to view ───────────────────────────────────────────────────────────

  const fitToView = useCallback(() => {
    const ns = nodesRef.current
    if (ns.length === 0) return
    const { w, h } = vpSize
    const xs = ns.map(n => n.x)
    const ys = ns.map(n => n.y)
    const minX = Math.min(...xs) - 60
    const minY = Math.min(...ys) - 60
    const maxX = Math.max(...xs) + NODE_W + 60
    const maxY = Math.max(...ys) + NODE_H + 60
    const cW = maxX - minX
    const cH = maxY - minY
    const scale = Math.min((w - 40) / cW, (h - 40) / cH, 1)
    const tx = (w - cW * scale) / 2 - minX * scale
    const ty = (h - cH * scale) / 2 - minY * scale
    setTransform({ x: tx, y: ty, scale })
  }, [vpSize, setTransform])

  // Auto-fit on first render
  useEffect(() => { fitToView() }, [vpSize.w]) // eslint-disable-line

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo() }
      if (mod &&  e.shiftKey && e.key === 'z') { e.preventDefault(); redo() }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedEdgeId) removeEdge(selectedEdgeId)
      }
      if (e.key === 'Escape') { setConnectingFrom(null); setSelectedId(null) }
      if (e.key === 'v' && !mod) setActiveTool('select')
      if (e.key === 'h' && !mod) setActiveTool('pan')
      if (e.key === 'c' && !mod) setActiveTool('connect')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo, removeEdge, selectedEdgeId, setConnectingFrom, setSelectedId, setActiveTool])

  // ── Zoom ──────────────────────────────────────────────────────────────────

  const applyZoom = useCallback((delta: number, cx?: number, cy?: number) => {
    setTransform(t => {
      const factor    = delta > 0 ? 1.1 : 0.9
      const newScale  = Math.max(0.1, Math.min(3, t.scale * factor))
      const mouseX    = cx ?? vpSize.w / 2
      const mouseY    = cy ?? vpSize.h / 2
      const newTx     = mouseX - (mouseX - t.x) * (newScale / t.scale)
      const newTy     = mouseY - (mouseY - t.y) * (newScale / t.scale)
      return { x: newTx, y: newTy, scale: newScale }
    })
  }, [vpSize, setTransform])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const rect = containerRef.current!.getBoundingClientRect()
    applyZoom(-e.deltaY, e.clientX - rect.left, e.clientY - rect.top)
  }, [applyZoom])

  // ── Pointer events (drag + pan) ───────────────────────────────────────────

  const screenToCanvas = useCallback((sx: number, sy: number) => {
    return {
      x: (sx - transform.x) / transform.scale,
      y: (sy - transform.y) / transform.scale,
    }
  }, [transform])

  const handleNodePointerDown = useCallback((e: React.PointerEvent, nodeId: string) => {
    if (e.button !== 0) return
    e.stopPropagation() // always stop — prevents canvas handler from clearing connectingFrom
    if (activeTool !== 'select') return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    interactionRef.current = {
      mode: 'dragging', nodeId,
      lastX: e.clientX, lastY: e.clientY,
      startX: e.clientX, startY: e.clientY,
      hasMoved: false,
    }
  }, [activeTool])

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    if (connectingFrom) { setConnectingFrom(null); return }
    if (activeTool === 'pan') {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      interactionRef.current = {
        mode: 'panning',
        nodeId: null,
        lastX: e.clientX, lastY: e.clientY,
        startX: e.clientX, startY: e.clientY,
        hasMoved: false,
      }
    } else if (activeTool === 'select') {
      setSelectedId(null)
      setSelectedEdgeId(null)
    }
  }, [activeTool, connectingFrom, setConnectingFrom, setSelectedId, setSelectedEdgeId])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const ia = interactionRef.current
    const rect = containerRef.current!.getBoundingClientRect()
    const canvasX = (e.clientX - rect.left - transform.x) / transform.scale
    const canvasY = (e.clientY - rect.top  - transform.y) / transform.scale
    setMouseCanvas({ x: canvasX, y: canvasY })

    if (ia.mode === 'dragging' && ia.nodeId) {
      const dx = (e.clientX - ia.lastX) / scaleRef.current
      const dy = (e.clientY - ia.lastY) / scaleRef.current
      if (!ia.hasMoved && (Math.abs(e.clientX - ia.startX) > 3 || Math.abs(e.clientY - ia.startY) > 3)) {
        ia.hasMoved = true
      }
      if (ia.hasMoved) {
        moveNode(ia.nodeId, dx, dy)
      }
      ia.lastX = e.clientX
      ia.lastY = e.clientY
    } else if (ia.mode === 'panning') {
      const dx = e.clientX - ia.lastX
      const dy = e.clientY - ia.lastY
      ia.lastX = e.clientX
      ia.lastY = e.clientY
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        ia.hasMoved = true
        setTransform(t => ({ ...t, x: t.x + dx, y: t.y + dy }))
      }
    }
  }, [moveNode, setTransform, transform])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const ia = interactionRef.current
    if (ia.mode === 'dragging' && ia.hasMoved) {
      commitDrag(nodesRef.current)
    }
    interactionRef.current = { mode: 'idle', nodeId: null, lastX: 0, lastY: 0, hasMoved: false, startX: 0, startY: 0 }
  }, [commitDrag])

  const handleNodeClick = useCallback((e: React.MouseEvent, nodeId: string) => {
    if (interactionRef.current.hasMoved) return // was a drag
    e.stopPropagation()

    if (activeTool === 'connect' || connectingFrom) {
      if (!connectingFrom) {
        setConnectingFrom(nodeId)
      } else if (connectingFrom !== nodeId) {
        addEdge(connectingFrom, nodeId)
        setConnectingFrom(null)
        setActiveTool('select')
      }
      return
    }
    setSelectedId(prev => prev === nodeId ? null : nodeId)
    setSelectedEdgeId(null)
  }, [activeTool, connectingFrom, setConnectingFrom, addEdge, setSelectedId, setSelectedEdgeId, setActiveTool])

  const handleAddNode = useCallback(() => {
    const cx = (-transform.x + vpSize.w / 2) / transform.scale - NODE_W / 2
    const cy = (-transform.y + vpSize.h / 2) / transform.scale - NODE_H / 2
    addNode(cx, cy)
  }, [transform, vpSize, addNode])

  // ── Node map for edge lookup ──────────────────────────────────────────────

  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]))
  const selectedNode = selectedId ? nodeMap[selectedId] ?? null : null

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative', width: '100%', height: '100%',
        overflow: 'hidden',
        background: 'var(--bg)',
        cursor: activeTool === 'pan' ? 'grab'
              : activeTool === 'zoom' ? 'zoom-in'
              : connectingFrom ? 'crosshair'
              : 'default',
      }}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
    >
      {/* Subtle grid background */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <defs>
          <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse"
            patternTransform={`translate(${transform.x % 28},${transform.y % 28})`}
          >
            <circle cx="0" cy="0" r="0.8" fill="rgba(148,163,184,0.12)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Edge SVG — screen-space, outside the transformed viewport so there are no
          overflow/clip issues with the CSS transform. Rendered before the viewport
          div so edges appear behind nodes. */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
        <g style={{ pointerEvents: 'all' }}>
          {edges.map(edge => {
            const src = nodeMap[edge.sourceId]
            const tgt = nodeMap[edge.targetId]
            if (!src || !tgt) return null
            return (
              <EdgePath
                key={edge.id}
                source={src} target={tgt}
                transform={transform}
                selected={edge.id === selectedEdgeId}
                hovered={edge.id === hovEdgeId}
                onClick={() => { setSelectedEdgeId(edge.id); setSelectedId(null) }}
                onMouseEnter={() => setHovEdgeId(edge.id)}
                onMouseLeave={() => setHovEdgeId(null)}
              />
            )
          })}
          {connectingFrom && nodeMap[connectingFrom] && (
            <ConnectingLine
              fromNode={nodeMap[connectingFrom]}
              mousePos={mouseCanvas}
              transform={transform}
            />
          )}
        </g>
      </svg>

      {/* Viewport — transformed for pan/zoom (nodes only) */}
      <div
        ref={viewportRef}
        style={{
          position: 'absolute',
          transformOrigin: '0 0',
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
          />
        ))}
      </div>

      {/* Toolbar */}
      <Toolbar
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        onAddNode={handleAddNode}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
      />

      {/* Zoom controls */}
      <ZoomControls
        scale={transform.scale}
        onZoom={d => applyZoom(d)}
        onFit={fitToView}
      />

      {/* Minimap */}
      <Minimap
        nodes={nodes}
        transform={transform}
        vpW={vpSize.w}
        vpH={vpSize.h}
        onPanTo={(x, y) => setTransform(t => ({ ...t, x, y }))}
      />

      {/* Connect mode banner */}
      {connectingFrom && (
        <div style={{
          position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--purple)', borderRadius: 20, padding: '6px 16px',
          fontSize: 12, fontWeight: 600, color: '#fff', zIndex: 20,
          boxShadow: '0 4px 14px rgba(139,92,246,.4)',
        }}>
          Click a target node to connect · Esc to cancel
        </div>
      )}

      {/* Delete edge hint */}
      {selectedEdgeId && (
        <div style={{
          position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 20, padding: '6px 16px',
          fontSize: 12, color: 'var(--muted)', zIndex: 20,
          boxShadow: 'var(--shadow-sm)',
        }}>
          Reporting line selected · <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Delete</span> to remove
        </div>
      )}

      {/* JD panel */}
      <JDPanel node={selectedNode} onClose={() => setSelectedId(null)} />
    </div>
  )
}
