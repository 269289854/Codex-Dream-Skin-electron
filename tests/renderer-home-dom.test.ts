import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Window } from 'happy-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { PARTICLE_EFFECT_IDS, PARTICLE_PERFORMANCE_MODES, PARTICLE_VIEWPORT_TOP, createSparkleParticles, particleEffectIconSlot, resolveParticleRenderPolicy, type SparkleParticle } from '../src/shared/particle-effects'
import { DEFAULT_BRAND_COPY, DEFAULT_HOME_COPY, HOME_ACTION_FALLBACK_BUILTINS, HOME_ACTIONS } from '../src/shared/home-layout'
import { BUILTIN_ICON_GLYPHS } from '../src/shared/icon-glyphs'
import type { ConversationOverlayStyle } from '../src/shared/conversation-overlay'
import { createDefaultTheme, type ThemeProfile } from '../src/shared/theme'

let template = ''
let particleEffectsCss = ''
let previewParticleEffectsCss = ''
let homeLayoutCss = ''
const themeId = '11111111-1111-4111-8111-111111111111'
const windows: Window[] = []
const defaultProfile = createDefaultTheme(themeId)
const defaultDecorations = defaultProfile.decorations

beforeAll(async () => {
  ;[template, particleEffectsCss, previewParticleEffectsCss, homeLayoutCss] = await Promise.all([
    readFile(join(process.cwd(), 'resources', 'windows', 'renderer-inject.js'), 'utf8'),
    readFile(join(process.cwd(), 'resources', 'windows', 'dream-particle-effects.css'), 'utf8'),
    readFile(join(process.cwd(), 'src', 'renderer', 'src', 'particle-effects.css'), 'utf8'),
    readFile(join(process.cwd(), 'resources', 'windows', 'dream-home-layout.css'), 'utf8')
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

type RuntimeMediaConfig = {
  asset?: string
  kind: 'image' | 'video'
  transform: ThemeProfile['hero']['mediaTransform']
  playback?: ThemeProfile['hero']['playback']
  mimeType?: string
}

type RuntimeConversationBackgroundConfig = {
  visible: boolean
  mode: 'color' | 'image' | 'gif' | 'video'
  color: string
  source?: { asset: string; kind: 'image' | 'video'; mimeType: string } | null
  dataUrl?: string | null
  opacity: number
  overlayStyle?: ConversationOverlayStyle
  overlayColor?: string
  overlayOpacity?: number
  focus: { x: number; y: number }
  scale: number
}

type RuntimeWindowBackgroundConfig = {
  visible: boolean
  mode: 'color' | 'image' | 'gif' | 'video'
  asset?: string
  kind?: 'image' | 'video'
  mimeType?: string
  dataUrl?: string | null
  backgroundStyle: { background: string; opacity: string; objectPosition: string; transform: string }
  masks: Array<{ id: string; visible: boolean; style: ConversationOverlayStyle }>
}

type RuntimeDecorations = Omit<ThemeProfile['decorations'], 'composerMelody'> & {
  composerMelody: ThemeProfile['decorations']['composerMelody'] & { dataUrl?: string | null }
}

const fullOverlayStyle: ConversationOverlayStyle = {
  background: '#FFFFFF',
  opacity: '0.2',
  inset: '0',
  left: '0',
  top: '0',
  width: 'auto',
  height: 'auto',
  transform: 'none',
  borderRadius: '0',
  filter: 'none'
}

function inject(window: Window, icons: Record<string, { name?: string; dataUrl?: string }> = {
  cardPrimary: { name: 'wand-sparkles' },
  cardSecondary: { name: 'image' },
  decoration: { name: 'heart' },
  backgroundSparkle: { name: 'sparkles' }
}, copy: Record<string, string> = { ...DEFAULT_HOME_COPY, ...DEFAULT_BRAND_COPY }, cssText = '.dream-layout-root { display: block; }', composerBadge: { visible: boolean } = { visible: true }, decorations: RuntimeDecorations = defaultDecorations, sparkleParticles: SparkleParticle[] = createSparkleParticles(decorations.sparkles), media: { hero: RuntimeMediaConfig | null; polaroid: RuntimeMediaConfig | null; conversationBackground?: RuntimeConversationBackgroundConfig | null; windowBackground?: RuntimeWindowBackgroundConfig | null } = { hero: null, polaroid: null }, conversationBubbles: { visible: boolean } = { visible: true }, toolActivityBubbles: { visible: boolean } = { visible: true }): void {
  const runtimeConfig = {
    themeId,
    media,
    icons,
    composerBadge,
    conversationBubbles,
    toolActivityBubbles,
    decorations,
    particleViewportTop: PARTICLE_VIEWPORT_TOP,
    sparkleIconSlot: particleEffectIconSlot(decorations.sparkles.effect),
    sparkleParticles,
    sparklePolicy: resolveParticleRenderPolicy(decorations.sparkles.performanceMode, sparkleParticles.length),
    builtinGlyphs: BUILTIN_ICON_GLYPHS,
    actionFallbackBuiltins: HOME_ACTION_FALLBACK_BUILTINS,
    copy: { ...copy, parts: { before: '我们应该在 ', after: ' 中构建什么？' } },
    actions: HOME_ACTIONS
  }
  const payload = template
    .replace('__DREAM_VERSION_JSON__', JSON.stringify(JSON.stringify(runtimeConfig)))
    .replace('__DREAM_CSS_JSON__', JSON.stringify(cssText))
    .replace('__DREAM_ART_JSON__', JSON.stringify('data:image/png;base64,AA=='))
    .replace('__DREAM_CONFIG_JSON__', JSON.stringify(runtimeConfig))
  window.eval(payload)
}

function stateOf(window: Window): { ensure: () => void; cleanup: () => void } {
  const state = (window as unknown as Record<string, { ensure: () => void; cleanup: () => void } | undefined>).__CODEX_DREAM_SKIN_STATE__
  if (!state) throw new Error('Renderer injection state was not installed.')
  return state
}

describe('renderer home DOM adaptation', () => {
  it('wraps only user and Codex prose, follows streaming additions, and clears bubble classes', () => {
    const window = createWindow()
    window.document.body.innerHTML = `
      <main class="main-surface">
        <div data-user-message-bubble>用户消息</div>
        <div data-local-conversation-final-assistant>
          <div data-response-annotation-conversation><div data-selected-text-overlay-target>Codex 正文</div></div>
          <div data-tool-result>工具结果</div>
          <div data-file-diff-card>文件差异</div>
        </div>
        <div data-response-annotation-conversation data-empty-response>无正文标记</div>
      </main>`
    inject(window)

    expect(window.document.querySelector('[data-user-message-bubble]')?.classList.contains('dream-conversation-user-bubble')).toBe(true)
    expect(window.document.querySelector('[data-response-annotation-conversation]:not([data-empty-response])')?.classList.contains('dream-conversation-codex-bubble')).toBe(true)
    expect(window.document.querySelector('[data-empty-response]')?.classList.contains('dream-conversation-codex-bubble')).toBe(false)
    expect(window.document.querySelector('[data-tool-result]')?.className).toBe('')
    expect(window.document.querySelector('[data-file-diff-card]')?.className).toBe('')

    const streaming = window.document.createElement('div')
    streaming.setAttribute('data-response-annotation-conversation', '')
    streaming.innerHTML = '<p data-selected-text-overlay-target>流式正文</p>'
    window.document.querySelector('main')?.append(streaming)
    stateOf(window).ensure()
    expect(streaming.classList.contains('dream-conversation-codex-bubble')).toBe(true)

    inject(window, undefined, undefined, undefined, undefined, undefined, undefined, undefined, { visible: false })
    expect(window.document.querySelector('.dream-conversation-user-bubble')).toBeNull()
    expect(window.document.querySelector('.dream-conversation-codex-bubble')).toBeNull()
    stateOf(window).cleanup()
    expect(window.document.querySelector('[data-user-message-bubble]')?.className).toBe('')
  })

  it('marks only outermost tool activities and clears disabled, rebuilt, and cleaned nodes', () => {
    const window = createWindow()
    window.document.body.innerHTML = `
      <main class="main-surface">
        <section id="batch" data-local-conversation-item-target-ids="exec-1 exec-2">
          <div class="group/command">npm test</div>
          <div class="group/output">Tests passed</div>
          <div id="nested" data-local-conversation-item-target-ids="exec-2"><span data-tool-output>nested output</span></div>
        </section>
        <section id="file-edit" data-local-conversation-item-target-ids="edit-1"><div data-tool-output>Updated theme.ts</div></section>
        <section id="mcp" data-local-conversation-item-target-ids="mcp-1"><small>MCP details</small></section>
      </main>`
    inject(window)

    expect(window.document.querySelector('#batch')?.classList.contains('dream-conversation-tool-bubble')).toBe(true)
    expect(window.document.querySelector('#file-edit')?.classList.contains('dream-conversation-tool-bubble')).toBe(true)
    expect(window.document.querySelector('#mcp')?.classList.contains('dream-conversation-tool-bubble')).toBe(true)
    expect(window.document.querySelector('#nested')?.classList.contains('dream-conversation-tool-bubble')).toBe(false)
    expect(window.document.querySelectorAll('.dream-conversation-tool-bubble')).toHaveLength(3)
    stateOf(window).ensure()
    expect(window.document.querySelectorAll('.dream-conversation-tool-bubble')).toHaveLength(3)

    const replacement = window.document.createElement('section')
    replacement.id = 'rebuilt'
    replacement.setAttribute('data-local-conversation-item-target-ids', 'web-1')
    replacement.textContent = 'Visited example.test'
    window.document.querySelector('#batch')?.replaceWith(replacement)
    stateOf(window).ensure()
    expect(replacement.classList.contains('dream-conversation-tool-bubble')).toBe(true)

    inject(window, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, { visible: false })
    expect(window.document.querySelector('.dream-conversation-tool-bubble')).toBeNull()
    inject(window)
    expect(replacement.classList.contains('dream-conversation-tool-bubble')).toBe(true)
    stateOf(window).cleanup()
    expect(window.document.querySelector('.dream-conversation-tool-bubble')).toBeNull()
    expect(replacement.getAttribute('data-local-conversation-item-target-ids')).toBe('web-1')
  })

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

  it('customizes five sidebar navigation items independently and restores their native DOM', () => {
    const window = createWindow()
    window.document.body.innerHTML = `
      <aside class="app-shell-left-panel">
        <button aria-label="切换模式，当前模式：Codex"><span>Codex</span><svg><path d="mode" /></svg></button>
        <button data-app-action-sidebar-section-toggle><span>项目</span><svg><path d="projects" /></svg></button>
        <button data-app-action-sidebar-section-toggle><span>任务</span><svg><path d="tasks" /></svg></button>
        <nav>${[
          ['新建任务', 'newTask'],
          ['拉取请求', 'pullRequests'],
          ['站点', 'sites'],
          ['已安排', 'scheduled'],
          ['插件', 'plugins']
        ].map(([label, id], index) => `<button ${index === 2 ? 'aria-current="page"' : ''}><div><span class="native-icon"><svg><path d="${id}" /></svg></span><span class="text-fade-truncate">${label}</span></div></button>`).join('')}</nav>
      </aside><main class="main-surface"><div role="main"><article>Reply</article></div></main>`
    inject(window, {
      sidebarMode: { name: 'music' },
      sidebarNavNewTask: { name: 'square-pen' },
      sidebarNavPullRequests: { name: 'git-pull-request' },
      sidebarNavSites: { name: 'grid-2x2' },
      sidebarNavScheduled: { name: 'clock-3' },
      sidebarNavPlugins: { name: 'at-sign' }
    }, {
      ...DEFAULT_HOME_COPY,
      ...DEFAULT_BRAND_COPY,
      sidebarModeTitle: 'Dream',
      sidebarProjectsTitle: '作品集',
      sidebarTasksTitle: '工作项',
      sidebarNavNewTask: '<b>创建</b>',
      sidebarNavPullRequests: '代码审阅',
      sidebarNavSites: '应用站点',
      sidebarNavScheduled: '计划任务',
      sidebarNavPlugins: '扩展中心'
    })

    const navButtons = [...window.document.querySelectorAll('nav > button')]
    expect(navButtons.map((button) => button.querySelector('.text-fade-truncate')?.textContent)).toEqual(['<b>创建</b>', '代码审阅', '应用站点', '计划任务', '扩展中心'])
    expect(window.document.querySelector('nav b')).toBeNull()
    expect(navButtons.map((button) => button.querySelector('.native-icon')?.textContent)).toEqual(['✎', '⑂', '▦', '◷', '@'])
    expect(navButtons[1]?.querySelector('.native-icon')?.classList.contains('dream-sidebar-nav-icon')).toBe(true)
    expect(navButtons[2]?.classList.contains('dream-sidebar-nav-sites-selected')).toBe(true)
    expect(window.document.querySelector('button[aria-label^="切换模式"] span')?.textContent).toBe('Dream')
    expect([...window.document.querySelectorAll('button[data-app-action-sidebar-section-toggle] span')].map((node) => node.textContent)).toEqual(['作品集', '工作项'])
    expect(window.document.querySelector('.dream-sidebar-projects-title')?.textContent).toContain('作品集')
    expect(window.document.querySelector('.dream-sidebar-tasks-title')?.textContent).toContain('工作项')

    stateOf(window).ensure()
    expect(window.document.querySelectorAll('[data-dream-sidebar-nav]')).toHaveLength(5)
    stateOf(window).cleanup()
    expect(navButtons.map((button) => button.querySelector('.text-fade-truncate')?.textContent)).toEqual(['新建任务', '拉取请求', '站点', '已安排', '插件'])
    expect(navButtons[0]?.querySelector('.native-icon svg path')?.getAttribute('d')).toBe('newTask')
    expect(navButtons[1]?.querySelector('.native-icon')?.getAttribute('class')).toBe('native-icon')
    expect(window.document.querySelector('button[aria-label^="切换模式"] span')?.textContent).toBe('Codex')
    expect([...window.document.querySelectorAll('button[data-app-action-sidebar-section-toggle] span')].map((node) => node.textContent)).toEqual(['项目', '任务'])
    expect(window.document.querySelector('.dream-sidebar-projects-title')).toBeNull()
    expect(window.document.querySelector('.dream-sidebar-tasks-title')).toBeNull()
  })

  it('rebinds recreated section titles and keeps equal custom labels independent', () => {
    const window = createWindow()
    window.document.body.innerHTML = `
      <aside class="app-shell-left-panel">
        <button data-app-action-sidebar-section-toggle><span>项目</span><svg><path d="projects" /></svg></button>
        <button data-app-action-sidebar-section-toggle><span>任务</span><svg><path d="tasks" /></svg></button>
      </aside><main class="main-surface"><div role="main"><article>Reply</article></div></main>`
    inject(window, {}, {
      ...DEFAULT_HOME_COPY,
      ...DEFAULT_BRAND_COPY,
      sidebarProjectsTitle: '共同分区',
      sidebarTasksTitle: '共同分区'
    })

    const originalProject = window.document.querySelector('.dream-sidebar-projects-title')
    const task = window.document.querySelector('.dream-sidebar-tasks-title')
    const sidebar = window.document.querySelector('aside.app-shell-left-panel') as unknown as HTMLElement | null
    expect(originalProject?.querySelector('span')?.textContent).toBe('共同分区')
    expect(task?.querySelector('span')?.textContent).toBe('共同分区')

    if (!sidebar) throw new Error('Sidebar fixture is missing.')
    sidebar.style.visibility = 'hidden'
    stateOf(window).ensure()
    expect(originalProject?.classList.contains('dream-sidebar-projects-title')).toBe(true)
    expect(task?.classList.contains('dream-sidebar-tasks-title')).toBe(true)
    sidebar.style.visibility = 'visible'
    stateOf(window).ensure()

    const replacement = window.document.createElement('button')
    replacement.setAttribute('data-app-action-sidebar-section-toggle', '')
    replacement.innerHTML = '<span>项目</span><svg><path d="projects-new" /></svg>'
    originalProject?.replaceWith(replacement)
    stateOf(window).ensure()

    expect(replacement.classList.contains('dream-sidebar-projects-title')).toBe(true)
    expect(replacement.querySelector('span')?.textContent).toBe('共同分区')
    expect(task?.classList.contains('dream-sidebar-tasks-title')).toBe(true)
    stateOf(window).cleanup()
    expect(replacement.classList.contains('dream-sidebar-projects-title')).toBe(false)
    expect(replacement.querySelector('span')?.textContent).toBe('项目')
    expect(task?.classList.contains('dream-sidebar-tasks-title')).toBe(false)
    expect(task?.querySelector('span')?.textContent).toBe('任务')
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

  it('drags the polaroid within the shell without creating a preview update', () => {
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
    const state = (window as unknown as { __CODEX_DREAM_SKIN_STATE__?: Record<string, unknown> }).__CODEX_DREAM_SKIN_STATE__
    expect(state?.takePlacementUpdate).toBeUndefined()
    expect(state?.applyPolaroidPlacement).toBeUndefined()
    chrome.remove()
    stateOf(window).ensure()
    const restoredPolaroid = window.document.querySelector('.dream-polaroid') as unknown as HTMLElement | null
    expect(restoredPolaroid?.style.getPropertyValue('left')).toBe('80%')
    expect(Number.parseFloat(restoredPolaroid?.style.getPropertyValue('top') ?? '')).toBeCloseTo(460 / 700 * 100)
    expect(capturedPointer).toBeNull()
    expect(polaroid.classList.contains('dream-polaroid-dragging')).toBe(false)
  })

  it('creates a synchronized clickable project proxy for long project names', async () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('Codex-Dream-Skin-electron')
    const sourceButton = window.document.querySelector('[data-composer-navigation-target="workspace-project"]')
    if (!sourceButton) throw new Error('Project selector fixture is missing.')
    Object.defineProperty(sourceButton, 'getBoundingClientRect', {
      configurable: true,
      writable: true,
      value: () => ({ x: 500, y: 900, top: 900, left: 500, right: 700, bottom: 940, width: 200, height: 40, toJSON: () => ({}) })
    })
    const click = vi.fn()
    const pointerDown = vi.fn()
    const observedAnchorRect = vi.fn()
    const bubbledClick = vi.fn()
    sourceButton.addEventListener('click', click)
    window.document.body.addEventListener('click', bubbledClick)

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
    expect(bubbledClick).toHaveBeenCalledTimes(1)

    click.mockClear()
    bubbledClick.mockClear()
    sourceButton.addEventListener('pointerdown', (event) => {
      observedAnchorRect(sourceButton.getBoundingClientRect())
      pointerDown(event)
      sourceButton.setAttribute('aria-expanded', 'true')
      event.preventDefault()
    })
    proxy.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, button: 0 }))
    proxy.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, button: 0 }))
    proxy.dispatchEvent(new window.MouseEvent('click', { bubbles: true, detail: 1 }))
    expect(pointerDown).toHaveBeenCalledTimes(1)
    expect(observedAnchorRect.mock.calls[0]?.[0]).toMatchObject({ left: 0, top: 0 })
    expect(click).not.toHaveBeenCalled()
    expect(bubbledClick).not.toHaveBeenCalled()
    sourceButton.setAttribute('aria-expanded', 'false')
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    expect(sourceButton.getBoundingClientRect()).toMatchObject({ left: 500, top: 900 })

    const replacement = sourceButton.cloneNode(true)
    const replacementClick = vi.fn()
    replacement.addEventListener('click', replacementClick)
    sourceButton.replaceWith(replacement)
    proxy.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    expect(replacementClick).toHaveBeenCalledTimes(1)

    replacement.textContent = 'Renamed-Project'
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

  it('keeps every configured particle while applying deterministic performance budgets', () => {
    for (const mode of PARTICLE_PERFORMANCE_MODES) {
      for (const count of [1, 8, 20, 24]) {
        const window = createWindow()
        window.document.body.innerHTML = homeFixture(`${mode}-${count}`)
        const decorations = structuredClone(defaultDecorations)
        decorations.sparkles = { ...decorations.sparkles, performanceMode: mode, count, glow: 10, extraColors: ['#20bcc3'] }
        const particles = createSparkleParticles(decorations.sparkles)
        inject(window, undefined, undefined, undefined, undefined, decorations, particles)

        const layer = window.document.querySelector('.dream-sparkles') as unknown as HTMLElement | null
        const nodes = [...(layer?.querySelectorAll(':scope > .dream-particle') ?? [])] as HTMLElement[]
        const expected = resolveParticleRenderPolicy(mode, count)
        expect(nodes).toHaveLength(count)
        expect(layer?.dataset.dreamPerformance).toBe(mode)
        expect(layer?.dataset.dreamTrails).toBe(expected.showTrails ? 'true' : 'false')
        expect(nodes.flatMap((node, index) => node.dataset.dreamAnimated === 'true' ? [index] : [])).toEqual(expected.animatedIndexes)
        expect(nodes.every((node) => node.style.getPropertyValue('--dream-particle-x').endsWith('%'))).toBe(true)
        expect(nodes.every((node) => node.style.getPropertyValue('--dream-sparkle-size').endsWith('px'))).toBe(true)
        expect(nodes.every((node) => node.querySelector('.dream-particle-content') !== null)).toBe(true)
        expect(nodes[0]?.style.getPropertyValue('--dream-sparkle-glow')).toBe(`${mode === 'quality' ? 10 : mode === 'balanced' ? 6 : 0}px`)
        if (expected.targetFps) {
          const duration = Number.parseFloat(nodes[expected.animatedIndexes[0] ?? 0]?.style.getPropertyValue('--dream-particle-duration') ?? '0')
          expect(nodes[expected.animatedIndexes[0] ?? 0]?.style.getPropertyValue('--dream-particle-steps')).toBe(`${Math.max(1, Math.round(duration * expected.targetFps))}`)
        }
        stateOf(window).cleanup()
      }
    }
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
    expect(particleEffectsCss).toContain('animation-play-state: paused !important')
    expect(particleEffectsCss).not.toContain('animation: none !important')
    expect(previewParticleEffectsCss).toContain('[data-preview-selected="true"]')
    expect(previewParticleEffectsCss).toContain('@media (prefers-reduced-motion: reduce)')
    expect(previewParticleEffectsCss).toContain('animation-play-state: paused !important')
    expect(previewParticleEffectsCss).not.toContain('animation: none !important')
  })

  it('pauses decorative motion while hidden or unfocused and removes motion listeners during cleanup', () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('Motion-State')
    let focused = true
    let hidden = false
    Object.defineProperty(window.document, 'hasFocus', { configurable: true, value: () => focused })
    Object.defineProperty(window.document, 'hidden', { configurable: true, get: () => hidden })
    const clearInterval = vi.spyOn(window, 'clearInterval')
    inject(window)

    expect(window.document.documentElement.hasAttribute('data-dream-motion-paused')).toBe(false)
    focused = false
    window.dispatchEvent(new window.Event('blur'))
    expect(window.document.documentElement.getAttribute('data-dream-motion-paused')).toBe('')
    focused = true
    window.dispatchEvent(new window.Event('focus'))
    expect(window.document.documentElement.hasAttribute('data-dream-motion-paused')).toBe(false)
    hidden = true
    window.document.dispatchEvent(new window.Event('visibilitychange'))
    expect(window.document.documentElement.getAttribute('data-dream-motion-paused')).toBe('')

    const timer = (window as unknown as { __CODEX_DREAM_SKIN_STATE__: { timer: number } }).__CODEX_DREAM_SKIN_STATE__.timer
    stateOf(window).cleanup()
    expect(clearInterval).toHaveBeenCalledWith(timer)
    expect(window.document.documentElement.hasAttribute('data-dream-motion-paused')).toBe(false)
    focused = false
    hidden = false
    window.dispatchEvent(new window.Event('blur'))
    window.document.dispatchEvent(new window.Event('visibilitychange'))
    expect(window.document.documentElement.hasAttribute('data-dream-motion-paused')).toBe(false)
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
      ...decorations.composerMelody,
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

  it('renders all composer text effects with bounded structured nodes', () => {
    const effects = ['wave', 'barrage', 'scroll', 'float', 'pulse'] as const
    for (const effect of effects) {
      const window = createWindow()
      window.document.body.innerHTML = homeFixture(`Effect-${effect}`)
      const decorations = structuredClone(defaultDecorations) as RuntimeDecorations
      decorations.composerMelody = { ...decorations.composerMelody, text: '<b>波浪</b>', effect, direction: 'right', speed: 2 }
      inject(window, undefined, undefined, undefined, undefined, decorations)

      const melody = window.document.querySelector('.dream-composer-melody') as HTMLElement | null
      expect(melody?.dataset.dreamComposerMode).toBe('text')
      expect(melody?.dataset.dreamComposerEffect).toBe(effect)
      expect(melody?.querySelector('b')).toBeNull()
      if (effect === 'wave') {
        const characters = [...(melody?.querySelectorAll('.dream-composer-decoration-character') ?? [])] as HTMLElement[]
        expect(characters).toHaveLength(Array.from('<b>波浪</b>').length)
        expect(characters[0]?.style.animationDelay).toBe('0s')
        expect(characters[1]?.style.animationDelay).toBe('-0.03s')
        expect(melody?.style.getPropertyValue('--dream-composer-effect-duration')).toBe('0.7s')
        expect(melody?.dataset.dreamComposerDirection).toBeUndefined()
      } else if (effect === 'barrage') {
        expect(melody?.querySelectorAll('.dream-composer-decoration-barrage')).toHaveLength(3)
        expect(melody?.querySelectorAll('.dream-composer-decoration-direction-right')).toHaveLength(3)
        expect(melody?.dataset.dreamComposerDirection).toBe('right')
        expect(melody?.style.left).toBe('48px')
        expect(melody?.style.right).toBe('48px')
      } else {
        expect(melody?.querySelector(`.dream-composer-decoration-${effect}`)?.textContent).toBe('<b>波浪</b>')
        if (effect === 'scroll') {
          expect(melody?.querySelector('.dream-composer-decoration-direction-right')).not.toBeNull()
          expect(melody?.dataset.dreamComposerDirection).toBe('right')
        }
      }
    }
    expect(homeLayoutCss).toContain('@media (prefers-reduced-motion: reduce)')
    expect(homeLayoutCss).toContain('animation-play-state: paused !important;')
    expect(homeLayoutCss).not.toContain('.dream-composer-decoration-character { animation: none !important; }')
    expect(homeLayoutCss).toContain('.dream-composer-decoration-wave { padding-block: 4px; }')
    expect(homeLayoutCss).toContain('.dream-composer-decoration-direction-right { animation-direction: reverse; }')
  })

  it('keeps wave character nodes stable across repeated synchronization and repairs damaged content', () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('Stable-Wave')
    const decorations = structuredClone(defaultDecorations) as RuntimeDecorations
    decorations.composerMelody = { ...decorations.composerMelody, text: '波浪效果', effect: 'wave' }
    inject(window, undefined, undefined, undefined, undefined, decorations)

    const melody = window.document.querySelector('.dream-composer-melody') as HTMLElement | null
    const characters = [...(melody?.querySelectorAll('.dream-composer-decoration-character') ?? [])]
    expect(characters).toHaveLength(Array.from('波浪效果').length)

    stateOf(window).ensure()
    stateOf(window).ensure()
    const synchronized = [...(melody?.querySelectorAll('.dream-composer-decoration-character') ?? [])]
    expect(synchronized).toEqual(characters)
    synchronized[1]?.remove()

    stateOf(window).ensure()
    const repaired = [...(melody?.querySelectorAll('.dream-composer-decoration-character') ?? [])]
    expect(repaired).toHaveLength(Array.from('波浪效果').length)
    expect(repaired[0]).not.toBe(characters[0])
  })

  it('renders GIF frames without text effect classes and cleans mode switches idempotently', () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('Composer-GIF')
    const decorations = structuredClone(defaultDecorations) as RuntimeDecorations
    decorations.composerMelody = {
      ...decorations.composerMelody,
      mode: 'gif',
      source: { asset: 'assets/composer.gif', kind: 'image', mimeType: 'image/gif' },
      effect: 'wave',
      gifWidth: 144,
      dataUrl: 'data:image/gif;base64,AA=='
    }
    inject(window, undefined, undefined, undefined, undefined, decorations)

    const gifDecoration = window.document.querySelector('.dream-composer-melody') as HTMLElement | null
    const image = gifDecoration?.querySelector('.dream-composer-decoration-gif') as HTMLImageElement | null
    expect(gifDecoration?.dataset.dreamComposerMode).toBe('gif')
    expect(gifDecoration?.dataset.dreamComposerEffect).toBe('none')
    expect(image?.getAttribute('src')).toBe('data:image/gif;base64,AA==')
    expect(image?.style.width).toBe('144px')
    expect(gifDecoration?.querySelector('[class*="dream-composer-decoration-wave"]')).toBeNull()

    decorations.composerMelody = { ...decorations.composerMelody, mode: 'text', effect: 'float' }
    inject(window, undefined, undefined, undefined, undefined, decorations)
    expect(window.document.querySelectorAll('.dream-composer-melody')).toHaveLength(1)
    expect(window.document.querySelector('.dream-composer-decoration-gif')).toBeNull()
    expect(window.document.querySelector('.dream-composer-decoration-float')).not.toBeNull()

    decorations.composerMelody = { ...decorations.composerMelody, mode: 'gif', dataUrl: 'data:image/png;base64,AA==' }
    inject(window, undefined, undefined, undefined, undefined, decorations)
    expect(window.document.querySelector('.dream-composer-melody')).toBeNull()
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

  it('renders a conversation background below content, keeps GIFs as images, and cleans it up', () => {
    const window = createWindow()
    window.document.body.innerHTML = '<main class="main-surface"><div class="thread-scroll-container" data-app-action-timeline-scroll><div class="thread-content"><article data-message-author-role="assistant">Reply</article><div class="sticky"><div class="composer-surface-chrome"><div class="ProseMirror" contenteditable="true"></div></div></div></div></div></main>'
    const background: RuntimeConversationBackgroundConfig = {
      visible: true,
      mode: 'gif',
      color: '#F7FFFF',
      source: { asset: 'assets/background.gif', kind: 'image', mimeType: 'image/gif' },
      dataUrl: 'data:image/gif;base64,AA==',
      opacity: .8,
      overlayStyle: {
        ...fullOverlayStyle,
        background: 'linear-gradient(120deg, #FFFFFF 0%, #123456 100%)',
        opacity: '0.35',
        inset: 'auto',
        left: '42%',
        top: '55%',
        width: '72%',
        height: '62%',
        transform: 'translate(-50%, -50%)',
        borderRadius: '28px',
        filter: 'blur(18px)'
      },
      focus: { x: .2, y: .7 },
      scale: 1.4
    }
    inject(window, undefined, undefined, undefined, undefined, undefined, undefined, { hero: null, polaroid: null, conversationBackground: background })

    const surface = window.document.querySelector('.dream-conversation-surface')
    const viewport = surface?.parentElement
    const backgroundLayer = viewport?.querySelector(':scope > .dream-conversation-background')
    const image = backgroundLayer?.querySelector(':scope > .dream-conversation-background-media') as HTMLImageElement | null
    expect(surface).not.toBeNull()
    expect(viewport?.classList.contains('dream-conversation-viewport')).toBe(true)
    expect(backgroundLayer?.parentElement).toBe(viewport)
    expect(backgroundLayer).not.toBe(surface?.firstElementChild)
    expect(backgroundLayer?.firstElementChild?.classList.contains('dream-conversation-background-media')).toBe(true)
    expect(image?.getAttribute('src')).toBe('data:image/gif;base64,AA==')
    expect(image?.style.objectPosition).toBe('20% 70%')
    const overlay = backgroundLayer?.querySelector(':scope > .dream-conversation-background-overlay') as HTMLElement | null
    expect(overlay?.classList.contains('dream-conversation-background-overlay')).toBe(true)
    expect(overlay?.style.background).toContain('linear-gradient(120deg')
    expect(overlay?.style.left).toBe('42%')
    expect(overlay?.style.top).toBe('55%')
    expect(overlay?.style.width).toBe('72%')
    expect(overlay?.style.height).toBe('62%')
    expect(overlay?.style.borderRadius).toBe('28px')
    expect(overlay?.style.filter).toBe('blur(18px)')
    expect(backgroundLayer?.nextElementSibling).toBe(surface)
    expect(surface?.firstElementChild?.classList.contains('thread-content')).toBe(true)
    stateOf(window).ensure()
    expect(viewport?.querySelectorAll(':scope > .dream-conversation-background')).toHaveLength(1)
    expect(backgroundLayer?.querySelectorAll(':scope > .dream-conversation-background-media')).toHaveLength(1)

    stateOf(window).cleanup()
    expect(window.document.querySelector('.dream-conversation-surface')).toBeNull()
    expect(window.document.querySelector('.dream-conversation-viewport')).toBeNull()
    expect(window.document.querySelector('.dream-conversation-background')).toBeNull()
  })

  it('keeps one fixed window background, composites masks in foreground order, and cleans every state', () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('Sample-Project')
    const windowBackground: RuntimeWindowBackgroundConfig = {
      visible: true,
      mode: 'color',
      dataUrl: null,
      backgroundStyle: {
        background: 'linear-gradient(135deg, #123456 0%, #abcdef 100%)',
        opacity: '.84',
        objectPosition: '35% 65%',
        transform: 'scale(1.25) scaleX(-1) scaleY(1)'
      },
      masks: [
        { id: '22222222-2222-4222-8222-222222222222', visible: true, style: { ...fullOverlayStyle, background: '#ff0000', opacity: '.45', inset: 'auto', left: '30%', top: '60%', width: '50%', height: '40%', transform: 'translate(-50%, -50%)', borderRadius: '50%', filter: 'blur(12px)' } },
        { id: '33333333-3333-4333-8333-333333333333', visible: false, style: { ...fullOverlayStyle, background: 'radial-gradient(circle at 40% 60%, #ffffff 0%, transparent 100%)' } }
      ]
    }
    inject(window, undefined, undefined, undefined, undefined, undefined, undefined, { hero: null, polaroid: null, windowBackground })

    const background = window.document.getElementById('codex-dream-skin-window-background')
    const base = background?.querySelector('.dream-window-background-color') as HTMLElement | null
    const masks = background ? [...background.querySelectorAll(':scope > .dream-window-background-mask')] as unknown as HTMLElement[] : []
    expect(window.document.documentElement.classList.contains('dream-window-background-active')).toBe(true)
    expect(background?.parentElement).toBe(window.document.body)
    expect(base?.style.background).toContain('linear-gradient(135deg')
    expect(base?.style.opacity).toBe('.84')
    expect(masks).toHaveLength(2)
    expect(masks[0]?.dataset.dreamMaskId).toBe(windowBackground.masks[0]?.id)
    expect(masks[0]?.style.zIndex).toBe('2')
    expect(masks[0]?.style.left).toBe('30%')
    expect(masks[0]?.style.filter).toBe('blur(12px)')
    expect(masks[1]?.style.display).toBe('none')
    stateOf(window).ensure()
    expect(window.document.querySelectorAll('#codex-dream-skin-window-background')).toHaveLength(1)
    expect(window.document.querySelectorAll('.dream-window-background-mask')).toHaveLength(2)

    stateOf(window).cleanup()
    expect(window.document.getElementById('codex-dream-skin-window-background')).toBeNull()
    expect(window.document.documentElement.classList.contains('dream-window-background-active')).toBe(false)
  })

  it('starts a muted looping window video and exposes its restricted CDP input role', () => {
    const window = createWindow()
    Object.defineProperty(window.HTMLMediaElement.prototype, 'play', { configurable: true, value: vi.fn(() => Promise.resolve()) })
    Object.defineProperty(window.HTMLMediaElement.prototype, 'load', { configurable: true, value: vi.fn() })
    window.document.body.innerHTML = homeFixture('Sample-Project')
    const windowBackground: RuntimeWindowBackgroundConfig = {
      visible: true,
      mode: 'video',
      asset: 'assets/window.mp4',
      kind: 'video',
      mimeType: 'video/mp4',
      dataUrl: 'blob:window-background',
      backgroundStyle: { background: '#FFFFFF', opacity: '1', objectPosition: '50% 50%', transform: 'scale(1) scaleX(1) scaleY(1)' },
      masks: []
    }
    inject(window, undefined, undefined, undefined, undefined, undefined, undefined, { hero: null, polaroid: null, windowBackground })

    const video = window.document.querySelector('.dream-window-background-video') as HTMLVideoElement | null
    const prepared = (window as unknown as { __CODEX_DREAM_SKIN_PREPARE_MEDIA__?: () => Record<string, string> }).__CODEX_DREAM_SKIN_PREPARE_MEDIA__?.()
    expect(prepared?.windowBackground).toBe('codex-dream-skin-media-windowBackground')
    expect(video?.muted).toBe(true)
    expect(video?.autoplay).toBe(true)
    expect(video?.loop).toBe(true)
    expect(video?.controls).toBe(false)
    expect(video?.playsInline).toBe(true)
  })

  it('keeps the conversation background outside the scrolling content during streaming updates', () => {
    const window = createWindow()
    window.document.body.innerHTML = '<main class="main-surface"><div class="conversation-viewport"><div class="thread-scroll-container" data-app-action-timeline-scroll><div class="thread-content"><article data-message-author-role="assistant">Reply</article><div class="sticky"><div class="composer-surface-chrome"><div class="ProseMirror" contenteditable="true"></div></div></div></div></div></div></main>'
    const background: RuntimeConversationBackgroundConfig = {
      visible: true,
      mode: 'color',
      color: '#F7FFFF',
      source: null,
      opacity: 1,
      overlayStyle: { ...fullOverlayStyle, background: 'radial-gradient(circle at 50% 40%, #FFFFFF 0%, transparent 100%)' },
      focus: { x: .5, y: .5 },
      scale: 1
    }
    inject(window, undefined, undefined, undefined, undefined, undefined, undefined, { hero: null, polaroid: null, conversationBackground: background })

    const surface = window.document.querySelector('.dream-conversation-surface') as HTMLElement | null
    const viewport = surface?.parentElement
    const backgroundLayer = viewport?.querySelector(':scope > .dream-conversation-background')
    if (!surface || !viewport || !backgroundLayer) throw new Error('Conversation background fixture is missing.')

    const staleBackground = window.document.createElement('div')
    staleBackground.className = 'dream-conversation-background'
    surface.prepend(staleBackground as unknown as Node)
    stateOf(window).ensure()
    expect(staleBackground.isConnected).toBe(false)
    expect(viewport.querySelectorAll(':scope > .dream-conversation-background')).toHaveLength(1)

    surface.scrollTop = 420
    const streamingMessage = window.document.createElement('article')
    streamingMessage.textContent = '继续输出中的新内容'
    surface.querySelector('.thread-content')?.appendChild(streamingMessage as unknown as Node)
    stateOf(window).ensure()

    expect(backgroundLayer.isConnected).toBe(true)
    expect(backgroundLayer.parentElement).toBe(viewport)
    expect(surface.querySelector(':scope > .dream-conversation-background')).toBeNull()
    expect(viewport.querySelectorAll(':scope > .dream-conversation-background')).toHaveLength(1)
    expect(surface.scrollTop).toBe(420)

    const overlay = backgroundLayer.querySelector(':scope > .dream-conversation-background-overlay') as HTMLElement | null
    if (!overlay) throw new Error('Conversation overlay fixture is missing.')
    overlay.style.inset = 'auto'
    overlay.style.left = '42%'
    overlay.style.top = '55%'
    overlay.style.width = '72%'
    overlay.style.height = '62%'
    overlay.style.transform = 'translate(-50%, -50%)'
    overlay.style.borderRadius = '28px'
    overlay.style.filter = 'blur(18px)'
    stateOf(window).ensure()
    expect(overlay.style.left).toBe('0px')
    expect(overlay.style.top).toBe('0px')
    expect(overlay.style.width).toBe('auto')
    expect(overlay.style.height).toBe('auto')
    expect(overlay.style.transform).toBe('none')
    expect(overlay.style.borderRadius).toBe('0px')
    expect(overlay.style.filter).toBe('none')
  })

  it('keeps legacy overlay fallbacks full-size when generated styles are absent', () => {
    const window = createWindow()
    window.document.body.innerHTML = '<main class="main-surface"><div class="thread-scroll-container" data-app-action-timeline-scroll><div class="thread-content"><article data-message-author-role="assistant">Reply</article><div class="composer-surface-chrome"><div class="ProseMirror" contenteditable="true"></div></div></div></div></main>'
    const background: RuntimeConversationBackgroundConfig = {
      visible: true,
      mode: 'color',
      color: '#F7FFFF',
      source: null,
      opacity: 1,
      overlayColor: '#123456',
      overlayOpacity: .35,
      focus: { x: .5, y: .5 },
      scale: 1
    }
    inject(window, undefined, undefined, undefined, undefined, undefined, undefined, { hero: null, polaroid: null, conversationBackground: background })

    const overlay = window.document.querySelector('.dream-conversation-background-overlay') as HTMLElement | null
    expect(overlay?.style.background).toBe('#123456')
    expect(overlay?.style.opacity).toBe('0.35')
    expect(overlay?.style.left).toBe('0px')
    expect(overlay?.style.top).toBe('0px')
    expect(overlay?.style.width).toBe('auto')
    expect(overlay?.style.height).toBe('auto')
  })

  it('keeps the theme enabled when the runtime is injected repeatedly', () => {
    const window = createWindow()
    window.document.body.innerHTML = '<main class="main-surface"><div class="thread-scroll-container" data-app-action-timeline-scroll><div class="thread-content"><article data-message-author-role="assistant">Reply</article><div class="composer-surface-chrome"><div class="ProseMirror" contenteditable="true"></div></div></div></div></main>'
    const background: RuntimeConversationBackgroundConfig = {
      visible: true,
      mode: 'color',
      color: '#F7FFFF',
      source: null,
      opacity: 1,
      overlayStyle: fullOverlayStyle,
      focus: { x: .5, y: .5 },
      scale: 1
    }

    inject(window, undefined, undefined, undefined, undefined, undefined, undefined, { hero: null, polaroid: null, conversationBackground: background })
    const particle = window.document.querySelector('.dream-sparkles > .dream-particle')
    inject(window, undefined, undefined, undefined, undefined, undefined, undefined, { hero: null, polaroid: null, conversationBackground: background })

    expect((window as unknown as { __CODEX_DREAM_SKIN_DISABLED__?: boolean }).__CODEX_DREAM_SKIN_DISABLED__).toBe(false)
    expect(window.document.documentElement.classList.contains('codex-dream-skin')).toBe(true)
    expect(window.document.querySelectorAll('.dream-conversation-background')).toHaveLength(1)
    expect(window.document.querySelectorAll('.dream-conversation-background-overlay')).toHaveLength(1)
    expect(window.document.querySelector('.dream-sparkles > .dream-particle')).toBe(particle)
  })

  it('starts a muted looping conversation video and removes it when the page changes', () => {
    const window = createWindow()
    Object.defineProperty(window.HTMLMediaElement.prototype, 'play', { configurable: true, value: vi.fn(() => Promise.resolve()) })
    Object.defineProperty(window.HTMLMediaElement.prototype, 'load', { configurable: true, value: vi.fn() })
    window.document.body.innerHTML = '<main class="main-surface"><div class="thread-scroll-container" data-app-action-timeline-scroll><div class="thread-content"><article data-message-author-role="assistant">Reply</article><div class="sticky"><div class="composer-surface-chrome"><div class="ProseMirror" contenteditable="true"></div></div></div></div></div></main>'
    const background: RuntimeConversationBackgroundConfig = {
      visible: true,
      mode: 'video',
      color: '#F7FFFF',
      source: { asset: 'assets/background.mp4', kind: 'video', mimeType: 'video/mp4' },
      dataUrl: 'blob:conversation-background',
      opacity: 1,
      overlayStyle: { ...fullOverlayStyle, background: '#000000', opacity: '0.3' },
      focus: { x: .5, y: .5 },
      scale: 1
    }
    inject(window, undefined, undefined, undefined, undefined, undefined, undefined, { hero: null, polaroid: null, conversationBackground: background })
    const video = window.document.querySelector('.dream-conversation-background-video') as HTMLVideoElement | null
    expect(video).not.toBeNull()
    const prepared = (window as unknown as { __CODEX_DREAM_SKIN_PREPARE_MEDIA__?: () => Record<string, string> }).__CODEX_DREAM_SKIN_PREPARE_MEDIA__?.()
    expect(prepared?.conversationBackground).toBe('codex-dream-skin-media-conversationBackground')
    expect(video?.muted).toBe(true)
    expect(video?.loop).toBe(true)
    expect(video?.controls).toBe(false)
    expect(video?.playsInline).toBe(true)
    window.document.body.innerHTML = '<main class="main-surface"><div role="main"><article>Home</article><div class="composer-surface-chrome"><div class="ProseMirror" contenteditable="true"></div></div></div></main>'
    stateOf(window).ensure()
    expect(video?.isConnected).toBe(false)
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
    expect(heroImage?.parentElement?.firstElementChild).not.toBe(heroImage)
    expect(heroImage?.parentElement?.firstElementChild?.classList.contains('hero-host')).toBe(true)
    expect(window.document.querySelector('.dream-heading-region')).not.toBeNull()
    stateOf(window).cleanup()
    expect(window.document.querySelector('.dream-hero-image')).toBeNull()
  })

  it('keeps hero video outside the native content layout and repairs an older first-child injection', () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('Sample-Project')
    inject(window, undefined, undefined, undefined, undefined, undefined, undefined, {
      hero: { kind: 'video', transform: { flipHorizontal: false, flipVertical: true } },
      polaroid: null
    })

    const hero = window.document.querySelector('.dream-layout-root')
    const heroVideo = hero?.querySelector(':scope > .dream-hero-video')
    if (!(heroVideo instanceof window.HTMLVideoElement)) throw new Error('Hero video fixture is missing.')
    expect(heroVideo?.style.transform).toBe('scaleX(1) scaleY(-1)')
    expect(hero?.firstElementChild?.classList.contains('hero-host')).toBe(true)

    hero?.prepend(heroVideo)
    expect(hero?.firstElementChild).toBe(heroVideo)
    stateOf(window).ensure()

    expect(hero?.firstElementChild).not.toBe(heroVideo)
    expect(hero?.firstElementChild?.classList.contains('hero-host')).toBe(true)
    expect(hero?.querySelectorAll(':scope > .dream-hero-video')).toHaveLength(1)
  })

  it('retains the hero video node and playback position across page navigation', () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('Sample-Project')
    Object.defineProperty(window.HTMLMediaElement.prototype, 'play', { configurable: true, value: vi.fn(() => Promise.resolve()) })
    Object.defineProperty(window.HTMLMediaElement.prototype, 'load', { configurable: true, value: vi.fn() })
    inject(window, undefined, undefined, undefined, undefined, undefined, undefined, {
      hero: {
        asset: 'asset-hero-video',
        kind: 'video',
        playback: { autoplay: true, loop: true, sound: false, volume: 0.7 },
        transform: { flipHorizontal: false, flipVertical: false }
      },
      polaroid: null
    })
    const video = window.document.querySelector('#codex-dream-skin-hero-video') as HTMLVideoElement | null
    if (!video) throw new Error('Hero video fixture is missing.')
    Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 9 })

    window.document.body.innerHTML = '<main class="main-surface"><div role="main"><article>Reply</article><div class="composer-surface-chrome"><div class="ProseMirror" contenteditable="true"></div></div></div></main>'
    stateOf(window).ensure()
    expect(video.isConnected).toBe(false)

    window.document.body.innerHTML = homeFixture('Sample-Project')
    stateOf(window).ensure()
    expect(window.document.querySelector('#codex-dream-skin-hero-video')).toBe(video)
    expect(video.currentTime).toBe(9)
    expect(window.document.querySelectorAll('#codex-dream-skin-hero-video')).toHaveLength(1)
  })

  it('starts bound polaroid video and retries autoplay when the media becomes playable', async () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('Sample-Project')
    const play = vi.fn(() => Promise.resolve())
    const load = vi.fn()
    Object.defineProperty(window.HTMLMediaElement.prototype, 'play', { configurable: true, value: play })
    Object.defineProperty(window.HTMLMediaElement.prototype, 'load', { configurable: true, value: load })
    inject(window, undefined, undefined, undefined, undefined, undefined, undefined, {
      hero: null,
      polaroid: {
        kind: 'video',
        mimeType: 'video/mp4',
        playback: { autoplay: true, loop: true, sound: false, volume: 0.7 },
        transform: { flipHorizontal: false, flipVertical: false }
      }
    })

    const inputIds = (window as unknown as { __CODEX_DREAM_SKIN_PREPARE_MEDIA__: () => Record<string, string> }).__CODEX_DREAM_SKIN_PREPARE_MEDIA__()
    const input = window.document.getElementById(inputIds.polaroid ?? '')
    if (!(input instanceof window.HTMLInputElement)) throw new Error('Polaroid media input fixture is missing.')
    Object.defineProperty(input, 'files', { configurable: true, value: [new window.File(['video'], 'polaroid.mp4', { type: 'video/mp4' })] })
    ;(window as unknown as { __CODEX_DREAM_SKIN_ATTACH_MEDIA__: () => boolean }).__CODEX_DREAM_SKIN_ATTACH_MEDIA__()

    const video = window.document.querySelector('.dream-polaroid-video')
    if (!(video instanceof window.HTMLVideoElement)) throw new Error('Polaroid video fixture is missing.')
    expect(load).toHaveBeenCalledTimes(1)
    expect(play).toHaveBeenCalled()
    expect(video.muted).toBe(true)
    expect(video.loop).toBe(true)
    expect(video.volume).toBe(0.7)
    expect(video.id).toBe('codex-dream-skin-polaroid-video')
    expect(video.dataset.dreamMediaKey).toBe(`${themeId}:polaroid`)

    const firstVideo = video
    const callsBeforeCanPlay = play.mock.calls.length
    video.dispatchEvent(new window.Event('canplay'))
    expect(play.mock.calls.length).toBeGreaterThan(callsBeforeCanPlay)
    stateOf(window).ensure()
    expect(window.document.querySelector('.dream-polaroid-video')).toBe(firstVideo)
    expect(load).toHaveBeenCalledTimes(1)
    const polaroid = video.closest('.dream-polaroid') as HTMLElement | null
    if (!polaroid) throw new Error('Polaroid drag fixture is missing.')
    Object.defineProperties(polaroid, {
      offsetLeft: { configurable: true, value: 700 },
      offsetTop: { configurable: true, value: 120 },
      offsetWidth: { configurable: true, value: 200 },
      offsetHeight: { configurable: true, value: 160 }
    })
    let capturedPointer: number | null = null
    polaroid.setPointerCapture = (pointerId: number) => { capturedPointer = pointerId }
    polaroid.hasPointerCapture = (pointerId: number) => capturedPointer === pointerId
    polaroid.releasePointerCapture = () => { capturedPointer = null }
    const pointer = (clientX: number, clientY: number): PointerEvent => ({
      button: 0,
      pointerId: 9,
      clientX,
      clientY,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    }) as unknown as PointerEvent

    play.mockClear()
    polaroid.onpointerdown?.(pointer(720, 140))
    polaroid.onpointermove?.(pointer(740, 160))
    polaroid.onpointerup?.(pointer(740, 160))
    expect(play).toHaveBeenCalled()
    await Promise.resolve()
  })

  it('reuses the same media node and playback position when the document body is replaced', async () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('Sample-Project')
    const play = vi.fn(() => Promise.resolve())
    Object.defineProperty(window.HTMLMediaElement.prototype, 'play', { configurable: true, value: play })
    Object.defineProperty(window.HTMLMediaElement.prototype, 'load', { configurable: true, value: vi.fn() })
    inject(window, undefined, undefined, undefined, undefined, undefined, undefined, {
      hero: null,
      polaroid: {
        kind: 'video',
        mimeType: 'video/mp4',
        playback: { autoplay: true, loop: true, sound: false, volume: 0.7 },
        transform: { flipHorizontal: false, flipVertical: false }
      }
    })
    const inputIds = (window as unknown as { __CODEX_DREAM_SKIN_PREPARE_MEDIA__: () => Record<string, string> }).__CODEX_DREAM_SKIN_PREPARE_MEDIA__()
    const input = window.document.getElementById(inputIds.polaroid ?? '')
    if (!(input instanceof window.HTMLInputElement)) throw new Error('Polaroid media input fixture is missing.')
    Object.defineProperty(input, 'files', { configurable: true, value: [new window.File(['video'], 'polaroid.mp4', { type: 'video/mp4' })] })
    ;(window as unknown as { __CODEX_DREAM_SKIN_ATTACH_MEDIA__: () => boolean }).__CODEX_DREAM_SKIN_ATTACH_MEDIA__()
    const video = window.document.querySelector('#codex-dream-skin-polaroid-video') as HTMLVideoElement | null
    if (!video) throw new Error('Polaroid video fixture is missing.')
    Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 14 })

    const replacement = window.document.createElement('body')
    replacement.innerHTML = homeFixture('Sample-Project')
    window.document.documentElement.replaceChild(replacement, window.document.body)
    await new Promise((resolve) => window.setTimeout(resolve, 220))

    expect(window.document.querySelector('#codex-dream-skin-polaroid-video')).toBe(video)
    expect(video.currentTime).toBe(14)
    expect(window.document.querySelectorAll('#codex-dream-skin-polaroid-video')).toHaveLength(1)
  })

  it('does not reconfigure media for streaming text mutations', async () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('Sample-Project')
    const play = vi.fn(() => Promise.resolve())
    const load = vi.fn()
    Object.defineProperty(window.HTMLMediaElement.prototype, 'play', { configurable: true, value: play })
    Object.defineProperty(window.HTMLMediaElement.prototype, 'load', { configurable: true, value: load })
    inject(window, undefined, undefined, undefined, undefined, undefined, undefined, {
      hero: null,
      polaroid: {
        kind: 'video',
        mimeType: 'video/mp4',
        playback: { autoplay: true, loop: true, sound: false, volume: 0.7 },
        transform: { flipHorizontal: false, flipVertical: false }
      }
    })
    const inputIds = (window as unknown as { __CODEX_DREAM_SKIN_PREPARE_MEDIA__: () => Record<string, string> }).__CODEX_DREAM_SKIN_PREPARE_MEDIA__()
    const input = window.document.getElementById(inputIds.polaroid ?? '')
    if (!(input instanceof window.HTMLInputElement)) throw new Error('Polaroid media input fixture is missing.')
    Object.defineProperty(input, 'files', { configurable: true, value: [new window.File(['video'], 'polaroid.mp4', { type: 'video/mp4' })] })
    ;(window as unknown as { __CODEX_DREAM_SKIN_ATTACH_MEDIA__: () => boolean }).__CODEX_DREAM_SKIN_ATTACH_MEDIA__()
    await new Promise((resolve) => window.setTimeout(resolve, 220))
    play.mockClear()
    load.mockClear()
    const chrome = window.document.getElementById('codex-dream-skin-chrome') as HTMLElement | null
    if (!chrome) throw new Error('Runtime chrome fixture is missing.')
    chrome.style.left = '123px'
    const editor = window.document.querySelector('.ProseMirror')
    const melody = window.document.querySelector('.dream-composer-melody')
    if (!editor || !melody) throw new Error('Composer fixture is missing.')
    const streamingText = window.document.createTextNode('正在调用工具')
    editor.appendChild(streamingText)
    await new Promise((resolve) => window.setTimeout(resolve, 220))
    expect(melody.classList.contains('dream-composer-melody-hidden')).toBe(true)
    streamingText.data = ''
    await new Promise((resolve) => window.setTimeout(resolve, 220))

    expect(load).not.toHaveBeenCalled()
    expect(chrome.style.left).toBe('123px')
    expect(melody.classList.contains('dream-composer-melody-hidden')).toBe(false)
  })

  it('restarts a polaroid video whose playing timeline stalls during DOM streaming', () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('Sample-Project')
    const guardCallbacks: Array<() => void> = []
    const nativeSetInterval = window.setInterval.bind(window)
    window.setInterval = ((handler: (...args: unknown[]) => void, timeout?: number, ...args: unknown[]) => {
      if (timeout === 750 && typeof handler === 'function') {
        guardCallbacks.push(handler as () => void)
        return 750
      }
      return nativeSetInterval(handler, timeout, ...args)
    }) as typeof window.setInterval
    let now = 0
    Object.defineProperty(window.performance, 'now', { configurable: true, value: () => now })
    const play = vi.fn(() => Promise.resolve())
    const pause = vi.fn()
    Object.defineProperty(window.HTMLMediaElement.prototype, 'play', { configurable: true, value: play })
    Object.defineProperty(window.HTMLMediaElement.prototype, 'pause', { configurable: true, value: pause })
    Object.defineProperty(window.HTMLMediaElement.prototype, 'load', { configurable: true, value: vi.fn() })
    inject(window, undefined, undefined, undefined, undefined, undefined, undefined, {
      hero: null,
      polaroid: {
        kind: 'video',
        mimeType: 'video/mp4',
        playback: { autoplay: true, loop: true, sound: false, volume: 0.7 },
        transform: { flipHorizontal: false, flipVertical: false }
      }
    })

    const inputIds = (window as unknown as { __CODEX_DREAM_SKIN_PREPARE_MEDIA__: () => Record<string, string> }).__CODEX_DREAM_SKIN_PREPARE_MEDIA__()
    const input = window.document.getElementById(inputIds.polaroid ?? '')
    if (!(input instanceof window.HTMLInputElement)) throw new Error('Polaroid media input fixture is missing.')
    Object.defineProperty(input, 'files', { configurable: true, value: [new window.File(['video'], 'polaroid.mp4', { type: 'video/mp4' })] })
    ;(window as unknown as { __CODEX_DREAM_SKIN_ATTACH_MEDIA__: () => boolean }).__CODEX_DREAM_SKIN_ATTACH_MEDIA__()

    const video = window.document.querySelector('.dream-polaroid-video')
    if (!(video instanceof window.HTMLVideoElement)) throw new Error('Polaroid video fixture is missing.')
    Object.defineProperties(video, {
      paused: { configurable: true, value: false },
      ended: { configurable: true, value: false },
      readyState: { configurable: true, value: 2 },
      currentTime: { configurable: true, value: 8 }
    })
    play.mockClear()
    pause.mockClear()
    now = 100
    guardCallbacks[0]?.()
    now = 1700
    guardCallbacks[0]?.()

    expect(pause).toHaveBeenCalledOnce()
    expect(play).toHaveBeenCalledOnce()
    expect(template).not.toContain('requestVideoFrameCallback')
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

  it('renders the editable heading decoration as safe text and keeps it idempotent', () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('Sample-Project')
    const decorations = structuredClone(defaultDecorations)
    decorations.homeHeading = { visible: true, text: '<b>标题装饰</b>', fontSize: 23 }

    inject(window, undefined, undefined, undefined, undefined, decorations)

    const decoration = window.document.querySelector('.dream-heading-decoration') as HTMLElement | null
    const region = window.document.querySelector('.dream-heading-region') as HTMLElement | null
    expect(decoration?.textContent).toBe('<b>标题装饰</b>')
    expect(decoration?.querySelector('b')).toBeNull()
    expect(decoration?.style.fontSize).toBe('23px')
    expect(region?.classList.contains('dream-heading-region-decorated')).toBe(true)
    expect(decoration?.nextElementSibling?.classList.contains('dream-heading')).toBe(true)
    expect(window.document.querySelectorAll('.dream-heading-decoration')).toHaveLength(1)

    stateOf(window).ensure()
    stateOf(window).ensure()
    expect(window.document.querySelectorAll('.dream-heading-decoration')).toHaveLength(1)
  })

  it('removes the heading decoration when disabled and compacts overflowing headings', () => {
    const window = createWindow()
    window.document.body.innerHTML = homeFixture('Sample-Project')
    const decorations = structuredClone(defaultDecorations)
    decorations.homeHeading.visible = false
    inject(window, undefined, undefined, undefined, undefined, decorations)
    expect(window.document.querySelector('.dream-heading-decoration')).toBeNull()
    expect(window.document.querySelector('.dream-heading-region')?.classList.contains('dream-heading-region-decorated')).toBe(false)

    const overflowing = createWindow()
    overflowing.document.body.innerHTML = homeFixture('Sample-Project')
    const visibleDecorations = structuredClone(defaultDecorations)
    inject(overflowing, undefined, undefined, undefined, undefined, visibleDecorations)
    const region = overflowing.document.querySelector('.dream-heading-region') as HTMLElement | null
    const heading = overflowing.document.querySelector('.dream-heading') as HTMLElement | null
    const decoration = overflowing.document.querySelector('.dream-heading-decoration') as HTMLElement | null
    const actionGrid = overflowing.document.querySelector('.dream-action-grid') as HTMLElement | null
    if (!region || !heading || !decoration || !actionGrid) throw new Error('Heading layout fixture is incomplete.')
    Object.defineProperties(region, {
      clientHeight: { configurable: true, value: 180 },
      getBoundingClientRect: { configurable: true, value: () => ({ top: 0, bottom: 180, left: 0, right: 700, width: 700, height: 180 }) }
    })
    Object.defineProperties(heading, {
      scrollHeight: { configurable: true, value: 300 },
      getBoundingClientRect: { configurable: true, value: () => ({ top: 0, bottom: 260, left: 0, right: 500, width: 500, height: 260 }) }
    })
    Object.defineProperty(decoration, 'getBoundingClientRect', { configurable: true, value: () => ({ top: 0, bottom: 20, left: 0, right: 100, width: 100, height: 20 }) })
    Object.defineProperty(actionGrid, 'getBoundingClientRect', { configurable: true, value: () => ({ top: 200, bottom: 340, left: 0, right: 700, width: 700, height: 140 }) })
    region.removeAttribute('data-dream-heading-measure-key')
    stateOf(overflowing).ensure()
    expect(region.dataset.dreamHeadingDensity).toBe('condensed')
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
