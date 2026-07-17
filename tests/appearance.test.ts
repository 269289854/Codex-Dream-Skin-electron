import { describe, expect, it } from 'vitest'
import {
  APPEARANCE_COLOR_TOKENS,
  APPEARANCE_PAINT_TOKENS,
  createEmptyAppearance,
  isCssColor,
  paintToCss,
  parseCssColor,
  resolveAppearancePaint,
  themeAppearanceSchema,
  themePaintSchema
} from '../src/shared/appearance'

const legacyColors = {
  surface: '#F7FFFF',
  ink: '#164B59',
  accent: '#20BCC3',
  pink: '#F06EA9',
  lavender: '#B9A7E8',
  border: '#BFDADD',
  success: '#169B68',
  danger: '#D84A5D'
}

describe('appearance model', () => {
  it.each([
    '#12abef',
    '#12abef80',
    'rgb(10 20 30 / 45%)',
    'rgba(10, 20, 30, 0.45)',
    'hsl(220 50% 40% / .5)',
    'hsla(220, 50%, 40%, .5)',
    'hwb(220 10% 20% / 30%)',
    'lab(52% 40 -20 / .8)',
    'lch(52% 40 280 / .8)',
    'oklab(.52 .1 -.1 / .8)',
    'oklch(.52 .1 280 / .8)',
    'rebeccapurple',
    'transparent'
  ])('accepts supported CSS solid color %s', (color) => {
    expect(isCssColor(color)).toBe(true)
    expect(parseCssColor(`  ${color}  `)).toBe(color)
  })

  it.each([
    '',
    'linear-gradient(red, blue)',
    'url(https://example.com/a)',
    'var(--accent)',
    'red; color: blue',
    'red/*x*/',
    'red\nbackground:black',
    '{ color: red }',
    '\\72 ed'
  ])('rejects non-color or injectable input %s', (color) => {
    expect(isCssColor(color)).toBe(false)
    expect(parseCssColor(color)).toBeNull()
  })

  it('validates and serializes solid, linear, and radial paints', () => {
    expect(paintToCss(themePaintSchema.parse({ kind: 'solid', color: 'rgb(1 2 3 / .5)' }))).toBe('rgb(1 2 3 / .5)')
    expect(paintToCss(themePaintSchema.parse({
      kind: 'linear',
      angle: 135,
      stops: [{ color: '#fff', position: 0 }, { color: 'oklch(.7 .1 20)', position: 0.5 }, { color: '#0008', position: 1 }]
    }))).toBe('linear-gradient(135deg, #fff 0%, oklch(.7 .1 20) 50%, #0008 100%)')
    expect(paintToCss(themePaintSchema.parse({
      kind: 'radial',
      center: { x: 0.25, y: 0.75 },
      stops: [{ color: 'red', position: 0.2 }, { color: 'blue', position: 0.2 }]
    }))).toBe('radial-gradient(circle at 25% 75%, red 20%, blue 20%)')
  })

  it('rejects malformed gradients and unknown appearance tokens', () => {
    expect(() => themePaintSchema.parse({ kind: 'linear', angle: 361, stops: [{ color: 'red', position: 0 }, { color: 'blue', position: 1 }] })).toThrow()
    expect(() => themePaintSchema.parse({ kind: 'linear', angle: 10, stops: [{ color: 'red', position: 0.8 }, { color: 'blue', position: 0.2 }] })).toThrow()
    expect(() => themePaintSchema.parse({ kind: 'radial', center: { x: -0.1, y: 0.5 }, stops: [{ color: 'red', position: 0 }, { color: 'blue', position: 1 }] })).toThrow()
    expect(() => themePaintSchema.parse({ kind: 'linear', angle: 10, stops: [{ color: 'red', position: 0 }] })).toThrow()
    expect(() => themePaintSchema.parse({ kind: 'solid', color: 'linear-gradient(red, blue)' })).toThrow()
    expect(() => themeAppearanceSchema.parse({ colors: { unknown: 'red' }, paints: {} })).toThrow()
  })

  it('registers unique CSS variables and a preview target for every token', () => {
    const definitions = [...Object.values(APPEARANCE_COLOR_TOKENS), ...Object.values(APPEARANCE_PAINT_TOKENS)]
    expect(new Set(definitions.map((token) => token.cssVariable)).size).toBe(definitions.length)
    expect(definitions.every((token) => token.targets.length > 0)).toBe(true)
  })

  it('restores the original cyan, pink, and lavender gradients when no paint is overridden', () => {
    const appearance = createEmptyAppearance()
    expect(paintToCss(resolveAppearancePaint(appearance, legacyColors, 'canvas'))).toMatch(/^linear-gradient\(135deg, /)
    expect(paintToCss(resolveAppearancePaint(appearance, legacyColors, 'sidebarSurface'))).toMatch(/^linear-gradient\(180deg, /)
    expect(paintToCss(resolveAppearancePaint(appearance, legacyColors, 'brandSurface'))).toMatch(/^linear-gradient\(90deg, /)
    expect(paintToCss(resolveAppearancePaint(appearance, legacyColors, 'actionCardIconBadge'))).toBe(
      'linear-gradient(145deg, #20BCC3 0%, #B9A7E8 58%, #F06EA9 100%)'
    )
    expect(resolveAppearancePaint(appearance, legacyColors, 'sidebarHeader')).toEqual({ kind: 'solid', color: 'transparent' })
  })

  it('recomputes inherited gradients from legacy theme colors and keeps explicit overrides authoritative', () => {
    const appearance = createEmptyAppearance()
    const changedColors = { ...legacyColors, accent: '#123456', pink: '#654321', lavender: '#ABCDEF' }
    expect(paintToCss(resolveAppearancePaint(appearance, changedColors, 'canvas'))).not.toBe(
      paintToCss(resolveAppearancePaint(appearance, legacyColors, 'canvas'))
    )
    expect(paintToCss(resolveAppearancePaint(appearance, changedColors, 'actionCardIconBadge'))).toContain('#123456')

    appearance.paints.canvas = { kind: 'solid', color: 'rebeccapurple' }
    expect(resolveAppearancePaint(appearance, changedColors, 'canvas')).toEqual({ kind: 'solid', color: 'rebeccapurple' })
    delete appearance.paints.canvas
    expect(paintToCss(resolveAppearancePaint(appearance, changedColors, 'canvas'))).toMatch(/^linear-gradient\(135deg, /)
  })
})
