import { Window } from 'happy-dom'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImportedFontAsset, RuntimeStatus, StudioApi } from '../src/shared/contracts'
import { createDefaultTheme, type ThemeProfile } from '../src/shared/theme'
import { App } from '../src/renderer/src/App'
import { ICON_PREVIEW_TARGETS, PREVIEW_TARGETS } from '../src/renderer/src/preview-editing'

const GLOBAL_KEYS = [
  'window', 'document', 'navigator', 'Element', 'HTMLElement', 'Node', 'Event',
  'InputEvent', 'MouseEvent', 'PointerEvent', 'KeyboardEvent', 'ResizeObserver'
] as const

const runtimeStatus: RuntimeStatus = {
  phase: 'idle',
  port: 9335,
  connected: false,
  targetCount: 0,
  codexVersion: null,
  backupAvailable: false,
  lastError: null,
  message: '等待检测 Codex'
}

describe('Studio preview editing interaction', () => {
  let browserWindow: Window
  let root: Root
  let container: HTMLElement
  let previous: Map<string, PropertyDescriptor | undefined>
  let scrollIntoView: ReturnType<typeof vi.fn>
  let savedProfiles: ThemeProfile[]
  let alternateProfile: ThemeProfile
  let selectedFontAsset: ImportedFontAsset | null
  let selectIcon: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    browserWindow = new Window({ url: 'app://-/index.html' })
    previous = new Map(GLOBAL_KEYS.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
    const profile = createDefaultTheme('00000000-0000-4000-8000-000000000000')
    alternateProfile = createDefaultTheme('00000000-0000-4000-8000-000000000001', '备用主题')
    profile.polaroid.sourceImage = 'assets/polaroid.png'
    profile.polaroid.sourceSize = { width: 1000, height: 800 }
    savedProfiles = []
    selectedFontAsset = null
    selectIcon = vi.fn(async () => null)
    const studio: StudioApi = {
      app: { getInfo: async () => ({ version: 'test', platform: 'win32' }) },
      themes: {
        list: async () => [
          { id: profile.id, name: profile.name, updatedAt: profile.updatedAt, active: true },
          { id: alternateProfile.id, name: alternateProfile.name, updatedAt: alternateProfile.updatedAt, active: false }
        ],
        get: async (id) => id === alternateProfile.id ? alternateProfile : profile,
        create: async () => profile,
        duplicate: async () => profile,
        update: async (next) => {
          savedProfiles.push(structuredClone(next))
          return next
        },
        delete: async () => undefined,
        activate: async (id) => id === alternateProfile.id ? alternateProfile : profile,
        compile: async () => ({ css: '', rendererPayload: '', assets: { 'assets/polaroid.png': 'data:image/png;base64,AA==' } }),
        subscribePolaroidPlacement: () => () => undefined
      },
    assets: {
      selectImage: async () => null,
      selectIcon,
      selectFont: async () => selectedFontAsset
    },
      codex: {
        detect: async () => ({ found: true, version: 'test', executable: '', packageFamilyName: '', running: false, backupAvailable: false }),
        installTheme: async () => runtimeStatus,
        start: async () => runtimeStatus,
        verify: async () => runtimeStatus,
        reinject: async () => runtimeStatus,
        stop: async () => runtimeStatus,
        restore: async () => runtimeStatus
      },
      runtime: {
        getStatus: async () => runtimeStatus,
        subscribeStatus: () => () => undefined
      }
    }
    ;(browserWindow as unknown as { studio: StudioApi }).studio = studio

    class ResizeObserverStub {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(): void { this.callback([], this as unknown as ResizeObserver) }
      unobserve(): void {}
      disconnect(): void {}
    }

    const values: Record<(typeof GLOBAL_KEYS)[number], unknown> = {
      window: browserWindow,
      document: browserWindow.document,
      navigator: browserWindow.navigator,
      Element: browserWindow.Element,
      HTMLElement: browserWindow.HTMLElement,
      Node: browserWindow.Node,
      Event: browserWindow.Event,
      InputEvent: browserWindow.InputEvent,
      MouseEvent: browserWindow.MouseEvent,
      PointerEvent: browserWindow.PointerEvent,
      KeyboardEvent: browserWindow.KeyboardEvent,
      ResizeObserver: ResizeObserverStub
    }
    for (const key of GLOBAL_KEYS) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: values[key] })
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, writable: true, value: true })
    Object.defineProperty(browserWindow.HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value() {
        const width = this.classList?.contains('preview-stage') ? 900 : this.hasAttribute?.('data-preview-target') ? 120 : 1280
        const height = this.classList?.contains('preview-stage') ? 700 : this.hasAttribute?.('data-preview-target') ? 60 : 820
        return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON: () => ({}) }
      }
    })
    Object.defineProperty(browserWindow.HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return this.classList?.contains('preview-edit-popover') ? 270 : 0 } })
    Object.defineProperty(browserWindow.HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return this.classList?.contains('preview-edit-popover') ? 180 : 0 } })
    Object.defineProperty(browserWindow.HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() })
    scrollIntoView = vi.fn()
    Object.defineProperty(browserWindow.HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })

    const element = browserWindow.document.createElement('div')
    browserWindow.document.body.append(element)
    container = element as unknown as HTMLElement
    root = createRoot(container)
    await act(async () => {
      root.render(React.createElement(App))
      await Promise.resolve()
      await new Promise((resolve) => browserWindow.setTimeout(resolve, 0))
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    browserWindow.close()
    for (const key of GLOBAL_KEYS) {
      const descriptor = previous.get(key)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT')
  })

  const pointerDown = (element: Element): void => {
    act(() => element.dispatchEvent(new browserWindow.PointerEvent('pointerdown', { bubbles: true, button: 0 }) as unknown as PointerEvent))
  }

  const enterQuickCopy = (value: string): void => {
    const control = container.querySelector<HTMLInputElement | HTMLTextAreaElement>('[role="dialog"] .quick-copy-field input, [role="dialog"] .quick-copy-field textarea')
    if (!control) throw new Error('Quick copy control is missing.')
    const prototype = control.tagName === 'TEXTAREA'
      ? browserWindow.HTMLTextAreaElement.prototype
      : browserWindow.HTMLInputElement.prototype
    act(() => {
      control.focus()
      Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(control, value)
      control.dispatchEvent(new browserWindow.Event('input', { bubbles: true }) as unknown as Event)
      control.dispatchEvent(new browserWindow.Event('change', { bubbles: true }) as unknown as Event)
    })
  }

  const setInputValue = (control: HTMLInputElement, value: string): void => {
    control.focus()
    Object.getOwnPropertyDescriptor(browserWindow.HTMLInputElement.prototype, 'value')?.set?.call(control, value)
    control.dispatchEvent(new browserWindow.InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }) as unknown as InputEvent)
    control.dispatchEvent(new browserWindow.Event('change', { bubbles: true }) as unknown as Event)
  }

  const clickDialogButton = (label: string): void => {
    const button = [...container.querySelectorAll('[role="dialog"] button')].find((candidate) => candidate.textContent?.trim() === label)
    if (!button) throw new Error(`Dialog button ${label} is missing.`)
    button.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
  }

  it('opens the most specific nested target and closes with Escape or outside click', () => {
    for (const targetId of Object.values(ICON_PREVIEW_TARGETS)) {
      expect(container.querySelector(`[data-preview-target="${targetId}"]`), `${targetId} should be rendered`).not.toBeNull()
    }
    const renderedTargets = new Set([...container.querySelectorAll('[data-preview-target]')].map((node) => node.getAttribute('data-preview-target')))
    const conversationSwitch = container.querySelector<HTMLButtonElement>('button[title="会话预览"]')
    const homeSwitch = container.querySelector<HTMLButtonElement>('button[title="首页预览"]')
    if (!conversationSwitch || !homeSwitch) throw new Error('Preview page switch is missing.')
    act(() => conversationSwitch.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))
    for (const node of container.querySelectorAll('[data-preview-target]')) renderedTargets.add(node.getAttribute('data-preview-target'))
    for (const targetId of Object.keys(PREVIEW_TARGETS)) expect(renderedTargets.has(targetId), `${targetId} should have a rendered target`).toBe(true)
    act(() => homeSwitch.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))

    const cardIcon = container.querySelector('[data-preview-target="icon-card-primary"]')
    if (!cardIcon) throw new Error('Primary card icon target is missing.')
    pointerDown(cardIcon)
    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('主卡片图标快捷配置')

    act(() => browserWindow.document.dispatchEvent(new browserWindow.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(container.querySelector('[role="dialog"]')).toBeNull()

    const card = container.querySelector('[data-preview-target="palette-action-card"]')
    if (!card) throw new Error('Action card target is missing.')
    pointerDown(card)
    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('操作卡片快捷配置')
    pointerDown(browserWindow.document.body as unknown as Element)
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('previews normal, hover, and selected paints and groups continuous drag into one undo step', () => {
    const selector = container.querySelector<HTMLElement>('[data-preview-target="project-selector"]')
    const canvas = container.querySelector<HTMLElement>('.codex-preview')
    if (!selector || !canvas) throw new Error('Project selector preview is missing.')
    pointerDown(selector)

    expect(canvas.style.getPropertyValue('--dream-project-selector')).toContain('linear-gradient(135deg')
    let angle = container.querySelector<HTMLInputElement>('[role="dialog"] .paint-control > .range-row input')
    if (!angle) throw new Error('Gradient angle control is missing.')
    act(() => setInputValue(angle!, '210'))
    angle = container.querySelector<HTMLInputElement>('[role="dialog"] .paint-control > .range-row input')
    if (!angle) throw new Error('Gradient angle control disappeared.')
    act(() => setInputValue(angle!, '240'))
    act(() => angle!.dispatchEvent(new browserWindow.PointerEvent('pointerup', { bubbles: true }) as unknown as PointerEvent))
    expect(canvas.style.getPropertyValue('--dream-project-selector')).toContain('linear-gradient(240deg')

    const undo = container.querySelector<HTMLButtonElement>('button[title="撤销"]')
    if (!undo) throw new Error('Undo command is missing.')
    act(() => undo.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))
    expect(canvas.style.getPropertyValue('--dream-project-selector')).toContain('linear-gradient(135deg')

    act(() => clickDialogButton('悬停'))
    expect(selector.getAttribute('data-preview-state')).toBe('hover')
    act(() => clickDialogButton('径向'))
    expect(canvas.style.getPropertyValue('--dream-project-selector-hover')).toContain('radial-gradient(')
    act(() => clickDialogButton('选中'))
    expect(selector.getAttribute('data-preview-state')).toBe('selected')
    act(() => clickDialogButton('普通'))
    expect(selector.getAttribute('data-preview-state')).toBe('normal')
  })

  it('exposes an independent selected state for task rows', () => {
    const task = container.querySelector<HTMLElement>('[data-preview-target="sidebar-task"]')
    const canvas = container.querySelector<HTMLElement>('.codex-preview')
    if (!task || !canvas) throw new Error('Task row preview is missing.')
    pointerDown(task)

    const stateButtons = [...container.querySelectorAll('[role="dialog"] .state-tabs button')].map((button) => button.textContent?.trim())
    expect(stateButtons).toEqual(['普通', '悬停', '选中'])
    act(() => clickDialogButton('选中'))
    expect(task.getAttribute('data-preview-state')).toBe('selected')
    expect(canvas.style.getPropertyValue('--dream-sidebar-task-row-selected')).toContain('linear-gradient(90deg')

    const selectedText = [...container.querySelectorAll<HTMLInputElement>('[role="dialog"] .color-text-input')].find((input) => input.value === '#20BCC3')
    expect(selectedText).toBeTruthy()
  })

  it('persists a user gradient edited directly from the inherited default', async () => {
    const selector = container.querySelector<HTMLElement>('[data-preview-target="project-selector"]')
    if (!selector) throw new Error('Project selector preview is missing.')
    pointerDown(selector)

    const angle = container.querySelector<HTMLInputElement>('[role="dialog"] .paint-control > .range-row input')
    if (!angle) throw new Error('Inherited gradient angle control is missing.')
    act(() => {
      setInputValue(angle, '225')
      angle.dispatchEvent(new browserWindow.PointerEvent('pointerup', { bubbles: true }) as unknown as PointerEvent)
    })

    const save = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('保存主题'))
    if (!save) throw new Error('Save theme command is missing.')
    await act(async () => {
      save.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
      await Promise.resolve()
    })

    expect(savedProfiles).toHaveLength(1)
    expect(savedProfiles[0]?.appearance.paints.projectSelector).toMatchObject({ kind: 'linear', angle: 225 })
  })

  it('supports keyboard selection and links quick editing to the full inspector', async () => {
    const brand = container.querySelector<HTMLElement>('[data-preview-target="palette-brand"]')
    if (!brand) throw new Error('Brand palette target is missing.')
    pointerDown(brand)
    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('品牌栏快捷配置')
    act(() => browserWindow.document.dispatchEvent(new browserWindow.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    act(() => brand.dispatchEvent(new browserWindow.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }) as unknown as KeyboardEvent))
    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('品牌栏快捷配置')

    const composerIcon = container.querySelector('[data-preview-target="icon-composer"]')
    if (!composerIcon) throw new Error('Composer icon target is missing.')
    pointerDown(composerIcon)
    const more = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('更多设置'))
    if (!more) throw new Error('More settings command is missing.')
    await act(async () => {
      more.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
      await new Promise((resolve) => browserWindow.setTimeout(resolve, 20))
    })

    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(container.querySelector('[data-inspector-anchor="appearance-composer"]')?.classList.contains('inspector-highlight')).toBe(true)
    expect(scrollIntoView).toHaveBeenCalled()

    pointerDown(composerIcon)
    const iconSettings = [...container.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent?.includes('图标设置'))
    if (!iconSettings) throw new Error('Icon settings command is missing.')
    await act(async () => {
      iconSettings.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
      await new Promise((resolve) => browserWindow.setTimeout(resolve, 20))
    })
    expect(container.querySelector('[data-inspector-anchor="icon-composer"]')?.classList.contains('inspector-highlight')).toBe(true)

    const brandTitle = container.querySelector('[data-preview-target="copy-brand-title"]')
    if (!brandTitle) throw new Error('Brand title target is missing.')
    pointerDown(brandTitle)
    const fontSettings = [...container.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent?.includes('字体管理'))
    if (!fontSettings) throw new Error('Font management command is missing.')
    await act(async () => {
      fontSettings.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
      await new Promise((resolve) => browserWindow.setTimeout(resolve, 20))
    })
    expect(container.querySelector('[data-inspector-anchor="typography"]')?.classList.contains('inspector-highlight')).toBe(true)
  })

  it('opens custom icon import from both quick editing and the full icon inspector', async () => {
    const composerIcon = container.querySelector('[data-preview-target="icon-composer"]')
    if (!composerIcon) throw new Error('Composer icon target is missing.')

    pointerDown(composerIcon)
    const quickSelect = container.querySelector<HTMLSelectElement>('[role="dialog"] [data-icon-slot="composer"] select')
    if (!quickSelect) throw new Error('Quick icon selector is missing.')
    act(() => {
      quickSelect.value = '__asset'
      quickSelect.dispatchEvent(new browserWindow.Event('change', { bubbles: true }) as unknown as Event)
    })
    expect(selectIcon).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000000')

    const iconSettings = [...container.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent?.includes('图标设置'))
    if (!iconSettings) throw new Error('Icon settings command is missing.')
    await act(async () => {
      iconSettings.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
      await new Promise((resolve) => browserWindow.setTimeout(resolve, 20))
    })

    const inspectorSelect = container.querySelector<HTMLSelectElement>('[data-inspector-anchor="icon-composer"] select')
    if (!inspectorSelect) throw new Error('Inspector icon selector is missing.')
    act(() => {
      inspectorSelect.value = '__asset'
      inspectorSelect.dispatchEvent(new browserWindow.Event('change', { bubbles: true }) as unknown as Event)
    })
    expect(selectIcon).toHaveBeenCalledTimes(2)
  })

  it('keeps particles and composer melody synchronized across home and conversation previews', async () => {
    expect(container.querySelectorAll('[data-preview-target="sparkles"]')).toHaveLength(6)
    const particleLayer = container.querySelector<HTMLElement>('.preview-sparkles')
    expect(particleLayer?.style.getPropertyValue('--dream-particle-top')).toBe('66px')
    expect(particleLayer?.style.getPropertyValue('--dream-particle-view-width')).toBe('1010px')
    expect(particleLayer?.style.getPropertyValue('--dream-particle-view-height')).toBe('754px')
    const firstParticle = container.querySelector<HTMLElement>('[data-preview-target="sparkles"]')
    if (!firstParticle) throw new Error('Background particle target is missing.')
    expect(firstParticle.querySelectorAll(':scope > .preview-particle-trail')).toHaveLength(1)
    pointerDown(firstParticle)
    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('背景粒子快捷配置')
    expect(firstParticle.getAttribute('data-preview-selected')).toBe('true')
    const count = [...container.querySelectorAll('[role="dialog"] .range-row')].find((row) => row.querySelector('span')?.textContent === '数量')?.querySelector<HTMLInputElement>('input')
    if (!count) throw new Error('Particle count control is missing.')
    act(() => {
      setInputValue(count, '10')
      count.dispatchEvent(new browserWindow.PointerEvent('pointerup', { bubbles: true }) as unknown as PointerEvent)
    })
    expect(container.querySelectorAll('[data-preview-target="sparkles"]')).toHaveLength(10)

    const undo = container.querySelector<HTMLButtonElement>('button[title="撤销"]')
    if (!undo) throw new Error('Undo command is missing.')
    act(() => undo.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))
    expect(container.querySelectorAll('[data-preview-target="sparkles"]')).toHaveLength(6)

    const particleBeforeShuffle = container.querySelector<HTMLElement>('[data-preview-target="sparkles"]')
    if (!particleBeforeShuffle) throw new Error('Particle disappeared after undo.')
    const originalX = particleBeforeShuffle.style.getPropertyValue('--dream-particle-x')
    pointerDown(particleBeforeShuffle)
    const rainMode = [...container.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent === '垂直雨落')
    if (!rainMode) throw new Error('Rain particle mode is missing.')
    act(() => rainMode.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))
    expect(container.querySelector('.preview-sparkles')?.getAttribute('data-dream-effect')).toBe('rain')
    const rainIcon = container.querySelector<HTMLSelectElement>('[role="dialog"] [data-icon-slot="backgroundRain"] select')
    const speed = [...container.querySelectorAll('[role="dialog"] .range-row')].find((row) => row.querySelector('span')?.textContent === '速度')?.querySelector<HTMLInputElement>('input')
    const shuffle = [...container.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent?.includes('重新排列'))
    const addColor = [...container.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent?.includes('添加颜色'))
    if (!rainIcon || !speed || !shuffle || !addColor) throw new Error('Particle arrangement controls are missing.')
    act(() => {
      rainIcon.value = 'star'
      rainIcon.dispatchEvent(new browserWindow.Event('change', { bubbles: true }) as unknown as Event)
      setInputValue(speed, '1.5')
      speed.dispatchEvent(new browserWindow.PointerEvent('pointerup', { bubbles: true }) as unknown as PointerEvent)
      shuffle.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
      addColor.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
    })
    expect(container.querySelector<HTMLElement>('[data-preview-target="sparkles"]')?.style.getPropertyValue('--dream-particle-x')).not.toBe(originalX)
    expect(container.querySelectorAll<HTMLElement>('[data-preview-target="sparkles"]')[1]?.style.getPropertyValue('--dream-sparkle-color')).toBe('#20bcc3')
    expect(container.querySelector('[data-preview-target="sparkles"] .builtin-icon-glyph')?.textContent).toBe('★')

    const more = [...container.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent?.includes('更多设置'))
    if (!more) throw new Error('Particle more settings command is missing.')
    await act(async () => {
      more.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
      await new Promise((resolve) => browserWindow.setTimeout(resolve, 20))
    })
    expect(container.querySelector('[data-inspector-anchor="visual-sparkles"]')?.classList.contains('inspector-highlight')).toBe(true)

    const conversation = container.querySelector<HTMLButtonElement>('button[title="会话预览"]')
    if (!conversation) throw new Error('Conversation preview command is missing.')
    act(() => conversation.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))
    expect(container.querySelectorAll('[data-preview-target="sparkles"]')).toHaveLength(6)
    const melody = container.querySelector<HTMLElement>('[data-preview-target="composer-melody"]')
    if (!melody) throw new Error('Conversation melody target is missing.')
    pointerDown(melody)
    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('输入框旋律快捷配置')
    enterQuickCopy('<b>自定义旋律 ♪</b>')
    const fontSize = [...container.querySelectorAll('[role="dialog"] .range-row')].find((row) => row.querySelector('span')?.textContent === '字号')?.querySelector<HTMLInputElement>('input')
    const positionX = [...container.querySelectorAll('[role="dialog"] .range-row')].find((row) => row.querySelector('span')?.textContent === '水平位置')?.querySelector<HTMLInputElement>('input')
    if (!fontSize || !positionX) throw new Error('Melody geometry controls are missing.')
    act(() => {
      setInputValue(fontSize, '22')
      fontSize.dispatchEvent(new browserWindow.PointerEvent('pointerup', { bubbles: true }) as unknown as PointerEvent)
      setInputValue(positionX, '0.7')
      positionX.dispatchEvent(new browserWindow.PointerEvent('pointerup', { bubbles: true }) as unknown as PointerEvent)
    })
    const updatedMelody = container.querySelector<HTMLElement>('[data-preview-target="composer-melody"]')
    expect(updatedMelody?.textContent).toBe('<b>自定义旋律 ♪</b>')
    expect(updatedMelody?.querySelector('b')).toBeNull()
    expect(updatedMelody?.style.fontSize).toBe('22px')
    expect(updatedMelody?.style.left).toBe('70%')

    const home = container.querySelector<HTMLButtonElement>('button[title="首页预览"]')
    if (!home) throw new Error('Home preview command is missing.')
    act(() => home.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))
    expect(container.querySelector('[data-preview-target="composer-melody"]')?.textContent).toBe('<b>自定义旋律 ♪</b>')

    const save = container.querySelector<HTMLButtonElement>('.preview-actions .primary-button')
    if (!save) throw new Error('Save command is missing.')
    await act(async () => {
      save.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
      await Promise.resolve()
    })
    expect(savedProfiles.at(-1)?.decorations).toMatchObject({
      sparkles: { effect: 'rain', speed: 1.5, seed: 1, extraColors: ['#20bcc3'] },
      composerMelody: { text: '<b>自定义旋律 ♪</b>', fontSize: 22, position: { x: 0.7, y: 0.35 } }
    })
    expect(savedProfiles.at(-1)?.icons).toMatchObject({ backgroundSparkle: { name: 'sparkles' }, backgroundRain: { name: 'star' } })

    const reset = container.querySelector<HTMLButtonElement>('button[title="恢复默认"]')
    if (!reset) throw new Error('Restore defaults command is missing.')
    act(() => reset.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))
    expect(container.querySelectorAll('[data-preview-target="sparkles"]')).toHaveLength(6)
    expect(container.querySelector('.preview-sparkles')?.getAttribute('data-dream-effect')).toBe('twinkle')
    expect(container.querySelector('[data-preview-target="composer-melody"]')?.textContent).toBe('♫ · · · ♡ · · · ♪')

    const iconInspector = [...container.querySelectorAll('.sidebar-nav button')].find((button) => button.textContent?.includes('图标样式'))
    if (!iconInspector) throw new Error('Icon inspector command is missing.')
    act(() => iconInspector.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))
    const particleGroup = [...container.querySelectorAll('.property-group')].find((group) => group.querySelector('h3')?.textContent === '粒子动效素材')
    expect(particleGroup?.querySelectorAll('[data-icon-slot]')).toHaveLength(5)
  })

  it('edits, validates, undoes, saves, and links each brand copy target', async () => {
    const title = container.querySelector('[data-preview-target="copy-brand-title"]')
    if (!title) throw new Error('Brand title target is missing.')
    pointerDown(title)
    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('品牌主标题快捷配置')
    enterQuickCopy('新的品牌主标题')
    expect(container.querySelector('[data-preview-target="copy-brand-title"]')?.textContent).toBe('新的品牌主标题')

    const undo = container.querySelector<HTMLButtonElement>('button[title="撤销"]')
    if (!undo) throw new Error('Undo command is missing.')
    act(() => undo.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))
    expect(container.querySelector('[data-preview-target="copy-brand-title"]')?.textContent).toBe('初音未来主题 Codex App')

    const cases = [
      ['copy-brand-title', '品牌主标题快捷配置', '保存后的品牌标题'],
      ['copy-brand-subtitle', '品牌副标题快捷配置', '保存后的品牌副标题'],
      ['copy-brand-signature', '品牌签名快捷配置', 'MIKU SAVED']
    ] as const
    for (const [targetId, dialogLabel, value] of cases) {
      const target = container.querySelector(`[data-preview-target="${targetId}"]`)
      if (!target) throw new Error(`${targetId} is missing.`)
      pointerDown(target)
      expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(dialogLabel)
      enterQuickCopy(value)
      expect(container.querySelector(`[data-preview-target="${targetId}"]`)?.textContent).toBe(value)
    }

    const signature = container.querySelector('[data-preview-target="copy-brand-signature"]')
    if (!signature) throw new Error('Brand signature target is missing.')
    pointerDown(signature)
    const more = [...container.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent?.includes('更多设置'))
    if (!more) throw new Error('Brand more settings command is missing.')
    await act(async () => {
      more.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
      await new Promise((resolve) => browserWindow.setTimeout(resolve, 20))
    })
    expect(container.querySelector('[data-inspector-anchor="appearance-brand"]')?.classList.contains('inspector-highlight')).toBe(true)
    expect(scrollIntoView).toHaveBeenCalled()

    const savedTitle = container.querySelector('[data-preview-target="copy-brand-title"]')
    if (!savedTitle) throw new Error('Brand title target disappeared.')
    pointerDown(savedTitle)
    enterQuickCopy('')
    expect(container.querySelector<HTMLButtonElement>('.preview-actions .primary-button')?.disabled).toBe(true)
    expect(container.querySelector('[role="dialog"] .field-error')?.textContent).toBe('品牌主标题不能为空。')
    enterQuickCopy('最终品牌标题')

    const save = container.querySelector<HTMLButtonElement>('.preview-actions .primary-button')
    if (!save) throw new Error('Save command is missing.')
    await act(async () => {
      save.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
      await Promise.resolve()
    })
    expect(savedProfiles.at(-1)?.copy).toMatchObject({
      brandTitle: '最终品牌标题',
      brandSubtitle: '保存后的品牌副标题',
      brandSignature: 'MIKU SAVED'
    })
  })

  it('keeps optional brand copy targets selectable after they are cleared', () => {
    const cases = [
      ['copy-brand-subtitle', '品牌副标题快捷配置'],
      ['copy-brand-signature', '品牌签名快捷配置']
    ] as const

    for (const [targetId, dialogLabel] of cases) {
      const target = container.querySelector(`[data-preview-target="${targetId}"]`)
      if (!target) throw new Error(`${targetId} is missing.`)
      pointerDown(target)
      enterQuickCopy('')
      expect(container.querySelector(`[data-preview-target="${targetId}"]`)?.textContent).toBe('')
      act(() => browserWindow.document.dispatchEvent(new browserWindow.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))

      const clearedTarget = container.querySelector(`[data-preview-target="${targetId}"]`)
      if (!clearedTarget) throw new Error(`${targetId} disappeared after being cleared.`)
      pointerDown(clearedTarget)
      expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(dialogLabel)
      act(() => browserWindow.document.dispatchEvent(new browserWindow.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    }
  })

  it('imports a font once, reuses it across slots, saves it, and restores defaults', async () => {
    selectedFontAsset = {
      id: 'font-test',
      relativePath: 'assets/font-test.woff2',
      dataUrl: 'data:font/woff2;base64,d09GMg==',
      mediaType: 'font/woff2',
      originalName: 'test.woff2',
      family: 'Test Font',
      format: 'woff2'
    }
    const title = container.querySelector('[data-preview-target="copy-brand-title"]')
    const canvas = container.querySelector<HTMLElement>('.codex-preview')
    if (!title || !canvas) throw new Error('Brand title preview is missing.')
    pointerDown(title)
    const importButton = container.querySelector<HTMLButtonElement>('[role="dialog"] button[title="为品牌主标题导入字体"]')
    if (!importButton) throw new Error('Brand title font import command is missing.')
    await act(async () => {
      importButton.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
      await Promise.resolve()
      await new Promise((resolve) => browserWindow.setTimeout(resolve, 0))
    })
    expect(canvas.style.getPropertyValue('--dream-font-brand-title')).toContain('Dream Imported font-test')
    expect(container.querySelector('.codex-preview style')?.textContent).toContain('data:font/woff2;base64,d09GMg==')

    const subtitle = container.querySelector('[data-preview-target="copy-brand-subtitle"]')
    if (!subtitle) throw new Error('Brand subtitle preview is missing.')
    pointerDown(subtitle)
    const select = container.querySelector<HTMLSelectElement>('[role="dialog"] .font-control select')
    if (!select) throw new Error('Brand subtitle font selector is missing.')
    expect(select.querySelector('option[value="imported:font-test"]')?.textContent).toBe('Test Font')
    act(() => {
      select.value = 'imported:font-test'
      select.dispatchEvent(new browserWindow.Event('change', { bubbles: true }) as unknown as Event)
    })
    expect(canvas.style.getPropertyValue('--dream-font-brand-subtitle')).toContain('Dream Imported font-test')

    const melody = container.querySelector('[data-preview-target="composer-melody"]')
    if (!melody) throw new Error('Composer melody preview is missing.')
    pointerDown(melody)
    const melodyFont = container.querySelector<HTMLSelectElement>('[role="dialog"] [data-font-slot="composerMelody"] select')
    if (!melodyFont) throw new Error('Composer melody font selector is missing.')
    expect(melodyFont.querySelector('option[value="imported:font-test"]')?.textContent).toBe('Test Font')
    act(() => {
      melodyFont.value = 'imported:font-test'
      melodyFont.dispatchEvent(new browserWindow.Event('change', { bubbles: true }) as unknown as Event)
    })
    expect(canvas.style.getPropertyValue('--dream-font-composer-melody')).toContain('Dream Imported font-test')

    const save = container.querySelector<HTMLButtonElement>('.preview-actions .primary-button')
    if (!save) throw new Error('Save command is missing.')
    await act(async () => {
      save.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
      await Promise.resolve()
    })
    expect(savedProfiles.at(-1)?.typography).toMatchObject({
      slots: { brandTitle: { kind: 'imported', id: 'font-test' }, brandSubtitle: { kind: 'imported', id: 'font-test' }, composerMelody: { kind: 'imported', id: 'font-test' } },
      importedFonts: [{ id: 'font-test', family: 'Test Font' }]
    })

    const reset = container.querySelector<HTMLButtonElement>('button[title="恢复默认"]')
    if (!reset) throw new Error('Restore defaults command is missing.')
    act(() => reset.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))
    expect(canvas.style.getPropertyValue('--dream-font-brand-title')).toBe('var(--dream-font-ui)')
    expect(container.querySelector('.codex-preview style')).toBeNull()
  })

  it('clears the popover and invalid local color input when switching themes', async () => {
    const colorInput = container.querySelector<HTMLInputElement>('[data-color-token="globalText"] .color-text-input')
    const brand = container.querySelector('[data-preview-target="palette-brand"]')
    if (!colorInput || !brand) throw new Error('Theme-switch fixtures are missing.')
    act(() => setInputValue(colorInput, 'url(https://example.com/not-a-color)'))
    expect(colorInput.getAttribute('aria-invalid')).toBe('true')
    pointerDown(brand)
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()

    const alternateLabel = [...container.querySelectorAll('.theme-item strong')].find((node) => node.textContent === '备用主题')
    const alternateButton = alternateLabel?.closest('button')
    if (!alternateButton) throw new Error('Alternate theme is missing.')
    await act(async () => {
      alternateButton.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
      await Promise.resolve()
      await new Promise((resolve) => browserWindow.setTimeout(resolve, 0))
    })
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    const nextInput = container.querySelector<HTMLInputElement>('[data-color-token="globalText"] .color-text-input')
    expect(nextInput?.value).toBe(alternateProfile.colors.ink)
    expect(nextInput?.getAttribute('aria-invalid')).toBe('false')
  })

  it('keeps pin selection separate from polaroid dragging', () => {
    const pin = container.querySelector('[data-preview-target="icon-polaroid-pin"]')
    const polaroid = container.querySelector<HTMLElement>('[data-preview-target="polaroid"]')
    const preview = container.querySelector('.codex-preview')
    if (!pin || !polaroid || !preview) throw new Error('Polaroid editing targets are missing.')
    expect(container.querySelectorAll('[data-preview-target="icon-project"]').length).toBeGreaterThan(0)

    pointerDown(pin)
    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('图钉图标快捷配置')
    act(() => preview.dispatchEvent(new browserWindow.PointerEvent('pointermove', { bubbles: true, pointerId: 4, clientX: 110, clientY: 55 }) as unknown as PointerEvent))
    expect(polaroid.style.left).toBe('72%')

    pointerDown(polaroid)
    act(() => preview.dispatchEvent(new browserWindow.PointerEvent('pointermove', { bubbles: true, pointerId: 5, clientX: 110, clientY: 55 }) as unknown as PointerEvent))
    expect(container.querySelector<HTMLElement>('[data-preview-target="polaroid"]')?.style.left).not.toBe('72%')
  })
})
