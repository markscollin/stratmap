// Types and small pure helpers shared by the canvas and its parts (split out of OrgChart.tsx, R-35).
import type { RoleType, NodeStatus } from '../../types'

export type Transform = { x: number; y: number; scale: number }

export type ActiveFilters = {
  depts: Set<string>
  roleTypes: Set<RoleType>
  statuses: Set<NodeStatus>
}

export const EMPTY_FILTERS: ActiveFilters = { depts: new Set(), roleTypes: new Set(), statuses: new Set() }

export function toScreen(cx: number, cy: number, t: Transform) {
  return { x: cx * t.scale + t.x, y: cy * t.scale + t.y }
}

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export type ActiveTool = 'select' | 'pan' | 'zoom' | 'connect'
