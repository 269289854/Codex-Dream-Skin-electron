import {
  APPEARANCE_COLOR_TOKENS,
  APPEARANCE_PAINT_TOKENS,
  paintToCss,
  resolveAppearanceColor,
  resolveAppearancePaint
} from './appearance'
import type { ThemeProfile } from './theme'
import { BUILTIN_FONTS, safeImportedFontFamily, type FontSelection } from './typography'

export type ThemeStyleVariables = Record<`--dream-${string}`, string>

export function buildThemeStyleVariables(profile: ThemeProfile): ThemeStyleVariables {
  const colors = profile.colors
  const variables: ThemeStyleVariables = {
    '--dream-surface': colors.surface,
    '--dream-ink': colors.ink,
    '--dream-deep': colors.accent,
    '--dream-cyan': colors.accent,
    '--dream-aqua': colors.lavender,
    '--dream-accent': colors.accent,
    '--dream-pink': colors.pink,
    '--dream-lavender': colors.lavender,
    '--dream-line': colors.border,
    '--dream-border': colors.border,
    '--dream-success': colors.success,
    '--dream-danger': colors.danger,
    '--dream-font-ui': resolveFontFamily(profile, profile.typography.slots.ui),
    '--dream-font-brand-title': resolveFontFamily(profile, profile.typography.slots.brandTitle),
    '--dream-font-brand-subtitle': resolveFontFamily(profile, profile.typography.slots.brandSubtitle),
    '--dream-font-brand-signature': resolveFontFamily(profile, profile.typography.slots.brandSignature)
  }

  for (const [token, definition] of Object.entries(APPEARANCE_COLOR_TOKENS)) {
    variables[definition.cssVariable] = resolveAppearanceColor(profile.appearance, colors, token as keyof typeof APPEARANCE_COLOR_TOKENS)
  }
  for (const [token, definition] of Object.entries(APPEARANCE_PAINT_TOKENS)) {
    variables[definition.cssVariable] = paintToCss(resolveAppearancePaint(profile.appearance, colors, token as keyof typeof APPEARANCE_PAINT_TOKENS))
  }
  return variables
}

export function buildThemeVariableDeclarations(profile: ThemeProfile): string {
  return Object.entries(buildThemeStyleVariables(profile)).map(([name, value]) => `${name}: ${value};`).join(' ')
}

export function resolveFontFamily(profile: ThemeProfile, selection: FontSelection): string {
  if (selection.kind === 'inherit') return 'var(--dream-font-ui)'
  if (selection.kind === 'builtin') return BUILTIN_FONTS[selection.id].family
  const record = profile.typography.importedFonts.find((font) => font.id === selection.id)
  return record ? `"${safeImportedFontFamily(record.id)}", sans-serif` : 'var(--dream-font-ui)'
}

export function buildPreviewImportedFontCss(profile: ThemeProfile, assets: Record<string, string>): string {
  const selected = new Set(Object.values(profile.typography.slots).filter((slot) => slot.kind === 'imported').map((slot) => slot.kind === 'imported' ? slot.id : ''))
  return profile.typography.importedFonts.filter((font) => selected.has(font.id) && assets[font.asset]).map((font) => {
    const format = font.format === 'ttf' ? 'truetype' : font.format === 'otf' ? 'opentype' : font.format
    return `@font-face { font-family: "${safeImportedFontFamily(font.id)}"; src: url("${assets[font.asset]}") format("${format}"); font-style: normal; font-weight: 100 900; font-display: swap; }`
  }).join('\n')
}
