import { useState, useRef, useCallback } from 'react'
import type { OrgNode, OrgEdge } from '../../types'
import { useToastStore } from '../../store/toastStore'

export interface Transform { x: number; y: number; scale: number }

interface Snapshot { nodes: OrgNode[]; edges: OrgEdge[] }

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

export function useCanvasState(initialNodes: OrgNode[] = [], initialEdges: OrgEdge[] = []) {
  const [nodes,     setNodes]     = useState<OrgNode[]>(initialNodes)
  const [edges,     setEdges]     = useState<OrgEdge[]>(initialEdges)
  const [transform, setTransform] = useState<Transform>(INITIAL_TRANSFORM)
  const [selectedId,     setSelectedId]     = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null)
  const [activeTool,     setActiveTool]     = useState<ActiveTool>('select')

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

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return
    historyIndexRef.current--
    const { nodes: n, edges: e } = historyRef.current[historyIndexRef.current]
    setNodes(n)
    setEdges(e)
    syncHistoryFlags()
    useToastStore.getState().addToast('Undo', 'info')
  }, [syncHistoryFlags])

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return
    historyIndexRef.current++
    const { nodes: n, edges: e } = historyRef.current[historyIndexRef.current]
    setNodes(n)
    setEdges(e)
    syncHistoryFlags()
    useToastStore.getState().addToast('Redo', 'info')
  }, [syncHistoryFlags])

  const moveNode = useCallback((id: string, dx: number, dy: number) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, x: n.x + dx, y: n.y + dy } : n))
  }, [])

  const commitDrag = useCallback((finalNodes: OrgNode[]) => {
    setEdges(currentEdges => {
      pushHistory(finalNodes, currentEdges)
      return currentEdges
    })
  }, [pushHistory])

  const addNode = useCallback((data: Omit<OrgNode, 'id'>): string => {
    const newNode: OrgNode = { id: `n-${Date.now()}`, ...data }
    setNodes(prev => {
      const next = [...prev, newNode]
      setEdges(es => { pushHistory(next, es); return es })
      return next
    })
    return newNode.id
  }, [pushHistory])

  const updateNode = useCallback((id: string, updates: Partial<OrgNode>) => {
    setNodes(prev => {
      const next = prev.map(n => n.id === id ? { ...n, ...updates } : n)
      setEdges(es => { pushHistory(next, es); return es })
      return next
    })
  }, [pushHistory])

  const deleteNode = useCallback((id: string) => {
    setNodes(prev => {
      const next = prev.filter(n => n.id !== id)
      setEdges(prevEdges => {
        const nextEdges = prevEdges.filter(e => e.sourceId !== id && e.targetId !== id)
        pushHistory(next, nextEdges)
        return nextEdges
      })
      return next
    })
    setSelectedId(null)
  }, [pushHistory])

  const addEdge = useCallback((sourceId: string, targetId: string) => {
    setEdges(prev => {
      if (sourceId === targetId) {
        useToastStore.getState().addToast('Cannot connect a node to itself', 'error')
        return prev
      }
      if (prev.some(e => e.sourceId === sourceId && e.targetId === targetId)) return prev
      if (hasPath(prev, targetId, sourceId)) {
        useToastStore.getState().addToast('This would create a circular reporting line', 'error')
        return prev
      }
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

  // Remove all edges where targetId matches (used when re-assigning "reports to")
  const removeEdgesByTarget = useCallback((targetId: string) => {
    setEdges(prev => {
      const next = prev.filter(e => e.targetId !== targetId)
      setNodes(n => { pushHistory(n, next); return n })
      return next
    })
  }, [pushHistory])

  return {
    nodes, edges, transform, setTransform,
    selectedId, setSelectedId,
    selectedEdgeId, setSelectedEdgeId,
    connectingFrom, setConnectingFrom,
    activeTool, setActiveTool,
    moveNode, commitDrag,
    addNode, updateNode, deleteNode,
    addEdge, removeEdge, removeEdgesByTarget,
    undo, redo, canUndo, canRedo,
  }
}
