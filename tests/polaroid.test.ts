import { describe, expect, it } from 'vitest'
import type { Fence } from '../src/shared/geometry'
import { clampPolaroidPosition, getPolaroidLayout, getPolaroidPlacementMetrics, polaroidShadowFilter } from '../src/shared/polaroid'
import { createDefaultTheme } from '../src/shared/theme'

const fence: Fence = [{ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.2 }, { x: 0.9, y: 0.8 }, { x: 0.1, y: 0.8 }]

describe('polaroid layout', () => {
  it('uses the complete source ratio without requiring a valid fence', () => {
    const layout = getPolaroidLayout('full', { width: 1200, height: 800 }, [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }])
    expect(layout).toMatchObject({
      aspectRatio: 1.5,
      backgroundSize: '100% 100%',
      backgroundPosition: '0% 0%',
      clipPath: null,
      image: { width: '100%', height: '100%', left: '0%', top: '0%' }
    })
  })

  it('keeps the existing crop math for fence mode', () => {
    const layout = getPolaroidLayout('fence', { width: 1200, height: 800 }, fence)
    expect(layout?.aspectRatio).toBeCloseTo(2)
    expect(layout?.image).toEqual({ width: '125%', height: expect.stringMatching(/^166\.6+[^%]*%$/), left: '-12.5%', top: expect.stringMatching(/^-33\.3+[^%]*%$/) })
    expect(layout?.clipPath).toContain('polygon(')
  })

  it('rejects an invalid fence only when fence mode is selected', () => {
    const invalid: Fence = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.9, y: 0.1 }, { x: 0.1, y: 0.9 }]
    expect(getPolaroidLayout('fence', { width: 100, height: 100 }, invalid)).toBeNull()
    expect(getPolaroidLayout('full', { width: 100, height: 100 }, invalid)).not.toBeNull()
  })

  it('uses the rendered aspect ratio for placement bounds and shadow styling', () => {
    const layout = getPolaroidLayout('full', { width: 800, height: 1200 }, fence)
    if (!layout) throw new Error('Expected a full-image layout.')
    const metrics = getPolaroidPlacementMetrics(.25, layout)
    expect(metrics.width).toBe(.25)
    expect(metrics.height).toBeCloseTo(.375)
    expect(clampPolaroidPosition(.9, .9, metrics).x).toBe(.75)
    expect(clampPolaroidPosition(.9, .9, metrics).y).toBeCloseTo(.625)

    const profile = createDefaultTheme('00000000-0000-4000-8000-000000000000')
    expect(polaroidShadowFilter(profile.polaroid.style)).toBe('drop-shadow(0px 8px 10px rgba(24, 48, 54, 0.24))')
    profile.polaroid.style.shadow.visible = false
    expect(polaroidShadowFilter(profile.polaroid.style)).toBe('none')
  })
})
