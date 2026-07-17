import { contextBridge, ipcRenderer } from 'electron'
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
    duplicate: (id, name) => ipcRenderer.invoke('themes:duplicate', id, name),
    update: (profile) => ipcRenderer.invoke('themes:update', profile),
    delete: (id) => ipcRenderer.invoke('themes:delete', id),
    activate: (id) => ipcRenderer.invoke('themes:activate', id),
    compile: (id) => ipcRenderer.invoke('themes:compile', id)
  },
  assets: {
    selectImage: (themeId, purpose) => ipcRenderer.invoke('assets:select', themeId, purpose),
    selectIcon: (themeId) => ipcRenderer.invoke('assets:select', themeId, 'icon')
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
