import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import type { StudioApi } from '../src/shared/contracts'
import { localizedMessage, localizedMessageFrom } from '../src/shared/localized-message'
import { createDefaultTheme } from '../src/shared/theme'

const electronMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  send: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  getPathForFile: vi.fn(),
  exposed: {} as Record<string, unknown>
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (name: string, value: unknown) => { electronMocks.exposed[name] = value }
  },
  ipcRenderer: {
    invoke: electronMocks.invoke,
    send: electronMocks.send,
    on: electronMocks.on,
    removeListener: electronMocks.removeListener
  },
  webUtils: { getPathForFile: electronMocks.getPathForFile }
}))

await import('../src/preload/index')

const studio = electronMocks.exposed.studio as StudioApi

describe('preload share import IPC results', () => {
  beforeEach(() => {
    electronMocks.invoke.mockReset()
  })

  it('unwraps successful imports for both share entry points', async () => {
    const profile = createDefaultTheme('11111111-1111-4111-8111-111111111111', '分享主题')
    electronMocks.invoke.mockResolvedValue({ ok: true, value: profile })

    await expect(studio.share.importTheme()).resolves.toEqual(profile)
    await expect(studio.share.importThemePath('C:\\Shares\\theme.cdstheme')).resolves.toEqual(profile)
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(1, 'share:import')
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(2, 'share:import-path', 'C:\\Shares\\theme.cdstheme')
  })

  it('forwards theme library options and independent icon package paths', async () => {
    const profile = createDefaultTheme('11111111-1111-4111-8111-111111111111', '分享主题')
    electronMocks.invoke
      .mockResolvedValueOnce({ ok: true, value: { filePath: 'C:\\Shares\\theme.cdstheme' } })
      .mockResolvedValueOnce({ ok: true, value: { id: '22222222-2222-4222-8222-222222222222', name: 'Imported' } })

    await studio.share.exportTheme(profile, true)
    await studio.iconLibraries.importPackagePath('C:\\Shares\\icons.cdsicons')
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(1, 'share:export', profile, true)
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(2, 'icon-libraries:import-package-path', 'C:\\Shares\\icons.cdsicons')
  })

  it('forwards session icon settings and assignments through serialized IPC', async () => {
    electronMocks.invoke.mockResolvedValue({ ok: true, value: true })
    const ref = { libraryId: 'system', iconId: 'star' }

    await studio.projectIcons.getSessionIconsEnabled()
    await studio.projectIcons.setSessionIconsEnabled(false)
    await studio.projectIcons.assignSession('theme-id', 'project-id', 'session-id', ref)
    await studio.projectIcons.clearSessionAssignment('theme-id', 'project-id', 'session-id')

    expect(electronMocks.invoke).toHaveBeenNthCalledWith(1, 'project-icons:get-session-icons-enabled')
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(2, 'project-icons:set-session-icons-enabled', false)
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(3, 'project-icons:assign-session', 'theme-id', 'project-id', 'session-id', ref)
    expect(electronMocks.invoke).toHaveBeenNthCalledWith(4, 'project-icons:clear-session-assignment', 'theme-id', 'project-id', 'session-id')
  })

  it('throws clean serialized errors without Electron remote-method wrappers', async () => {
    const error = localizedMessage('分享包校验失败。')
    electronMocks.invoke.mockResolvedValue({ ok: false, error })

    await expect(studio.share.importTheme()).rejects.not.toThrow(/Error invoking remote method/)
    await studio.share.importThemePath('C:\\Shares\\theme.cdstheme').catch((reason) => {
      expect(localizedMessageFrom(reason)).toEqual(error)
    })
  })

  it('restores structured localized errors with their nested values intact', async () => {
    const error = localizedMessage('主题导入失败：{reason}', {
      reason: localizedMessage('分享包缺少素材: {asset}', { asset: 'assets/hero.png' })
    })
    electronMocks.invoke.mockResolvedValue({ ok: false, error })

    try {
      await studio.share.importTheme()
      throw new Error('Expected importTheme to fail.')
    } catch (reason) {
      expect(localizedMessageFrom(reason)).toEqual(error)
    }
  })

  it('uses serialized results for every UI-facing IPC method', () => {
    const preloadSource = readFileSync(new URL('../src/preload/index.ts', import.meta.url), 'utf8')
    const mainSource = readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8')
    const directChannels = [...preloadSource.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)].map((match) => match[1])
    const serializedChannels = [...preloadSource.matchAll(/invokeIpcResult(?:<[^>]+>)?\('([^']+)'/g)].map((match) => match[1])

    expect(directChannels).toEqual(['app:get-info', 'app:get-update-status', 'runtime:get-status'])
    for (const channel of serializedChannels) {
      const handlerStart = mainSource.indexOf(`ipcMain.handle('${channel}'`)
      const handlerEnd = mainSource.indexOf('ipcMain.', handlerStart + 1)
      expect(handlerStart, `${channel} must have a main-process handler`).toBeGreaterThanOrEqual(0)
      expect(mainSource.slice(handlerStart, handlerEnd < 0 ? undefined : handlerEnd), `${channel} must capture its result`).toContain('captureIpcResult')
    }
  })
})
