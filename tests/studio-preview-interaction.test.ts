import { Window } from 'happy-dom'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeStatus, StudioApi } from '../src/shared/contracts'
import { createDefaultTheme, type ThemeProfile } from '../src/shared/theme'
import { App } from '../src/renderer/src/App'
import { ICON_PREVIEW_TARGETS } from '../src/renderer/src/preview-editing'

const GLOBAL_KEYS = [
  'window', 'document', 'navigator', 'Element', 'HTMLElement', 'Node', 'Event',
  'MouseEvent', 'PointerEvent', 'KeyboardEvent', 'ResizeObserver'
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

  beforeEach(async () => {
    browserWindow = new Window({ url: 'app://-/index.html' })
    previous = new Map(GLOBAL_KEYS.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
    const profile = createDefaultTheme('00000000-0000-4000-8000-000000000000')
    profile.polaroid.sourceImage = 'assets/polaroid.png'
    profile.polaroid.sourceSize = { width: 1000, height: 800 }
    savedProfiles = []
    const studio: StudioApi = {
      app: { getInfo: async () => ({ version: 'test', platform: 'win32' }) },
      themes: {
        list: async () => [{ id: profile.id, name: profile.name, updatedAt: profile.updatedAt, active: true }],
        get: async () => profile,
        create: async () => profile,
        duplicate: async () => profile,
        update: async (next) => {
          savedProfiles.push(structuredClone(next))
          return next
        },
        delete: async () => undefined,
        activate: async () => profile,
        compile: async () => ({ css: '', rendererPayload: '', assets: { 'assets/polaroid.png': 'data:image/png;base64,AA==' } }),
        subscribePolaroidPlacement: () => () => undefined
      },
    assets: {
      selectImage: async () => null,
      selectIcon: async () => null,
      selectFont: async () => null
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

  it('opens the most specific nested target and closes with Escape or outside click', () => {
    for (const targetId of Object.values(ICON_PREVIEW_TARGETS)) {
      expect(container.querySelector(`[data-preview-target="${targetId}"]`), `${targetId} should be rendered`).not.toBeNull()
    }
    const cardIcon = container.querySelector('[data-preview-target="icon-card-primary"]')
    if (!cardIcon) throw new Error('Primary card icon target is missing.')
    pointerDown(cardIcon)
    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('主卡片图标快捷配置')

    act(() => browserWindow.document.dispatchEvent(new browserWindow.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(container.querySelector('[role="dialog"]')).toBeNull()

    const card = container.querySelector('[data-preview-target="palette-action-card"]')
    if (!card) throw new Error('Action card target is missing.')
    pointerDown(card)
    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('操作卡片颜色快捷配置')
    pointerDown(browserWindow.document.body as unknown as Element)
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('supports keyboard selection and links quick editing to the full inspector', async () => {
    const brand = container.querySelector<HTMLElement>('[data-preview-target="palette-brand"]')
    if (!brand) throw new Error('Brand palette target is missing.')
    pointerDown(brand)
    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('品牌栏颜色快捷配置')
    act(() => browserWindow.document.dispatchEvent(new browserWindow.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    act(() => brand.dispatchEvent(new browserWindow.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }) as unknown as KeyboardEvent))
    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('品牌栏颜色快捷配置')

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
    expect(container.querySelector('[data-inspector-anchor="icon-composer"]')?.classList.contains('inspector-highlight')).toBe(true)
    expect(scrollIntoView).toHaveBeenCalled()
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
    expect(container.querySelector('[data-inspector-anchor="visual-brand-copy"]')?.classList.contains('inspector-highlight')).toBe(true)
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
