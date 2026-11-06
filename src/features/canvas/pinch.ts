// Two-finger pinch zoom for touch screens (roadmap 2.8). Pure maths, so it is unit-tested.

export interface Point { x: number; y: number }
export interface ViewTransform { x: number; y: number; scale: number }

export const MIN_SCALE = 0.1
export const MAX_SCALE = 3

export const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * The view for a pinch in progress. `start` is the view when the second finger went down, `startMid` and
 * `startDist` the fingers' midpoint and spacing then, `mid` and `dist` now (all in container coordinates).
 * The spacing ratio scales the view, and the point of the chart that was under the starting midpoint
 * follows the current midpoint, so you can zoom and pan with one gesture.
 */
export function pinchTransform(start: ViewTransform, startMid: Point, startDist: number, mid: Point, dist: number): ViewTransform {
  if (startDist <= 0) return start
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, start.scale * (dist / startDist)))
  const chartX = (startMid.x - start.x) / start.scale
  const chartY = (startMid.y - start.y) / start.scale
  return { scale, x: mid.x - chartX * scale, y: mid.y - chartY * scale }
}
