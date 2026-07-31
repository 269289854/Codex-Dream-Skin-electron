import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudioApi } from '../src/shared/contracts'
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

  it('throws clean serialized errors without Electron remote-method wrappers', async () => {
    electronMocks.invoke.mockResolvedValue({ ok: false, error: '分享包校验失败。' })

    await expect(studio.share.importTheme()).rejects.toThrow(/^分享包校验失败。$/)
    await expect(studio.share.importThemePath('C:\\Shares\\theme.cdstheme')).rejects.toThrow(/^分享包校验失败。$/)
  })
})
