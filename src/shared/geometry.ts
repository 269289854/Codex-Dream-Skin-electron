import type { Point } from './theme'

export type Fence = [Point, Point, Point, Point]

export function clampNormalized(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function normalizePoint(x: number, y: number, width: number, height: number): Point {
  if (width <= 0 || height <= 0) throw new Error('Image dimensions must be positive.')
  return { x: clampNormalized(x / width), y: clampNormalized(y / height) }
}

export function denormalizePoint(point: Point, width: number, height: number): Point {
  if (width <= 0 || height <= 0) throw new Error('Image dimensions must be positive.')
  return { x: point.x * width, y: point.y * height }
}

export function isFenceValid(fence: Fence): boolean {
  if (fence.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1)) return false
  const area = Math.abs(fence.reduce((sum, point, index) => {
    const next = fence[(index + 1) % fence.length]!
    return sum + point.x * next.y - next.x * point.y
  }, 0) / 2)
  if (area < 0.0005) return false
  return !segmentsIntersect(fence[0], fence[1], fence[2], fence[3]) && !segmentsIntersect(fence[1], fence[2], fence[3], fence[0])
}

export function fenceBounds(fence: Fence): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
  const xs = fence.map((point) => point.x)
  const ys = fence.map((point) => point.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

export function fenceClipPath(fence: Fence): string {
  const bounds = fenceBounds(fence)
  return `polygon(${fence.map((point) => `${percent((point.x - bounds.minX) / bounds.width)} ${percent((point.y - bounds.minY) / bounds.height)}`).join(', ')})`
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  const abC = cross(a, b, c)
  const abD = cross(a, b, d)
  const cdA = cross(c, d, a)
  const cdB = cross(c, d, b)
  return abC * abD < 0 && cdA * cdB < 0
}

function percent(value: number): string {
  return `${(value * 100).toFixed(3)}%`
}
