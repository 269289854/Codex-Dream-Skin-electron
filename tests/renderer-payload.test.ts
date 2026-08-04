import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_BRAND_COPY, DEFAULT_HOME_COPY, HOME_ACTIONS } from '../src/shared/home-layout'

describe('renderer injection template', () => {
  it('produces valid JavaScript with no unresolved markers', async () => {
    const template = await readFile(join(process.cwd(), 'resources', 'shared', 'renderer-inject.js'), 'utf8')
    const payload = template
      .replace('__DREAM_VERSION_JSON__', JSON.stringify('test-version'))
      .replace('__DREAM_CSS_JSON__', JSON.stringify(':root { --test: 1; }'))
      .replace('__DREAM_ART_JSON__', JSON.stringify('data:image/png;base64,AA=='))
      .replace('__DREAM_CONFIG_JSON__', JSON.stringify({ icons: {}, copy: { ...DEFAULT_HOME_COPY, ...DEFAULT_BRAND_COPY, parts: { before: '在 ', after: ' 中构建什么？' } }, actions: HOME_ACTIONS }))
    expect(payload).not.toMatch(/__DREAM_[A-Z_]+__/)
    expect(() => new Function(payload)).not.toThrow()
    expect(template).toContain('data-dream-copy-version')
    expect(template).toContain('document.querySelectorAll(".dream-heading").forEach(clearHeading)')
    expect(template).toContain('themeConfig?.builtinGlyphs')
    expect(template).toContain('ensureSidebarSurfaces()')
    expect(template).toContain('themeConfig?.sidebarNavigation')
    expect(template).toContain('data-dream-sidebar-nav')
    expect(template).toContain('restoreSidebarNav')
    expect(template).toContain('themeConfig?.accountMenu')
    expect(template).toContain('ensureAccountMenu()')
    expect(template).toContain('clearAccountMenu()')
    expect(template).toContain('dream-sidebar-project-icon-image')
    expect(template).toContain('data-dream-sidebar-project-icon-glyph')
    expect(template).toContain('dream-sidebar-session-icon-image')
    expect(template).toContain('data-dream-sidebar-session-icon-glyph')
    expect(template).not.toContain('--dream-sidebar-project-icon-mask')
    expect(template).not.toContain('--dream-sidebar-session-icon-mask')
    expect(template).toContain('requiresProjectIconRemount')
    expect(template).toContain('data-dream-account-menu-item')
    expect(template).toContain('dream-account-menu-background')
    expect(template).toContain('ensureAccountMenuBackground')
    expect(template).toContain('attributeFilter: ["data-state", "hidden", "aria-hidden", "lang", "data-response-annotation-conversation", "data-content-search-unit-key"]')
    expect(template).toContain('[data-local-conversation-item-target-ids]')
    expect(template).toContain('ensureToolActivityBubbles()')
    expect(template).toContain('clearToolActivityBubbles()')
    expect(template).not.toContain('const builtinGlyphs = {')
    for (const action of HOME_ACTIONS) expect(template).not.toContain(action.label)
  })

  it('shares the home layout stylesheet with the Studio preview', async () => {
    const [layoutCss, rendererEntry, studio, codexService] = await Promise.all([
      readFile(join(process.cwd(), 'resources', 'shared', 'dream-home-layout.css'), 'utf8'),
      readFile(join(process.cwd(), 'src', 'renderer', 'src', 'main.tsx'), 'utf8'),
      readFile(join(process.cwd(), 'src', 'renderer', 'src', 'App.tsx'), 'utf8'),
      readFile(join(process.cwd(), 'src', 'main', 'codex-service.ts'), 'utf8')
    ])

    expect(layoutCss).toContain('.dream-layout-root')
    expect(layoutCss).toContain('.dream-heading')
    expect(layoutCss).toContain('.dream-heading-decoration')
    expect(layoutCss).toContain('font-family: var(--dream-font-home-heading)')
    expect(layoutCss).toContain('font-family: var(--dream-font-home-subtitle)')
    expect(layoutCss).not.toContain('.dream-layout-root::after')
    expect(layoutCss).toContain('.dream-action-grid')
    expect(layoutCss).toContain('.dream-composer')
    expect(layoutCss).toContain('.dream-project-proxy')
    expect(layoutCss).toContain('.dream-native-suggestions')
    expect(layoutCss).toContain('[data-testid="home-icon"]')
    expect(layoutCss).toContain('.dream-home-flow')
    expect(layoutCss).toContain('.dream-home .dream-home-voice-promo')
    expect(layoutCss).toMatch(/main\.main-surface\.dream-home-shell \.app-shell-main-content-top-fade\s*\{[^}]*display:\s*none !important/)
    expect(layoutCss).toMatch(/\.dream-home-flow\s*\{[^}]*align-items:\s*stretch !important/)
    expect(layoutCss).toMatch(/\.dream-home-flow\s*\{[^}]*padding:\s*15px 0 20px !important/)
    expect(layoutCss).toMatch(/\.dream-home-flow > \.dream-layout-root\s*\{[^}]*align-self:\s*center !important/)
    expect(layoutCss).toContain('flex: 0 0 390px !important')
    expect(layoutCss).toContain('@media (min-width: 901px) and (max-height: 760px)')
    expect(layoutCss).toContain('.codex-preview .dream-layout-root')
    expect(layoutCss).toContain('flex-basis: 330px !important')
    expect(layoutCss).not.toContain('.dream-home > div:first-child')
    const heroMediaRule = layoutCss.match(/\.dream-home \.dream-layout-root > :is\(\.dream-hero-image, \.dream-hero-video\)\s*\{[^}]+\}/)?.[0]
    expect(heroMediaRule).toContain('position: absolute !important')
    expect(heroMediaRule).toContain('width: 100% !important')
    expect(heroMediaRule).toContain('height: 100% !important')
    expect(rendererEntry).toContain("dream-home-layout.css")
    expect(studio).toContain('HOME_ACTIONS_BY_LOCALE[contentLocale]')
    expect(studio).toContain('homeActions.map')
    expect(codexService).toContain("dream-home-layout.css")
    expect(codexService).toContain('actionsByLocale: HOME_ACTIONS_BY_LOCALE')
  })

  it('keeps legacy home layout rules out of the base theme', async () => {
    const css = await readFile(join(process.cwd(), 'resources', 'shared', 'dream-skin.css'), 'utf8')
    expect(css).not.toContain('.dream-home .dream-hero')
    expect(css).not.toContain('.dream-action-grid')
    expect(css).not.toContain('.dream-home .dream-composer')
  })

  it('centers themed project icons and removes the native negative left offset', async () => {
    const css = await readFile(join(process.cwd(), 'resources', 'shared', 'dream-skin.css'), 'utf8')
    const hostRule = css.match(/\.dream-sidebar-project-icon\s*\{[^}]+\}/)?.[0]
    const iconRule = css.match(/\.dream-sidebar-project-icon > \.dream-sidebar-project-icon-image\s*\{[^}]+\}/)?.[0]
    expect(hostRule).toContain('margin-left: 0 !important')
    expect(iconRule).toContain('top: 50%')
    expect(iconRule).toContain('left: 50%')
    expect(iconRule).toContain('transform: translate(-50%, -50%)')
    expect(iconRule).toContain('object-fit: contain')
    expect(css).not.toContain('--dream-sidebar-project-icon-mask')
    expect(css).not.toContain('--dream-sidebar-session-icon-mask')
  })

  it('maps native menu highlighting to hover colors instead of selected colors', async () => {
    const css = await readFile(join(process.cwd(), 'resources', 'shared', 'dream-skin.css'), 'utf8')
    const baseRule = css.match(/\.dream-account-menu \[data-dream-account-menu-item\]\s*\{[^}]+\}/)?.[0]
    const hoverRule = css.match(/\[data-dream-account-menu-item\]:is\(:hover, \[data-highlighted\]\)\s*\{[^}]+\}/)?.[0]
    const selectedRule = css.match(/\[data-dream-account-menu-item\]:is\(\[aria-selected="true"\], \[data-state="checked"\], \[data-state="open"\], :focus-visible\)\s*,?[\s\S]*?\{[^}]+\}/)?.[0]
    expect(baseRule).not.toContain('--dream-account-row-hover-text:')
    expect(baseRule).not.toContain('--dream-account-row-hover-background:')
    expect(hoverRule).toContain('var(--dream-account-row-hover-text, var(--dream-global-text))')
    expect(hoverRule).toContain('var(--dream-account-row-hover-background, transparent)')
    expect(selectedRule).toContain('var(--dream-account-row-selected-text, var(--dream-global-text))')
    expect(selectedRule).not.toContain('[data-highlighted]')
  })

  it('keeps the account menu media below row states without changing menu layout', async () => {
    const css = await readFile(join(process.cwd(), 'resources', 'shared', 'dream-skin.css'), 'utf8')
    const mediaRule = css.match(/\.dream-account-menu > \.dream-account-menu-background\s*\{[^}]+\}/)?.[0]
    const contentRule = css.match(/\.dream-account-menu > :not\(\.dream-account-menu-background\)\s*\{[^}]+\}/)?.[0]
    expect(mediaRule).toContain('position: absolute')
    expect(mediaRule).toContain('object-fit: cover')
    expect(mediaRule).toContain('pointer-events: none')
    expect(contentRule).toContain('z-index: 1')
    expect(css).toMatch(/\.dream-account-menu\s*\{[^}]*isolation:\s*isolate/)
    expect(css).not.toMatch(/\.dream-account-menu\s*\{[^}]*width:/)
    expect(css).not.toMatch(/\.dream-account-menu\s*\{[^}]*height:/)
  })

  it('keeps an open sidebar menu trigger fixed while its popover is anchored', async () => {
    const css = await readFile(join(process.cwd(), 'resources', 'shared', 'dream-skin.css'), 'utf8')
    const triggerRule = css.match(/aside\.app-shell-left-panel button\[aria-haspopup="menu"\]\[aria-expanded="true"\]\s*\{[^}]+\}/)?.[0]
    expect(triggerRule).toContain('transform: none !important')
  })

  it('reports the watcher injection count after startup', async () => {
    const codexService = await readFile(join(process.cwd(), 'src', 'main', 'codex-service.ts'), 'utf8')
    expect(codexService).toContain('const snapshot = await this.replaceWatcher')
    expect(codexService).toContain("localizedMessage('主题已注入 {count} 个 Codex 页面', { count: snapshot.targetCount })")
    expect(codexService).not.toContain("localizedMessage('主题已注入 {count} 个 Codex 页面', { count: result.targetCount })")
  })

  it('keeps the custom polaroid surface transparent and leaves shadow styling configurable', async () => {
    const css = await readFile(join(process.cwd(), 'resources', 'shared', 'dream-skin.css'), 'utf8')
    const rule = css.match(/\.dream-polaroid\s*\{[^}]+\}/)?.[0]
    const surfaceRule = css.match(/\.dream-polaroid-surface\s*\{[^}]+\}/)?.[0]
    const shadowRule = css.match(/\.dream-polaroid-shadow\s*\{[^}]+\}/)?.[0]

    expect(rule).toContain('overflow: visible')
    expect(rule).toContain('display: block')
    expect(css).not.toContain('#codex-dream-skin-chrome.dream-home-shell .dream-polaroid')
    expect(surfaceRule).toContain('background-color: transparent !important')
    expect(shadowRule).toContain('filter: var(--dream-polaroid-shadow-filter, none)')
  })

  it('keeps runtime particles above media and bubble frames while preserving text layering', async () => {
    const [template, particleCss, skinCss, homeLayoutCss] = await Promise.all([
      readFile(join(process.cwd(), 'resources', 'shared', 'renderer-inject.js'), 'utf8'),
      readFile(join(process.cwd(), 'resources', 'shared', 'dream-particle-effects.css'), 'utf8'),
      readFile(join(process.cwd(), 'resources', 'shared', 'dream-skin.css'), 'utf8'),
      readFile(join(process.cwd(), 'resources', 'shared', 'dream-home-layout.css'), 'utf8')
    ])

    expect(template).toContain('const particleParent = root instanceof HTMLElement ? root : document.body')
    expect(template).toContain('if (host.parentElement !== particleParent) particleParent.appendChild(host)')
    expect(particleCss).toMatch(/\.dream-particle-layer\s*\{[^}]*z-index:\s*2;/)
    expect(particleCss).toContain('pointer-events: none')
    expect(skinCss).toMatch(/\.dream-conversation-viewport\s*\{[^}]*isolation:\s*auto !important/)
    expect(skinCss).toMatch(/\.dream-conversation-viewport\s*\{[^}]*content-visibility:\s*visible !important/)
    expect(skinCss).toMatch(/:not\(#codex-dream-skin-particle-layer\):is\(main, \.isolate\):has\(\.dream-conversation-viewport\)[\s\S]*?isolation:\s*auto !important/)
    expect(skinCss).toMatch(/:not\(#codex-dream-skin-particle-layer\)\[style\*="transform"\]:has\(\.dream-conversation-tool-bubble\)\s*\{[^}]*transform:\s*none !important/)
    expect(skinCss).toMatch(/\.dream-conversation-surface\s*\{[^}]*z-index:\s*auto !important/)
    expect(skinCss).toMatch(/\.dream-conversation-user-bubble::before[\s\S]*?\{\s*z-index:\s*1;/)
    expect(skinCss).toContain('dream-conversation-tool-bubble) > *')
    expect(skinCss).toContain('z-index: 3;')
    expect(homeLayoutCss).toMatch(/\.dream-layout-root\s*\{[^}]*isolation:\s*auto;/)
    expect(homeLayoutCss).toMatch(/\.dream-composer\s*\{[^}]*z-index:\s*3;/)
    expect(homeLayoutCss).toMatch(/\.dream-project-bar\s*\{[^}]*z-index:\s*3;/)
  })
})
