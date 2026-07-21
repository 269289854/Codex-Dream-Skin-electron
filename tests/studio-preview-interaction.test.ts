import { Window } from 'happy-dom'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImportedFontAsset, RuntimeStatus, StudioApi } from '../src/shared/contracts'
import { createDefaultTheme, THEME_COLOR_PRESETS, type CreateThemeInput, type ThemeProfile } from '../src/shared/theme'
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
  let profile: ThemeProfile
  let alternateProfile: ThemeProfile
  let themeProfiles: ThemeProfile[]
  let activeThemeId: string
  let selectedFontAsset: ImportedFontAsset | null
  let selectIcon: ReturnType<typeof vi.fn>
  let selectMedia: ReturnType<typeof vi.fn>
  let getDefaultTheme: ReturnType<typeof vi.fn>
  let duplicateTheme: ReturnType<typeof vi.fn>
  let activateTheme: ReturnType<typeof vi.fn>
  let installTheme: ReturnType<typeof vi.fn>
  let reinjectTheme: ReturnType<typeof vi.fn>
  let exportTheme: ReturnType<typeof vi.fn>
  let importTheme: ReturnType<typeof vi.fn>
  let importThemePath: ReturnType<typeof vi.fn>
  let getPathForFile: ReturnType<typeof vi.fn>
  let createTheme: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    browserWindow = new Window({ url: 'app://-/index.html' })
    previous = new Map(GLOBAL_KEYS.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
    profile = createDefaultTheme('00000000-0000-4000-8000-000000000000')
    alternateProfile = createDefaultTheme('00000000-0000-4000-8000-000000000001', '备用主题')
    themeProfiles = [profile, alternateProfile]
    activeThemeId = profile.id
    profile.polaroid.sourceImage = 'assets/polaroid.png'
    profile.polaroid.sourceSize = { width: 1000, height: 800 }
    savedProfiles = []
    selectedFontAsset = null
    selectIcon = vi.fn(async () => null)
    selectMedia = vi.fn(async () => null)
    getDefaultTheme = vi.fn(async (id: string) => {
      const selected = themeProfiles.find((item) => item.id === id)
      if (!selected) throw new Error('Theme not found.')
      const defaults = createDefaultTheme(id, selected.name)
      if (id === profile.id) {
        defaults.hero.source = { asset: 'assets/dream-reference.png', kind: 'image', mimeType: 'image/png' }
        defaults.polaroid.source = { asset: 'assets/dream-polaroid.png', kind: 'image', mimeType: 'image/png' }
        defaults.polaroid.sourceSize = { width: 1122, height: 1402 }
        defaults.polaroid.placement = { x: 0.8278561014524648, y: 0.7127831468304384, width: 0.15, rotation: -15, hideBelowWidth: 920 }
        defaults.icons.backgroundRain = { kind: 'builtin', name: 'wand-sparkles' }
        defaults.decorations.sparkles = { visible: true, effect: 'rain', speed: 1, count: 20, minSize: 20, maxSize: 32, opacity: 0.72, glow: 10, seed: 0, extraColors: [] }
      }
      return defaults
    })
    duplicateTheme = vi.fn(async (current: ThemeProfile, name: string) => {
      const duplicate = { ...structuredClone(current), id: '00000000-0000-4000-8000-000000000002', name, updatedAt: new Date().toISOString() }
      themeProfiles.push(duplicate)
      return duplicate
    })
    activateTheme = vi.fn(async (id: string) => {
      const selected = themeProfiles.find((item) => item.id === id)
      if (!selected) throw new Error('Theme not found.')
      activeThemeId = id
      return selected
    })
    installTheme = vi.fn(async () => runtimeStatus)
    reinjectTheme = vi.fn(async () => runtimeStatus)
    exportTheme = vi.fn(async () => ({ filePath: 'C:\\Shares\\design.cdstheme' }))
    importTheme = vi.fn(async () => null)
    importThemePath = vi.fn(async () => { throw new Error('未设置拖放导入结果') })
    getPathForFile = vi.fn(() => 'C:\\Shares\\design.cdstheme')
    createTheme = vi.fn(async (input: CreateThemeInput) => {
      const created = { ...createDefaultTheme('00000000-0000-4000-8000-000000000002', input.name), colors: { ...input.colors } }
      themeProfiles.push(created)
      return created
    })
    const studio: StudioApi = {
      app: { getInfo: async () => ({ version: 'test', platform: 'win32' }) },
      themes: {
        list: async () => themeProfiles.map((item) => ({ id: item.id, name: item.name, updatedAt: item.updatedAt, active: item.id === activeThemeId, system: item.id === profile.id })),
        get: async (id) => {
          const selected = themeProfiles.find((item) => item.id === id)
          if (!selected) throw new Error('Theme not found.')
          return selected
        },
        create: createTheme,
        getDefault: getDefaultTheme,
        duplicate: duplicateTheme,
        update: async (next) => {
          savedProfiles.push(structuredClone(next))
          return next
        },
        delete: async () => undefined,
        activate: activateTheme,
        compile: async () => ({ css: '', rendererPayload: '', assets: { 'assets/polaroid.png': 'data:image/png;base64,AA==' } })
      },
    assets: {
      selectImage: async () => null,
      selectMedia,
      getPreviewUrl: async (_themeId, asset) => `data:image/png;base64,${asset}`,
      selectIcon,
      selectFont: async () => selectedFontAsset
    },
      share: {
        exportTheme,
        importTheme,
        importThemePath
      },
      files: { getPathForFile },
      operations: { cancel: async () => undefined, subscribeProgress: () => () => undefined },
      codex: {
        detect: async () => ({ found: true, version: 'test', executable: '', packageFamilyName: '', running: false, backupAvailable: false }),
        installTheme,
        start: async () => runtimeStatus,
        verify: async () => runtimeStatus,
        reinject: reinjectTheme,
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

  it('distinguishes system and custom themes and only enables deleting custom themes', async () => {
    expect(container.querySelector('.theme-item.active small')?.textContent).toBe('系统主题 · 当前')
    const deleteSystem = container.querySelector<HTMLButtonElement>('button[title="系统主题不能删除"]')
    expect(deleteSystem?.disabled).toBe(true)

    const customTheme = [...container.querySelectorAll<HTMLButtonElement>('.theme-item')].find((item) => item.querySelector('strong')?.textContent === '备用主题')
    if (!customTheme) throw new Error('Custom theme fixture is missing.')
    await act(async () => {
      customTheme.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
      await Promise.resolve()
      await new Promise((resolve) => browserWindow.setTimeout(resolve, 0))
    })
    expect(container.querySelector('.theme-item.active small')?.textContent).toBe('自定义主题 · 当前')
    expect(container.querySelector<HTMLButtonElement>('button[title="删除主题"]')?.disabled).toBe(false)
  })

  it('opens the new theme dialog, selects a preset, edits custom colors, and creates an active theme', async () => {
    const add = container.querySelector<HTMLButtonElement>('button[title="新建主题"]')
    if (!add) throw new Error('Create theme command is missing.')
    act(() => add.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))

    const dialog = container.querySelector<HTMLElement>('.create-theme-dialog')
    const input = dialog?.querySelector<HTMLInputElement>('input[placeholder="新主题"]')
    if (!dialog || !input) throw new Error('Create theme dialog is missing.')
    expect(dialog.querySelector('h2')?.textContent).toBe('新建主题')
    expect(browserWindow.document.activeElement).toBe(input)
    expect(dialog.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true)

    const ocean = [...dialog.querySelectorAll<HTMLButtonElement>('button[role="radio"]')].find((button) => button.textContent?.includes(THEME_COLOR_PRESETS[1].name))
    if (!ocean) throw new Error('Ocean palette option is missing.')
    act(() => ocean.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))
    expect(ocean.getAttribute('aria-checked')).toBe('true')

    const custom = [...dialog.querySelectorAll<HTMLButtonElement>('button[role="radio"]')].find((button) => button.textContent?.includes('自定义'))
    if (!custom) throw new Error('Custom palette option is missing.')
    act(() => custom.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))
    expect(dialog.querySelectorAll('[data-color-key]')).toHaveLength(8)
    const accent = dialog.querySelector<HTMLInputElement>('input[aria-label="强调颜色值"]')
    if (!accent) throw new Error('Custom accent color control is missing.')
    act(() => setInputValue(accent, '#123456'))
    act(() => setInputValue(input, '海盐自定义'))

    const submit = dialog.querySelector<HTMLButtonElement>('button[type="submit"]')
    if (!submit) throw new Error('Create theme submit command is missing.')
    expect(input.value).toBe('海盐自定义')
    expect(submit.disabled).toBe(false)
    await act(async () => {
      submit.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
      await Promise.resolve()
      await new Promise((resolve) => browserWindow.setTimeout(resolve, 0))
    })

    expect(createTheme).toHaveBeenCalledTimes(1)
    const submitted = createTheme.mock.calls[0]?.[0] as CreateThemeInput
    expect(submitted).toMatchObject({ name: '海盐自定义', colors: { accent: '#123456' } })
    expect(submitted.colors).toEqual({ ...THEME_COLOR_PRESETS[1].colors, accent: '#123456' })
    expect(activateTheme).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000002')
    expect(container.querySelector('.create-theme-dialog')).toBeNull()
    expect(container.querySelector('[role="status"]')?.textContent).toContain('已创建主题“海盐自定义”')
  })

  it('validates and preserves the new theme dialog when creation fails', async () => {
    createTheme.mockRejectedValueOnce(new Error('创建主题失败'))
    const add = container.querySelector<HTMLButtonElement>('button[title="新建主题"]')
    if (!add) throw new Error('Create theme command is missing.')
    act(() => add.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))
    const dialog = container.querySelector<HTMLElement>('.create-theme-dialog')
    const input = dialog?.querySelector<HTMLInputElement>('input[placeholder="新主题"]')
    const submit = dialog?.querySelector<HTMLButtonElement>('button[type="submit"]')
    if (!dialog || !input || !submit) throw new Error('Create theme controls are missing.')
    act(() => setInputValue(input, '失败主题'))
    await act(async () => {
      submit.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
      await Promise.resolve()
    })
    expect(createTheme).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.create-theme-dialog')).not.toBeNull()
    expect(container.querySelector('#create-theme-error')?.textContent).toBe('创建主题失败')
    expect(submit.disabled).toBe(false)

    act(() => input.dispatchEvent(new browserWindow.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }) as unknown as KeyboardEvent))
    expect(container.querySelector('.create-theme-dialog')).toBeNull()
  })

  it('opens an accessible duplicate dialog, validates the name, and cancels with Escape', () => {
    const copy = container.querySelector<HTMLButtonElement>('button[title="复制主题"]')
    if (!copy) throw new Error('Duplicate theme command is missing.')
    act(() => copy.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))

    const dialog = container.querySelector('[role="dialog"]')
    const input = dialog?.querySelector<HTMLInputElement>('input')
    expect(dialog?.querySelector('h2')?.textContent).toBe('复制主题')
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(input?.value).toBe('初音未来 副本')
    expect(browserWindow.document.activeElement).toBe(input)
    expect(input?.selectionStart).toBe(0)
    expect(input?.selectionEnd).toBe(input?.value.length)

    if (!input) throw new Error('Duplicate name input is missing.')
    act(() => setInputValue(input, '   '))
    expect(container.querySelector('.theme-dialog-error')?.textContent).toBe('主题名称不能为空。')
    expect(container.querySelector<HTMLButtonElement>('.theme-dialog button[type="submit"]')?.disabled).toBe(true)

    act(() => input.dispatchEvent(new browserWindow.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }) as unknown as KeyboardEvent))
    expect(container.querySelector('.theme-dialog')).toBeNull()
    expect(duplicateTheme).not.toHaveBeenCalled()
  })

  it('duplicates the unsaved draft once, activates it, and reports success', async () => {
    const title = container.querySelector('[data-preview-target="copy-brand-title"]')
    const copy = container.querySelector<HTMLButtonElement>('button[title="复制主题"]')
    if (!title || !copy) throw new Error('Duplicate theme fixtures are missing.')
    pointerDown(title)
    enterQuickCopy('尚未保存的副本标题')

    let resolveDuplicate: ((value: ThemeProfile) => void) | undefined
    duplicateTheme.mockImplementationOnce((_current: ThemeProfile, _name: string) => new Promise<ThemeProfile>((resolve) => { resolveDuplicate = resolve }))
    act(() => copy.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))
    const input = container.querySelector<HTMLInputElement>('.theme-dialog input')
    if (!input) throw new Error('Duplicate name input is missing.')
    act(() => setInputValue(input, '我的设计副本'))
    const submit = container.querySelector<HTMLButtonElement>('.theme-dialog button[type="submit"]')
    if (!submit) throw new Error('Duplicate submit command is missing.')
    await act(async () => {
      input.dispatchEvent(new browserWindow.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }) as unknown as KeyboardEvent)
      await Promise.resolve()
    })

    expect(duplicateTheme).toHaveBeenCalledTimes(1)
    expect(submit.disabled).toBe(true)
    expect(submit.textContent).toContain('复制中')
    act(() => submit.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))
    expect(duplicateTheme).toHaveBeenCalledTimes(1)
    const submitted = duplicateTheme.mock.calls[0]?.[0] as ThemeProfile
    expect(submitted.copy.brandTitle).toBe('尚未保存的副本标题')
    expect((await Promise.resolve(duplicateTheme.mock.calls[0]?.[1]))).toBe('我的设计副本')
    expect(profile.copy.brandTitle).not.toBe('尚未保存的副本标题')

    const duplicated = { ...structuredClone(submitted), id: '00000000-0000-4000-8000-000000000002', name: '我的设计副本', updatedAt: new Date().toISOString() }
    themeProfiles.push(duplicated)
    await act(async () => {
      resolveDuplicate?.(duplicated)
      await Promise.resolve()
      await new Promise((resolve) => browserWindow.setTimeout(resolve, 0))
    })

    expect(activateTheme).toHaveBeenCalledWith(duplicated.id)
    expect(container.querySelector('.theme-dialog')).toBeNull()
    expect(container.querySelector('[role="status"]')?.textContent).toContain('已创建主题“我的设计副本”')
    const duplicatedItem = [...container.querySelectorAll('.theme-item')].find((item) => item.querySelector('strong')?.textContent === '我的设计副本')
    expect(duplicatedItem?.classList.contains('active')).toBe(true)
  })

  it('keeps the duplicate dialog open and shows copy failures', async () => {
    duplicateTheme.mockRejectedValueOnce(new Error('素材复制失败'))
    const copy = container.querySelector<HTMLButtonElement>('button[title="复制主题"]')
    if (!copy) throw new Error('Duplicate theme command is missing.')
    act(() => copy.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))
    const submit = container.querySelector<HTMLButtonElement>('.theme-dialog button[type="submit"]')
    if (!submit) throw new Error('Duplicate submit command is missing.')
    await act(async () => {
      submit.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
      await Promise.resolve()
    })

    expect(container.querySelector('.theme-dialog')).not.toBeNull()
    expect(container.querySelector('.theme-dialog-error')?.textContent).toBe('素材复制失败')
    expect(submit.disabled).toBe(false)
  })

  it('exports the unsaved draft once and reports the selected share file', async () => {
    const title = container.querySelector('[data-preview-target="copy-brand-title"]')
    const exportButton = container.querySelector<HTMLButtonElement>('button[title="导出主题"]')
    if (!title || !exportButton) throw new Error('Share export fixtures are missing.')
    pointerDown(title)
    enterQuickCopy('尚未保存的分享标题')
    let finishExport: ((value: { filePath: string }) => void) | undefined
    exportTheme.mockImplementationOnce(() => new Promise((resolve) => { finishExport = resolve }))
    await act(async () => {
      exportButton.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
      exportButton.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
      await Promise.resolve()
    })
    expect(exportTheme).toHaveBeenCalledTimes(1)
    expect((exportTheme.mock.calls[0]?.[0] as ThemeProfile).copy.brandTitle).toBe('尚未保存的分享标题')
    expect(exportButton.disabled).toBe(true)
    await act(async () => {
      finishExport?.({ filePath: 'C:\\Shares\\design.cdstheme' })
      await Promise.resolve()
      await new Promise((resolve) => browserWindow.setTimeout(resolve, 0))
    })
    expect(container.querySelector('[role="status"]')?.textContent).toContain('design.cdstheme')
  })

  it('imports, activates, and opens a new theme while cancellation and failures preserve the current theme', async () => {
    const importButton = container.querySelector<HTMLButtonElement>('button[title="导入主题"]')
    if (!importButton) throw new Error('Share import command is missing.')
    await act(async () => {
      importButton.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
      await Promise.resolve()
    })
    expect(activateTheme).not.toHaveBeenCalled()

    const imported = createDefaultTheme('00000000-0000-4000-8000-000000000003', '分享主题')
    themeProfiles.push(imported)
    importTheme.mockResolvedValueOnce(imported)
    await act(async () => {
      importButton.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
      await Promise.resolve()
      await new Promise((resolve) => browserWindow.setTimeout(resolve, 0))
    })
    expect(activateTheme).toHaveBeenCalledWith(imported.id)
    expect(container.querySelector('[role="status"]')?.textContent).toContain('已导入主题“分享主题”')
    expect(container.querySelector('.theme-item.active strong')?.textContent).toBe('分享主题')

    importTheme.mockRejectedValueOnce(new Error('分享包校验失败'))
    await act(async () => {
      importButton.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
      await Promise.resolve()
    })
    expect(container.querySelector('.error-banner')?.textContent).toContain('分享包校验失败')
    expect(container.querySelector('.theme-item.active strong')?.textContent).toBe('分享主题')
  })

  it('converts dropped files through preload and imports through the validated path API', async () => {
    const shell = container.querySelector('main')
    if (!shell) throw new Error('Studio shell is missing.')
    const imported = createDefaultTheme('00000000-0000-4000-8000-000000000004', '拖放主题')
    themeProfiles.push(imported)
    importThemePath.mockResolvedValueOnce(imported)
    const file = new browserWindow.File(['theme'], 'design.cdstheme')
    const dragEnter = new browserWindow.Event('dragenter', { bubbles: true, cancelable: true })
    Object.defineProperty(dragEnter, 'dataTransfer', { value: { types: ['Files'], files: [file], dropEffect: 'none' } })
    act(() => shell.dispatchEvent(dragEnter as unknown as Event))
    expect(container.querySelector('.share-drop-zone')?.textContent).toContain('.cdstheme')
    const drop = new browserWindow.Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(drop, 'dataTransfer', { value: { types: ['Files'], files: [file], dropEffect: 'copy' } })
    await act(async () => {
      shell.dispatchEvent(drop as unknown as Event)
      await Promise.resolve()
      await new Promise((resolve) => browserWindow.setTimeout(resolve, 0))
    })
    expect(getPathForFile).toHaveBeenCalledWith(file)
    expect(importThemePath).toHaveBeenCalledWith('C:\\Shares\\design.cdstheme')
    expect(activateTheme).toHaveBeenCalledWith(imported.id)
    expect(container.querySelector('.share-drop-zone')).toBeNull()
  })

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

  it('opens conversation background editing from the preview and persists the color mode', async () => {
    const conversation = container.querySelector<HTMLButtonElement>('button[title="会话预览"]')
    if (!conversation) throw new Error('Conversation preview command is missing.')
    act(() => conversation.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))
    const surface = container.querySelector<HTMLElement>('[data-preview-target="conversation-background"]')
    if (!surface) throw new Error('Conversation background target is missing.')
    pointerDown(surface)
    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('对话区域背景快捷配置')
    const visible = [...container.querySelectorAll('[role="dialog"] .toggle-row')].find((row) => row.querySelector('span')?.textContent === '显示对话区域背景')?.querySelector<HTMLInputElement>('input')
    if (!visible) throw new Error('Conversation background visibility control is missing.')
    act(() => {
      visible.checked = false
      visible.click()
    })
    await act(async () => { await Promise.resolve() })
    const opacity = [...container.querySelectorAll('[role="dialog"] .range-row')].find((row) => row.querySelector('span')?.textContent === '背景透明度')?.querySelector<HTMLInputElement>('input')
    if (!opacity) throw new Error('Conversation background opacity control is missing.')
    act(() => {
      setInputValue(opacity, '.72')
      opacity.dispatchEvent(new browserWindow.PointerEvent('pointerup', { bubbles: true }) as unknown as PointerEvent)
    })
    await act(async () => { await Promise.resolve() })
    expect(container.querySelector<HTMLElement>('.preview-conversation-background-color')?.style.opacity).toBe('0.72')
    expect(container.querySelector<HTMLElement>('.preview-conversation-background-overlay')?.style.opacity).toBe('0.24')

    const save = container.querySelector<HTMLButtonElement>('.preview-actions .primary-button')
    if (!save) throw new Error('Save command is missing.')
    await act(async () => {
      save.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
      await Promise.resolve()
    })
    expect(savedProfiles.at(-1)?.conversationBackground).toMatchObject({ visible: true, mode: 'color', opacity: .72 })
  })

  it('keeps cancelled media selection unchanged and previews image, GIF, and video modes', async () => {
    const conversation = container.querySelector<HTMLButtonElement>('button[title="会话预览"]')
    if (!conversation) throw new Error('Conversation preview command is missing.')
    act(() => conversation.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))
    const surface = container.querySelector<HTMLElement>('[data-preview-target="conversation-background"]')
    if (!surface) throw new Error('Conversation background target is missing.')
    pointerDown(surface)

    const modeButton = (label: string): HTMLButtonElement => {
      const button = [...container.querySelectorAll<HTMLButtonElement>('[role="dialog"] .conversation-background-modes button')].find((candidate) => candidate.textContent === label)
      if (!button) throw new Error(`${label} mode is missing.`)
      return button
    }
    const choose = async (label: string): Promise<void> => {
      await act(async () => {
        modeButton(label).dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
        await new Promise((resolve) => browserWindow.setTimeout(resolve, 0))
      })
    }

    await choose('图片')
    expect(selectMedia).toHaveBeenLastCalledWith(profile.id, 'conversationBackground', 'image')
    expect(modeButton('颜色').classList.contains('active')).toBe(true)

    selectMedia.mockResolvedValueOnce({ reference: { asset: 'assets/conversation.png', kind: 'image', mimeType: 'image/png' }, relativePath: 'assets/conversation.png', previewUrl: 'data:image/png;base64,AA==', originalName: 'conversation.png', width: 1200, height: 800 })
    await choose('图片')
    expect(container.querySelector<HTMLImageElement>('.preview-conversation-background-media')?.src).toContain('data:image/png;base64,AA==')

    selectMedia.mockResolvedValueOnce({ reference: { asset: 'assets/conversation.gif', kind: 'image', mimeType: 'image/gif' }, relativePath: 'assets/conversation.gif', previewUrl: 'data:image/gif;base64,AA==', originalName: 'conversation.gif', width: 1200, height: 800 })
    await choose('GIF')
    expect(selectMedia).toHaveBeenLastCalledWith(profile.id, 'conversationBackground', 'gif')
    expect(container.querySelector<HTMLImageElement>('.preview-conversation-background-media')?.src).toContain('data:image/gif;base64,AA==')

    selectMedia.mockResolvedValueOnce({ reference: { asset: 'assets/conversation.mp4', kind: 'video', mimeType: 'video/mp4' }, relativePath: 'assets/conversation.mp4', previewUrl: 'studio-media://preview/conversation.mp4', originalName: 'conversation.mp4', width: 1200, height: 800 })
    await choose('视频')
    expect(selectMedia).toHaveBeenLastCalledWith(profile.id, 'conversationBackground', 'video')
    const video = container.querySelector<HTMLVideoElement>('.preview-conversation-background-media')
    expect(video?.muted).toBe(true)
    expect(video?.loop).toBe(true)
    expect(video?.autoplay).toBe(true)
  })

  it('opens custom icon import from both quick editing and the full icon inspector', async () => {
    const composerIcon = container.querySelector('[data-preview-target="icon-composer"]')
    if (!composerIcon) throw new Error('Composer icon target is missing.')

    pointerDown(composerIcon)
    const quickTrigger = container.querySelector<HTMLButtonElement>('[role="dialog"] [data-icon-slot="composer"] .icon-picker-trigger')
    if (!quickTrigger) throw new Error('Quick icon selector is missing.')
    act(() => quickTrigger.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))
    const quickAsset = container.querySelector<HTMLButtonElement>('[role="dialog"] [data-icon-slot="composer"] [data-icon-name="__asset"]')
    if (!quickAsset) throw new Error('Quick custom icon option is missing.')
    await act(async () => {
      quickAsset.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
      await new Promise((resolve) => browserWindow.setTimeout(resolve, 20))
    })
    expect(selectIcon).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000000')

    const iconSettings = [...container.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent?.includes('图标设置'))
    if (!iconSettings) throw new Error('Icon settings command is missing.')
    await act(async () => {
      iconSettings.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
      await new Promise((resolve) => browserWindow.setTimeout(resolve, 20))
    })

    const inspectorTrigger = container.querySelector<HTMLButtonElement>('[data-inspector-anchor="icon-composer"] .icon-picker-trigger')
    if (!inspectorTrigger) throw new Error('Inspector icon selector is missing.')
    act(() => inspectorTrigger.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))
    const inspectorAsset = container.querySelector<HTMLButtonElement>('[data-inspector-anchor="icon-composer"] [data-icon-name="__asset"]')
    if (!inspectorAsset) throw new Error('Inspector custom icon option is missing.')
    await act(async () => {
      inspectorAsset.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
      await new Promise((resolve) => browserWindow.setTimeout(resolve, 20))
    })
    expect(selectIcon).toHaveBeenCalledTimes(2)
  })

  it('saves the current draft before installing or reinjecting runtime changes', async () => {
    const iconSettings = [...container.querySelectorAll('aside button')].find((button) => button.textContent?.includes('图标样式'))
    if (!iconSettings) throw new Error('Icon settings navigation is missing.')
    act(() => iconSettings.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))

    const trigger = container.querySelector<HTMLButtonElement>('[data-icon-slot="composer"] .icon-picker-trigger')
    if (!trigger) throw new Error('Composer icon selector is missing.')
    act(() => trigger.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))
    const heart = container.querySelector<HTMLButtonElement>('[data-icon-slot="composer"] [data-icon-name="heart"]')
    if (!heart) throw new Error('Heart icon option is missing.')
    act(() => heart.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))
    expect(savedProfiles).toHaveLength(0)

    const runtimeSettings = [...container.querySelectorAll('aside button')].find((button) => button.textContent?.includes('运行设置'))
    if (!runtimeSettings) throw new Error('Runtime settings navigation is missing.')
    act(() => runtimeSettings.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))
    const reinject = [...container.querySelectorAll('.runtime-commands button')].find((button) => button.textContent?.includes('重新注入'))
    if (!reinject) throw new Error('Reinject command is missing.')
    await act(async () => {
      reinject.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
      await new Promise((resolve) => browserWindow.setTimeout(resolve, 30))
    })

    expect(savedProfiles.at(-1)?.icons.composer).toEqual({ kind: 'builtin', name: 'heart' })
    expect(reinjectTheme).toHaveBeenCalledWith(profile.id)
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
    const rainIcon = container.querySelector<HTMLButtonElement>('[role="dialog"] [data-icon-slot="backgroundRain"] .icon-picker-trigger')
    const speed = [...container.querySelectorAll('[role="dialog"] .range-row')].find((row) => row.querySelector('span')?.textContent === '速度')?.querySelector<HTMLInputElement>('input')
    const shuffle = [...container.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent?.includes('重新排列'))
    const addColor = [...container.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent?.includes('添加颜色'))
    if (!rainIcon || !speed || !shuffle || !addColor) throw new Error('Particle arrangement controls are missing.')
    act(() => rainIcon.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))
    const rainStar = container.querySelector<HTMLButtonElement>('[role="dialog"] [data-icon-slot="backgroundRain"] [data-icon-name="star"]')
    if (!rainStar) throw new Error('Rain star icon option is missing.')
    act(() => {
      rainStar.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
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
    await act(async () => {
      reset.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
      await Promise.resolve()
    })
    expect(getDefaultTheme).toHaveBeenCalledWith(profile.id)
    expect(container.querySelectorAll('[data-preview-target="sparkles"]')).toHaveLength(20)
    expect(container.querySelector('.preview-sparkles')?.getAttribute('data-dream-effect')).toBe('rain')
    expect(container.querySelector('.preview-hero-art')).not.toBeNull()
    expect(container.querySelector('.preview-polaroid img')).not.toBeNull()
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

    const homeHeading = container.querySelector('[data-preview-target="copy-heading"]')
    if (!homeHeading) throw new Error('Home heading preview is missing.')
    pointerDown(homeHeading)
    const homeHeadingFont = container.querySelector<HTMLSelectElement>('[role="dialog"] [data-font-slot="homeHeading"] select')
    if (!homeHeadingFont) throw new Error('Home heading font selector is missing.')
    expect(homeHeadingFont.querySelector('option[value="imported:font-test"]')?.textContent).toBe('Test Font')
    act(() => {
      homeHeadingFont.value = 'imported:font-test'
      homeHeadingFont.dispatchEvent(new browserWindow.Event('change', { bubbles: true }) as unknown as Event)
    })
    expect(canvas.style.getPropertyValue('--dream-font-home-heading')).toContain('Dream Imported font-test')

    const homeSubtitle = container.querySelector('[data-preview-target="copy-subtitle"]')
    if (!homeSubtitle) throw new Error('Home subtitle preview is missing.')
    pointerDown(homeSubtitle)
    const homeSubtitleFont = container.querySelector<HTMLSelectElement>('[role="dialog"] [data-font-slot="homeSubtitle"] select')
    if (!homeSubtitleFont) throw new Error('Home subtitle font selector is missing.')
    act(() => {
      homeSubtitleFont.value = 'imported:font-test'
      homeSubtitleFont.dispatchEvent(new browserWindow.Event('change', { bubbles: true }) as unknown as Event)
    })
    expect(canvas.style.getPropertyValue('--dream-font-home-subtitle')).toContain('Dream Imported font-test')
    act(() => {
      homeSubtitleFont.value = 'inherit'
      homeSubtitleFont.dispatchEvent(new browserWindow.Event('change', { bubbles: true }) as unknown as Event)
    })
    expect(canvas.style.getPropertyValue('--dream-font-home-subtitle')).toBe('var(--dream-font-ui)')

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
      slots: { homeHeading: { kind: 'imported', id: 'font-test' }, homeSubtitle: { kind: 'inherit' }, brandTitle: { kind: 'imported', id: 'font-test' }, brandSubtitle: { kind: 'imported', id: 'font-test' }, composerMelody: { kind: 'imported', id: 'font-test' } },
      importedFonts: [{ id: 'font-test', family: 'Test Font' }]
    })

    const reset = container.querySelector<HTMLButtonElement>('button[title="恢复默认"]')
    if (!reset) throw new Error('Restore defaults command is missing.')
    await act(async () => {
      reset.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
      await Promise.resolve()
    })
    expect(canvas.style.getPropertyValue('--dream-font-home-heading')).toBe('var(--dream-font-ui)')
    expect(canvas.style.getPropertyValue('--dream-font-home-subtitle')).toBe('var(--dream-font-ui)')
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
