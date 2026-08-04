import { Window } from 'happy-dom'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IconLibraryPage } from '../src/renderer/src/IconLibraryPage'
import { ProjectIconsPage } from '../src/renderer/src/ProjectIconsPage'
import { createSystemIconLibrary, type CustomIconLibrary, type IconLibrary, type ThemeProjectIconSettings } from '../src/shared/project-icons'
import type { StudioApi } from '../src/shared/contracts'
import { setActiveLocale } from '../src/shared/i18n'

const GLOBAL_KEYS = ['window', 'document', 'navigator', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'Node', 'Event', 'InputEvent', 'KeyboardEvent', 'MouseEvent'] as const
const themeId = '11111111-1111-4111-8111-111111111111'
const libraryId = '22222222-2222-4222-8222-222222222222'
const iconId = '33333333-3333-4333-8333-333333333333'
const gifIconId = '44444444-4444-4444-8444-444444444444'

function customLibrary(icons: CustomIconLibrary['icons'] = []): CustomIconLibrary {
  return {
    version: 1,
    id: libraryId,
    name: 'Pixel Set',
    updatedAt: '2026-08-03T00:00:00.000Z',
    icons
  }
}

function customIcon(): CustomIconLibrary['icons'][number] {
  return {
    id: iconId,
    name: 'Pixel Star',
    asset: `assets/${iconId}.png`,
    mimeType: 'image/png',
    defaultEnabled: true,
    defaultWeight: 4,
    originalName: 'pixel-star.png',
    width: 32,
    height: 32,
    sha256: 'a'.repeat(64)
  }
}

function customGifIcon(): CustomIconLibrary['icons'][number] {
  return {
    id: gifIconId,
    name: 'Pixel Motion',
    asset: `assets/${gifIconId}.gif`,
    posterAsset: `assets/${gifIconId}.poster.png`,
    mimeType: 'image/gif',
    defaultEnabled: true,
    defaultWeight: 2,
    originalName: 'pixel-motion.gif',
    width: 32,
    height: 32,
    sha256: 'b'.repeat(64)
  }
}

