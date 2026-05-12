import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useCanvasState } from '../useCanvasState'
import { useToastStore } from '../../../store/toastStore'
import type { OrgNode, OrgEdge } from '../../../types'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function nodeData(overrides: Partial<Omit<OrgNode, 'id'>> = {}): Omit<OrgNode, 'id'> {
  return {
    name: 'Alice', title: 'CEO', departmentId: 'eng',
    managerId: null, status: 'active', employmentType: 'full-time',
    x: 0, y: 0, ...overrides,
  }
}

function withId(id: string, overrides: Partial<OrgNode> = {}): OrgNode {
  return { ...nodeData(), id, ...overrides }
}

function edge(id: string, sourceId: string, targetId: string): OrgEdge {
  return { id, sourceId, targetId }
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  useToastStore.setState({ toasts: [] })
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// ─── addNode ──────────────────────────────────────────────────────────────────

describe('addNode', () => {
  it('adds a node to the canvas', () => {
    const { result } = renderHook(() => useCanvasState())
    act(() => { result.current.addNode(nodeData()) })
    expect(result.current.nodes).toHaveLength(1)
  })

  it('returns the new node id', () => {
    const { result } = renderHook(() => useCanvasState())
    let id!: string
    act(() => { id = result.current.addNode(nodeData()) })
    expect(result.current.nodes[0].id).toBe(id)
  })

  it('enables undo after adding a node', () => {
    const { result } = renderHook(() => useCanvasState())
    expect(result.current.canUndo).toBe(false)
    act(() => { result.current.addNode(nodeData()) })
    expect(result.current.canUndo).toBe(true)
  })

  it('preserves existing nodes', () => {
    const { result } = renderHook(() => useCanvasState([withId('n1')]))
    act(() => { result.current.addNode(nodeData({ name: 'Bob' })) })
    expect(result.current.nodes).toHaveLength(2)
    expect(result.current.nodes[0].id).toBe('n1')
  })
})

// ─── updateNode ───────────────────────────────────────────────────────────────

describe('updateNode', () => {
  it('updates the specified node fields', () => {
    const { result } = renderHook(() => useCanvasState([withId('n1', { name: 'Alice' })]))
    act(() => { result.current.updateNode('n1', { name: 'Alice Updated' }) })
    expect(result.current.nodes.find(n => n.id === 'n1')?.name).toBe('Alice Updated')
  })

  it('does not mutate other nodes', () => {
    const { result } = renderHook(() => useCanvasState([withId('n1'), withId('n2', { name: 'Bob' })]))
    act(() => { result.current.updateNode('n1', { name: 'Changed' }) })
    expect(result.current.nodes.find(n => n.id === 'n2')?.name).toBe('Bob')
  })

  it('pushes history so undo restores the previous value', () => {
    const { result } = renderHook(() => useCanvasState([withId('n1', { name: 'Alice' })]))
    act(() => { result.current.updateNode('n1', { name: 'Changed' }) })
    act(() => { result.current.undo() })
    expect(result.current.nodes.find(n => n.id === 'n1')?.name).toBe('Alice')
  })
})

// ─── deleteNode ───────────────────────────────────────────────────────────────

describe('deleteNode', () => {
  it('removes the node', () => {
    const { result } = renderHook(() => useCanvasState([withId('n1')]))
    act(() => { result.current.deleteNode('n1') })
    expect(result.current.nodes).toHaveLength(0)
  })

  it('removes edges where the node is the source', () => {
    const { result } = renderHook(() =>
      useCanvasState([withId('n1'), withId('n2')], [edge('e1', 'n1', 'n2')])
    )
    act(() => { result.current.deleteNode('n1') })
    expect(result.current.edges).toHaveLength(0)
  })

  it('removes edges where the node is the target', () => {
    const { result } = renderHook(() =>
      useCanvasState([withId('n1'), withId('n2')], [edge('e1', 'n1', 'n2')])
    )
    act(() => { result.current.deleteNode('n2') })
    expect(result.current.edges).toHaveLength(0)
  })

  it('does not remove unrelated edges', () => {
    const nodes = [withId('n1'), withId('n2'), withId('n3')]
    const edges = [edge('e1', 'n1', 'n2'), edge('e2', 'n2', 'n3')]
    const { result } = renderHook(() => useCanvasState(nodes, edges))
    act(() => { result.current.deleteNode('n1') })
    expect(result.current.edges).toHaveLength(1)
    expect(result.current.edges[0].id).toBe('e2')
  })

  it('clears selectedId', () => {
    const { result } = renderHook(() => useCanvasState([withId('n1')]))
    act(() => { result.current.setSelectedId('n1') })
    act(() => { result.current.deleteNode('n1') })
    expect(result.current.selectedId).toBeNull()
  })
})

// ─── addEdge ──────────────────────────────────────────────────────────────────

describe('addEdge', () => {
  it('adds a valid edge between two nodes', () => {
    const { result } = renderHook(() => useCanvasState([withId('n1'), withId('n2')]))
    act(() => { result.current.addEdge('n1', 'n2') })
    expect(result.current.edges).toHaveLength(1)
    expect(result.current.edges[0]).toMatchObject({ sourceId: 'n1', targetId: 'n2' })
  })

  it('blocks self-connections and shows an error toast', () => {
    const { result } = renderHook(() => useCanvasState([withId('n1')]))
    act(() => { result.current.addEdge('n1', 'n1') })
    expect(result.current.edges).toHaveLength(0)
    expect(useToastStore.getState().toasts[0]?.message).toContain('itself')
  })

  it('blocks duplicate edges silently', () => {
    const { result } = renderHook(() => useCanvasState([withId('n1'), withId('n2')]))
    act(() => { result.current.addEdge('n1', 'n2') })
    act(() => { result.current.addEdge('n1', 'n2') })
    expect(result.current.edges).toHaveLength(1)
  })

  it('blocks circular reporting lines (direct cycle) and shows an error toast', () => {
    const { result } = renderHook(() => useCanvasState([withId('n1'), withId('n2')]))
    act(() => { result.current.addEdge('n1', 'n2') })
    useToastStore.setState({ toasts: [] })
    act(() => { result.current.addEdge('n2', 'n1') })
    expect(result.current.edges).toHaveLength(1)
    expect(useToastStore.getState().toasts[0]?.message).toContain('circular')
  })

  it('blocks circular reporting lines through a chain (A→B→C, reject C→A)', () => {
    const nodes = [withId('n1'), withId('n2'), withId('n3')]
    const { result } = renderHook(() => useCanvasState(nodes))
    act(() => { result.current.addEdge('n1', 'n2') })
    act(() => { result.current.addEdge('n2', 'n3') })
    useToastStore.setState({ toasts: [] })
    act(() => { result.current.addEdge('n3', 'n1') })
    expect(result.current.edges).toHaveLength(2)
    expect(useToastStore.getState().toasts.some(t => t.message.includes('circular'))).toBe(true)
  })

  it('allows non-circular edges in a multi-node graph', () => {
    const nodes = [withId('n1'), withId('n2'), withId('n3')]
    const { result } = renderHook(() => useCanvasState(nodes))
    act(() => { result.current.addEdge('n1', 'n2') })
    act(() => { result.current.addEdge('n1', 'n3') })
    expect(result.current.edges).toHaveLength(2)
  })
})

// ─── removeEdge ───────────────────────────────────────────────────────────────

describe('removeEdge', () => {
  it('removes the edge by id', () => {
    const { result } = renderHook(() =>
      useCanvasState([withId('n1'), withId('n2')], [edge('e1', 'n1', 'n2')])
    )
    act(() => { result.current.removeEdge('e1') })
    expect(result.current.edges).toHaveLength(0)
  })

  it('clears selectedEdgeId', () => {
    const { result } = renderHook(() =>
      useCanvasState([withId('n1'), withId('n2')], [edge('e1', 'n1', 'n2')])
    )
    act(() => { result.current.setSelectedEdgeId('e1') })
    act(() => { result.current.removeEdge('e1') })
    expect(result.current.selectedEdgeId).toBeNull()
  })
})

// ─── undo / redo ──────────────────────────────────────────────────────────────

describe('undo / redo', () => {
  it('undo is unavailable at the initial state', () => {
    const { result } = renderHook(() => useCanvasState())
    expect(result.current.canUndo).toBe(false)
  })

  it('redo is unavailable at the latest state', () => {
    const { result } = renderHook(() => useCanvasState())
    act(() => { result.current.addNode(nodeData()) })
    expect(result.current.canRedo).toBe(false)
  })

  it('undo reverses an addNode', () => {
    const { result } = renderHook(() => useCanvasState())
    act(() => { result.current.addNode(nodeData()) })
    act(() => { result.current.undo() })
    expect(result.current.nodes).toHaveLength(0)
    expect(result.current.canUndo).toBe(false)
  })

  it('redo re-applies the undone addNode', () => {
    const { result } = renderHook(() => useCanvasState())
    act(() => { result.current.addNode(nodeData()) })
    act(() => { result.current.undo() })
    act(() => { result.current.redo() })
    expect(result.current.nodes).toHaveLength(1)
    expect(result.current.canRedo).toBe(false)
  })

  it('undo reverses an addEdge', () => {
    const { result } = renderHook(() => useCanvasState([withId('n1'), withId('n2')]))
    act(() => { result.current.addEdge('n1', 'n2') })
    act(() => { result.current.undo() })
    expect(result.current.edges).toHaveLength(0)
  })

  it('undo shows an "Undo" toast', () => {
    const { result } = renderHook(() => useCanvasState())
    act(() => { result.current.addNode(nodeData()) })
    useToastStore.setState({ toasts: [] })
    act(() => { result.current.undo() })
    expect(useToastStore.getState().toasts.some(t => t.message === 'Undo')).toBe(true)
  })

  it('redo shows a "Redo" toast', () => {
    const { result } = renderHook(() => useCanvasState())
    act(() => { result.current.addNode(nodeData()) })
    act(() => { result.current.undo() })
    useToastStore.setState({ toasts: [] })
    act(() => { result.current.redo() })
    expect(useToastStore.getState().toasts.some(t => t.message === 'Redo')).toBe(true)
  })

  it('undo is a no-op at the initial state', () => {
    const { result } = renderHook(() => useCanvasState([withId('n1')]))
    act(() => { result.current.undo() })
    expect(result.current.nodes).toHaveLength(1)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('branching: redo history is discarded after a new action', () => {
    const { result } = renderHook(() => useCanvasState())
    act(() => { result.current.addNode(nodeData({ name: 'A' })) })
    act(() => { result.current.addNode(nodeData({ name: 'B' })) })
    act(() => { result.current.undo() })
    expect(result.current.canRedo).toBe(true)
    // New action should clear redo stack
    act(() => { result.current.addNode(nodeData({ name: 'C' })) })
    expect(result.current.canRedo).toBe(false)
  })
})
