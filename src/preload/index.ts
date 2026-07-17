import { contextBridge, ipcRenderer } from 'electron'
import type { StudioApi } from '../shared/contracts'

const api: StudioApi = {
  app: {
    getInfo: () => ipcRenderer.invoke('app:get-info')
  }
}

contextBridge.exposeInMainWorld('studio', api)
