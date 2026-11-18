import { useRef, useEffect, useCallback, useState, useMemo, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { exportAsPNG, exportAsPDF } from '../../utils/export'
import { showsBranding } from '../../lib/plans'
import type { OrgNode, OrgEdge, Department } from '../../types'
import { NODE_W, NODE_H } from '../nodes/nodeSize'
import { useCanvasState } from './useCanvasState'
import { saveHistoryStep, saveNewRole, saveRoleEdit, saveRoleDelete, saveNewLine, saveLineDelete, savePositions } from './canvasSync'
import { NodeCard } from '../nodes/NodeCard'
import { NodeChip } from '../nodes/NodeChip'
import { EMPTY_FILTERS, type ActiveFilters } from './canvasTypes'
import { EdgeLine, EdgePath, ConnectingLine } from './EdgeLayers'
import { Minimap } from './Minimap'
import { Toolbar } from './Toolbar'
import { ZoomControls } from './ZoomControls'
import { readingOrder, roleAriaLabel } from './keyboardNav'
import { useRoleKeyboard } from './useRoleKeyboard'
import { viewRect, visibleNodeIds, edgeInView, shouldVirtualize, shouldUseChips, movedPositions } from './viewport'
import { JDPanel } from '../panel/JDPanel'
import { commentDeepLink } from '../comments/deepLink'
import { UpgradeModal } from '../../components/ui/UpgradeModal'
import { usePlanLimits } from '../../hooks/usePlanLimits'
import { useBillingStore } from '../../store/billingStore'
import { useToastStore } from '../../store/toastStore'
import { useJobDescriptionStore } from '../../store/jobDescriptionStore'
import { useWorkspaceDepartmentStore } from '../../store/workspaceDepartmentStore'
import { mergeDepartments } from '../../lib/departments'
import { calculateLayout } from '../../utils/layout'
import { EmptyCanvasCard } from '../onboarding/EmptyCanvasCard'
import { pinchTransform, midpoint, distance, type Point, type ViewTransform } from './pinch'
import { buildChartCsv } from '../../lib/exportOrg'
import { downloadText, fileSlug } from '../../lib/csvSafe'

// Opened on demand, so they are separate downloads (R-24): a share page or embed never fetches them.
const NodeModal = lazy(() => import('../nodes/NodeModal').then(m => ({ default: m.NodeModal })))
const HistoryPanel = lazy(() => import('../history/HistoryPanel').then(m => ({ default: m.HistoryPanel })))
const ImportDialog = lazy(() => import('../import/ImportDialog').then(m => ({ default: m.ImportDialog })))


// ─── Main canvas ──────────────────────────────────────────────────────────────

export function OrgChart({ chartId = '', chartName = 'chart', initialNodes = [], initialEdges = [], departments = [], readOnly = false, isPublic = false, brandExports: brandExportsProp, onImported, commentCounts, onCommentsChanged, onVersionRestored }: {
  /** Version history (roadmap 5): shown only where the viewer is signed in. Called after a version was restored, so the page reloads the chart. */
  onVersionRestored?: () => void
  /** Open comment threads per role (roadmap 5). Only passed where the viewer is signed in; a public share page has no comments. */
  commentCounts?: Record<string, number>
  /** Called after a comment changed, so the page can refetch `commentCounts`. */
  onCommentsChanged?: () => void
  chartId?: string
  chartName?: string
  initialNodes?: OrgNode[]
  initialEdges?: OrgEdge[]
  departments?: Department[]
  readOnly?: boolean
  isPublic?: boolean
  /** Put the "Made with StratMap" mark on PNG exports. Defaults to the viewer's plan (Free = yes); a share page passes the chart owner's. */
  brandExports?: boolean
  /** Called after people were imported into this chart, so the page can reload it. */
  onImported?: () => void
}) {
  // A link from a comment email opens the chart with that role and its comments showing (read once, on mount).
  const [deepLink] = useState(() => commentDeepLink(typeof window === 'undefined' ? '' : window.location.search, initialNodes.map(n => n.id)))

  const {
    nodes, edges, getEdges, transform, setTransform,
    selectedId, setSelectedId,
    selectedEdgeId, setSelectedEdgeId,
    connectingFrom, setConnectingFrom,
    activeTool, setActiveTool,
    moveNode, commitDrag,
    addNode, updateNode, deleteNode,
    addEdge, removeEdge,
    applyLayout,
    undo, redo, canUndo, canRedo,
  } = useCanvasState(initialNodes, initialEdges, deepLink.roleId)

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
  // What the server last saw for each role's position, so a drag sends only what moved (roadmap 3.4).
  const syncedPositions = useRef(new Map<string, Point>(initialNodes.map(n => [n.id, { x: n.x, y: n.y }])))

  const [mouseCanvas, setMouseCanvas] = useState({ x: 0, y: 0 })
  const [hovEdgeId,   setHovEdgeId]   = useState<string | null>(null)
  const [vpSize,      setVpSize]      = useState({ w: 1100, h: 600 })

  // Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [editingNodeId,  setEditingNodeId]  = useState<string | null>(null)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const addNodePosRef = useRef({ x: 400, y: 200 })

  // Filter state
  const [filterOpen, setFilterOpen] = useState(false)
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>(EMPTY_FILTERS)

  const matchedNodeIds = useMemo<Set<string> | null>(() => {
    const { depts, roleTypes, statuses } = activeFilters
    if (depts.size === 0 && roleTypes.size === 0 && statuses.size === 0) return null
    return new Set(
      nodes
        .filter(n => {
          if (depts.size > 0 && !depts.has(n.departmentId)) return false
          if (roleTypes.size > 0 && !roleTypes.has(n.roleType ?? 'existing')) return false
          if (statuses.size > 0 && !statuses.has(n.status)) return false
          return true
        })
        .map(n => n.id)
    )
  }, [nodes, activeFilters])

  // Plan limits
  const { isAtNodeLimit, currentTier, upgradeRequired } = usePlanLimits()
  const plan = useBillingStore((state) => state.plan)
  const brandExports = brandExportsProp ?? showsBranding(currentTier)
  const navigate = useNavigate()

  // Workspace departments for NodeCard colour lookup
  const { departments: wsDepts, fetch: fetchWsDepts } = useWorkspaceDepartmentStore()
  // A role's department is a chart department (templates) or a workspace one (blank charts): look in the chart's own first (R-47).
  // On a public share page there are no workspace departments at all, so the chart's own are the only colours.
  const deptLookup = useMemo(() => mergeDepartments(departments, wsDepts), [departments, wsDepts])
  useEffect(() => { fetchWsDepts() }, []) // eslint-disable-line

  // Push chartId into JD store so JD actions know which chart to hit
  const setJDChartId = useJobDescriptionStore(s => s.setChartId)
  useEffect(() => {
    if (chartId) setJDChartId(chartId)
  }, [chartId, setJDChartId])

  // Single vs double click disambiguation
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // False until the ResizeObserver has reported the real size; before that vpSize is only a default guess.
  const vpMeasured = useRef(false)
  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(entries => {
      for (const e of entries) {
        vpMeasured.current = true
        setVpSize({ w: e.contentRect.width, h: e.contentRect.height })
      }
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

  // Fit once when the real viewport size first arrives from ResizeObserver (not the 1100x600 default, which on a
  // phone would centre the chart for a screen three times too wide). After that, preserve the user's zoom: spurious
  // ResizeObserver firings (e.g. from DOM changes after adding nodes) must not reset the view.
  const initialFitDone = useRef(false)
  useEffect(() => {
    if (!initialFitDone.current && vpMeasured.current) {
      initialFitDone.current = true
      fitToView()
    }
  }, [vpSize]) // eslint-disable-line

  // Undo and redo change the canvas; the same change is then saved, so a reload shows what is on screen (R-02).
  const handleUndo = useCallback(() => {
    const step = undo()
    if (step && chartId) saveHistoryStep(chartId, step, { syncedPositions: syncedPositions.current, afterRestore: onCommentsChanged })
  }, [undo, chartId, onCommentsChanged])
  const handleRedo = useCallback(() => {
    const step = redo()
    if (step && chartId) saveHistoryStep(chartId, step, { syncedPositions: syncedPositions.current, afterRestore: onCommentsChanged })
  }, [redo, chartId, onCommentsChanged])

  /** The one way a reporting line is deleted (Delete key, the × on the line, the role's edit form). It is saved, and refused on a read-only canvas (R-45, R-49). */
  const handleDeleteLine = useCallback((edgeId: string) => {
    if (readOnly) return
    removeEdge(edgeId)
    saveLineDelete(chartId, edgeId)
  }, [readOnly, removeEdge, chartId])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.target instanceof HTMLElement && e.target.isContentEditable) return
      const mod = e.ctrlKey || e.metaKey
      if (!readOnly) {
        if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); handleUndo() }
        if (mod &&  e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); handleRedo() }
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEdgeId) handleDeleteLine(selectedEdgeId)
        if (e.key === 'c' && !mod) setActiveTool('connect')
      }
      if (e.key === 'Escape') { setConnectingFrom(null); setSelectedId(null); setFilterOpen(false) }
      if (e.key === 'v' && !mod) setActiveTool('select')
      if (e.key === 'h' && !mod) setActiveTool('pan')
      if (e.key === 'f' && !mod) setFilterOpen(o => !o)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleUndo, handleRedo, handleDeleteLine, selectedEdgeId, readOnly, setConnectingFrom, setSelectedId, setActiveTool])

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
      // Don't intercept wheel events inside modals/overlays rendered within the canvas DOM
      if ((e.target as Element).closest('[data-canvas-overlay]')) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      applyZoom(-e.deltaY, e.clientX - rect.left, e.clientY - rect.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [applyZoom])

  // ── Touch: pinch to zoom (roadmap 2.8) ────────────────────────────────────
  // Pointers are tracked in the capture phase so a pinch works even when a finger lands on a node.
  const pointersRef = useRef(new Map<number, Point>())
  const pinchRef = useRef<{ start: ViewTransform; startMid: Point; startDist: number } | null>(null)
  const transformRef = useRef(transform)
  useEffect(() => { transformRef.current = transform }, [transform])

  const localPoint = (e: React.PointerEvent): Point => {
    const rect = containerRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  const firstTwo = () => [...pointersRef.current.values()].slice(0, 2) as [Point, Point]

  const handlePointerDownCapture = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return
    pointersRef.current.set(e.pointerId, localPoint(e))
    if (pointersRef.current.size === 2) {
      const [a, b] = firstTwo()
      pinchRef.current = { start: { ...transformRef.current }, startMid: midpoint(a, b), startDist: distance(a, b) }
      // A second finger ends any drag or pan the first one started.
      interactionRef.current = { mode: 'idle', nodeId: null, lastX: 0, lastY: 0, hasMoved: true, startX: 0, startY: 0 }
    }
  }
  const handlePointerMoveCapture = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch' || !pointersRef.current.has(e.pointerId)) return
    pointersRef.current.set(e.pointerId, localPoint(e))
    const pinch = pinchRef.current
    if (pinch && pointersRef.current.size >= 2) {
      const [a, b] = firstTwo()
      setTransform(pinchTransform(pinch.start, pinch.startMid, pinch.startDist, midpoint(a, b), distance(a, b)))
    }
  }
  const handlePointerEndCapture = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return
    pointersRef.current.delete(e.pointerId)
    if (pointersRef.current.size < 2) pinchRef.current = null
  }

  // ── Pointer events ─────────────────────────────────────────────────────────

  const handleNodePointerDown = useCallback((e: React.PointerEvent, nodeId: string) => {
    if (e.button !== 0) return
    e.stopPropagation()
    if (pinchRef.current) return
    if (readOnly || activeTool !== 'select') return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    interactionRef.current = { mode: 'dragging', nodeId, lastX: e.clientX, lastY: e.clientY, startX: e.clientX, startY: e.clientY, hasMoved: false }
  }, [activeTool, readOnly])

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 || pinchRef.current) return
    // A press that starts on the toolbar, a panel, a dialog or any control is theirs, not a pan: capturing the pointer for a
    // pan would swallow the click, so on a view-only canvas the toolbar buttons (filter, export, history) stopped working.
    if ((e.target as Element).closest('button, a, input, select, textarea, [role="dialog"], [data-export-ignore], [data-canvas-overlay]')) return
    if (connectingFrom) { setConnectingFrom(null); return }
    // Dragging empty canvas pans with the Pan tool, and always on a touch screen or a view-only canvas
    // (there is nothing to select-drag there, and a phone has no Pan key).
    const dragPans = activeTool === 'pan' || (activeTool === 'select' && (readOnly || e.pointerType === 'touch'))
    if (dragPans) {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      interactionRef.current = { mode: 'panning', nodeId: null, lastX: e.clientX, lastY: e.clientY, startX: e.clientX, startY: e.clientY, hasMoved: false }
    }
    // A tap on empty canvas (no drag) deselects; see handlePointerUp for the pan case.
    if (activeTool === 'select' && !dragPans) { setSelectedId(null); setSelectedEdgeId(null) }
  }, [activeTool, readOnly, connectingFrom, setConnectingFrom, setSelectedId, setSelectedEdgeId])

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
        const moved = movedPositions(nodesRef.current, syncedPositions.current)
        savePositions(chartId, moved, "Couldn't save the new position",
          () => moved.forEach(p => syncedPositions.current.set(p.id, { x: p.x, y: p.y })))
      }
    }
    if (ia.mode === 'panning' && !ia.hasMoved && activeTool === 'select') { setSelectedId(null); setSelectedEdgeId(null) }
    interactionRef.current = { mode: 'idle', nodeId: null, lastX: 0, lastY: 0, hasMoved: false, startX: 0, startY: 0 }
  }, [commitDrag, chartId, activeTool, setSelectedId, setSelectedEdgeId])

  const handleNodeClick = useCallback((e: React.MouseEvent, nodeId: string) => {
    if (interactionRef.current.hasMoved) return
    e.stopPropagation()

    // A canvas that turned read-only while Connect was armed (a failed save, an edit conflict) must not draw a line (R-51).
    if (!readOnly && (activeTool === 'connect' || connectingFrom)) {
      if (!connectingFrom) {
        setConnectingFrom(nodeId)
      } else if (connectingFrom !== nodeId) {
        const line = addEdge(connectingFrom, nodeId)
        if (line) saveNewLine(chartId, line)
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
  }, [readOnly, activeTool, connectingFrom, chartId, setConnectingFrom, addEdge, setSelectedId, setSelectedEdgeId, setActiveTool])

  // The moment the canvas goes read-only, Connect is disarmed: the half-drawn line and the tool go with it (R-51).
  useEffect(() => {
    if (!readOnly) return
    setConnectingFrom(null)
    if (activeTool === 'connect') setActiveTool('select')
  }, [readOnly, activeTool, setConnectingFrom, setActiveTool])

  // Keyboard access to the roles (R-32 item 4): Tab, Enter, F2 and the arrow keys. See useRoleKeyboard.ts.
  const { reportingIndex, handleNodeKeyDown, handleNodeFocus } = useRoleKeyboard({
    nodes, edges, nodesRef, containerRef, transform, vpSize, setTransform,
    readOnly, chartId, activeTool, setActiveTool, connectingFrom, setConnectingFrom, addEdge,
    setSelectedId, setSelectedEdgeId, setEditingNodeId,
  })

  const handleNodeDoubleClick = useCallback((e: React.MouseEvent, nodeId: string) => {
    if (interactionRef.current.hasMoved || readOnly) return
    e.stopPropagation()
    clearTimeout(clickTimerRef.current)
    setSelectedId(null)
    setEditingNodeId(nodeId)
  }, [setSelectedId, readOnly])

  const handleOpenAddModal = useCallback(() => {
    if (isAtNodeLimit(nodes.length)) {
      setShowUpgradeModal(true)
      return
    }
    if (nodes.length === 0) {
      const cx = (-transform.x + vpSize.w / 2) / transform.scale - NODE_W / 2
      const cy = (-transform.y + vpSize.h / 2) / transform.scale - NODE_H / 2
      addNodePosRef.current = { x: cx, y: cy }
    } else {
      const maxY  = Math.max(...nodes.map(n => n.y))
      const minX  = Math.min(...nodes.map(n => n.x))
      const maxX  = Math.max(...nodes.map(n => n.x)) + NODE_W
      const centreX = (minX + maxX) / 2 - NODE_W / 2
      addNodePosRef.current = { x: centreX, y: maxY + NODE_H + 60 }
    }
    setIsAddModalOpen(true)
  }, [nodes, transform, vpSize, isAtNodeLimit])

  const handleAddSubmit = useCallback((data: Omit<import('../../types').OrgNode, 'id'>, reportsToId: string) => {
    const pos = addNodePosRef.current
    const newRoleId = addNode({ ...data, x: pos.x, y: pos.y })
    const line = reportsToId && newRoleId ? addEdge(reportsToId, newRoleId) : null
    // The role is saved before the line that points at it: the queue keeps the order.
    saveNewRole(chartId, { ...data, id: newRoleId, x: pos.x, y: pos.y })
    if (line) saveNewLine(chartId, line)
    setIsAddModalOpen(false)
  }, [addNode, addEdge, chartId])

  const handleUpdateSubmit = useCallback((nodeId: string, updates: Partial<import('../../types').OrgNode>, reportsToId: string) => {
    updateNode(nodeId, updates)
    const oldEdge = getEdges().find(e => e.targetId === nodeId)
    const oldManagerId = oldEdge?.sourceId ?? ''
    let newLine: OrgEdge | null = null
    if (oldManagerId !== reportsToId) {
      if (oldEdge) removeEdge(oldEdge.id)
      if (reportsToId) newLine = addEdge(reportsToId, nodeId)
    }
    saveRoleEdit(chartId, nodeId, updates)
    if (oldManagerId !== reportsToId) {
      if (oldEdge) saveLineDelete(chartId, oldEdge.id)
      if (newLine) saveNewLine(chartId, newLine)
    }
    setEditingNodeId(null)
  }, [updateNode, removeEdge, addEdge, getEdges, chartId])

  const handleDeleteNode = useCallback((nodeId: string) => {
    deleteNode(nodeId)
    setEditingNodeId(null)
    saveRoleDelete(chartId, nodeId)
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
    const posArr = nodesRef.current.map(n => {
      const p = positions.get(n.id)
      return { id: n.id, x: p?.x ?? n.x, y: p?.y ?? n.y }
    })
    savePositions(chartId, posArr, "Couldn't save the new layout",
      () => posArr.forEach(p => syncedPositions.current.set(p.id, { x: p.x, y: p.y })))
  }, [upgradeRequired, edges, applyLayout, fitToView, addToast, chartId])

  const [isExporting,    setIsExporting]    = useState(false)
  const [exportOverflow, setExportOverflow] = useState(false)

  const handleExport = useCallback(async (format: 'png' | 'pdf' | 'csv') => {
    if (format === 'csv') {
      // Free for everyone, built in the browser from what's on screen. Also a valid import file.
      if (nodesRef.current.length === 0) { addToast('This chart has no roles to export yet.', 'info'); return }
      const out = buildChartCsv({ nodes: nodesRef.current, edges, departments })
      downloadText(`${fileSlug(chartName, 'chart')}.csv`, out.csv)
      addToast(`Exported ${out.rows} role${out.rows === 1 ? '' : 's'} to CSV.`, 'success')
      if (out.multiManager > 0) {
        addToast(`${out.multiManager} role${out.multiManager === 1 ? ' has' : 's have'} more than one manager. Only the first is in the file.`, 'warning')
      }
      return
    }
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
      if (format === 'png') await exportAsPNG(containerRef.current, slug, { width: chartW, height: chartH, watermark: brandExports })
      else await exportAsPDF(containerRef.current, slug, { width: chartW, height: chartH })
    } finally {
      setExportOverflow(false)
      setTransform(savedTransform)
      setIsExporting(false)
    }
  }, [containerRef, nodesRef, isExporting, transform, setTransform, chartName, edges, departments, addToast, brandExports])

  const nodeMap      = Object.fromEntries(nodes.map(n => [n.id, n]))
  const selectedNode = selectedId ? nodeMap[selectedId] ?? null : null
  const editingNode  = editingNodeId ? nodeMap[editingNodeId] ?? null : null

  // Dept colour lookup for edges
  const deptColourMap = Object.fromEntries(departments.map(d => [d.id, d.colour]))

  // Big charts (roadmap 3.4): draw only what is near the screen, and plain chips when zoomed far out.
  // Exports render everything, because they capture the whole chart rather than the screen.
  const virtualize = !exportOverflow && shouldVirtualize(nodes.length)
  const chips = virtualize && shouldUseChips(nodes.length, transform.scale)
  // Tab order = DOM order, so draw in reading order. Big charts keep their own order (re-sorting 1,000 roles on every drag frame is not free).
  const drawOrder = useMemo(() => (nodes.length > 300 ? nodes : readingOrder(nodes)), [nodes])
  const view = useMemo(() => (virtualize ? viewRect(transform, vpSize) : null), [virtualize, transform, vpSize])
  const visibleIds = useMemo(() => (view ? visibleNodeIds(nodes, view) : null), [view, nodes])

  return (
    <div data-a11y-ok="empty-canvas click deselects; Escape does the same"
      ref={containerRef}
      style={{
        position: 'relative', width: '100%', height: '100%', overflow: exportOverflow ? 'visible' : 'hidden',
        background: 'var(--bg)',
        touchAction: 'none', // the canvas handles pan and pinch itself; the page must not scroll or zoom under it
        cursor: activeTool === 'pan' ? 'grab' : activeTool === 'zoom' ? 'zoom-in' : connectingFrom ? 'crosshair' : 'default',
      }}
      role="group"
      aria-label="Org chart. Tab moves between roles, Enter opens one, arrow keys follow reporting lines, F2 edits."
      onPointerDownCapture={handlePointerDownCapture}
      onPointerMoveCapture={handlePointerMoveCapture}
      onPointerUpCapture={handlePointerEndCapture}
      onPointerCancelCapture={handlePointerEndCapture}
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
            if (view && edge.id !== selectedEdgeId && !edgeInView(src, tgt, view)) return null
            const deptColour = deptColourMap[src.departmentId] ?? '#94A3B8'
            const edgeDimmed = matchedNodeIds !== null &&
              (!matchedNodeIds.has(edge.sourceId) || !matchedNodeIds.has(edge.targetId))
            if (chips) {
              return <EdgeLine key={edge.id} source={src} target={tgt} transform={transform} colour={deptColour} opacity={edgeDimmed ? 0.1 : 1} />
            }
            return (
              <EdgePath
                key={edge.id}
                source={src} target={tgt}
                transform={transform}
                selected={edge.id === selectedEdgeId}
                hovered={edge.id === hovEdgeId}
                deptColour={deptColour}
                opacity={edgeDimmed ? 0.1 : 1}
                onClick={() => { setSelectedEdgeId(edge.id); setSelectedId(null) }}
                onMouseEnter={() => setHovEdgeId(edge.id)}
                onMouseLeave={() => setHovEdgeId(null)}
                onDelete={() => handleDeleteLine(edge.id)}
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
        {drawOrder.map(node => {
          // Off-screen roles are skipped on big charts; the one being selected or connected always stays.
          if (visibleIds && !visibleIds.has(node.id) && node.id !== selectedId && node.id !== connectingFrom) return null
          const state = {
            node,
            selected: node.id === selectedId,
            connecting: node.id === connectingFrom,
            isConnectTarget: !!connectingFrom && node.id !== connectingFrom,
            dimmed: matchedNodeIds !== null && !matchedNodeIds.has(node.id),
          }
          return chips
            ? <NodeChip key={node.id} {...state} colour={deptColourMap[node.departmentId] ?? '#94A3B8'}
                ariaLabel={roleAriaLabel(node, reportingIndex, id => nodeMap[id]?.name ?? '')}
                onPointerDown={handleNodePointerDown} onClick={handleNodeClick} onDoubleClick={handleNodeDoubleClick}
                onKeyDown={handleNodeKeyDown} onFocus={handleNodeFocus} />
            : <NodeCard key={node.id} {...state} departments={deptLookup} commentCount={commentCounts?.[node.id] ?? 0}
                ariaLabel={roleAriaLabel(node, reportingIndex, id => nodeMap[id]?.name ?? '')}
                onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => handleNodeKeyDown(e, node.id)}
                onFocus={(e: React.FocusEvent<HTMLDivElement>) => handleNodeFocus(e, node.id)}
                onPointerDown={(e: React.PointerEvent) => handleNodePointerDown(e, node.id)}
                onClick={(e: React.MouseEvent) => handleNodeClick(e, node.id)}
                onDoubleClick={(e: React.MouseEvent) => handleNodeDoubleClick(e, node.id)} />
        })}
      </div>

      <Toolbar
        activeTool={activeTool} setActiveTool={setActiveTool}
        onAddNode={handleOpenAddModal}
        onImport={() => setIsImportOpen(true)}
        onHistory={onVersionRestored ? () => setIsHistoryOpen(true) : undefined}
        onAutoLayout={handleAutoLayout}
        onUndo={handleUndo} onRedo={handleRedo} canUndo={canUndo} canRedo={canRedo}
        readOnly={readOnly}
        nodeCount={nodes.length}
        maxNodesPerChart={plan.maxNodesPerChart}
        currentTier={currentTier}
        onExport={handleExport}
        chartId={chartId}
        isPublic={isPublic}
        filterOpen={filterOpen} onFilterOpenChange={setFilterOpen}
        departments={departments} filters={activeFilters} onFiltersChange={setActiveFilters}
      />

      {!readOnly && nodes.length === 0 && chartId && (
        <EmptyCanvasCard onAdd={handleOpenAddModal} onImport={() => setIsImportOpen(true)} />
      )}

      {isHistoryOpen && chartId && onVersionRestored && (
        <Suspense fallback={null}>
          <HistoryPanel chartId={chartId} chartName={chartName} onClose={() => setIsHistoryOpen(false)} onRestored={onVersionRestored} />
        </Suspense>
      )}

      {isImportOpen && (
        <Suspense fallback={null}>
          <ImportDialog
            onClose={() => setIsImportOpen(false)}
            chart={{ id: chartId, name: chartName, nodes, departments }}
            onImported={onImported}
          />
        </Suspense>
      )}

      {/* Over the node limit after a downgrade (roadmap 1.6): edit and remove, but don't add */}
      {!readOnly && plan.maxNodesPerChart !== -1 && nodes.length > plan.maxNodesPerChart && (
        <div role="status" data-export-ignore style={{
          position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--warn-bg)', border: '1px solid var(--warn)',
          borderRadius: 8, padding: '7px 16px', zIndex: 19, maxWidth: 'calc(100% - 32px)',
          display: 'flex', alignItems: 'center', gap: 10, fontSize: 12,
          color: 'var(--text)', boxShadow: 'var(--shadow-sm)',
        }}>
          <span>This chart has <strong>{nodes.length}</strong> roles and your plan allows <strong>{plan.maxNodesPerChart}</strong>. You can edit and remove roles, but not add new ones.</span>
          <button onClick={() => navigate('/pricing')} style={{
            background: 'var(--warn)', border: 'none', borderRadius: 6,
            color: '#fff', fontSize: 11, fontWeight: 600, padding: '3px 10px', cursor: 'pointer', flexShrink: 0,
          }}>Upgrade</button>
        </div>
      )}

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
      <Minimap nodes={nodes} departments={deptLookup} transform={transform} vpW={vpSize.w} vpH={vpSize.h}
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
          departments={departments}
          onClose={() => setSelectedId(null)}
          onEditNode={node => setEditingNodeId(node.id)}
          chartId={commentCounts ? chartId : undefined}
          initialTab={deepLink.tab}
          commentCount={selectedNode ? commentCounts?.[selectedNode.id] ?? 0 : 0}
          onCommentsChanged={onCommentsChanged}
        />
      </div>

      {/* Add node modal */}
      {isAddModalOpen && (
        <div data-export-ignore>
          <Suspense fallback={null}>
            <NodeModal
              isOpen
              onClose={() => setIsAddModalOpen(false)}
              mode="add"
              departments={departments}
              allNodes={nodes}
              allEdges={edges}
              onAdd={handleAddSubmit}
              onUpdate={() => {}}
              onDelete={() => {}}
            />
          </Suspense>
        </div>
      )}

      {/* Edit node modal */}
      {editingNode && (
        <div data-export-ignore>
          <Suspense fallback={null}>
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
              onRemoveLine={readOnly ? undefined : handleDeleteLine}
            />
          </Suspense>
        </div>
      )}
    </div>
  )
}

