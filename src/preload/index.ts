import { contextBridge, ipcRenderer } from 'electron'
import type { StudioApi } from '../shared/contracts'

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
    detect: () => ipcRenderer.invoke('codex:detect'),
    installTheme: (themeId) => ipcRenderer.invoke('codex:install-theme', themeId),
    start: (themeId, restartExisting) => ipcRenderer.invoke('codex:start', themeId, restartExisting),
    verify: () => ipcRenderer.invoke('codex:verify'),
    reinject: (themeId) => ipcRenderer.invoke('codex:reinject', themeId),
    stop: () => ipcRenderer.invoke('codex:stop'),
    restore: (restartCodex) => ipcRenderer.invoke('codex:restore', restartCodex)
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
