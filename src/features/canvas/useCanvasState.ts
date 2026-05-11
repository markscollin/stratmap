import { useState, useRef, useCallback } from 'react'
import type { OrgNode, OrgEdge } from '../../types'

export interface Transform { x: number; y: number; scale: number }

interface Snapshot { nodes: OrgNode[]; edges: OrgEdge[] }

export type ActiveTool = 'select' | 'pan' | 'zoom' | 'connect'

const INITIAL_TRANSFORM: Transform = { x: 0, y: 0, scale: 0.58 }

export function useCanvasState(initialNodes: OrgNode[] = [], initialEdges: OrgEdge[] = []) {
  const [nodes,     setNodes]     = useState<OrgNode[]>(initialNodes)
  const [edges,     setEdges]     = useState<OrgEdge[]>(initialEdges)
  const [transform, setTransform] = useState<Transform>(INITIAL_TRANSFORM)
  const [selectedId,     setSelectedId]     = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null)
  const [activeTool,     setActiveTool]     = useState<ActiveTool>('select')

  // History — stored in refs so we never get stale-closure issues
  const historyRef      = useRef<Snapshot[]>([{ nodes: initialNodes, edges: initialEdges }])
  const historyIndexRef = useRef(0)

  // Expose booleans as derived state so components can gate buttons
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
    historyRef.current   = sliced
    historyIndexRef.current = sliced.length - 1
    syncHistoryFlags()
  }, [syncHistoryFlags])

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return
    historyIndexRef.current--
    const { nodes: n, edges: e } = historyRef.current[historyIndexRef.current]
    setNodes(n)
    setEdges(e)
    syncHistoryFlags()
  }, [syncHistoryFlags])

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return
    historyIndexRef.current++
    const { nodes: n, edges: e } = historyRef.current[historyIndexRef.current]
    setNodes(n)
    setEdges(e)
    syncHistoryFlags()
  }, [syncHistoryFlags])

  // Move a node by delta during drag (no history — pushed on drag end)
  const moveNode = useCallback((id: string, dx: number, dy: number) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, x: n.x + dx, y: n.y + dy } : n))
  }, [])

  // Call this when a drag finishes to snapshot the final positions
  const commitDrag = useCallback((finalNodes: OrgNode[]) => {
    setEdges(currentEdges => {
      pushHistory(finalNodes, currentEdges)
      return currentEdges
    })
  }, [pushHistory])

  const addEdge = useCallback((sourceId: string, targetId: string) => {
    setEdges(prev => {
      if (prev.some(e => e.sourceId === sourceId && e.targetId === targetId)) return prev
      const e: OrgEdge = { id: `e-${sourceId}-${targetId}-${Date.now()}`, sourceId, targetId }
      const next = [...prev, e]
      setNodes(n => { pushHistory(n, next); return n })
      return next
    })
  }, [pushHistory])

  const removeEdge = useCallback((edgeId: string) => {
    setEdges(prev => {
      const next = prev.filter(e => e.id !== edgeId)
      setNodes(n => { pushHistory(n, next); return n })
      return next
    })
    setSelectedEdgeId(null)
  }, [pushHistory])

  const addNode = useCallback((x: number, y: number) => {
    const newNode: OrgNode = {
      id: `n-${Date.now()}`,
      name: 'New Role',
      title: 'Job Title',
      departmentId: 'eng',
      managerId: null,
      status: 'planned',
      employmentType: 'full-time',
      x, y,
      isNew: true,
    }
    setNodes(prev => {
      const next = [...prev, newNode]
      setEdges(es => { pushHistory(next, es); return es })
      return next
    })
    return newNode.id
  }, [pushHistory])

  return {
    nodes, edges, transform, setTransform,
    selectedId, setSelectedId,
    selectedEdgeId, setSelectedEdgeId,
    connectingFrom, setConnectingFrom,
    activeTool, setActiveTool,
    moveNode, commitDrag, addEdge, removeEdge, addNode,
    undo, redo, canUndo, canRedo,
  }
}
