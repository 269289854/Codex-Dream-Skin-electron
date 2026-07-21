import { Window } from 'happy-dom'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppearanceColorControl, FontControl, PaintControl, RenderIcon, ThemeIconControl } from '../src/renderer/src/editor-controls'
import type { ThemePaint } from '../src/shared/appearance'
import { BUILTIN_ICON_GLYPHS } from '../src/shared/icon-glyphs'
import { createDefaultTheme } from '../src/shared/theme'
import { builtinIconLabels, builtinIconOptions, builtinIcons } from '../src/renderer/src/icons'

const GLOBAL_KEYS = ['window', 'document', 'navigator', 'Element', 'HTMLElement', 'Node', 'Event', 'InputEvent', 'MouseEvent', 'PointerEvent'] as const

function stopPositions(paint: ThemePaint): number[] {
  return paint.kind === 'solid' ? [] : paint.stops.map((stop) => stop.position)
}

describe('editor appearance controls', () => {
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
      InputEvent: browserWindow.InputEvent,
      MouseEvent: browserWindow.MouseEvent,
      PointerEvent: browserWindow.PointerEvent
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

  const setInputValue = (input: HTMLInputElement, value: string): void => {
    input.focus()
    Object.getOwnPropertyDescriptor(browserWindow.HTMLInputElement.prototype, 'value')?.set?.call(input, value)
    input.dispatchEvent(new browserWindow.InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }) as unknown as InputEvent)
    input.dispatchEvent(new browserWindow.Event('change', { bubbles: true }) as unknown as Event)
  }

  const clickButton = (label: string): void => {
    const button = [...container.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === label)
    if (!button) throw new Error(`Button ${label} is missing.`)
    button.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
  }

  it('accepts supported color formats while retaining invalid input locally', () => {
    const onChange = vi.fn()
    act(() => root.render(React.createElement(AppearanceColorControl, { token: 'globalText', value: '#123456', onChange })))
    const input = container.querySelector<HTMLInputElement>('[aria-label="全局正文颜色值"]')
    if (!input) throw new Error('Color text input is missing.')

    act(() => setInputValue(input, 'oklch(.62 .18 210 / 45%)'))
    expect(onChange).toHaveBeenLastCalledWith('oklch(.62 .18 210 / 45%)')
    expect(input.getAttribute('aria-invalid')).toBe('false')

    const callCount = onChange.mock.calls.length
    act(() => setInputValue(input, 'url(https://example.com/color)'))
    expect(onChange).toHaveBeenCalledTimes(callCount)
    expect(input.value).toBe('url(https://example.com/color)')
    expect(input.getAttribute('aria-invalid')).toBe('true')
  })

  it('edits linear and radial paints with stable ordered 2-8 color stops', () => {
    let latest: ThemePaint = { kind: 'solid', color: '#123456' }
    const continuousFlags: Array<boolean | undefined> = []
    const interactionEnd = vi.fn()

    function Harness(): React.JSX.Element {
      const [paint, setPaint] = React.useState<ThemePaint>(latest)
      return React.createElement(PaintControl, {
        token: 'canvas',
        value: paint,
        onChange: (next, continuous) => {
          latest = next
          continuousFlags.push(continuous)
          setPaint(next)
        },
        onChangeEnd: interactionEnd
      })
    }

    act(() => root.render(React.createElement(Harness)))
    act(() => clickButton('线性'))
    expect(latest).toMatchObject({ kind: 'linear', angle: 135, stops: [{ position: 0 }, { position: 1 }] })
    expect(continuousFlags.at(-1)).toBeUndefined()

    act(() => clickButton('添加色标'))
    expect(stopPositions(latest)).toEqual([0, 0.5, 1])
    const firstRow = container.querySelector('.gradient-stop')
    const middlePosition = container.querySelectorAll<HTMLInputElement>('.gradient-stop .range-row input')[1]
    if (!firstRow || !middlePosition) throw new Error('Gradient stop controls are missing.')
    act(() => setInputValue(middlePosition, '0.9'))
    expect(stopPositions(latest)).toEqual([0, 0.9, 1])
    expect(continuousFlags.at(-1)).toBe(true)
    expect(container.querySelector('.gradient-stop')).toBe(firstRow)

    const firstPosition = container.querySelector<HTMLInputElement>('.gradient-stop .range-row input')
    if (!firstPosition) throw new Error('First gradient position is missing.')
    act(() => setInputValue(firstPosition, '0.95'))
    expect(stopPositions(latest)).toEqual([0.9, 0.9, 1])
    act(() => firstPosition.dispatchEvent(new browserWindow.PointerEvent('pointerup', { bubbles: true }) as unknown as PointerEvent))
    expect(interactionEnd).toHaveBeenCalled()

    const remove = container.querySelectorAll<HTMLButtonElement>('button[title="删除色标"]')[1]
    if (!remove) throw new Error('Remove gradient stop command is missing.')
    act(() => remove.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))
    expect(stopPositions(latest)).toHaveLength(2)
    expect(container.querySelectorAll('button[title="删除色标"]:disabled')).toHaveLength(2)

    act(() => clickButton('径向'))
    expect(latest).toMatchObject({ kind: 'radial', center: { x: 0.5, y: 0.5 }, stops: [{ position: 0 }, { position: 1 }] })
    for (let count = 0; count < 6; count += 1) act(() => clickButton('添加色标'))
    expect(stopPositions(latest)).toHaveLength(8)
    expect(container.querySelector<HTMLButtonElement>('.add-stop-button')?.disabled).toBe(true)
  })

  it('reuses one imported font across font slots', () => {
    const profile = createDefaultTheme('00000000-0000-4000-8000-000000000000')
    profile.typography.importedFonts.push({ id: 'font-test', family: 'Test Font', asset: 'assets/font-test.woff2', originalName: 'test.woff2', format: 'woff2' })
    const onChange = vi.fn()
    const onImport = vi.fn()

    act(() => root.render(React.createElement(FontControl, { slot: 'brandTitle', profile, onChange, onImport })))
    const titleSelect = container.querySelector<HTMLSelectElement>('select')
    if (!titleSelect) throw new Error('Font selector is missing.')
    expect(titleSelect.querySelector('option[value="imported:font-test"]')?.textContent).toBe('Test Font')
    act(() => {
      titleSelect.value = 'imported:font-test'
      titleSelect.dispatchEvent(new browserWindow.Event('change', { bubbles: true }) as unknown as Event)
    })
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'imported', id: 'font-test' })

    act(() => root.render(React.createElement(FontControl, { slot: 'homeSubtitle', profile, onChange, onImport })))
    const subtitleSelect = container.querySelector<HTMLSelectElement>('select')
    if (!subtitleSelect) throw new Error('Reused font selector is missing.')
    expect(subtitleSelect.querySelector('option[value="imported:font-test"]')?.textContent).toBe('Test Font')
    expect(subtitleSelect.querySelector('option[value="inherit"]')?.textContent).toBe('继承全局界面字体')
    const importButton = container.querySelector<HTMLButtonElement>('button[title="为首页副标题导入字体"]')
    if (!importButton) throw new Error('Font import command is missing.')
    act(() => importButton.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))
    expect(onImport).toHaveBeenCalledOnce()
  })

  it('opens custom image import from the icon selector and keeps builtin changes separate', () => {
    const profile = createDefaultTheme('00000000-0000-0000-0000-000000000000')
    const onChange = vi.fn()
    const onImport = vi.fn()
    act(() => root.render(React.createElement(ThemeIconControl, { slot: 'composer', profile, assets: {}, onChange, onImport })))

    const trigger = container.querySelector<HTMLButtonElement>('[data-icon-slot="composer"] .icon-picker-trigger')
    if (!trigger) throw new Error('Icon selector is missing.')
    act(() => {
      trigger.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
    })
    const assetOption = container.querySelector<HTMLButtonElement>('[data-icon-slot="composer"] [data-icon-name="__asset"]')
    if (!assetOption) throw new Error('Custom image option is missing.')
    act(() => assetOption.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))
    expect(onImport).toHaveBeenCalledOnce()
    expect(onChange).not.toHaveBeenCalled()

    act(() => trigger.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))
    const heartOption = container.querySelector<HTMLButtonElement>('[data-icon-slot="composer"] [data-icon-name="heart"]')
    if (!heartOption) throw new Error('Heart icon option is missing.')
    act(() => {
      heartOption.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent)
    })
    expect(onChange).toHaveBeenLastCalledWith('heart')
    expect(onImport).toHaveBeenCalledOnce()
  })

  it('keeps custom assets selectable and exposes a replace action', () => {
    const profile = createDefaultTheme('00000000-0000-0000-0000-000000000000')
    profile.icons.composer = { kind: 'asset', asset: 'assets/custom.png' }
    const onImport = vi.fn()
    act(() => root.render(React.createElement(ThemeIconControl, { slot: 'composer', profile, assets: { 'assets/custom.png': 'data:image/png;base64,AA==' }, onChange: vi.fn(), onImport })))

    const trigger = container.querySelector<HTMLButtonElement>('[data-icon-slot="composer"] .icon-picker-trigger')
    const button = container.querySelector<HTMLButtonElement>('[data-icon-slot="composer"] button[title]')
    if (!trigger || !button) throw new Error('Custom icon controls are missing.')
    expect(trigger.textContent).toContain('自定义图片')
    expect(button.title).toBe('更换输入框发送按钮图标')
    act(() => button.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }) as unknown as MouseEvent))
    expect(onImport).toHaveBeenCalledOnce()
    expect(container.querySelector('img.custom-icon')?.getAttribute('src')).toBe('data:image/png;base64,AA==')
  })

  it('offers at least 50 visual builtin icons with runtime glyph fallbacks', () => {
    expect(builtinIconOptions.length).toBeGreaterThanOrEqual(50)
    expect(Object.values(builtinIcons)).toHaveLength(builtinIconOptions.length)
    expect(builtinIconOptions.every((name) => Boolean(BUILTIN_ICON_GLYPHS[name]))).toBe(true)

    const profile = createDefaultTheme('00000000-0000-0000-0000-000000000000')
    act(() => root.render(React.createElement(ThemeIconControl, { slot: 'composer', profile, assets: {}, onChange: vi.fn(), onImport: vi.fn() })))
    const trigger = container.querySelector<HTMLButtonElement>('.icon-picker-trigger')
    if (!trigger) throw new Error('Icon picker trigger is missing.')
    act(() => trigger.click())
    expect(container.querySelectorAll('.icon-picker-option[data-icon-name]:not([data-icon-name="__asset"])')).toHaveLength(builtinIconOptions.length)
    expect(container.querySelectorAll('.icon-picker-option:not([data-icon-name="__asset"]) svg')).toHaveLength(builtinIconOptions.length)
  })

  it('names the default sidebar icons without special original-icon labels', () => {
    expect(builtinIconLabels['square-pen']).toBe('新建任务')
    expect(builtinIconLabels['git-pull-request']).toBe('拉取请求')
    expect(builtinIconLabels['grid-2x2']).toBe('站点')
    expect(builtinIconLabels['clock-3']).toBe('已安排')
    expect(builtinIconLabels['at-sign']).toBe('插件')
  })

  it('renders the runtime glyphs for injected sidebar and brand preview slots', () => {
    const profile = createDefaultTheme('00000000-0000-4000-8000-000000000000')
    act(() => root.render(React.createElement('div', null,
      React.createElement(RenderIcon, { slot: 'sidebarMode', profile, assets: {}, injected: true }),
      React.createElement(RenderIcon, { slot: 'branding', profile, assets: {}, injected: true })
    )))

    expect([...container.querySelectorAll('.builtin-icon-glyph')].map((node) => node.textContent)).toEqual(['♫', '✦'])
  })

  it('renders the native Codex-style upward arrow for the default composer icon', () => {
    const profile = createDefaultTheme('00000000-0000-4000-8000-000000000000')
    act(() => root.render(React.createElement(RenderIcon, { slot: 'composer', profile, assets: {} })))

    expect(container.querySelector('svg')?.classList.contains('lucide-arrow-up')).toBe(true)
    expect(BUILTIN_ICON_GLYPHS.send).toBe('↑')
  })
})
