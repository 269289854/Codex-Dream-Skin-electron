import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Window } from 'happy-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { DEFAULT_HOME_COPY, HOME_ACTIONS } from '../src/shared/home-layout'

let template = ''
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

function inject(window: Window): void {
  const payload = template
    .replace('__DREAM_VERSION_JSON__', JSON.stringify('dom-test'))
    .replace('__DREAM_CSS_JSON__', JSON.stringify('.dream-layout-root { display: block; }'))
    .replace('__DREAM_ART_JSON__', JSON.stringify('data:image/png;base64,AA=='))
    .replace('__DREAM_CONFIG_JSON__', JSON.stringify({
      icons: {},
      copy: { ...DEFAULT_HOME_COPY, parts: { before: '我们应该在 ', after: ' 中构建什么？' } },
      actions: HOME_ACTIONS
    }))
  window.eval(payload)
}

function stateOf(window: Window): { ensure: () => void; cleanup: () => void } {
  const state = (window as unknown as Record<string, { ensure: () => void; cleanup: () => void } | undefined>).__CODEX_DREAM_SKIN_STATE__
  if (!state) throw new Error('Renderer injection state was not installed.')
  return state
}

describe('renderer home DOM adaptation', () => {
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
