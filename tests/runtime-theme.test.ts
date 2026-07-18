import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildRuntimeFontCss } from '../src/main/theme-fonts'
import { APPEARANCE_COLOR_TOKENS, APPEARANCE_PAINT_TOKENS } from '../src/shared/appearance'
import { buildThemeStyleVariables, buildThemeVariableDeclarations } from '../src/shared/runtime-theme'
import { createDefaultTheme } from '../src/shared/theme'

const id = '11111111-1111-4111-8111-111111111111'
const resourcesRoot = join(process.cwd(), 'resources', 'windows')

describe('runtime appearance compilation', () => {
  it('emits every registered token with legacy fallbacks and structured gradients', () => {
    const profile = createDefaultTheme(id)
    profile.appearance.colors.brandTitle = 'oklch(.42 .11 210 / .8)'
    profile.appearance.paints.canvas = {
      kind: 'linear',
      angle: 120,
      stops: [{ color: '#fff', position: 0 }, { color: 'rgb(10 20 30 / .5)', position: 1 }]
    }
    const variables = buildThemeStyleVariables(profile)

    expect(variables['--dream-brand-title']).toBe('oklch(.42 .11 210 / .8)')
    expect(variables['--dream-canvas']).toBe('linear-gradient(120deg, #fff 0%, rgb(10 20 30 / .5) 100%)')
    expect(variables['--dream-font-brand-title']).toBe('var(--dream-font-ui)')
    for (const definition of Object.values(APPEARANCE_COLOR_TOKENS)) expect(variables[definition.cssVariable]).toBeTruthy()
    for (const definition of Object.values(APPEARANCE_PAINT_TOKENS)) expect(variables[definition.cssVariable]).toBeTruthy()
    expect(buildThemeVariableDeclarations(profile)).not.toContain('undefined')
  })

  it('consumes every registered appearance variable in the runtime stylesheets', async () => {
    const css = await Promise.all([
      readFile(join(resourcesRoot, 'dream-skin.css'), 'utf8'),
      readFile(join(resourcesRoot, 'dream-home-layout.css'), 'utf8'),
      readFile(join(resourcesRoot, 'dream-particle-effects.css'), 'utf8')
    ]).then((parts) => parts.join('\n'))
    for (const definition of Object.values(APPEARANCE_COLOR_TOKENS)) expect(css, definition.cssVariable).toContain(`var(${definition.cssVariable})`)
    for (const definition of Object.values(APPEARANCE_PAINT_TOKENS)) expect(css, definition.cssVariable).toContain(`var(${definition.cssVariable})`)
  })

  it('draws the brand surface once on the native header without covering injected copy', async () => {
    const css = await readFile(join(resourcesRoot, 'dream-skin.css'), 'utf8')
    expect(css).toMatch(/main\.main-surface > header\.app-header-tint\s*\{[^}]*background:\s*var\(--dream-brand-surface\) !important;/)
    expect(css).toMatch(/\.dream-brand\s*\{[^}]*background:\s*transparent !important;/)
    expect(css).not.toMatch(/\.dream-brand\s*\{[^}]*background:\s*var\(--dream-brand-surface\)/)
  })

  it('applies the sidebar mode badge to the injected icon instead of the native button', async () => {
    const css = await readFile(join(resourcesRoot, 'dream-skin.css'), 'utf8')
    expect(css).toMatch(/button:is\([^}]+\)\s*\{[^}]*background:\s*transparent !important;/)
    expect(css).toMatch(/\.dream-sidebar-mode-icon\s*\{[^}]*background:\s*var\(--dream-sidebar-mode-badge\);/)
  })

  it('embeds only selected imported fonts with generated family names', async () => {
    const profile = createDefaultTheme(id)
    profile.typography.importedFonts = [
      { id: 'font-used', family: 'Used', asset: 'assets/used.woff2', originalName: 'used.woff2', format: 'woff2' },
      { id: 'font-unused', family: 'Unused', asset: 'assets/unused.woff2', originalName: 'unused.woff2', format: 'woff2' }
    ]
    profile.typography.slots.brandTitle = { kind: 'imported', id: 'font-used' }
    const css = await buildRuntimeFontCss(profile, {
      'assets/used.woff2': 'data:font/woff2;base64,d09GMg==',
      'assets/unused.woff2': 'data:font/woff2;base64,VU5VU0VE'
    }, resourcesRoot)

    expect(css).toContain('font-family: "Dream Imported font-used"')
    expect(css).toContain('font-display: swap')
    expect(css).toContain('d09GMg==')
    expect(css).not.toContain('font-unused')
    expect(css).not.toContain('VU5VU0VE')
  })

  it('embeds a selected bundled font and skips all bundled files by default', async () => {
    const profile = createDefaultTheme(id)
    expect(await buildRuntimeFontCss(profile, {}, resourcesRoot)).toBe('')
    profile.typography.slots.ui = { kind: 'builtin', id: 'jetbrains-mono' }
    const css = await buildRuntimeFontCss(profile, {}, resourcesRoot)
    expect(css).toContain('font-family: "Dream JetBrains Mono"')
    expect(css).toContain('data:font/woff2;base64,')
    expect(css).not.toContain('Dream Noto')
  })
})
