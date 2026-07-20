import { describe, expect, it } from 'vitest'
import { BUILTIN_FONTS, createDefaultTypography, safeImportedFontFamily, themeTypographySchema } from '../src/shared/typography'

describe('typography model', () => {
  it('provides every requested built-in font and defaults brand slots correctly', () => {
    expect(Object.keys(BUILTIN_FONTS)).toEqual([
      'system-ui', 'segoe-script', 'noto-sans-sc', 'noto-serif-sc', 'lxgw-wenkai', 'jetbrains-mono'
    ])
    expect(createDefaultTypography()).toEqual({
      slots: {
        ui: { kind: 'builtin', id: 'system-ui' },
        brandTitle: { kind: 'inherit' },
        brandSubtitle: { kind: 'inherit' },
        brandSignature: { kind: 'builtin', id: 'segoe-script' },
        homeHeadingDecoration: { kind: 'inherit' },
        composerMelody: { kind: 'inherit' }
      },
      importedFonts: []
    })
  })

  it('validates reusable imported font records and slot references', () => {
    const typography = createDefaultTypography()
    typography.importedFonts.push({ id: 'font-123', family: 'My Font', asset: 'assets/font-123.woff2', originalName: 'my-font.woff2', format: 'woff2' })
    typography.slots.brandTitle = { kind: 'imported', id: 'font-123' }
    expect(themeTypographySchema.parse(typography)).toEqual(typography)
    expect(() => themeTypographySchema.parse({ ...typography, slots: { ...typography.slots, brandTitle: { kind: 'imported', id: 'missing' } } })).toThrow()
    expect(() => themeTypographySchema.parse({ ...typography, slots: { ...typography.slots, ui: { kind: 'inherit' } } })).toThrow()
    expect(() => themeTypographySchema.parse({ ...typography, importedFonts: [...typography.importedFonts, typography.importedFonts[0]] })).toThrow()
    expect(safeImportedFontFamily('font-123<script>')).toBe('Dream Imported font-123script')
  })
})
