import { describe, expect, it } from 'vitest'
import { denormalizePoint, fenceBounds, isFenceValid, normalizePoint } from '../src/shared/geometry'

describe('polaroid fence geometry', () => {
  it('converts original image coordinates without losing position', () => {
    const normalized = normalizePoint(960, 270, 1920, 1080)
    expect(normalized).toEqual({ x: 0.5, y: 0.25 })
    expect(denormalizePoint(normalized, 1920, 1080)).toEqual({ x: 960, y: 270 })
  })

  it('rejects out-of-bounds and self-intersecting fences', () => {
    expect(isFenceValid([{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }])).toBe(true)
    expect(isFenceValid([{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.9, y: 0.1 }, { x: 0.1, y: 0.9 }])).toBe(false)
    expect(isFenceValid([{ x: -0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }])).toBe(false)
  })

  it('calculates the crop bounds', () => {
    const bounds = fenceBounds([{ x: 0.2, y: 0.1 }, { x: 0.8, y: 0.2 }, { x: 0.7, y: 0.9 }, { x: 0.1, y: 0.8 }])
    expect(bounds).toMatchObject({ minX: 0.1, minY: 0.1, maxX: 0.8, maxY: 0.9 })
    expect(bounds.width).toBeCloseTo(0.7)
    expect(bounds.height).toBeCloseTo(0.8)
  })
})
