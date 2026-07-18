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
})
