import { useState, useRef, useCallback } from 'react'
import type { OrgNode, OrgEdge } from '../../types'
import { useToastStore } from '../../store/toastStore'
import { newId } from './canvasSync'

export interface Transform { x: number; y: number; scale: number }

export interface Snapshot { nodes: OrgNode[]; edges: OrgEdge[] }

/** What an undo or redo changed: the canvas before and after, so the caller can save the difference (R-02). */
export interface HistoryStep { from: Snapshot; to: Snapshot }

export type ActiveTool = 'select' | 'pan' | 'zoom' | 'connect'

const INITIAL_TRANSFORM: Transform = { x: 0, y: 0, scale: 0.58 }

// BFS: can we reach `to` from `from` following sourceId→targetId edges?
function hasPath(edges: OrgEdge[], from: string, to: string): boolean {
  const visited = new Set<string>()
  const queue = [from]
  while (queue.length) {
    const curr = queue.shift()!
    if (curr === to) return true
    if (visited.has(curr)) continue
    visited.add(curr)
    edges.filter(e => e.sourceId === curr).forEach(e => queue.push(e.targetId))
  }
  return false
}

export function useCanvasState(initialNodes: OrgNode[] = [], initialEdges: OrgEdge[] = [], initialSelectedId: string | null = null) {
  const [nodes,     setNodesState] = useState<OrgNode[]>(initialNodes)
  const [edges,     setEdgesState] = useState<OrgEdge[]>(initialEdges)
  const [transform, setTransform] = useState<Transform>(INITIAL_TRANSFORM)
  const [selectedId,     setSelectedId]     = useState<string | null>(initialSelectedId)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null)
  const [activeTool,     setActiveTool]     = useState<ActiveTool>('select')

  // The latest nodes and edges, updated the moment they change (not at the next render). Handlers that
  // change several things in one go (add a role and its line, change who a role reports to) read these,
  // and callers get the new edge back so they can save it under the same id (R-03).
  const nodesRef = useRef(initialNodes)
  const edgesRef = useRef(initialEdges)
  const setNodes = useCallback((n: OrgNode[]) => { nodesRef.current = n; setNodesState(n) }, [])
  const setEdges = useCallback((e: OrgEdge[]) => { edgesRef.current = e; setEdgesState(e) }, [])

  const historyRef      = useRef<Snapshot[]>([{ nodes: initialNodes, edges: initialEdges }])
  const historyIndexRef = useRef(0)

  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const syncHistoryFlags = useCallback(() => {
    setCanUndo(historyIndexRef.current > 0)
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1)
  }, [])

  const pushHistory = useCallback((ns: OrgNode[], es: OrgEdge[]) => {
    const sliced = historyRef.current.slice(0, historyIndexRef.current + 1)
    sliced.push({ nodes: ns, edges: es })
    if (sliced.length > 50) sliced.shift()
    historyRef.current      = sliced
    historyIndexRef.current = sliced.length - 1
    syncHistoryFlags()
  }, [syncHistoryFlags])

  /** Move to another point in the history. Returns what changed on screen so the caller can save it. */
  const step = useCallback((delta: -1 | 1, toast: string): HistoryStep | null => {
    const target = historyIndexRef.current + delta
    if (target < 0 || target >= historyRef.current.length) return null
    const from: Snapshot = { nodes: nodesRef.current, edges: edgesRef.current }
    historyIndexRef.current = target
    const to = historyRef.current[target]
    setNodes(to.nodes)
    setEdges(to.edges)
    syncHistoryFlags()
    useToastStore.getState().addToast(toast, 'info')
    return { from, to }
  }, [setNodes, setEdges, syncHistoryFlags])

  const undo = useCallback(() => step(-1, 'Undo'), [step])
  const redo = useCallback(() => step(1, 'Redo'), [step])

  const moveNode = useCallback((id: string, dx: number, dy: number) => {
    setNodes(nodesRef.current.map(n => n.id === id ? { ...n, x: n.x + dx, y: n.y + dy } : n))
  }, [setNodes])

  const commitDrag = useCallback((finalNodes: OrgNode[]) => {
    pushHistory(finalNodes, edgesRef.current)
  }, [pushHistory])

  const addNode = useCallback((data: Omit<OrgNode, 'id'>): string => {
    const newNode: OrgNode = { id: newId('n'), ...data }
    const next = [...nodesRef.current, newNode]
    setNodes(next)
    pushHistory(next, edgesRef.current)
    return newNode.id
  }, [setNodes, pushHistory])

  const updateNode = useCallback((id: string, updates: Partial<OrgNode>) => {
    const next = nodesRef.current.map(n => n.id === id ? { ...n, ...updates } : n)
    setNodes(next)
    pushHistory(next, edgesRef.current)
  }, [setNodes, pushHistory])

  const deleteNode = useCallback((id: string) => {
    const next = nodesRef.current.filter(n => n.id !== id)
    const nextEdges = edgesRef.current.filter(e => e.sourceId !== id && e.targetId !== id)
    setNodes(next)
    setEdges(nextEdges)
    pushHistory(next, nextEdges)
    setSelectedId(null)
  }, [setNodes, setEdges, pushHistory])

  /** Draws a reporting line. Returns it (with its id) so the caller can save it, or null if it was refused. */
  const addEdge = useCallback((sourceId: string, targetId: string): OrgEdge | null => {
    const prev = edgesRef.current
    if (sourceId === targetId) {
      useToastStore.getState().addToast('Cannot connect a node to itself', 'error')
      return null
    }
    if (prev.some(e => e.sourceId === sourceId && e.targetId === targetId)) return null
    if (hasPath(prev, targetId, sourceId)) {
      useToastStore.getState().addToast('This would create a circular reporting line', 'error')
      return null
    }
    // A client-made id, sent to the server unchanged, so this line can be deleted before any reload.
    const e: OrgEdge = { id: newId('e'), sourceId, targetId }
    const next = [...prev, e]
    setEdges(next)
    pushHistory(nodesRef.current, next)
    return e
  }, [setEdges, pushHistory])

  const removeEdge = useCallback((edgeId: string) => {
    const next = edgesRef.current.filter(e => e.id !== edgeId)
    setEdges(next)
    pushHistory(nodesRef.current, next)
    setSelectedEdgeId(null)
  }, [setEdges, pushHistory])

  // Remove all edges where targetId matches (used when re-assigning "reports to")
  const removeEdgesByTarget = useCallback((targetId: string) => {
    const next = edgesRef.current.filter(e => e.targetId !== targetId)
    setEdges(next)
    pushHistory(nodesRef.current, next)
  }, [setEdges, pushHistory])

  const applyLayout = useCallback((newPositions: Map<string, { x: number; y: number }>) => {
    const next = nodesRef.current.map(n => {
      const pos = newPositions.get(n.id)
      return pos ? { ...n, x: pos.x, y: pos.y } : n
    })
    setNodes(next)
    pushHistory(next, edgesRef.current)
  }, [setNodes, pushHistory])

  const getEdges = useCallback(() => edgesRef.current, [])

  return {
    nodes, edges, getEdges, transform, setTransform,
    selectedId, setSelectedId,
    selectedEdgeId, setSelectedEdgeId,
    connectingFrom, setConnectingFrom,
    activeTool, setActiveTool,
    moveNode, commitDrag,
    addNode, updateNode, deleteNode,
    addEdge, removeEdge, removeEdgesByTarget,
    applyLayout,
    undo, redo, canUndo, canRedo,
  }
}
