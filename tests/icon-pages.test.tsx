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

const GLOBAL_KEYS = ['window', 'document', 'navigator', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'Node', 'Event', 'InputEvent', 'MouseEvent'] as const
const themeId = '11111111-1111-4111-8111-111111111111'
const libraryId = '22222222-2222-4222-8222-222222222222'
const iconId = '33333333-3333-4333-8333-333333333333'

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

  const setInput = (input: HTMLInputElement, value: string): void => {
    input.focus()
    Object.getOwnPropertyDescriptor(browserWindow.HTMLInputElement.prototype, 'value')?.set?.call(input, value)
    input.dispatchEvent(new browserWindow.InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }) as unknown as InputEvent)
    input.dispatchEvent(new browserWindow.Event('change', { bubbles: true }) as unknown as Event)
  }

  const setSelect = (select: HTMLSelectElement, value: string): void => {
    Object.getOwnPropertyDescriptor(browserWindow.HTMLSelectElement.prototype, 'value')?.set?.call(select, value)
    select.dispatchEvent(new browserWindow.Event('change', { bubbles: true }) as unknown as Event)
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
    const custom = customLibrary([customIcon()])
    let settings: ThemeProjectIconSettings = { enabledLibraryIds: ['system'], weightOverrides: [], assignments: [] }
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
        setEnabledLibraries,
        setWeightOverride,
        assignProject,
        clearProjectAssignment: async () => settings,
        listProjects: async () => [
          { id: 'project-1', label: 'Zulu', kind: 'local', lastSeenAt: '2026-08-03T00:00:00.000Z' },
          { id: 'project-2', label: 'Alpha', kind: 'local', lastSeenAt: '2026-08-03T00:00:00.000Z' },
          { id: 'project-3', label: 'Zebra', kind: 'local', lastSeenAt: '2026-08-03T00:00:00.000Z' }
        ],
        refreshProjects: async () => []
      }
    } as unknown as StudioApi
    ;(browserWindow as unknown as { studio: StudioApi }).studio = studio

    await act(async () => root.render(<ProjectIconsPage themes={[{ id: themeId, name: 'Dream', active: true, system: false, updatedAt: '2026-08-03T00:00:00.000Z' }]} currentThemeId={themeId} revision={0} onChanged={vi.fn()} onError={vi.fn()} />))
    await vi.waitFor(() => expect(container.textContent).toContain('Zulu'))
    expect(container.textContent).toContain('仅本机')
    const projectLabels = (): string[] => [...container.querySelectorAll('.project-assignment-copy strong')].map((node) => node.textContent ?? '')
    expect(projectLabels()).toEqual(['Zulu', 'Alpha', 'Zebra'])

    const search = container.querySelector<HTMLInputElement>('.project-search input')
    if (!search) throw new Error('Project search input is missing.')
    act(() => setInput(search, 'z'))
    expect(projectLabels()).toEqual(['Zulu', 'Zebra'])
    act(() => setInput(search, ''))
    expect(projectLabels()).toEqual(['Zulu', 'Alpha', 'Zebra'])

    const customToggle = [...container.querySelectorAll<HTMLElement>('.library-toggle-row')].find((row) => row.textContent?.includes('Pixel Set'))?.querySelector<HTMLInputElement>('input')
    if (!customToggle) throw new Error('Custom library toggle is missing.')
    await act(async () => customToggle.click())
    expect(setEnabledLibraries).toHaveBeenCalledWith(themeId, ['system', libraryId])

    const starToggle = container.querySelector<HTMLInputElement>('input[aria-label="星星参与随机"]')
    if (!starToggle) throw new Error('Star priority toggle is missing.')
    await act(async () => starToggle.click())
    expect(setWeightOverride).toHaveBeenCalledWith(themeId, { libraryId: 'system', iconId: 'star' }, false, 1)

    const assignment = container.querySelector<HTMLSelectElement>('.project-assignment-row select')
    if (!assignment) throw new Error('Project assignment select is missing.')
    await act(async () => setSelect(assignment, `${libraryId}:${iconId}`))
    expect(assignProject).toHaveBeenCalledWith(themeId, 'project-1', { libraryId, iconId })
    await vi.waitFor(() => expect(container.textContent).toContain('已指定'))

    setActiveLocale('en-US')
    await act(async () => root.render(<ProjectIconsPage themes={[{ id: themeId, name: 'Dream', active: true, system: false, updatedAt: '2026-08-03T00:00:00.000Z' }]} currentThemeId={themeId} revision={1} onChanged={vi.fn()} onError={vi.fn()} />))
    await vi.waitFor(() => expect(container.textContent).toContain('System icons'))
    expect(container.textContent).not.toContain('系统图标')
  })
})
