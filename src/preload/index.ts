import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { StudioApi } from '../shared/contracts'
import { unwrapIpcResult, type IpcResult } from '../shared/ipc-result'

async function invokeIpcResult<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = await ipcRenderer.invoke(channel, ...args) as IpcResult<T>
  return unwrapIpcResult(result, true)
}

const api: StudioApi = {
  app: {
    getInfo: () => ipcRenderer.invoke('app:get-info'),
    getLocale: () => invokeIpcResult('app:get-locale'),
    setLocale: (locale) => invokeIpcResult('app:set-locale', locale),
    quit: () => ipcRenderer.send('app:quit'),
    getUpdateStatus: () => ipcRenderer.invoke('app:get-update-status'),
    checkForUpdates: () => invokeIpcResult('app:check-for-updates'),
    downloadUpdate: () => invokeIpcResult('app:download-update'),
    installUpdate: () => invokeIpcResult('app:install-update'),
    subscribeUpdateStatus: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, status: Parameters<typeof listener>[0]) => listener(status)
      ipcRenderer.on('app:update-status', handler)
      return () => ipcRenderer.removeListener('app:update-status', handler)
    }
  },
  themes: {
    list: () => invokeIpcResult('themes:list'),
    get: (id) => invokeIpcResult('themes:get', id),
    create: (input) => invokeIpcResult('themes:create', input),
    getDefault: (id) => invokeIpcResult('themes:get-default', id),
    duplicate: (profile, name) => invokeIpcResult('themes:duplicate', profile, name),
    update: (profile) => invokeIpcResult('themes:update', profile),
    delete: (id) => invokeIpcResult('themes:delete', id),
    activate: (id) => invokeIpcResult('themes:activate', id),
    compile: (id) => invokeIpcResult('themes:compile', id)
  },
  assets: {
    selectImage: (themeId, purpose) => invokeIpcResult('assets:select', themeId, purpose),
    selectMedia: (themeId, purpose, kind) => invokeIpcResult('assets:select-media', themeId, purpose, kind),
    commitVideoSelection: (themeId, selectionId, decision) => invokeIpcResult('assets:commit-video-selection', themeId, selectionId, decision),
    discardVideoSelection: (themeId, selectionId) => invokeIpcResult('assets:discard-video-selection', themeId, selectionId),
    getPreviewUrl: (themeId, asset) => invokeIpcResult('assets:get-preview-url', themeId, asset),
    inspectVideo: (themeId, asset) => invokeIpcResult('assets:inspect-video', themeId, asset),
    optimizeVideo: (themeId, role, sourceAsset, settings) => invokeIpcResult('assets:optimize-video', themeId, role, sourceAsset, settings),
    selectIcon: (themeId) => invokeIpcResult('assets:select', themeId, 'icon'),
    selectFont: (themeId) => invokeIpcResult('assets:select', themeId, 'font')
  },
  iconLibraries: {
    list: () => invokeIpcResult('icon-libraries:list'),
    get: (id) => invokeIpcResult('icon-libraries:get', id),
    create: (name) => invokeIpcResult('icon-libraries:create', name),
    rename: (id, name) => invokeIpcResult('icon-libraries:rename', id, name),
    delete: (id) => invokeIpcResult('icon-libraries:delete', id),
    importAssets: (id) => invokeIpcResult('icon-libraries:import-assets', id),
    importAssetPaths: (id, paths) => invokeIpcResult('icon-libraries:import-asset-paths', id, paths),
    exportPackage: (id) => invokeIpcResult('icon-libraries:export-package', id),
    importPackage: () => invokeIpcResult('icon-libraries:import-package'),
    importPackagePath: (path) => invokeIpcResult('icon-libraries:import-package-path', path),
    updateIcon: (libraryId, iconId, update) => invokeIpcResult('icon-libraries:update-icon', libraryId, iconId, update),
    deleteIcon: (libraryId, iconId) => invokeIpcResult('icon-libraries:delete-icon', libraryId, iconId),
    getPreviewUrl: (libraryId, iconId) => invokeIpcResult('icon-libraries:get-preview-url', libraryId, iconId),
    copyToTheme: (themeId, ref) => invokeIpcResult('icon-libraries:copy-to-theme', themeId, ref)
  },
  projectIcons: {
    getThemeSettings: (themeId) => invokeIpcResult('project-icons:get-theme-settings', themeId),
    setEnabledLibraries: (themeId, libraryIds) => invokeIpcResult('project-icons:set-enabled-libraries', themeId, libraryIds),
    setWeightOverride: (themeId, ref, enabled, weight) => invokeIpcResult('project-icons:set-weight-override', themeId, ref, enabled, weight),
    assignProject: (themeId, projectId, ref) => invokeIpcResult('project-icons:assign-project', themeId, projectId, ref),
    clearProjectAssignment: (themeId, projectId) => invokeIpcResult('project-icons:clear-project-assignment', themeId, projectId),
    listProjects: () => invokeIpcResult('project-icons:list-projects'),
    refreshProjects: () => invokeIpcResult('project-icons:refresh-projects')
  },
  share: {
    exportTheme: (profile, includeIconLibraries) => invokeIpcResult('share:export', profile, includeIconLibraries),
    importTheme: () => invokeIpcResult('share:import'),
    importThemePath: (path) => invokeIpcResult('share:import-path', path)
  },
  files: {
    getPathForFile: (file) => webUtils.getPathForFile(file as Parameters<typeof webUtils.getPathForFile>[0])
  },
  operations: {
    cancel: (id) => invokeIpcResult('operations:cancel', id),
    subscribeProgress: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: Parameters<typeof listener>[0]) => listener(progress)
      ipcRenderer.on('operations:progress', handler)
      return () => ipcRenderer.removeListener('operations:progress', handler)
    }
  },
  codex: {
    detect: () => invokeIpcResult('codex:detect'),
    installTheme: (themeId) => invokeIpcResult('codex:install-theme', themeId),
    start: (themeId, restartExisting) => invokeIpcResult('codex:start', themeId, restartExisting),
    verify: () => invokeIpcResult('codex:verify'),
    reinject: (themeId) => invokeIpcResult('codex:reinject', themeId),
    stop: () => invokeIpcResult('codex:stop'),
    restore: (restartCodex) => invokeIpcResult('codex:restore', restartCodex)
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
