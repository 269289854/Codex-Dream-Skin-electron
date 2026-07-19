import { Window } from 'happy-dom'
import { act, createElement, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PreviewQuickEditor } from '../src/renderer/src/PreviewQuickEditor'
import { PREVIEW_TARGETS, type PreviewTargetDefinition } from '../src/renderer/src/preview-editing'
import { createDefaultTheme, type ThemeProfile } from '../src/shared/theme'

const GLOBAL_KEYS = ['window', 'document', 'navigator', 'Element', 'HTMLElement', 'Node', 'Event', 'MouseEvent'] as const

describe('preview quick editor', () => {
  let browserWindow: Window
  let root: Root
  let container: HTMLElement
  let previous: Map<string, PropertyDescriptor | undefined>

  beforeEach(() => {
    browserWindow = new Window({ url: 'app://-/index.html' })
    previous = new Map(GLOBAL_KEYS.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
    const values: Record<(typeof GLOBAL_KEYS)[number], unknown> = {
      window: browserWindow,
      document: browserWindow.document,
      navigator: browserWindow.navigator,
      Element: browserWindow.Element,
      HTMLElement: browserWindow.HTMLElement,
      Node: browserWindow.Node,
      Event: browserWindow.Event,
      MouseEvent: browserWindow.MouseEvent
    }
    for (const key of GLOBAL_KEYS) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: values[key] })
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, writable: true, value: true })
    const element = browserWindow.document.createElement('div')
    browserWindow.document.body.append(element)
    container = element as unknown as HTMLElement
    root = createRoot(container)
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

  const renderEditor = (
    target: PreviewTargetDefinition,
    profile: ThemeProfile,
    onMore = vi.fn(),
    onChange = (mutator: (next: ThemeProfile) => void): void => mutator(profile)
  ): void => {
    act(() => root.render(createElement(PreviewQuickEditor, {
      target,
      profile,
      assets: {},
      position: { left: 20, top: 30, placement: 'right' },
      popoverRef: createRef<HTMLDivElement>(),
      onChange,
      onInteractionEnd: vi.fn(),
      onSelectImage: vi.fn(),
      onImportIcon: vi.fn(),
      onImportFont: vi.fn(),
      onStateChange: vi.fn(),
      onMore,
      onClose: vi.fn()
    })))
  }

  it('shows only the appearance tokens used by the selected region and opens full settings', () => {
    const profile = createDefaultTheme('00000000-0000-4000-8000-000000000000')
    const onMore = vi.fn()
    renderEditor(PREVIEW_TARGETS['palette-project-bar'], profile, onMore)

    expect([...container.querySelectorAll('[data-color-token]')].map((node) => node.getAttribute('data-color-token'))).toEqual(['projectBarText'])
    expect([...container.querySelectorAll('[data-paint-token]')].map((node) => node.getAttribute('data-paint-token'))).toEqual(['projectBar'])
    const more = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('更多设置'))
    act(() => more?.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))
    expect(onMore).toHaveBeenCalledOnce()
  })

  it('shows only normal and hover states for a sidebar project row', () => {
    const profile = createDefaultTheme('00000000-0000-4000-8000-000000000000')
    renderEditor(PREVIEW_TARGETS['sidebar-project'], profile)

    expect([...container.querySelectorAll('[role="dialog"] .state-tabs button')].map((button) => button.textContent?.trim())).toEqual(['普通', '悬停'])
    expect(container.querySelector('[data-color-token="sidebarProjectSelectedText"]')).toBeNull()
    expect(container.querySelector('[data-paint-token="sidebarProjectRowSelected"]')).toBeNull()
  })

  it('changes the selected icon without exposing unrelated icon slots', () => {
    const profile = createDefaultTheme('00000000-0000-4000-8000-000000000000')
    renderEditor(PREVIEW_TARGETS['icon-composer'], profile)

    expect(container.querySelectorAll('[data-icon-slot]')).toHaveLength(1)
    expect(container.querySelector('[data-icon-slot="composer"]')).not.toBeNull()
    const select = container.querySelector<HTMLSelectElement>('select')
    if (!select) throw new Error('Icon selector is missing.')
    act(() => {
      select.value = 'heart'
      select.dispatchEvent(new browserWindow.Event('change', { bubbles: true }) as unknown as Event)
    })
    expect(profile.icons.composer).toEqual({ kind: 'builtin', name: 'heart' })
  })

  it('edits the composer badge independently and toggles its visibility', () => {
    const profile = createDefaultTheme('00000000-0000-0000-0000-000000000000')
    renderEditor(PREVIEW_TARGETS['icon-composer-badge'], profile)

    expect(container.querySelector('[data-icon-slot="composerBadge"]')).not.toBeNull()
    expect(container.querySelector('[data-icon-slot="composer"]')).toBeNull()
    const select = container.querySelector<HTMLSelectElement>('select')
    const toggle = container.querySelector<HTMLInputElement>('.toggle-row input')
    if (!select || !toggle) throw new Error('Composer badge controls are missing.')
    act(() => {
      select.value = 'heart'
      select.dispatchEvent(new browserWindow.Event('change', { bubbles: true }) as unknown as Event)
      toggle.click()
    })

    expect(profile.icons.composerBadge).toEqual({ kind: 'builtin', name: 'heart' })
    expect(profile.composerBadge.visible).toBe(false)
  })

  it('edits each brand copy field independently', () => {
    const profile = createDefaultTheme('00000000-0000-4000-8000-000000000000')
    const cases = [
      ['copy-brand-title', 'brandTitle', '新的品牌主标题'],
      ['copy-brand-subtitle', 'brandSubtitle', '新的品牌副标题'],
      ['copy-brand-signature', 'brandSignature', 'MIKU NEW']
    ] as const

    for (const [targetId, field, value] of cases) {
      renderEditor(PREVIEW_TARGETS[targetId], profile)
      const control = container.querySelector<HTMLInputElement | HTMLTextAreaElement>('.quick-copy-field input, .quick-copy-field textarea')
      if (!control) throw new Error(`${targetId} copy control is missing.`)
      const prototype = control.tagName === 'TEXTAREA'
        ? browserWindow.HTMLTextAreaElement.prototype
        : browserWindow.HTMLInputElement.prototype
      act(() => {
        control.focus()
        Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(control, value)
        control.dispatchEvent(new browserWindow.Event('input', { bubbles: true }) as unknown as Event)
        control.dispatchEvent(new browserWindow.Event('change', { bubbles: true }) as unknown as Event)
      })
      expect(profile.copy[field]).toBe(value)
    }
  })

  it('captures copy input before a queued state update runs', () => {
    const profile = createDefaultTheme('00000000-0000-4000-8000-000000000000')
    let queuedChange: ((next: ThemeProfile) => void) | undefined
    renderEditor(
      PREVIEW_TARGETS['copy-brand-signature'],
      profile,
      vi.fn(),
      (mutator) => { queuedChange = mutator }
    )
    const control = container.querySelector<HTMLInputElement>('.quick-copy-field input')
    if (!control) throw new Error('Brand signature control is missing.')

    act(() => {
      control.focus()
      Object.getOwnPropertyDescriptor(browserWindow.HTMLInputElement.prototype, 'value')?.set?.call(control, 'QUEUED VALUE')
      control.dispatchEvent(new browserWindow.Event('input', { bubbles: true }) as unknown as Event)
    })

    expect(queuedChange).toBeTypeOf('function')
    expect(() => queuedChange?.(profile)).not.toThrow()
    expect(profile.copy.brandSignature).toBe('QUEUED VALUE')
  })

  it('switches polaroid modes without clearing the fence points', () => {
    const profile = createDefaultTheme('00000000-0000-4000-8000-000000000000')
    profile.polaroid.fence = [{ x: 0.08, y: 0.14 }, { x: 0.86, y: 0.2 }, { x: 0.8, y: 0.82 }, { x: 0.16, y: 0.76 }]
    const originalFence = profile.polaroid.fence.map((point) => ({ ...point }))
    renderEditor(PREVIEW_TARGETS.polaroid, profile)

    const full = [...container.querySelectorAll('.polaroid-mode-tabs button')].find((button) => button.textContent === '整图')
    const fenceButton = [...container.querySelectorAll('.polaroid-mode-tabs button')].find((button) => button.textContent === '四点围栏')
    if (!full || !fenceButton) throw new Error('Polaroid mode controls are missing.')
    act(() => full.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))
    expect(profile.polaroid.mode).toBe('full')
    act(() => fenceButton.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))
    expect(profile.polaroid.mode).toBe('fence')
    expect(profile.polaroid.fence).toEqual(originalFence)
  })

  it('edits particle effects, independent materials, speed, and visibility from one target', () => {
    const profile = createDefaultTheme('00000000-0000-4000-8000-000000000000')
    renderEditor(PREVIEW_TARGETS.sparkles, profile)

    const rainMode = [...container.querySelectorAll('button')].find((button) => button.textContent === '垂直雨落')
    if (!rainMode) throw new Error('Rain particle mode is missing.')
    act(() => rainMode.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))
    renderEditor(PREVIEW_TARGETS.sparkles, profile)

    const icon = container.querySelector<HTMLSelectElement>('[data-icon-slot="backgroundRain"] select')
    const speed = [...container.querySelectorAll('.range-row')].find((row) => row.querySelector('span')?.textContent === '速度')?.querySelector<HTMLInputElement>('input')
    const count = [...container.querySelectorAll('.range-row')].find((row) => row.querySelector('span')?.textContent === '数量')?.querySelector<HTMLInputElement>('input')
    const addColor = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('添加颜色'))
    const shuffle = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('重新排列'))
    if (!icon || !speed || !count || !addColor || !shuffle) throw new Error('Particle effect controls are missing.')
    act(() => {
      icon.value = 'star'
      icon.dispatchEvent(new browserWindow.Event('change', { bubbles: true }) as unknown as Event)
      Object.getOwnPropertyDescriptor(browserWindow.HTMLInputElement.prototype, 'value')?.set?.call(speed, '1.5')
      speed.dispatchEvent(new browserWindow.Event('input', { bubbles: true }) as unknown as Event)
      Object.getOwnPropertyDescriptor(browserWindow.HTMLInputElement.prototype, 'value')?.set?.call(count, '12')
      count.dispatchEvent(new browserWindow.Event('input', { bubbles: true }) as unknown as Event)
      addColor.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
      shuffle.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
    })

    expect(profile.icons.backgroundSparkle).toEqual({ kind: 'builtin', name: 'sparkles' })
    expect(profile.icons.backgroundRain).toEqual({ kind: 'builtin', name: 'star' })
    expect(profile.decorations.sparkles).toMatchObject({ effect: 'rain', speed: 1.5, count: 12, seed: 1, extraColors: ['#20bcc3'] })

    const visibility = container.querySelector<HTMLInputElement>('[data-decoration-controls="sparkles"] > .toggle-row input')
    if (!visibility) throw new Error('Particle visibility toggle is missing.')
    act(() => visibility.click())
    renderEditor(PREVIEW_TARGETS.sparkles, profile)
    expect(container.querySelector<HTMLFieldSetElement>('.particle-effect-settings')?.disabled).toBe(true)
  })

  it('edits composer melody presets, text, font, position, and typing behavior', () => {
    const profile = createDefaultTheme('00000000-0000-4000-8000-000000000000')
    renderEditor(PREVIEW_TARGETS['composer-melody'], profile)
    const starWish = [...container.querySelectorAll('button')].find((button) => button.textContent === '星愿')
    const text = container.querySelector<HTMLTextAreaElement>('[data-decoration-controls="composer-melody"] textarea')
    const font = container.querySelector<HTMLSelectElement>('[data-font-slot="composerMelody"] select')
    const x = [...container.querySelectorAll('.range-row')].find((row) => row.querySelector('span')?.textContent === '水平位置')?.querySelector<HTMLInputElement>('input')
    const toggles = container.querySelectorAll<HTMLInputElement>('[data-decoration-controls="composer-melody"] .toggle-row input')
    if (!starWish || !text || !font || !x || toggles.length !== 2) throw new Error('Composer melody controls are missing.')
    act(() => {
      starWish.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
      Object.getOwnPropertyDescriptor(browserWindow.HTMLTextAreaElement.prototype, 'value')?.set?.call(text, '自定义旋律 ♪')
      text.dispatchEvent(new browserWindow.Event('input', { bubbles: true }) as unknown as Event)
      font.value = 'builtin:jetbrains-mono'
      font.dispatchEvent(new browserWindow.Event('change', { bubbles: true }) as unknown as Event)
      Object.getOwnPropertyDescriptor(browserWindow.HTMLInputElement.prototype, 'value')?.set?.call(x, '0.7')
      x.dispatchEvent(new browserWindow.Event('input', { bubbles: true }) as unknown as Event)
      toggles[1]!.click()
    })

    expect(profile.decorations.composerMelody).toMatchObject({ text: '自定义旋律 ♪', position: { x: 0.7, y: 0.35 }, hideWhenTyping: false })
    expect(profile.typography.slots.composerMelody).toEqual({ kind: 'builtin', id: 'jetbrains-mono' })
  })
})
