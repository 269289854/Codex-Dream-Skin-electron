import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_BRAND_COPY, DEFAULT_HOME_COPY, HOME_ACTIONS } from '../src/shared/home-layout'

describe('renderer injection template', () => {
  it('produces valid JavaScript with no unresolved markers', async () => {
    const template = await readFile(join(process.cwd(), 'resources', 'windows', 'renderer-inject.js'), 'utf8')
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
    expect(template).not.toContain('const builtinGlyphs = {')
    for (const action of HOME_ACTIONS) expect(template).not.toContain(action.label)
  })

  it('shares the home layout stylesheet with the Studio preview', async () => {
    const [layoutCss, rendererEntry, studio, codexService] = await Promise.all([
      readFile(join(process.cwd(), 'resources', 'windows', 'dream-home-layout.css'), 'utf8'),
      readFile(join(process.cwd(), 'src', 'renderer', 'src', 'main.tsx'), 'utf8'),
      readFile(join(process.cwd(), 'src', 'renderer', 'src', 'App.tsx'), 'utf8'),
      readFile(join(process.cwd(), 'src', 'main', 'codex-service.ts'), 'utf8')
    ])

    expect(layoutCss).toContain('.dream-layout-root')
    expect(layoutCss).toContain('.dream-heading')
    expect(layoutCss).toContain('.dream-action-grid')
    expect(layoutCss).toContain('.dream-composer')
    expect(layoutCss).toContain('.dream-project-proxy')
    expect(layoutCss).toContain('.dream-native-suggestions')
    expect(layoutCss).toContain('[data-testid="home-icon"]')
    const heroMediaRule = layoutCss.match(/\.dream-home \.dream-layout-root > :is\(\.dream-hero-image, \.dream-hero-video\)\s*\{[^}]+\}/)?.[0]
    expect(heroMediaRule).toContain('position: absolute !important')
    expect(heroMediaRule).toContain('width: 100% !important')
    expect(heroMediaRule).toContain('height: 100% !important')
    expect(rendererEntry).toContain("dream-home-layout.css")
    expect(studio).toContain('HOME_ACTIONS.map')
    expect(codexService).toContain("dream-home-layout.css")
    expect(codexService).toContain('actions: HOME_ACTIONS')
  })

  it('keeps legacy home layout rules out of the base theme', async () => {
    const css = await readFile(join(process.cwd(), 'resources', 'windows', 'dream-skin.css'), 'utf8')
    expect(css).not.toContain('.dream-home .dream-hero')
    expect(css).not.toContain('.dream-action-grid')
    expect(css).not.toContain('.dream-home .dream-composer')
  })

  it('reports the watcher injection count after startup', async () => {
    const codexService = await readFile(join(process.cwd(), 'src', 'main', 'codex-service.ts'), 'utf8')
    expect(codexService).toContain('const snapshot = await this.replaceWatcher')
    expect(codexService).toContain('主题已注入 ${snapshot.targetCount} 个 Codex 页面')
    expect(codexService).not.toContain('主题已注入 ${result.targetCount} 个 Codex 页面')
  })

  it('keeps the custom polaroid surface transparent and leaves shadow styling configurable', async () => {
    const css = await readFile(join(process.cwd(), 'resources', 'windows', 'dream-skin.css'), 'utf8')
    const rule = css.match(/\.dream-polaroid\s*\{[^}]+\}/)?.[0]
    const surfaceRule = css.match(/\.dream-polaroid-surface\s*\{[^}]+\}/)?.[0]
    const shadowRule = css.match(/\.dream-polaroid-shadow\s*\{[^}]+\}/)?.[0]

    expect(rule).toContain('overflow: visible')
    expect(rule).toContain('display: block')
    expect(css).not.toContain('#codex-dream-skin-chrome.dream-home-shell .dream-polaroid')
    expect(surfaceRule).toContain('background-color: transparent !important')
    expect(shadowRule).toContain('filter: var(--dream-polaroid-shadow-filter, none)')
  })
})
