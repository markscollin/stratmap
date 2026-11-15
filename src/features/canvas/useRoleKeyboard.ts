// Keyboard access to the roles on the canvas (R-32 item 4), split out of OrgChart.tsx (R-35).
// Tab walks the roles in reading order, Enter or Space opens one (or finishes a connection), F2 edits it, and
// the arrows follow the reporting lines (keyboardNav.ts). A role that is off screen is panned into view.
import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { RefObject, Dispatch, SetStateAction } from 'react'
import type { OrgNode, OrgEdge } from '../../types'
import { buildReportingIndex, navTarget, isNavKey, panToReveal } from './keyboardNav'
import { saveNewLine } from './canvasSync'
import type { ActiveTool, Transform } from './canvasTypes'

interface Options {
  nodes: OrgNode[]
  edges: OrgEdge[]
  nodesRef: RefObject<OrgNode[]>
  containerRef: RefObject<HTMLDivElement | null>
  transform: Transform
  vpSize: { w: number; h: number }
  setTransform: Dispatch<SetStateAction<Transform>>
  readOnly: boolean
  chartId: string
  activeTool: ActiveTool
  setActiveTool: (t: ActiveTool) => void
  connectingFrom: string | null
  setConnectingFrom: (id: string | null) => void
  addEdge: (sourceId: string, targetId: string) => OrgEdge | null | undefined
  setSelectedId: Dispatch<SetStateAction<string | null>>
  setSelectedEdgeId: Dispatch<SetStateAction<string | null>>
  setEditingNodeId: (id: string | null) => void
}

export function useRoleKeyboard({
  nodes, edges, nodesRef, containerRef, transform, vpSize, setTransform,
  readOnly, chartId, activeTool, setActiveTool, connectingFrom, setConnectingFrom, addEdge,
  setSelectedId, setSelectedEdgeId, setEditingNodeId,
}: Options) {
  const reportingIndex = useMemo(() => buildReportingIndex(nodes, edges), [nodes, edges])
  // A role we asked to focus that is off screen is drawn by the render after the pan; the effect then focuses it.
  const pendingFocus = useRef<string | null>(null)

  // preventScroll: the container is overflow:hidden but a browser would still scroll it to the focused element.
  const focusRole = useCallback((nodeId: string) => {
    containerRef.current?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(nodeId)}"]`)?.focus({ preventScroll: true })
  }, [containerRef])

  /** Bring a role on screen. Returns true when the canvas had to pan (so it is not drawn where it will be yet). */
  const revealNode = useCallback((nodeId: string): boolean => {
    const n = nodesRef.current.find(x => x.id === nodeId)
    const next = n && panToReveal(n, transform, vpSize)
    if (next) setTransform(next)
    return !!next
  }, [nodesRef, transform, vpSize, setTransform])

  useEffect(() => {
    if (!pendingFocus.current) return
    focusRole(pendingFocus.current)
    pendingFocus.current = null
  }, [transform, focusRole])

  const connectTo = useCallback((nodeId: string): boolean => {
    if (activeTool !== 'connect' && !connectingFrom) return false
    if (!connectingFrom) {
      setConnectingFrom(nodeId)
    } else if (connectingFrom !== nodeId) {
      const line = addEdge(connectingFrom, nodeId)
      if (line) saveNewLine(chartId, line)
      setConnectingFrom(null)
      setActiveTool('select')
    }
    return true
  }, [activeTool, connectingFrom, chartId, setConnectingFrom, addEdge, setActiveTool])

  const handleNodeKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>, nodeId: string) => {
    if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (connectTo(nodeId)) return
      setSelectedId(nodeId) // opens the role's panel (unlike a click, a key press never toggles it shut)
      setSelectedEdgeId(null)
    } else if (e.key === 'F2' && !readOnly) {
      e.preventDefault()
      setSelectedId(null)
      setEditingNodeId(nodeId)
    } else if (isNavKey(e.key)) {
      const to = navTarget(reportingIndex, nodeId, e.key)
      e.preventDefault()
      if (!to) return
      if (revealNode(to)) pendingFocus.current = to
      else focusRole(to)
    }
  }, [connectTo, readOnly, reportingIndex, revealNode, focusRole, setSelectedId, setSelectedEdgeId, setEditingNodeId])

  // Tabbing to an off-screen role brings it into view; clicking one with the mouse does not move the canvas.
  const handleNodeFocus = useCallback((e: React.FocusEvent<HTMLDivElement>, nodeId: string) => {
    if (e.target !== e.currentTarget) return
    let byKeyboard = true
    try { byKeyboard = e.currentTarget.matches(':focus-visible') } catch { /* an old engine: treat as keyboard */ }
    if (byKeyboard) revealNode(nodeId)
  }, [revealNode])

  return { reportingIndex, handleNodeKeyDown, handleNodeFocus }
}
