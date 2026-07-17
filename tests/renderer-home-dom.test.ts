import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Window } from 'happy-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { DEFAULT_BRAND_COPY, DEFAULT_HOME_COPY, HOME_ACTION_FALLBACK_BUILTINS, HOME_ACTIONS } from '../src/shared/home-layout'
import { BUILTIN_ICON_GLYPHS } from '../src/shared/icon-glyphs'

let template = ''
const themeId = '11111111-1111-4111-8111-111111111111'
const windows: Window[] = []

beforeAll(async () => {
  template = await readFile(join(process.cwd(), 'resources', 'windows', 'renderer-inject.js'), 'utf8')
})

afterEach(() => {
  for (const window of windows.splice(0)) {
    const state = (window as unknown as Record<string, { cleanup?: () => void }>).__CODEX_DREAM_SKIN_STATE__
    state?.cleanup?.()
    window.close()
  }
  vi.restoreAllMocks()
})

function createWindow(): Window {
  const window = new Window({ url: 'app://-/index.html' })
  windows.push(window)
  Object.defineProperty(window.HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value() {
      return { x: 0, y: 0, top: 0, left: 0, right: 1000, bottom: 700, width: 1000, height: 700, toJSON: () => ({}) }
    }
  })
  Object.defineProperty(window.URL, 'createObjectURL', { configurable: true, value: () => 'blob:dream-art' })
  Object.defineProperty(window.URL, 'revokeObjectURL', { configurable: true, value: () => undefined })
  return window
}

function homeFixture(projectName: string, nativeHeadingButton = false): string {
  const nativeHeading = nativeHeadingButton
    ? `<span class="group/title">我们应该在 <button type="button">${projectName}</button> 中构建什么？</span>`
    : '<span class="group/title">我们该构建什么？</span>'
  return `
    <aside class="app-shell-left-panel">
      <button type="button" aria-label="切换模式：Codex">Codex</button>
      <header>Sidebar header</header>
      <button type="button" aria-label="搜索">Search</button>
      <button type="button" data-project-id="sample">Project</button>
      <button type="button" data-task-id="sample">Task</button>
      <footer><span data-testid="team-avatar">DT</span></footer>
    </aside>
    <main class="main-surface">
      <div role="main">
        <div class="home-page">
          <div class="hero-row">
            <div class="hero-host">
              <div class="heading-shell"><div class="heading-region flex-col">
                <button type="button" data-testid="home-icon">home icon</button>
                <div data-feature="game-source">${nativeHeading}</div>
              </div></div>
              <div data-home-ambient-suggestions="true">native suggestions</div>
            </div>
          </div>
          <div class="composer-row">
            <div class="project-bar"><div class="horizontal-scroll-fade-mask">
              <button type="button" data-composer-navigation-target="workspace-project">${projectName}</button>
            </div></div>
            <div class="composer-surface-chrome"><div class="ProseMirror" contenteditable="true"></div></div>
          </div>
        </div>
      </div>
    </main>`
}

function inject(window: Window, icons: Record<string, { name?: string; dataUrl?: string }> = {
  cardPrimary: { name: 'wand-sparkles' },
  cardSecondary: { name: 'image' },
  decoration: { name: 'heart' }
}, copy: Record<string, string> = { ...DEFAULT_HOME_COPY, ...DEFAULT_BRAND_COPY }, cssText = '.dream-layout-root { display: block; }'): void {
  const payload = template
    .replace('__DREAM_VERSION_JSON__', JSON.stringify('dom-test'))
    .replace('__DREAM_CSS_JSON__', JSON.stringify(cssText))
    .replace('__DREAM_ART_JSON__', JSON.stringify('data:image/png;base64,AA=='))
    .replace('__DREAM_CONFIG_JSON__', JSON.stringify({
      themeId,
      icons,
      builtinGlyphs: BUILTIN_ICON_GLYPHS,
      actionFallbackBuiltins: HOME_ACTION_FALLBACK_BUILTINS,
      copy: { ...copy, parts: { before: '我们应该在 ', after: ' 中构建什么？' } },
      actions: HOME_ACTIONS
    }))
  window.eval(payload)
}

