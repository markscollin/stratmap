import type { OrgNode, OrgEdge } from '../types'

const NODE_W = 220
const NODE_H = 80
const VERTICAL_GAP = 120   // px between levels (level bottom to next level top)
const HORIZ_SPACING = 260  // px center-to-center between sibling subtrees

// Build map of nodeId → [childId, ...]
function buildChildMap(edges: OrgEdge[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const e of edges) {
    if (!map.has(e.sourceId)) map.set(e.sourceId, [])
    map.get(e.sourceId)!.push(e.targetId)
  }
  return map
}

// Compute the total horizontal width a subtree requires (center-to-center units)
function subtreeWidth(nodeId: string, childMap: Map<string, string[]>, visited: Set<string>): number {
  if (visited.has(nodeId)) return HORIZ_SPACING  // circular: treat as leaf
  const children = childMap.get(nodeId) ?? []
  if (children.length === 0) return HORIZ_SPACING
  const inner = new Set(visited)
  inner.add(nodeId)
  return children.reduce((sum, c) => sum + subtreeWidth(c, childMap, inner), 0)
}

// Recursively assign positions, centerX is the horizontal center of this subtree
function assignPositions(
  nodeId: string,
  centerX: number,
  y: number,
  childMap: Map<string, string[]>,
  positions: Map<string, { x: number; y: number }>,
  visited: Set<string>,
): void {
  if (visited.has(nodeId)) return
  // Convert center to top-left corner
  positions.set(nodeId, { x: centerX - NODE_W / 2, y })

  const children = (childMap.get(nodeId) ?? []).filter(c => !visited.has(c))
  if (children.length === 0) return

  const inner = new Set(visited)
  inner.add(nodeId)
  const widths = children.map(c => subtreeWidth(c, childMap, inner))
  const total = widths.reduce((a, b) => a + b, 0)
  let x = centerX - total / 2

  for (let i = 0; i < children.length; i++) {
    assignPositions(children[i], x + widths[i] / 2, y + NODE_H + VERTICAL_GAP, childMap, positions, inner)
    x += widths[i]
  }
}

export function calculateLayout(
  nodes: OrgNode[],
  edges: OrgEdge[],
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  if (nodes.length === 0) return positions

  const childMap = buildChildMap(edges)
  const hasParent = new Set(edges.map(e => e.targetId))

  const roots = nodes.filter(n => !hasParent.has(n.id))

  if (roots.length === 0) {
    // All nodes in cycles — fall back to single row
    nodes.forEach((n, i) => positions.set(n.id, { x: i * HORIZ_SPACING, y: 0 }))
    return positions
  }

  // Lay out each root subtree side by side
  let cursor = 0
  for (const root of roots) {
    const w = subtreeWidth(root.id, childMap, new Set())
    assignPositions(root.id, cursor + w / 2, 0, childMap, positions, new Set())
    cursor += w
  }

  // Any nodes not yet placed (isolated from all edges)
  const unplaced = nodes.filter(n => !positions.has(n.id))
  if (unplaced.length > 0) {
    const maxY = Math.max(...[...positions.values()].map(p => p.y))
    const isolatedY = maxY + NODE_H + VERTICAL_GAP
    unplaced.forEach((n, i) => {
      positions.set(n.id, { x: i * HORIZ_SPACING, y: isolatedY })
    })
  }

  return positions
}
