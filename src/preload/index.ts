import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { StudioApi } from '../shared/contracts'
import { unwrapIpcResult, type IpcResult } from '../shared/ipc-result'

async function invokeCodex<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = await ipcRenderer.invoke(channel, ...args) as IpcResult<T>
  return unwrapIpcResult(result)
}

const api: StudioApi = {
  app: {
    getInfo: () => ipcRenderer.invoke('app:get-info')
  },
  themes: {
    list: () => ipcRenderer.invoke('themes:list'),
    get: (id) => ipcRenderer.invoke('themes:get', id),
    create: (name) => ipcRenderer.invoke('themes:create', name),
    getDefault: (id) => ipcRenderer.invoke('themes:get-default', id),
    duplicate: (profile, name) => ipcRenderer.invoke('themes:duplicate', profile, name),
    update: (profile) => ipcRenderer.invoke('themes:update', profile),
    delete: (id) => ipcRenderer.invoke('themes:delete', id),
    activate: (id) => ipcRenderer.invoke('themes:activate', id),
    compile: (id) => ipcRenderer.invoke('themes:compile', id)
  },
  assets: {
    selectImage: (themeId, purpose) => ipcRenderer.invoke('assets:select', themeId, purpose),
    selectMedia: (themeId, purpose, kind) => ipcRenderer.invoke('assets:select-media', themeId, purpose, kind),
    getPreviewUrl: (themeId, asset) => ipcRenderer.invoke('assets:get-preview-url', themeId, asset),
    selectIcon: (themeId) => ipcRenderer.invoke('assets:select', themeId, 'icon'),
    selectFont: (themeId) => ipcRenderer.invoke('assets:select', themeId, 'font')
  },
  share: {
    exportTheme: (profile) => ipcRenderer.invoke('share:export', profile),
    importTheme: () => ipcRenderer.invoke('share:import'),
    importThemePath: (path) => ipcRenderer.invoke('share:import-path', path)
  },
  files: {
    getPathForFile: (file) => webUtils.getPathForFile(file as Parameters<typeof webUtils.getPathForFile>[0])
  },
  operations: {
    cancel: (id) => ipcRenderer.invoke('operations:cancel', id),
    subscribeProgress: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: Parameters<typeof listener>[0]) => listener(progress)
      ipcRenderer.on('operations:progress', handler)
      return () => ipcRenderer.removeListener('operations:progress', handler)
    }
  },
  codex: {
    detect: () => invokeCodex('codex:detect'),
    installTheme: (themeId) => invokeCodex('codex:install-theme', themeId),
    start: (themeId, restartExisting) => invokeCodex('codex:start', themeId, restartExisting),
    verify: () => invokeCodex('codex:verify'),
    reinject: (themeId) => invokeCodex('codex:reinject', themeId),
    stop: () => invokeCodex('codex:stop'),
    restore: (restartCodex) => invokeCodex('codex:restore', restartCodex)
  },
  runtime: {
    getStatus: () => ipcRenderer.invoke('runtime:get-status'),
    subscribeStatus: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, status: Parameters<typeof listener>[0]) => listener(status)
      ipcRenderer.on('runtime:status', handler)
      return () => ipcRenderer.removeListener('runtime:status', handler)
    }
  }
}

contextBridge.exposeInMainWorld('studio', api)
