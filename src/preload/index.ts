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
  }
}

contextBridge.exposeInMainWorld('studio', api)