function stateOf(window: Window): { ensure: () => void; cleanup: () => void; takePlacementUpdate: () => unknown } {
  const state = (window as unknown as Record<string, { ensure: () => void; cleanup: () => void; takePlacementUpdate: () => unknown } | undefined>).__CODEX_DREAM_SKIN_STATE__
  if (!state) throw new Error('Renderer injection state was not installed.')
  return state
}

describe('renderer home DOM adaptation', () => {
  it('renders brand copy as text and keeps the sidebar mode icon idempotent and removable', () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('Sample-Project')
    const title = '<img src=x onerror=alert(1)> 初音未来'
    inject(window, {
      sidebarMode: { dataUrl: 'data:image/png;base64,AA==' },
      branding: { name: 'sparkles' }
    }, {
      ...DEFAULT_HOME_COPY,
      brandTitle: title,
      brandSubtitle: '自定义品牌副标题',
      brandSignature: 'MIKU TEST'
    })

    const modeButton = window.document.querySelector('aside.app-shell-left-panel button')
    expect(modeButton?.classList.contains('dream-sidebar-mode-button')).toBe(true)
    expect(modeButton?.querySelector('.dream-sidebar-mode-icon img')?.getAttribute('src')).toBe('data:image/png;base64,AA==')
    expect(window.document.querySelector('.dream-brand b')?.textContent).toBe(title)
    expect(window.document.querySelector('.dream-brand b img')).toBeNull()
    expect(window.document.querySelector('.dream-brand small')?.textContent).toBe('自定义品牌副标题')
    expect(window.document.querySelector('.dream-signature')?.textContent).toBe('MIKU TEST')
    expect(window.document.querySelector('aside header')?.classList.contains('dream-sidebar-header')).toBe(true)
    expect(window.document.querySelector('button[aria-label="搜索"]')?.classList.contains('dream-sidebar-search-button')).toBe(true)
    expect(window.document.querySelector('[data-project-id]')?.classList.contains('dream-sidebar-project-row')).toBe(true)
    expect(window.document.querySelector('[data-task-id]')?.classList.contains('dream-sidebar-task-row')).toBe(true)
    expect(window.document.querySelector('aside footer')?.classList.contains('dream-sidebar-footer')).toBe(true)
    expect(window.document.querySelector('[data-testid="team-avatar"]')?.classList.contains('dream-sidebar-avatar')).toBe(true)

    stateOf(window).ensure()
    expect(modeButton?.querySelectorAll(':scope > .dream-sidebar-mode-icon')).toHaveLength(1)
    stateOf(window).cleanup()
    expect(modeButton?.classList.contains('dream-sidebar-mode-button')).toBe(false)
    expect(modeButton?.querySelector('.dream-sidebar-mode-icon')).toBeNull()
    expect(window.document.querySelector('.dream-sidebar-project-row')).toBeNull()
  })

  it('supports the English native mode button label', () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('Sample-Project').replace('切换模式：Codex', 'Switch mode: Codex')
    inject(window, { sidebarMode: { name: 'music' } })

    const icon = window.document.querySelector('aside.app-shell-left-panel .dream-sidebar-mode-icon')
    expect(icon?.textContent).toBe('♫')
  })

  it('drags the polaroid within the shell and exposes the final position once', () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('Sample-Project')
    inject(window)

    const chrome = window.document.getElementById('codex-dream-skin-chrome')
    const polaroid = chrome?.querySelector('.dream-polaroid') as unknown as HTMLElement | null
    if (!chrome || !polaroid) throw new Error('Injected polaroid fixture is missing.')

    Object.defineProperties(polaroid, {
      offsetLeft: { configurable: true, value: 700 },
      offsetTop: { configurable: true, value: 120 },
      offsetWidth: { configurable: true, value: 200 },
      offsetHeight: { configurable: true, value: 240 }
    })
    let capturedPointer: number | null = null
    polaroid.setPointerCapture = (pointerId: number) => { capturedPointer = pointerId }
    polaroid.hasPointerCapture = (pointerId: number) => capturedPointer === pointerId
    polaroid.releasePointerCapture = () => { capturedPointer = null }

    const pointer = (clientX: number, clientY: number): PointerEvent => ({
      button: 0,
      pointerId: 7,
      clientX,
      clientY,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    }) as unknown as PointerEvent

    polaroid.onpointerdown?.(pointer(720, 140))
    expect(capturedPointer).toBe(7)
    polaroid.onpointermove?.(pointer(1200, 900))
    polaroid.onpointerup?.(pointer(1200, 900))

    expect(polaroid.style.getPropertyValue('left')).toBe('80%')
    expect(Number.parseFloat(polaroid.style.getPropertyValue('top'))).toBeCloseTo(460 / 700 * 100)
    const update = stateOf(window).takePlacementUpdate()
    expect(update).toEqual({ themeId, x: 0.8, y: 460 / 700 })
    expect(stateOf(window).takePlacementUpdate()).toBeNull()
    expect(capturedPointer).toBeNull()
    expect(polaroid.classList.contains('dream-polaroid-dragging')).toBe(false)
  })

  it('creates a synchronized clickable project proxy for long project names', () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('Codex-Dream-Skin-electron')
    const sourceButton = window.document.querySelector('[data-composer-navigation-target="workspace-project"]')
    if (!sourceButton) throw new Error('Project selector fixture is missing.')
    const click = vi.fn()
    sourceButton.addEventListener('click', click)

    inject(window)

    const proxy = window.document.getElementById('codex-dream-skin-project-proxy')
    if (!proxy) throw new Error('Project proxy was not created.')
    expect(proxy.textContent).toBe('Codex-Dream-Skin-electron')
    expect(window.document.querySelector('[role="main"]')?.classList.contains('dream-home')).toBe(true)
    expect(window.document.querySelector('.hero-row')?.classList.contains('dream-layout-root')).toBe(true)
    expect(window.document.querySelector('[data-home-ambient-suggestions]')?.classList.contains('dream-native-suggestions')).toBe(true)
    expect(window.document.querySelectorAll('.dream-action-card')).toHaveLength(HOME_ACTIONS.length)
    expect([...window.document.querySelectorAll('.dream-action-icon')].map((node) => node.textContent)).toEqual(HOME_ACTIONS.map((action) => action.icon))
    expect([...window.document.querySelectorAll('.dream-action-heart')].map((node) => node.textContent)).toEqual(['♥', '♥', '♥', '♥'])

    proxy.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    expect(click).toHaveBeenCalledTimes(1)

    sourceButton.textContent = 'Renamed-Project'
    stateOf(window).ensure()
    stateOf(window).ensure()
    expect(proxy.textContent).toBe('Renamed-Project')
    expect(window.document.querySelectorAll('#codex-dream-skin-project-proxy')).toHaveLength(1)
    expect(window.document.querySelectorAll('#codex-dream-skin-actions')).toHaveLength(1)
  })

  it('reuses a native heading project button when Codex renders one', () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('ShortProject', true)

    inject(window)

    const headingButton = window.document.querySelector('[data-feature="game-source"] button')
    expect(headingButton?.classList.contains('dream-project-selector')).toBe(true)
    expect(window.document.getElementById('codex-dream-skin-project-proxy')).toBeNull()
    expect(window.document.querySelectorAll('.dream-action-card')).toHaveLength(HOME_ACTIONS.length)
  })

  it('keeps a custom card image above the default action glyph', () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('Sample-Project')

    inject(window, {
      cardPrimary: { dataUrl: 'data:image/png;base64,AA==' },
      cardSecondary: { name: 'image' },
      decoration: { name: 'heart' }
    })

    const icons = window.document.querySelectorAll('.dream-action-icon')
    expect(icons[0]?.querySelector('.dream-custom-icon')?.getAttribute('src')).toBe('data:image/png;base64,AA==')
    expect([...icons].slice(1).map((node) => node.textContent)).toEqual(['+', '✓', '✦'])
  })

  it('cleans the custom layout when the page stops matching the home contract', () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('Codex-Dream-Skin-electron')
    inject(window)

    window.document.querySelector('.composer-surface-chrome')?.remove()
    stateOf(window).ensure()

    expect(window.document.querySelector('.dream-home')).toBeNull()
    expect(window.document.querySelector('.dream-layout-root')).toBeNull()
    expect(window.document.querySelector('.dream-native-suggestions')).toBeNull()
    expect(window.document.getElementById('codex-dream-skin-project-proxy')).toBeNull()
    expect(window.document.getElementById('codex-dream-skin-actions')).toBeNull()
  })

  it('leaves non-home and incomplete DOM structures untouched', () => {
    const window = createWindow()
    window.document.body.innerHTML = `
      <main class="main-surface"><div role="main">
        <div data-feature="game-source"><span>Thread heading</span></div>
        <div class="composer-surface-chrome"></div>
      </div></main>`

    inject(window)

    expect(window.document.querySelector('.dream-home')).toBeNull()
    expect(window.document.querySelector('.dream-heading')).toBeNull()
    expect(window.document.getElementById('codex-dream-skin-actions')).toBeNull()
  })

  it('keeps conversation injection idempotent and removes gradient and font styles during cleanup', () => {
    const window = createWindow()
    window.document.body.innerHTML = '<main class="main-surface"><div role="main"><article data-message-author-role="assistant">Reply</article><div class="composer-surface-chrome"><div class="ProseMirror" contenteditable="true"></div></div></div></main>'
    const css = ':root.codex-dream-skin { --dream-canvas: linear-gradient(90deg, red, blue); --dream-font-ui: "Dream Imported font-used"; } @font-face { font-family: "Dream Imported font-used"; src: url("data:font/woff2;base64,d09GMg=="); font-display: swap; }'
    inject(window, {}, { ...DEFAULT_HOME_COPY, ...DEFAULT_BRAND_COPY }, css)

    expect(window.document.querySelectorAll('#codex-dream-skin-style')).toHaveLength(1)
    expect(window.document.getElementById('codex-dream-skin-style')?.textContent).toContain('linear-gradient(90deg, red, blue)')
    expect(window.document.getElementById('codex-dream-skin-style')?.textContent).toContain('font-display: swap')
    expect(window.document.querySelector('.dream-home')).toBeNull()
    stateOf(window).ensure()
    stateOf(window).ensure()
    expect(window.document.querySelectorAll('#codex-dream-skin-style')).toHaveLength(1)

    stateOf(window).cleanup()
    expect(window.document.getElementById('codex-dream-skin-style')).toBeNull()
    expect(window.document.documentElement.classList.contains('codex-dream-skin')).toBe(false)
  })

  it('falls back without partial layout when the project selector contract drifts', () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('Codex-Dream-Skin-electron')
    window.document.querySelector('[data-composer-navigation-target="workspace-project"]')?.removeAttribute('data-composer-navigation-target')

    inject(window)

    expect(window.document.querySelector('.dream-home')).toBeNull()
    expect(window.document.querySelector('.dream-heading')).toBeNull()
    expect(window.document.querySelector('.dream-layout-root')).toBeNull()
    expect(window.document.getElementById('codex-dream-skin-project-proxy')).toBeNull()
    expect(window.document.getElementById('codex-dream-skin-actions')).toBeNull()
  })

  it('removes every injected home node and class during cleanup', () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('Codex-Dream-Skin-electron')
    inject(window)

    stateOf(window).cleanup()

    expect(window.document.documentElement.classList.contains('codex-dream-skin')).toBe(false)
    expect(window.document.querySelector('.dream-home')).toBeNull()
    expect(window.document.querySelector('.dream-heading')).toBeNull()
    expect(window.document.querySelector('.dream-native-suggestions')).toBeNull()
    expect(window.document.getElementById('codex-dream-skin-project-proxy')).toBeNull()
    expect(window.document.getElementById('codex-dream-skin-actions')).toBeNull()
  })
})