describe('icon management pages', () => {
  let browserWindow: Window
  let root: Root
  let container: HTMLElement
  let previous: Map<string, PropertyDescriptor | undefined>

  beforeEach(() => {
    setActiveLocale('zh-CN')
    browserWindow = new Window({ url: 'app://-/index.html' })
    previous = new Map(GLOBAL_KEYS.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
    const values: Record<(typeof GLOBAL_KEYS)[number], unknown> = {
      window: browserWindow,
      document: browserWindow.document,
      navigator: browserWindow.navigator,
      Element: browserWindow.Element,
      HTMLElement: browserWindow.HTMLElement,
      HTMLInputElement: browserWindow.HTMLInputElement,
      HTMLSelectElement: browserWindow.HTMLSelectElement,
      Node: browserWindow.Node,
      Event: browserWindow.Event,
      InputEvent: browserWindow.InputEvent,
      KeyboardEvent: browserWindow.KeyboardEvent,
      MouseEvent: browserWindow.MouseEvent
    }
    for (const key of GLOBAL_KEYS) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: values[key] })
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, writable: true, value: true })
    const element = browserWindow.document.createElement('div')
    browserWindow.document.body.append(element)
    container = element as unknown as HTMLElement
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    await new Promise<void>((resolve) => setImmediate(resolve))
    browserWindow.close()
    for (const key of GLOBAL_KEYS) {
      const descriptor = previous.get(key)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT')
  })

  const setInput = (input: HTMLInputElement, value: string): void => {
    input.focus()
    Object.getOwnPropertyDescriptor(browserWindow.HTMLInputElement.prototype, 'value')?.set?.call(input, value)
    input.dispatchEvent(new browserWindow.InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }) as unknown as InputEvent)
    input.dispatchEvent(new browserWindow.Event('change', { bubbles: true }) as unknown as Event)
  }

  it('keeps the system library protected and creates and populates a custom library', async () => {
    const system = createSystemIconLibrary()
    let custom: CustomIconLibrary | null = null
    const list = vi.fn(async () => [
      { id: system.id, name: system.name, system: true, iconCount: system.icons.length, updatedAt: system.updatedAt },
      ...(custom ? [{ id: custom.id, name: custom.name, system: false, iconCount: custom.icons.length, updatedAt: custom.updatedAt }] : [])
    ])
    const get = vi.fn(async (id: string): Promise<IconLibrary> => id === system.id ? system : custom ?? Promise.reject(new Error('Missing library')))
    const create = vi.fn(async (name: string) => {
      custom = { ...customLibrary(), name }
      return custom
    })
    const importAssets = vi.fn(async () => {
      custom = customLibrary([customIcon()])
      return custom
    })
    const studio = {
      iconLibraries: { list, get, create, importAssets, getPreviewUrl: async (id: string, icon: string) => `studio-icon://${id}/${icon}` },
      files: { getPathForFile: () => '' }
    } as unknown as StudioApi
    ;(browserWindow as unknown as { studio: StudioApi }).studio = studio

    await act(async () => root.render(<IconLibraryPage preferredLibraryId={null} operationProgress={null} onChanged={vi.fn()} onError={vi.fn()} />))
    await vi.waitFor(() => expect(container.querySelector('.library-icon-grid')).not.toBeNull())
    expect(container.querySelector<HTMLButtonElement>('.utility-actions .danger')?.disabled).toBe(true)

    const newLibrary = container.querySelector<HTMLButtonElement>('button[title="新建素材库"]')
    if (!newLibrary) throw new Error('New library button is missing.')
    act(() => newLibrary.click())
    const name = container.querySelector<HTMLInputElement>('.library-create-form input')
    if (!name) throw new Error('Library name input is missing.')
    act(() => setInput(name, 'My Icons'))
    const createButton = container.querySelector<HTMLButtonElement>('.library-create-form button[type="submit"]')
    if (!createButton) throw new Error('Create library submit button is missing.')
    await act(async () => createButton.click())
    expect(create).toHaveBeenCalledWith('My Icons')
    await vi.waitFor(() => expect(container.querySelector<HTMLInputElement>('.library-title-edit input')?.value).toBe('My Icons'))
    expect(container.querySelector<HTMLButtonElement>('.utility-actions .danger')?.disabled).toBe(false)

    const importButton = [...container.querySelectorAll<HTMLButtonElement>('.utility-actions button')].find((button) => button.textContent?.includes('导入素材'))
    if (!importButton) throw new Error('Import assets button is missing.')
    await act(async () => importButton.click())
    await vi.waitFor(() => expect(container.querySelectorAll('.library-icon-tile')).toHaveLength(1))
    expect(importAssets).toHaveBeenCalledWith(libraryId)
  })

  it('configures theme libraries, priorities, cached projects, and explicit assignments', async () => {
    const system = createSystemIconLibrary()
    const custom = customLibrary([customIcon(), customGifIcon()])
    let settings: ThemeProjectIconSettings = { enabledLibraryIds: ['system'], weightOverrides: [], assignments: [], sessionAssignments: [] }
    const setEnabledLibraries = vi.fn(async (_themeId: string, ids: string[]) => {
      settings = { ...settings, enabledLibraryIds: ids }
      return settings
    })
    const setWeightOverride = vi.fn(async (_themeId: string, ref, enabled: boolean, weight: number) => {
      settings = { ...settings, weightOverrides: [{ ref, enabled, weight }] }
      return settings
    })
    const assignProject = vi.fn(async (_themeId: string, projectId: string, ref) => {
      settings = { ...settings, assignments: [{ projectId, ref }] }
      return settings
    })
    const clearProjectAssignment = vi.fn(async (_themeId: string, projectId: string) => {
      settings = { ...settings, assignments: settings.assignments.filter((assignment) => assignment.projectId !== projectId) }
      return settings
    })
    let sessionIconsEnabled = true
    const setSessionIconsEnabled = vi.fn(async (enabled: boolean) => {
      sessionIconsEnabled = enabled
      return enabled
    })
    const assignSession = vi.fn(async (_themeId: string, projectId: string, sessionId: string, ref) => {
      settings = { ...settings, sessionAssignments: [{ projectId, sessionId, ref }] }
      return settings
    })
    const clearSessionAssignment = vi.fn(async (_themeId: string, projectId: string, sessionId: string) => {
      settings = { ...settings, sessionAssignments: settings.sessionAssignments.filter((assignment) => !(assignment.projectId === projectId && assignment.sessionId === sessionId)) }
      return settings
    })
    const studio = {
      iconLibraries: {
        list: async () => [
          { id: system.id, name: system.name, system: true, iconCount: system.icons.length, updatedAt: system.updatedAt },
          { id: custom.id, name: custom.name, system: false, iconCount: custom.icons.length, updatedAt: custom.updatedAt }
        ],
        get: async (id: string) => id === system.id ? system : custom,
        getPreviewUrl: async (id: string, icon: string) => `studio-icon://${id}/${icon}`
      },
      projectIcons: {
        getThemeSettings: async () => settings,
        getSessionIconsEnabled: async () => sessionIconsEnabled,
        setSessionIconsEnabled,
        setEnabledLibraries,
        setWeightOverride,
        assignProject,
        clearProjectAssignment,
        assignSession,
        clearSessionAssignment,
        listProjects: async () => [
          { id: 'project-1', label: 'Zulu', kind: 'local', lastSeenAt: '2026-08-03T00:00:00.000Z', sessions: [{ id: 'local:session-1', title: 'Needle Session', lastSeenAt: '2026-08-03T00:00:00.000Z' }] },
          { id: 'project-2', label: 'Alpha', kind: 'local', lastSeenAt: '2026-08-03T00:00:00.000Z', sessions: [] },
          { id: 'project-3', label: 'Zebra', kind: 'local', lastSeenAt: '2026-08-03T00:00:00.000Z', sessions: [] }
        ],
        refreshProjects: async () => []
      }
    } as unknown as StudioApi
    ;(browserWindow as unknown as { studio: StudioApi }).studio = studio

    await act(async () => root.render(<ProjectIconsPage themes={[{ id: themeId, name: 'Dream', active: true, system: false, updatedAt: '2026-08-03T00:00:00.000Z' }]} currentThemeId={themeId} revision={0} onChanged={vi.fn()} onError={vi.fn()} />))
    await vi.waitFor(() => expect(container.textContent).toContain('Zulu'))
    expect(container.textContent).toContain('仅本机')
    const projectLabels = (): string[] => [...container.querySelectorAll('.project-assignment-row > .project-assignment-copy strong')].map((node) => node.textContent ?? '')
    expect(projectLabels()).toEqual(['Zulu', 'Alpha', 'Zebra'])

    const search = container.querySelector<HTMLInputElement>('.project-search input')
    if (!search) throw new Error('Project search input is missing.')
    act(() => setInput(search, 'z'))
    expect(projectLabels()).toEqual(['Zulu', 'Zebra'])
    act(() => setInput(search, 'needle'))
    expect(projectLabels()).toEqual(['Zulu'])
    expect(container.textContent).toContain('Needle Session')
    act(() => setInput(search, ''))
    expect(projectLabels()).toEqual(['Zulu', 'Alpha', 'Zebra'])

    const sessionToggle = container.querySelector<HTMLInputElement>('.session-icon-toggle input')
    if (!sessionToggle) throw new Error('Session icon toggle is missing.')
    await act(async () => sessionToggle.click())
    expect(setSessionIconsEnabled).toHaveBeenCalledWith(false)

    const customToggle = [...container.querySelectorAll<HTMLElement>('.library-toggle-row')].find((row) => row.textContent?.includes('Pixel Set'))?.querySelector<HTMLInputElement>('input')
    if (!customToggle) throw new Error('Custom library toggle is missing.')
    await act(async () => customToggle.click())
    expect(setEnabledLibraries).toHaveBeenCalledWith(themeId, ['system', libraryId])

    const starToggle = container.querySelector<HTMLInputElement>('input[aria-label="星星参与随机"]')
    if (!starToggle) throw new Error('Star priority toggle is missing.')
    await act(async () => starToggle.click())
    expect(setWeightOverride).toHaveBeenCalledWith(themeId, { libraryId: 'system', iconId: 'star' }, false, 1)

    expect(container.querySelector('.project-assignment-row select')).toBeNull()
    const assignmentTrigger = container.querySelector<HTMLButtonElement>('.project-icon-picker-trigger')
    if (!assignmentTrigger) throw new Error('Project assignment picker is missing.')
    await act(async () => assignmentTrigger.click())
    const picker = (): HTMLElement | null => browserWindow.document.querySelector('.project-icon-picker-menu') as unknown as HTMLElement | null
    expect(picker()).not.toBeNull()
    expect(picker()?.querySelectorAll('.project-icon-picker-option svg').length).toBeGreaterThan(1)
    await act(async () => vi.waitFor(() => expect(picker()?.querySelectorAll('.project-icon-picker-option img')).toHaveLength(2)))
    expect(picker()?.querySelector<HTMLImageElement>(`[data-icon-name="${libraryId}:${iconId}"] img`)?.src).toBe(`studio-icon://${libraryId}/${iconId}`)
    expect(picker()?.querySelector<HTMLImageElement>(`[data-icon-name="${libraryId}:${gifIconId}"] img`)?.src).toBe(`studio-icon://${libraryId}/${gifIconId}`)
    expect([...picker()!.querySelectorAll('.project-icon-picker-group-label')].map((node) => node.textContent)).toEqual(['系统图标', 'Pixel Set'])

    const iconSearch = picker()?.querySelector<HTMLInputElement>('.project-icon-picker-search input')
    if (!iconSearch) throw new Error('Project icon search is missing.')
    act(() => setInput(iconSearch, 'Pixel Star'))
    expect([...picker()!.querySelectorAll<HTMLButtonElement>('.project-icon-picker-option')].map((node) => node.title)).toEqual(['Pixel Star'])
    expect([...picker()!.querySelectorAll('.project-icon-picker-group-label')].map((node) => node.textContent)).toEqual(['Pixel Set'])
    act(() => setInput(iconSearch, 'missing'))
    expect(picker()?.textContent).toContain('没有匹配的图标')

    act(() => browserWindow.document.body.dispatchEvent(new browserWindow.Event('pointerdown', { bubbles: true })))
    expect(picker()).toBeNull()
    await act(async () => assignmentTrigger.dispatchEvent(new browserWindow.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
    expect(picker()).not.toBeNull()
    act(() => browserWindow.document.dispatchEvent(new browserWindow.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(picker()).toBeNull()
    expect(browserWindow.document.activeElement).toBe(assignmentTrigger)

    await act(async () => assignmentTrigger.click())
    const customOption = picker()?.querySelector<HTMLButtonElement>(`[data-icon-name="${libraryId}:${iconId}"]`)
    if (!customOption) throw new Error('Custom project icon option is missing.')
    await act(async () => customOption.click())
    expect(assignProject).toHaveBeenCalledWith(themeId, 'project-1', { libraryId, iconId })
    await vi.waitFor(() => expect(container.textContent).toContain('已指定'))
    expect(assignmentTrigger.textContent).toContain('Pixel Star')

    await act(async () => assignmentTrigger.click())
    expect(picker()?.querySelector(`[data-icon-name="${libraryId}:${iconId}"]`)?.getAttribute('aria-selected')).toBe('true')
    const randomOption = picker()?.querySelector<HTMLButtonElement>('[data-icon-name="__random"]')
    if (!randomOption) throw new Error('Random project icon option is missing.')
    await act(async () => randomOption.click())
    expect(clearProjectAssignment).toHaveBeenCalledWith(themeId, 'project-1')
    await vi.waitFor(() => expect(assignmentTrigger.textContent).toContain('随机（素材库优先级）'))

    const disclosure = container.querySelector<HTMLButtonElement>('.project-disclosure')
    if (!disclosure) throw new Error('Project disclosure is missing.')
    await act(async () => disclosure.click())
    expect(disclosure.getAttribute('aria-expanded')).toBe('true')
    const sessionRow = container.querySelector<HTMLElement>('.session-assignment-row')
    expect(sessionRow?.textContent).toContain('Needle Session')
    const sessionTrigger = sessionRow?.querySelector<HTMLButtonElement>('.project-icon-picker-trigger')
    if (!sessionTrigger) throw new Error('Session assignment picker is missing.')
    await act(async () => sessionTrigger.click())
    const sessionOption = picker()?.querySelector<HTMLButtonElement>(`[data-icon-name="${libraryId}:${iconId}"]`)
    if (!sessionOption) throw new Error('Custom session icon option is missing.')
    await act(async () => sessionOption.click())
    expect(assignSession).toHaveBeenCalledWith(themeId, 'project-1', 'local:session-1', { libraryId, iconId })

    setActiveLocale('en-US')
    await act(async () => root.render(<ProjectIconsPage themes={[{ id: themeId, name: 'Dream', active: true, system: false, updatedAt: '2026-08-03T00:00:00.000Z' }]} currentThemeId={themeId} revision={1} onChanged={vi.fn()} onError={vi.fn()} />))
    await vi.waitFor(() => expect(container.textContent).toContain('System icons'))
    expect(container.textContent).not.toContain('系统图标')
    const englishTrigger = container.querySelector<HTMLButtonElement>('.project-icon-picker-trigger')
    await act(async () => englishTrigger?.click())
    expect(browserWindow.document.querySelector<HTMLInputElement>('.project-icon-picker-search input')?.placeholder).toBe('Search icons')
    await act(async () => vi.waitFor(() => expect(browserWindow.document.querySelectorAll('.project-icon-picker-option img')).toHaveLength(2)))
    await act(async () => englishTrigger?.click())
  })
})
