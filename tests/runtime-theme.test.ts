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
    profile.appearance.colors.sidebarTaskSelectedText = '#0b3040'
    profile.appearance.paints.sidebarTaskRowSelected = {
      kind: 'linear',
      angle: 90,
      stops: [{ color: '#102030', position: 0 }, { color: '#f0d0e0', position: 1 }]
    }
    profile.appearance.paints.canvas = {
      kind: 'linear',
      angle: 120,
      stops: [{ color: '#fff', position: 0 }, { color: 'rgb(10 20 30 / .5)', position: 1 }]
    }
    const variables = buildThemeStyleVariables(profile)

    expect(variables['--dream-brand-title']).toBe('oklch(.42 .11 210 / .8)')
    expect(variables['--dream-sidebar-task-selected-text']).toBe('#0b3040')
    expect(variables['--dream-sidebar-task-row-selected']).toBe('linear-gradient(90deg, #102030 0%, #f0d0e0 100%)')
    expect(variables['--dream-canvas']).toBe('linear-gradient(120deg, #fff 0%, rgb(10 20 30 / .5) 100%)')
    expect(variables['--dream-font-home-heading']).toBe('var(--dream-font-ui)')
    expect(variables['--dream-font-home-subtitle']).toBe('var(--dream-font-ui)')
    expect(variables['--dream-font-brand-title']).toBe('var(--dream-font-ui)')
    expect(variables['--dream-font-sidebar-projects-title']).toBe('var(--dream-font-ui)')
    expect(variables['--dream-font-sidebar-tasks-title']).toBe('var(--dream-font-ui)')
    expect(variables['--dream-font-sidebar-nav-new-task']).toBe('var(--dream-font-ui)')
    expect(variables['--dream-font-sidebar-nav-pull-requests']).toBe('var(--dream-font-ui)')
    expect(variables['--dream-font-sidebar-nav-sites']).toBe('var(--dream-font-ui)')
    expect(variables['--dream-font-sidebar-nav-scheduled']).toBe('var(--dream-font-ui)')
    expect(variables['--dream-font-sidebar-nav-plugins']).toBe('var(--dream-font-ui)')
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
    expect(css).toContain('font-family: var(--dream-font-home-heading)')
    expect(css).toContain('font-family: var(--dream-font-home-subtitle)')
    expect(css).toContain('font-family: var(--dream-font-sidebar-projects-title)')
    expect(css).toContain('font-family: var(--dream-font-sidebar-tasks-title)')
    expect(css).toContain('font-family: var(--dream-font-sidebar-nav-new-task)')
    expect(css).toContain('font-family: var(--dream-font-sidebar-nav-plugins)')
    expect(css).toMatch(/\.dream-project-proxy\s*\{[^}]*font-family:\s*inherit;/)
  })

  it('resolves independent home copy fonts while preserving global inheritance', () => {
    const profile = createDefaultTheme(id)
    profile.typography.importedFonts.push({ id: 'font-home', family: 'Home Font', asset: 'assets/home.woff2', originalName: 'home.woff2', format: 'woff2' })
    profile.typography.slots.homeHeading = { kind: 'builtin', id: 'jetbrains-mono' }
    profile.typography.slots.homeSubtitle = { kind: 'imported', id: 'font-home' }

    const variables = buildThemeStyleVariables(profile)
    expect(variables['--dream-font-home-heading']).toBe('"Dream JetBrains Mono", monospace')
    expect(variables['--dream-font-home-subtitle']).toBe('"Dream Imported font-home", sans-serif')

    profile.typography.slots.homeSubtitle = { kind: 'inherit' }
    expect(buildThemeStyleVariables(profile)['--dream-font-home-subtitle']).toBe('var(--dream-font-ui)')
  })

  it('resolves independent sidebar section title fonts and two-state appearance', () => {
    const profile = createDefaultTheme(id)
    const defaults = buildThemeStyleVariables(profile)
    expect(defaults['--dream-sidebar-projects-title-text']).toBe(profile.colors.ink)
    expect(defaults['--dream-sidebar-projects-title-hover-text']).toBe(profile.colors.accent)
    expect(defaults['--dream-sidebar-tasks-title-text']).toBe(profile.colors.ink)
    expect(defaults['--dream-sidebar-tasks-title-hover-text']).toBe(profile.colors.accent)
    expect(defaults['--dream-sidebar-projects-title-hover-background']).toBe(defaults['--dream-sidebar-project-row-hover'])
    expect(defaults['--dream-sidebar-tasks-title-hover-background']).toBe(defaults['--dream-sidebar-task-row-hover'])
    profile.colors.ink = '#214537'
    profile.colors.accent = '#287F5F'
    const recolored = buildThemeStyleVariables(profile)
    expect(recolored['--dream-sidebar-projects-title-text']).toBe('#214537')
    expect(recolored['--dream-sidebar-tasks-title-hover-text']).toBe('#287F5F')
    expect(recolored['--dream-sidebar-project-text']).toBe('#214537')
    expect(recolored['--dream-sidebar-projects-title-hover-background']).toBe(recolored['--dream-sidebar-project-row-hover'])
    expect(recolored['--dream-sidebar-projects-title-hover-background']).not.toBe(defaults['--dream-sidebar-projects-title-hover-background'])

    profile.typography.slots.sidebarProjectsTitle = { kind: 'builtin', id: 'jetbrains-mono' }
    profile.appearance.colors.sidebarProjectsTitleText = '#123456'
    profile.appearance.colors.sidebarProjectsTitleHoverText = '#654321'
    profile.appearance.paints.sidebarProjectsTitleBackground = { kind: 'solid', color: 'transparent' }
    profile.appearance.paints.sidebarProjectsTitleHoverBackground = { kind: 'solid', color: 'rgb(10 20 30 / .5)' }

    const variables = buildThemeStyleVariables(profile)
    expect(variables['--dream-font-sidebar-projects-title']).toBe('"Dream JetBrains Mono", monospace')
    expect(variables['--dream-font-sidebar-tasks-title']).toBe('var(--dream-font-ui)')
    expect(variables['--dream-sidebar-projects-title-text']).toBe('#123456')
    expect(variables['--dream-sidebar-projects-title-hover-text']).toBe('#654321')
    expect(variables['--dream-sidebar-projects-title-background']).toBe('transparent')
    expect(variables['--dream-sidebar-projects-title-hover-background']).toBe('rgb(10 20 30 / .5)')
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

  it('keeps composer send colors above the global foreground button rule', async () => {
    const css = await readFile(join(resourcesRoot, 'dream-home-layout.css'), 'utf8')
    expect(css).toContain('html.codex-dream-skin .dream-composer button[class~="bg-token-foreground"]')
    expect(css).toMatch(/html\.codex-dream-skin \.dream-composer button\[class~="bg-token-foreground"\]\s*\{[^}]*background:\s*var\(--dream-composer-send-button\) !important;/)
    expect(css).toMatch(/html\.codex-dream-skin \.dream-composer button\[class~="bg-token-foreground"\]:hover\s*\{[^}]*background:\s*var\(--dream-composer-send-button-hover\) !important;/)
    expect(css).toContain('button[class~="bg-token-foreground"][data-preview-state="selected"]')
  })

  it('leaves conversation overlay geometry to the validated runtime styles', async () => {
    const css = await readFile(join(resourcesRoot, 'dream-skin.css'), 'utf8')
    const overlayRule = css.match(/html\.codex-dream-skin \.dream-conversation-background-overlay\s*\{([^}]*)\}/)?.[1]
    expect(overlayRule).toContain('position: absolute !important')
    expect(overlayRule).toContain('pointer-events: none !important')
    expect(overlayRule).not.toMatch(/\b(?:inset|left|top|width|height)\s*:/)
    expect(css).toMatch(/\.dream-conversation-background-color,\s*html\.codex-dream-skin \.dream-conversation-background-media\s*\{[^}]*inset:\s*0 !important;[^}]*width:\s*100% !important;[^}]*height:\s*100% !important;/)
  })

  it('keeps native sidebar navigation items rounded in every state', async () => {
    const css = await readFile(join(resourcesRoot, 'dream-skin.css'), 'utf8')
    expect(css).toMatch(/aside\.app-shell-left-panel nav > :is\(a, button\)\s*\{[^}]*border-radius:\s*10px !important;/)
    expect(css).toMatch(/:is\(a, button\)\[aria-current="page"\][^}]*\{[^}]*border-radius:\s*10px !important;/)
    expect(css).toMatch(/nav \.dream-sidebar-new-task-row\s*\{[^}]*background:\s*var\(--dream-sidebar-nav-item\) !important;/)
    expect(css).not.toMatch(/nav \.dream-sidebar-new-task-row\s*\{[^}]*min-height:\s*40px !important;/)
    expect(css).toMatch(/nav \.dream-sidebar-new-task-row-selected\s*\{[^}]*background:\s*var\(--dream-sidebar-nav-item-selected\) !important;/)
    expect(css).toMatch(/nav \.dream-sidebar-new-task-row > :is\(a, button\)\s*\{[^}]*background:\s*transparent !important;/)
    expect(css).not.toMatch(/nav \.dream-sidebar-new-task-row > :is\(a, button\)\s*\{[^}]*min-height:\s*40px !important;/)
    expect(css).toMatch(/nav \.dream-sidebar-new-task-row:hover\s*\{[^}]*background:\s*var\(--dream-sidebar-nav-item-hover\) !important;/)
    expect(css).toMatch(/nav \.dream-sidebar-new-task-row-selected:hover\s*\{[^}]*background:\s*var\(--dream-sidebar-nav-item-selected\) !important;/)
    expect(css).toMatch(/nav \.dream-sidebar-nav-icon\s*\{[^}]*width:\s*18px !important;[^}]*font-size:\s*18px !important;/)
    expect(css).toMatch(/\.dream-sidebar-task-row-selected[\s\S]*background:\s*var\(--dream-sidebar-task-row-selected\) !important;/)
    expect(css).toMatch(/\.dream-sidebar-task-row-selected[\s\S]*color:\s*var\(--dream-sidebar-task-selected-text\) !important;/)
  })

  it('recognizes current Codex thread rows and assigns the selected marker', async () => {
    const renderer = await readFile(join(resourcesRoot, 'renderer-inject.js'), 'utf8')
    expect(renderer).toContain('[data-app-action-sidebar-thread-row]')
    expect(renderer).toContain('dream-sidebar-task-row-selected')
    expect(renderer).toContain('node.classList.toggle("dream-sidebar-task-row-selected", selected)')
  })

  it('targets real project folder rows without adding a project selected state', async () => {
    const renderer = await readFile(join(resourcesRoot, 'renderer-inject.js'), 'utf8')
    const css = await readFile(join(resourcesRoot, 'dream-skin.css'), 'utf8')
    expect(renderer).toContain('[role="listitem"][data-sidebar-project-kind] > span > [role="button"]')
    expect(renderer).not.toContain('button[aria-label*="项目"]')
    expect(css).not.toContain('.dream-sidebar-project-row[aria-current="page"]')
    expect(css).toContain('.dream-sidebar-project-row-selected')
  })

  it('embeds only selected imported fonts with generated family names', async () => {
    const profile = createDefaultTheme(id)
    profile.typography.importedFonts = [
      { id: 'font-used', family: 'Used', asset: 'assets/used.woff2', originalName: 'used.woff2', format: 'woff2' },
      { id: 'font-unused', family: 'Unused', asset: 'assets/unused.woff2', originalName: 'unused.woff2', format: 'woff2' }
    ]
    profile.typography.slots.homeHeading = { kind: 'imported', id: 'font-used' }
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
