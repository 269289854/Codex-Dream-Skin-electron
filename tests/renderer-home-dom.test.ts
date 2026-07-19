import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Window } from 'happy-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { PARTICLE_EFFECT_IDS, PARTICLE_VIEWPORT_TOP, createSparkleParticles, particleEffectIconSlot, type SparkleParticle } from '../src/shared/particle-effects'
import { DEFAULT_BRAND_COPY, DEFAULT_HOME_COPY, HOME_ACTION_FALLBACK_BUILTINS, HOME_ACTIONS } from '../src/shared/home-layout'
import { BUILTIN_ICON_GLYPHS } from '../src/shared/icon-glyphs'
import { createDefaultTheme, type ThemeProfile } from '../src/shared/theme'

let template = ''
let particleEffectsCss = ''
let previewParticleEffectsCss = ''
const themeId = '11111111-1111-4111-8111-111111111111'
const windows: Window[] = []
const defaultProfile = createDefaultTheme(themeId)
const defaultDecorations = defaultProfile.decorations

beforeAll(async () => {
  ;[template, particleEffectsCss, previewParticleEffectsCss] = await Promise.all([
    readFile(join(process.cwd(), 'resources', 'windows', 'renderer-inject.js'), 'utf8'),
    readFile(join(process.cwd(), 'resources', 'windows', 'dream-particle-effects.css'), 'utf8'),
    readFile(join(process.cwd(), 'src', 'renderer', 'src', 'particle-effects.css'), 'utf8')
  ])
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
      <div data-app-action-sidebar-thread-row="" aria-current="page" class="bg-token-list-hover-background"><span data-thread-title="true">Current task</span></div>
      <div data-app-action-sidebar-thread-row=""><span data-thread-title="true">Other task</span></div>
      <footer><span data-testid="team-avatar">DT</span></footer>
      <nav aria-label="primary">
        <div class="native-new-task-row"><a aria-current="page" href="#new"><span>新建任务</span></a><button type="button" aria-label="新建任务">+</button></div>
        <a href="#pull"><span>拉取请求</span></a>
      </nav>
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
            <div class="composer-surface-chrome">
              <div class="ProseMirror" contenteditable="true"></div>
              <button type="button" aria-label="发送" class="size-token-button-composer rounded-full bg-token-foreground"><svg viewBox="0 0 20 20" width="20" height="20"><path d="M10 16V4"></path></svg></button>
            </div>
          </div>
        </div>
      </div>
    </main>`
}

function inject(window: Window, icons: Record<string, { name?: string; dataUrl?: string }> = {
  cardPrimary: { name: 'wand-sparkles' },
  cardSecondary: { name: 'image' },
  decoration: { name: 'heart' },
  backgroundSparkle: { name: 'sparkles' }
}, copy: Record<string, string> = { ...DEFAULT_HOME_COPY, ...DEFAULT_BRAND_COPY }, cssText = '.dream-layout-root { display: block; }', composerBadge: { visible: boolean } = { visible: true }, decorations: ThemeProfile['decorations'] = defaultDecorations, sparkleParticles: SparkleParticle[] = createSparkleParticles(decorations.sparkles), media: { hero: { kind: 'image' | 'video'; transform: ThemeProfile['hero']['mediaTransform'] } | null; polaroid: { kind: 'image' | 'video'; transform: ThemeProfile['polaroid']['mediaTransform'] } | null } = { hero: null, polaroid: null }): void {
  const payload = template
    .replace('__DREAM_VERSION_JSON__', JSON.stringify('dom-test'))
    .replace('__DREAM_CSS_JSON__', JSON.stringify(cssText))
    .replace('__DREAM_ART_JSON__', JSON.stringify('data:image/png;base64,AA=='))
    .replace('__DREAM_CONFIG_JSON__', JSON.stringify({
      themeId,
      media,
      icons,
      composerBadge,
      decorations,
      particleViewportTop: PARTICLE_VIEWPORT_TOP,
      sparkleIconSlot: particleEffectIconSlot(decorations.sparkles.effect),
      sparkleParticles,
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
    const activeThreadRow = window.document.querySelector('[data-app-action-sidebar-thread-row]')
    expect(activeThreadRow?.classList.contains('dream-sidebar-task-row')).toBe(true)
    expect(activeThreadRow?.classList.contains('dream-sidebar-task-row-selected')).toBe(true)
    const otherThreadRow = window.document.querySelectorAll('[data-app-action-sidebar-thread-row]')[1]
    expect(otherThreadRow?.classList.contains('dream-sidebar-task-row')).toBe(true)
    expect(otherThreadRow?.classList.contains('dream-sidebar-task-row-selected')).toBe(false)
    expect(window.document.querySelector('aside footer')?.classList.contains('dream-sidebar-footer')).toBe(true)
    expect(window.document.querySelector('[data-testid="team-avatar"]')?.classList.contains('dream-sidebar-avatar')).toBe(true)
    const newTaskRow = window.document.querySelector('.native-new-task-row')
    expect(newTaskRow?.classList.contains('dream-sidebar-new-task-row')).toBe(true)
    expect(newTaskRow?.classList.contains('dream-sidebar-new-task-row-selected')).toBe(true)

    activeThreadRow?.removeAttribute('aria-current')
    activeThreadRow?.classList.remove('bg-token-list-hover-background')
    stateOf(window).ensure()
    expect(activeThreadRow?.classList.contains('dream-sidebar-task-row-selected')).toBe(false)
    expect(modeButton?.querySelectorAll(':scope > .dream-sidebar-mode-icon')).toHaveLength(1)
    stateOf(window).cleanup()
    expect(modeButton?.classList.contains('dream-sidebar-mode-button')).toBe(false)
    expect(modeButton?.querySelector('.dream-sidebar-mode-icon')).toBeNull()
    expect(window.document.querySelector('.dream-sidebar-project-row')).toBeNull()
    expect(newTaskRow?.classList.contains('dream-sidebar-new-task-row')).toBe(false)
    expect(activeThreadRow?.classList.contains('dream-sidebar-task-row')).toBe(false)
    expect(activeThreadRow?.classList.contains('dream-sidebar-task-row-selected')).toBe(false)
    expect(otherThreadRow?.classList.contains('dream-sidebar-task-row')).toBe(false)
    expect(otherThreadRow?.classList.contains('dream-sidebar-task-row-selected')).toBe(false)
  })

  it('supports the English native mode button label', () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('Sample-Project').replace('切换模式：Codex', 'Switch mode: Codex')
    inject(window, { sidebarMode: { name: 'music' } })

    const icon = window.document.querySelector('aside.app-shell-left-panel .dream-sidebar-mode-icon')
    expect(icon?.textContent).toBe('♫')
  })

  it('marks the real project folder row without marking its action buttons', () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('Sample-Project')
    window.document.querySelector('aside')?.insertAdjacentHTML('beforeend', `
      <div data-app-action-sidebar-section-heading="Projects">
        <div role="listitem" data-sidebar-project-kind="local">
          <span><div role="button" class="group/folder-row">Project folder</div></span>
          <button type="button" aria-label="项目设置">...</button>
        </div>
      </div>`)
    inject(window)

    const projectRow = window.document.querySelector('[data-sidebar-project-kind] [role="button"]')
    const projectAction = window.document.querySelector('[data-sidebar-project-kind] button[aria-label="项目设置"]')
    expect(projectRow?.classList.contains('dream-sidebar-project-row')).toBe(true)
    expect(projectAction?.classList.contains('dream-sidebar-project-row')).toBe(false)
  })

  it('drags the polaroid within the shell and exposes the final position once', () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('Sample-Project')
    inject(window)

    const chrome = window.document.getElementById('codex-dream-skin-chrome')
    const polaroid = chrome?.querySelector('.dream-polaroid') as unknown as HTMLElement | null
    if (!chrome || !polaroid) throw new Error('Injected polaroid fixture is missing.')
    expect(polaroid.querySelectorAll(':scope > .dream-polaroid-shadow')).toHaveLength(1)
    expect(polaroid.querySelectorAll(':scope > .dream-polaroid-shadow > .dream-polaroid-surface')).toHaveLength(1)
    expect(polaroid.querySelector('.dream-polaroid-pin')?.parentElement).toBe(polaroid)

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

  it('renders one configurable composer badge and removes it during cleanup', () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('Sample-Project')
    inject(window, { composerBadge: { dataUrl: 'data:image/png;base64,AA==' } })

    const composer = window.document.querySelector('.composer-surface-chrome')
    expect(composer?.querySelectorAll(':scope > .dream-composer-badge')).toHaveLength(1)
    expect(composer?.querySelector('.dream-composer-badge .dream-custom-icon')?.getAttribute('src')).toBe('data:image/png;base64,AA==')
    stateOf(window).ensure()
    expect(composer?.querySelectorAll(':scope > .dream-composer-badge')).toHaveLength(1)

    stateOf(window).cleanup()
    expect(window.document.querySelector('.dream-composer-badge')).toBeNull()
  })

  it('does not create the composer badge when it is hidden', () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('Sample-Project')
    inject(window, {}, undefined, undefined, { visible: false })

    expect(window.document.querySelector('.dream-composer-badge')).toBeNull()
  })

  it('keeps the native send arrow by default and restores native stop state', () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('Sample-Project')
    inject(window, { composer: { name: 'send' } })

    const button = window.document.querySelector('button[aria-label="发送"]') as unknown as HTMLButtonElement | null
    expect(button?.classList.contains('dream-composer-send-button')).toBe(true)
    expect(button?.classList.contains('dream-composer-send-button-customized')).toBe(false)
    expect(button?.querySelector(':scope > svg')).not.toBeNull()
    expect(button?.querySelector('.dream-composer-send-icon')).toBeNull()

    button?.setAttribute('aria-label', '停止')
    stateOf(window).ensure()
    expect(button?.classList.contains('dream-composer-send-button')).toBe(false)
    expect(button?.querySelector(':scope > svg')).not.toBeNull()

    button?.setAttribute('aria-label', '发送')
    stateOf(window).ensure()
    expect(button?.classList.contains('dream-composer-send-button')).toBe(true)
    stateOf(window).cleanup()
    expect(button?.classList.contains('dream-composer-send-button')).toBe(false)
  })

  it('applies configured composer icons idempotently without removing the native icon', () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('Sample-Project')
    inject(window, { composer: { dataUrl: 'data:image/png;base64,AA==' } })

    const button = window.document.querySelector('button[aria-label="发送"]') as unknown as HTMLButtonElement | null
    expect(button?.classList.contains('dream-composer-send-button-customized')).toBe(true)
    expect(button?.querySelector(':scope > svg')).not.toBeNull()
    expect(button?.querySelector('.dream-composer-send-icon img')?.getAttribute('src')).toBe('data:image/png;base64,AA==')
    stateOf(window).ensure()
    expect(button?.querySelectorAll(':scope > .dream-composer-send-icon')).toHaveLength(1)

    stateOf(window).cleanup()
    expect(button?.querySelector('.dream-composer-send-icon')).toBeNull()
    expect(button?.querySelector(':scope > svg')).not.toBeNull()
  })

  it('renders configured multi-color sparkle images idempotently and removes them during cleanup', () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('Sample-Project')
    const decorations = structuredClone(defaultDecorations)
    decorations.sparkles = {
      ...decorations.sparkles,
      count: 3,
      opacity: 0.5,
      glow: 7,
      extraColors: ['rgb(255 0 128 / 60%)', 'oklch(70% 0.18 210)']
    }
    const particles: SparkleParticle[] = [
      { x: 10, y: 20, size: 12, opacity: 0.8, rotation: 5, colorIndex: 0, duration: 3, delay: -1, drift: 4, phase: 0.2, startY: 8 },
      { x: 30, y: 40, size: 18, opacity: 0.6, rotation: 15, colorIndex: 1, duration: 4, delay: -2, drift: -8, phase: 0.5, startY: 17 },
      { x: 50, y: 60, size: 24, opacity: 0.4, rotation: 25, colorIndex: 2, duration: 5, delay: -3, drift: 12, phase: 0.8, startY: 29 }
    ]
    inject(window, { backgroundSparkle: { dataUrl: 'data:image/png;base64,AA==' } }, undefined, undefined, undefined, decorations, particles)

    const sparkleNodes = window.document.querySelectorAll('.dream-sparkles > i')
    const firstSparkle = sparkleNodes[0] as unknown as HTMLElement
    const secondSparkle = sparkleNodes[1] as unknown as HTMLElement
    const thirdSparkle = sparkleNodes[2] as unknown as HTMLElement
    expect(sparkleNodes).toHaveLength(3)
    expect(window.document.querySelector('.dream-sparkles')?.getAttribute('data-dream-effect')).toBe('twinkle')
    expect(firstSparkle.classList.contains('dream-particle')).toBe(true)
    expect(sparkleNodes[0]?.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AA==')
    expect(firstSparkle.style.getPropertyValue('--dream-particle-x')).toBe('10%')
    expect(firstSparkle.style.getPropertyValue('--dream-particle-duration')).toBe('3s')
    expect(firstSparkle.style.getPropertyValue('--dream-particle-delay')).toBe('-1s')
    expect(firstSparkle.style.getPropertyValue('--dream-particle-start-y')).toBe('8%')
    expect(firstSparkle.style.getPropertyValue('--dream-particle-drift')).toBe('4px')
    expect(firstSparkle.style.getPropertyValue('--dream-sparkle-opacity')).toBe('0.4')
    expect(secondSparkle.style.getPropertyValue('--dream-sparkle-color')).toBe('rgb(255 0 128 / 60%)')
    expect(thirdSparkle.style.getPropertyValue('--dream-sparkle-color')).toBe('oklch(70% 0.18 210)')
    const sparkleLayer = window.document.querySelector('.dream-sparkles') as unknown as HTMLElement | null
    expect(sparkleLayer?.style.getPropertyValue('--dream-particle-top')).toBe('66px')
    expect(sparkleLayer?.style.getPropertyValue('--dream-particle-view-width')).toBe('1000px')
    expect(sparkleLayer?.style.getPropertyValue('--dream-particle-view-height')).toBe('634px')
    expect(firstSparkle.querySelectorAll(':scope > .dream-particle-trail')).toHaveLength(1)
    stateOf(window).ensure()
    expect(window.document.querySelectorAll('.dream-sparkles > i')).toHaveLength(3)
    expect(firstSparkle.querySelectorAll(':scope > .dream-particle-trail')).toHaveLength(1)

    stateOf(window).cleanup()
    expect(window.document.querySelector('.dream-sparkles')).toBeNull()
  })

  it('recomputes the particle viewport when the Codex main surface is resized', async () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('Sample-Project')
    const shellMain = window.document.querySelector('main.main-surface') as unknown as HTMLElement | null
    if (!shellMain) throw new Error('Main surface fixture is missing.')
    let width = 800
    let height = 600
    Object.defineProperty(shellMain, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}) })
    })

    inject(window)
    const layer = window.document.querySelector('.dream-sparkles') as unknown as HTMLElement | null
    expect(layer?.style.getPropertyValue('--dream-particle-view-width')).toBe('800px')
    expect(layer?.style.getPropertyValue('--dream-particle-view-height')).toBe('534px')

    width = 920
    height = 680
    window.dispatchEvent(new window.Event('resize'))
    await new Promise((resolve) => window.setTimeout(resolve, 220))
    expect(layer?.style.getPropertyValue('--dream-particle-view-width')).toBe('920px')
    expect(layer?.style.getPropertyValue('--dream-particle-view-height')).toBe('614px')
    expect(layer?.style.getPropertyValue('--dream-particle-negative-width')).toBe('-1016px')
  })

  it('selects an independent material and animation state for every particle effect', () => {
    for (const effect of PARTICLE_EFFECT_IDS) {
      const window = createWindow()
      window.document.body.innerHTML = homeFixture('Sample-Project')
      const decorations = structuredClone(defaultDecorations)
      decorations.sparkles.effect = effect
      const slot = particleEffectIconSlot(effect)
      const glyphName = effect === 'float' ? 'heart' : effect === 'rain' ? 'droplet' : effect === 'meteor' ? 'star' : effect === 'snow' ? 'snowflake' : 'sparkles'
      inject(window, { [slot]: { name: glyphName } }, undefined, undefined, undefined, decorations)

      const layer = window.document.querySelector('.dream-sparkles') as unknown as HTMLElement | null
      const particle = layer?.querySelector(':scope > .dream-particle') as HTMLElement | null
      expect(layer?.dataset.dreamEffect).toBe(effect)
      expect(particle?.querySelector('.dream-particle-content')?.textContent).toBe(BUILTIN_ICON_GLYPHS[glyphName])
      expect(particle?.querySelectorAll(':scope > .dream-particle-trail')).toHaveLength(1)
      expect(particle?.style.getPropertyValue('--dream-particle-duration')).toMatch(/s$/)
      expect(particle?.style.getPropertyValue('--dream-particle-start-y')).toMatch(/%$/)
    }
  })

  it('defines isolated keyframes, trails, and reduced-motion fallbacks for all particle effects', () => {
    for (const effect of PARTICLE_EFFECT_IDS) {
      expect(particleEffectsCss).toContain(`[data-dream-effect="${effect}"]`)
      expect(particleEffectsCss).toContain(`dream-particle-${effect}`)
      expect(previewParticleEffectsCss).toContain(`[data-dream-effect="${effect}"]`)
      expect(previewParticleEffectsCss).toContain(`dream-particle-${effect}`)
    }
    expect(particleEffectsCss).toContain('@media (prefers-reduced-motion: reduce)')
    expect(particleEffectsCss).toContain('pointer-events: none')
    expect(particleEffectsCss).toContain('will-change: transform, opacity')
    expect(particleEffectsCss).not.toMatch(/100v[wh]/)
    expect(previewParticleEffectsCss).not.toMatch(/100v[wh]/)
    expect(particleEffectsCss).toContain('left: 50%')
    expect(previewParticleEffectsCss).toContain('left: 50%')
    expect(particleEffectsCss).toContain('linear-gradient(90deg, var(--dream-sparkle-color, var(--dream-sparkle)), transparent)')
    expect(previewParticleEffectsCss).toContain('linear-gradient(90deg, var(--dream-sparkle-color, var(--dream-sparkle)), transparent)')
    expect(particleEffectsCss).not.toContain('left: 55%')
    expect(previewParticleEffectsCss).not.toContain('left: 55%')
    const runtimeKeyframes = particleEffectsCss.slice(particleEffectsCss.indexOf('@keyframes'), particleEffectsCss.indexOf('@media'))
    const previewKeyframes = previewParticleEffectsCss.slice(previewParticleEffectsCss.indexOf('@keyframes'), previewParticleEffectsCss.indexOf('@media'))
    expect(previewKeyframes).toBe(runtimeKeyframes)
    expect(particleEffectsCss).toContain('animation-duration: calc(var(--dream-particle-duration, 4s) * 1.8) !important')
    expect(particleEffectsCss).not.toContain('animation: none !important')
    expect(previewParticleEffectsCss).toContain('[data-preview-selected="true"]')
    expect(previewParticleEffectsCss).toContain('@media (prefers-reduced-motion: reduce)')
    expect(previewParticleEffectsCss).toContain('animation-duration: calc(var(--dream-particle-duration, 4s) * 1.8) !important')
    expect(previewParticleEffectsCss).not.toContain('animation: none !important')
  })

  it('shows composer melody as text and hides it for text or attachments', () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('Sample-Project')
    const composer = window.document.querySelector('.composer-surface-chrome')
    const emptyAttachments = window.document.createElement('div')
    emptyAttachments.className = '_attachmentsDefault_1qb5a_2'
    composer?.appendChild(emptyAttachments)
    const decorations = structuredClone(defaultDecorations)
    decorations.composerMelody = {
      visible: true,
      text: '<b>♫</b>',
      fontSize: 20,
      position: { x: 0.4, y: 0.25 },
      hideWhenTyping: true
    }
    inject(window, undefined, undefined, undefined, undefined, decorations)

    const editor = composer?.querySelector('.ProseMirror')
    const melody = composer?.querySelector('.dream-composer-melody') as HTMLElement | null
    expect(melody?.textContent).toBe('<b>♫</b>')
    expect(melody?.querySelector('b')).toBeNull()
    expect(melody?.style.left).toBe('40%')
    expect(melody?.style.top).toBe('25%')
    expect(melody?.style.fontSize).toBe('20px')
    expect(melody?.classList.contains('dream-composer-melody-hidden')).toBe(false)

    if (!editor) throw new Error('Composer editor fixture is missing.')
    editor.textContent = '正在输入'
    stateOf(window).ensure()
    expect(melody?.classList.contains('dream-composer-melody-hidden')).toBe(true)
    editor.textContent = ''
    stateOf(window).ensure()
    expect(melody?.classList.contains('dream-composer-melody-hidden')).toBe(false)

    const attachmentItem = window.document.createElement('div')
    emptyAttachments.appendChild(attachmentItem)
    stateOf(window).ensure()
    expect(melody?.classList.contains('dream-composer-melody-hidden')).toBe(true)
    attachmentItem.remove()
    stateOf(window).ensure()
    expect(melody?.classList.contains('dream-composer-melody-hidden')).toBe(false)

    const attachment = window.document.createElement('div')
    attachment.setAttribute('data-attachment', 'image.png')
    composer?.appendChild(attachment)
    stateOf(window).ensure()
    expect(melody?.classList.contains('dream-composer-melody-hidden')).toBe(true)
  })

  it('removes disabled sparkles and melody instead of leaving stale nodes', () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('Sample-Project')
    const decorations = structuredClone(defaultDecorations)
    decorations.sparkles.visible = false
    decorations.composerMelody.visible = false
    inject(window, undefined, undefined, undefined, undefined, decorations)

    expect(window.document.querySelector('.dream-sparkles')).toBeNull()
    expect(window.document.querySelector('.dream-composer-melody')).toBeNull()
    expect(window.document.querySelector('.dream-wave')).toBeNull()
  })

  it('keeps melody visible while typing when configured and supports conversation composers', () => {
    const window = createWindow()
    window.document.body.innerHTML = '<main class="main-surface"><div role="main"><article>Reply</article><div class="composer-surface-chrome"><div class="ProseMirror" contenteditable="true">已有内容</div><div class="_attachmentsDefault_1qb5a_2"><div data-attachment="image.png"></div></div></div></div></main>'
    const decorations = structuredClone(defaultDecorations)
    decorations.composerMelody.hideWhenTyping = false
    inject(window, undefined, undefined, undefined, undefined, decorations)

    const composer = window.document.querySelector('.composer-surface-chrome')
    expect(window.document.querySelector('.dream-home')).toBeNull()
    expect(composer?.classList.contains('dream-composer')).toBe(true)
    expect(composer?.querySelectorAll(':scope > .dream-composer-melody')).toHaveLength(1)
    expect(composer?.querySelector('.dream-composer-melody-hidden')).toBeNull()
    stateOf(window).ensure()
    expect(composer?.querySelectorAll(':scope > .dream-composer-melody')).toHaveLength(1)
    stateOf(window).cleanup()
    expect(window.document.querySelector('.dream-composer-melody')).toBeNull()
  })

  it('keeps the polaroid visible and idempotent on conversation pages', () => {
    const window = createWindow()
    window.document.body.innerHTML = '<main class="main-surface"><div><article data-message-author-role="assistant">Reply</article><div class="composer-surface-chrome"><div class="ProseMirror" contenteditable="true"></div></div></div></main>'
    inject(window, undefined, undefined, '.dream-polaroid { display: block; }')

    const chrome = window.document.getElementById('codex-dream-skin-chrome')
    const polaroid = chrome?.querySelector('.dream-polaroid')
    if (!chrome || !polaroid) throw new Error('Conversation polaroid fixture is missing.')
    expect(chrome.classList.contains('dream-home-shell')).toBe(false)
    expect(chrome.getAttribute('style') ?? '').not.toContain('--dream-polaroid-top')

    stateOf(window).ensure()
    stateOf(window).ensure()
    expect(window.document.querySelectorAll('#codex-dream-skin-chrome')).toHaveLength(1)
    expect(window.document.querySelectorAll('.dream-polaroid')).toHaveLength(1)
    expect(polaroid.querySelectorAll(':scope > .dream-polaroid-shadow')).toHaveLength(1)
    expect(polaroid.querySelectorAll(':scope > .dream-polaroid-shadow > .dream-polaroid-surface')).toHaveLength(1)

    stateOf(window).cleanup()
    expect(window.document.getElementById('codex-dream-skin-chrome')).toBeNull()
  })

  it('applies hero media flips to an isolated layer and cleans it up', () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('Sample-Project')
    inject(window, undefined, undefined, undefined, undefined, undefined, undefined, {
      hero: { kind: 'image', transform: { flipHorizontal: true, flipVertical: false } },
      polaroid: null
    })

    const heroImage = window.document.querySelector('.dream-hero-image') as HTMLElement | null
    expect(heroImage?.style.transform).toBe('scaleX(-1) scaleY(1)')
    expect(window.document.querySelector('.dream-heading-region')).not.toBeNull()
    stateOf(window).cleanup()
    expect(window.document.querySelector('.dream-hero-image')).toBeNull()
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
