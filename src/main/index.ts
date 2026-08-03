import { app, BrowserWindow, dialog, ipcMain, shell, Menu, Tray, nativeImage, protocol, type BrowserWindowConstructorOptions, type MenuItemConstructorOptions, type NativeImage, type OpenDialogOptions } from 'electron'
import { randomUUID } from 'node:crypto'
import { basename, extname, join } from 'node:path'
import electronUpdater from 'electron-updater'
import { ProfileStore } from './profile-store'
import { ProjectIconStore } from './project-icon-store'
import { ThemeShareService } from './theme-share-service'
import { CodexService } from './codex-service'
import { AppUpdateService, ElectronAppUpdateDriver, isAppUpdateEnabled } from './app-update-service'
import { createStudioInstanceData, resolveStudioInstanceAction } from './app-lifecycle'
import { isSupportedDesktopPlatform } from './codex-platform'
import { MacCodexDriver } from './macos-codex-driver'
import { WindowsCodexDriver } from './windows-codex-driver'
import { PendingVideoSelectionRegistry } from './pending-video-selections'
import { StudioMediaProtocol, toThemeDeleteError } from './studio-media-protocol'
import { captureIpcResult } from '../shared/ipc-result'
import type { AssetPurpose, MediaSelectionKind, OperationProgress, VideoAssetInspection, VideoMediaRole, VideoSourceSelection } from '../shared/contracts'
import { CONVERSATION_BUBBLE_PRESETS } from '../shared/theme'
import { VIDEO_IMPORT_CANCELLED_MESSAGE, assertVideoImportDecisionCompatible, resolveVideoOutputSize, videoImportDecisionSchema, videoTranscodeSettingsSchema, type VideoTranscodeSettings } from '../shared/video-transcode'
import { localizedMessage, localizedMessageFrom, setActiveLocale, t, type LocalizedMessage } from '../shared/i18n'
import { SYSTEM_ICON_LIBRARY_ID } from '../shared/project-icons'

const { autoUpdater } = electronUpdater

let mainWindow: BrowserWindow | null = null
let store: ProfileStore
let projectIconStore: ProjectIconStore
let themeShareService: ThemeShareService
let studioMediaProtocol: StudioMediaProtocol
let iconMediaProtocol: StudioMediaProtocol
let codexService: CodexService
let appUpdateService: AppUpdateService
let tray: Tray | null = null
let trayIcon: NativeImage | null = null
let appIconPath = ''
let quitting = false
let updatedVersionRelaunching = false
const operationControllers = new Map<string, AbortController>()
const pendingVideoSelections = new PendingVideoSelectionRegistry()
const appVersion = app.getVersion()
const hasSingleInstanceLock = app.requestSingleInstanceLock(createStudioInstanceData(appVersion))
protocol.registerSchemesAsPrivileged([
  { scheme: 'studio-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  { scheme: 'studio-icon', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

function showWindow(): void {
  if (mainWindow?.isMinimized()) mainWindow.restore()
  mainWindow?.show()
  mainWindow?.focus()
}

function quitStudio(): void {
  quitting = true
  app.quit()
}

async function restoreCodexAndQuit(): Promise<void> {
  try {
    const status = await codexService.restore(true)
    if (status.lastError) {
      showWindow()
      return
    }
  } catch {
    showWindow()
    return
  }
  quitting = true
  app.quit()
}

function relaunchForUpdatedVersion(): void {
  if (updatedVersionRelaunching) return
  updatedVersionRelaunching = true
  quitting = true
  appUpdateService?.stop()
  tray?.destroy()
  tray = null
  app.relaunch({ execPath: process.execPath })
  app.quit()
}

function updateTray(): void {
  if (codexService.isActive() && !tray && trayIcon) {
    tray = new Tray(trayIcon)
    tray.setToolTip('Codex Dream Skin Studio')
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: t('显示主题工作台'), click: showWindow },
      { label: t('验证当前主题'), click: () => void codexService.verify().catch(() => showWindow()) },
      { type: 'separator' },
      { label: t('退出 Studio（保留当前主题）'), click: quitStudio },
      { label: t('恢复 Codex 并退出'), click: () => void restoreCodexAndQuit() }
    ]))
    tray.on('double-click', showWindow)
  } else if (!codexService.isActive()) {
    const shouldRevealRuntimeError = tray !== null &&
      codexService.getStatus().phase === 'error' &&
      !quitting &&
      mainWindow !== null &&
      !mainWindow.isVisible()
    if (shouldRevealRuntimeError) showWindow()
    tray?.destroy()
    tray = null
  }
}

function configureApplicationMenu(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
    return
  }
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about', label: `${t('关于')} ${app.name}` },
        { type: 'separator' },
        { role: 'services', label: t('服务') },
        { type: 'separator' },
        { role: 'hide', label: `${t('隐藏')} ${app.name}` },
        { role: 'hideOthers', label: t('隐藏其他应用') },
        { role: 'unhide', label: t('全部显示') },
        { type: 'separator' },
        { role: 'quit', label: `${t('退出')} ${app.name}` }
      ]
    },
    {
      label: t('编辑'),
      submenu: [
        { role: 'undo', label: t('撤销') },
        { role: 'redo', label: t('重做') },
        { type: 'separator' },
        { role: 'cut', label: t('剪切') },
        { role: 'copy', label: t('复制') },
        { role: 'paste', label: t('粘贴') },
        { role: 'selectAll', label: t('全选') }
      ]
    },
    {
      label: t('窗口'),
      submenu: [
        { role: 'minimize', label: t('最小化') },
        { role: 'zoom', label: t('缩放') },
        { type: 'separator' },
        { role: 'front', label: t('前置全部窗口') }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function registerIpc(): void {
  ipcMain.handle('app:get-info', () => ({ version: app.getVersion(), platform: process.platform }))
  ipcMain.handle('app:get-locale', () => captureIpcResult(() => store.getLocale()))
  ipcMain.handle('app:set-locale', (_event, locale: unknown) => captureIpcResult(async () => {
    const saved = await store.setLocale(locale)
    setActiveLocale(saved)
    configureApplicationMenu()
    if (tray) {
      tray.destroy()
      tray = null
      updateTray()
    }
    return saved
  }))
  ipcMain.on('app:quit', () => quitStudio())
  ipcMain.handle('app:get-update-status', () => appUpdateService.getStatus())
  ipcMain.handle('app:check-for-updates', () => captureIpcResult(() => appUpdateService.checkForUpdates()))
  ipcMain.handle('app:download-update', () => captureIpcResult(() => appUpdateService.downloadUpdate()))
  ipcMain.handle('app:install-update', () => captureIpcResult(() => appUpdateService.installUpdate()))
  ipcMain.handle('themes:list', () => captureIpcResult(() => store.list()))
  ipcMain.handle('themes:get', (_event, id: string) => captureIpcResult(() => store.get(id)))
  ipcMain.handle('themes:create', (_event, input: unknown) => captureIpcResult(() => store.create(input)))
  ipcMain.handle('themes:get-default', (_event, id: string) => captureIpcResult(() => store.getDefault(id)))
  ipcMain.handle('themes:duplicate', (_event, profile: unknown, name: unknown) => captureIpcResult(async () => {
    const duplicate = await store.duplicate(profile, name)
    try {
      if (profile && typeof profile === 'object' && 'id' in profile && typeof profile.id === 'string') {
        await projectIconStore.copyThemeSettings(profile.id, duplicate.id)
      }
    } catch (error) {
      await store.delete(duplicate.id).catch(() => undefined)
      throw error
    }
    return duplicate
  }))
  ipcMain.handle('themes:update', (_event, profile: unknown) => captureIpcResult(() => store.update(profile)))
  ipcMain.handle('themes:delete', (_event, id: unknown) => captureIpcResult(async () => {
    if (typeof id !== 'string') throw new Error('主题 ID 无效。')
    const privateSettings = await projectIconStore.getThemeSettings(id)
    await projectIconStore.deleteThemeSettings(id)
    try {
      await studioMediaProtocol.withThemeSuspended(id, () => store.delete(id))
    } catch (reason) {
      await projectIconStore.restoreThemeSettings(id, privateSettings).catch(() => undefined)
      throw toThemeDeleteError(reason)
    }
  }))
  ipcMain.handle('themes:activate', (_event, id: string) => captureIpcResult(() => store.activate(id)))
  ipcMain.handle('themes:compile', (_event, id: string) => captureIpcResult(() => store.compile(id)))
  ipcMain.handle('assets:select', (_event, themeId: unknown, purpose: unknown) => captureIpcResult(async () => {
    if (typeof themeId !== 'string') throw new Error('主题 ID 无效。')
    if (purpose !== 'hero' && purpose !== 'polaroid' && purpose !== 'conversationBackground' && purpose !== 'accountMenuBackground' && purpose !== 'icon' && purpose !== 'font') throw new Error('素材用途无效。')
    const safePurpose = purpose as AssetPurpose
    const options: OpenDialogOptions = {
      title: t(safePurpose === 'font' ? '选择字体' : safePurpose === 'icon' ? '选择图标' : '选择主题图片'),
      properties: ['openFile'],
      filters: safePurpose === 'font'
        ? [{ name: t('字体文件'), extensions: ['ttf', 'otf', 'woff', 'woff2'] }]
        : [{ name: t(safePurpose === 'icon' ? '图片和 GIF' : '图片文件'), extensions: safePurpose === 'icon' ? ['png', 'webp', 'jpg', 'jpeg', 'gif', 'svg'] : ['png', 'webp', 'jpg', 'jpeg', 'svg'] }]
    }
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    if (safePurpose === 'font') return store.importFontAsset(themeId, result.filePaths[0])
    return store.importAsset(themeId, result.filePaths[0], safePurpose)
  }))
  ipcMain.handle('assets:select-media', (_event, themeId: unknown, purpose: unknown, requestedKind: unknown) => captureIpcResult(async () => {
    if (typeof themeId !== 'string') throw new Error('主题 ID 无效。')
    if (purpose !== 'hero' && purpose !== 'polaroid' && purpose !== 'conversationBackground' && purpose !== 'windowBackground' && purpose !== 'accountMenuBackground' && purpose !== 'brandSignature' && purpose !== 'composerMelody' && purpose !== 'conversationUserBubble' && purpose !== 'conversationCodexBubble' && purpose !== 'conversationPlanBubble') throw new Error('媒体用途无效。')
    if (requestedKind !== undefined && requestedKind !== 'image' && requestedKind !== 'gif' && requestedKind !== 'video') throw new Error('媒体类型无效。')
    if (purpose === 'brandSignature' && requestedKind !== 'image' && requestedKind !== 'gif') throw new Error('品牌签名只能选择图片或 GIF 文件。')
    if (purpose === 'composerMelody' && requestedKind !== 'image' && requestedKind !== 'gif') throw new Error('输入框装饰只能选择图片或 GIF 文件。')
    if (purpose === 'accountMenuBackground' && requestedKind !== 'image' && requestedKind !== 'gif') throw new Error('账号菜单背景只能选择图片或 GIF 文件。')
    if ((purpose === 'conversationUserBubble' || purpose === 'conversationCodexBubble' || purpose === 'conversationPlanBubble') && requestedKind !== 'image' && requestedKind !== 'gif') throw new Error('聊天气泡只能选择图片或 GIF 文件。')
    const kind = requestedKind as MediaSelectionKind | undefined
    const filters = kind === 'image'
      ? [{ name: t('图片文件'), extensions: ['png', 'webp', 'jpg', 'jpeg', 'svg'] }]
      : kind === 'gif'
        ? [{ name: 'GIF', extensions: ['gif'] }]
        : kind === 'video'
          ? [{ name: t('视频文件'), extensions: ['mp4', 'webm'] }]
          : [{ name: t('图片和视频'), extensions: ['png', 'webp', 'jpg', 'jpeg', 'gif', 'svg', 'mp4', 'webm'] }]
    const options: OpenDialogOptions = {
      title: t(purpose === 'hero' ? '选择主视觉媒体' : purpose === 'polaroid' ? '选择拍立得媒体' : purpose === 'conversationBackground' ? '选择对话区域背景' : purpose === 'windowBackground' ? '选择整个窗口背景' : purpose === 'accountMenuBackground' ? kind === 'image' ? '选择账号菜单背景图片' : '选择账号菜单背景 GIF' : purpose === 'brandSignature' ? kind === 'image' ? '选择品牌签名图片' : '选择品牌签名 GIF' : purpose === 'conversationUserBubble' ? kind === 'image' ? '选择我的消息气泡图片' : '选择我的消息气泡 GIF' : purpose === 'conversationCodexBubble' ? kind === 'image' ? '选择 Codex 回复气泡图片' : '选择 Codex 回复气泡 GIF' : purpose === 'conversationPlanBubble' ? kind === 'image' ? '选择生成计划气泡图片' : '选择生成计划气泡 GIF' : kind === 'image' ? '选择输入框图片装饰' : '选择输入框 GIF 装饰'),
      properties: ['openFile'],
      filters
    }
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    const sourcePath = result.filePaths[0]
    const id = randomUUID()
    const controller = new AbortController()
    operationControllers.set(id, controller)
    const sourceExtension = extname(sourcePath).toLowerCase()
    const videoSelected = sourceExtension === '.mp4' || sourceExtension === '.webm'
    emitProgress({ id, kind: 'media-import', phase: videoSelected ? 'validating' : 'started', processedBytes: 0, totalBytes: null, message: localizedMessage(videoSelected ? '正在检查视频' : '正在导入媒体') })
    try {
      if (videoSelected) {
        if (!isVideoMediaRole(purpose)) throw new Error('该位置不支持视频。')
        const preflight = await store.preflightVideoSource(sourcePath, controller.signal)
        const selectionId = randomUUID()
        pendingVideoSelections.add(selectionId, {
          themeId,
          purpose,
          sourcePath,
          originalName: basename(sourcePath),
          preflight
        })
        const selection: VideoSourceSelection = {
          kind: 'video-source',
          selectionId,
          originalName: basename(sourcePath),
          inspection: preflight.inspection
        }
        emitProgress({ id, kind: 'media-import', phase: 'completed', processedBytes: 0, totalBytes: null, message: localizedMessage('视频规格读取完成') })
        return selection
      }
      emitProgress({ id, kind: 'media-import', phase: 'copying', processedBytes: 0, totalBytes: null, message: localizedMessage('正在导入媒体') })
      const imported = await store.importMediaAsset(themeId, sourcePath, purpose, kind, controller.signal)
      emitProgress({ id, kind: 'media-import', phase: 'completed', processedBytes: 0, totalBytes: null, message: localizedMessage('媒体导入完成') })
      return imported
    } catch (error) {
      const failure = controller.signal.aborted ? new Error('媒体导入已取消。') : error
      emitProgress({ id, kind: 'media-import', phase: controller.signal.aborted ? 'cancelled' : 'failed', processedBytes: 0, totalBytes: null, message: localizedMessageFrom(failure, '媒体导入失败') })
      throw failure
    } finally {
      operationControllers.delete(id)
    }
  }))
  ipcMain.handle('icon-libraries:list', () => captureIpcResult(() => projectIconStore.listLibraries()))
  ipcMain.handle('icon-libraries:get', (_event, id: unknown) => captureIpcResult(() => projectIconStore.getLibrary(id)))
  ipcMain.handle('icon-libraries:create', (_event, name: unknown) => captureIpcResult(() => projectIconStore.createLibrary(name)))
  ipcMain.handle('icon-libraries:rename', (_event, id: unknown, name: unknown) => captureIpcResult(() => projectIconStore.renameLibrary(id, name)))
  ipcMain.handle('icon-libraries:delete', (_event, id: unknown) => captureIpcResult(async () => {
    if (typeof id !== 'string') throw new Error('素材库 ID 无效。')
    await iconMediaProtocol.withThemeSuspended(id, () => projectIconStore.deleteLibrary(id))
  }))
  ipcMain.handle('icon-libraries:import-assets', (_event, id: unknown) => captureIpcResult(async () => {
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, { title: t('选择图标素材'), properties: ['openFile', 'multiSelections'], filters: [{ name: t('图片和 GIF'), extensions: ['png', 'webp', 'jpg', 'jpeg', 'gif', 'svg'] }] })
      : await dialog.showOpenDialog({ title: t('选择图标素材'), properties: ['openFile', 'multiSelections'], filters: [{ name: t('图片和 GIF'), extensions: ['png', 'webp', 'jpg', 'jpeg', 'gif', 'svg'] }] })
    if (result.canceled || result.filePaths.length === 0) return null
    return projectIconStore.importAssets(id, result.filePaths)
  }))
  ipcMain.handle('icon-libraries:import-asset-paths', (_event, id: unknown, paths: unknown) => captureIpcResult(() => projectIconStore.importAssets(id, paths)))
  ipcMain.handle('icon-libraries:export-package', (_event, id: unknown) => captureIpcResult(async () => {
    const library = await projectIconStore.getLibrary(id)
    if (library.id === SYSTEM_ICON_LIBRARY_ID) throw new Error('系统素材库不能导出。')
    const safeName = library.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim().slice(0, 80) || t('素材库')
    const result = mainWindow
      ? await dialog.showSaveDialog(mainWindow, { title: t('导出素材库'), defaultPath: `${safeName}.cdsicons`, filters: [{ name: 'Codex Dream Icons', extensions: ['cdsicons'] }] })
      : await dialog.showSaveDialog({ title: t('导出素材库'), defaultPath: `${safeName}.cdsicons`, filters: [{ name: 'Codex Dream Icons', extensions: ['cdsicons'] }] })
    if (result.canceled || !result.filePath) return null
    const filePath = extname(result.filePath).toLowerCase() === '.cdsicons' ? result.filePath : `${result.filePath}.cdsicons`
    const operationId = randomUUID()
    const controller = new AbortController()
    operationControllers.set(operationId, controller)
    emitProgress({ id: operationId, kind: 'icon-library-export', phase: 'started', processedBytes: 0, totalBytes: null, message: localizedMessage('正在导出素材库') })
    try {
      await projectIconStore.exportLibraryPackage(library.id, filePath, controller.signal)
      emitProgress({ id: operationId, kind: 'icon-library-export', phase: 'completed', processedBytes: 0, totalBytes: null, message: localizedMessage('素材库导出完成') })
      return { filePath }
    } catch (error) {
      emitProgress({ id: operationId, kind: 'icon-library-export', phase: controller.signal.aborted ? 'cancelled' : 'failed', processedBytes: 0, totalBytes: null, message: localizedMessageFrom(error, '素材库导出失败') })
      throw error
    } finally {
      operationControllers.delete(operationId)
    }
  }))
  ipcMain.handle('icon-libraries:import-package', () => captureIpcResult(async () => {
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, { title: t('导入素材库'), properties: ['openFile'], filters: [{ name: 'Codex Dream Icons', extensions: ['cdsicons'] }] })
      : await dialog.showOpenDialog({ title: t('导入素材库'), properties: ['openFile'], filters: [{ name: 'Codex Dream Icons', extensions: ['cdsicons'] }] })
    if (result.canceled || !result.filePaths[0]) return null
    return importIconLibraryPackage(result.filePaths[0])
  }))
  ipcMain.handle('icon-libraries:import-package-path', (_event, path: unknown) => captureIpcResult(() => importIconLibraryPackage(path)))
  ipcMain.handle('icon-libraries:update-icon', (_event, libraryId: unknown, iconId: unknown, update: unknown) => captureIpcResult(() => projectIconStore.updateIcon(libraryId, iconId, update)))
  ipcMain.handle('icon-libraries:delete-icon', (_event, libraryId: unknown, iconId: unknown) => captureIpcResult(() => projectIconStore.deleteIcon(libraryId, iconId)))
  ipcMain.handle('icon-libraries:get-preview-url', (_event, libraryId: unknown, iconId: unknown) => captureIpcResult(async () => {
    await projectIconStore.resolvePreview(libraryId, iconId)
    return `studio-icon://${encodeURIComponent(String(libraryId))}/${encodeURIComponent(String(iconId))}`
  }))
  ipcMain.handle('icon-libraries:copy-to-theme', (_event, themeId: unknown, ref: unknown) => captureIpcResult(() => projectIconStore.copyIconToTheme(themeId, ref)))
  ipcMain.handle('project-icons:get-theme-settings', (_event, themeId: unknown) => captureIpcResult(() => projectIconStore.getThemeSettings(themeId)))
  ipcMain.handle('project-icons:set-enabled-libraries', (_event, themeId: unknown, ids: unknown) => captureIpcResult(() => projectIconStore.setEnabledLibraries(themeId, ids)))
  ipcMain.handle('project-icons:set-weight-override', (_event, themeId: unknown, ref: unknown, enabled: unknown, weight: unknown) => captureIpcResult(() => projectIconStore.setWeightOverride(themeId, ref, enabled, weight)))
  ipcMain.handle('project-icons:assign-project', (_event, themeId: unknown, projectId: unknown, ref: unknown) => captureIpcResult(() => projectIconStore.assignProject(themeId, projectId, ref)))
  ipcMain.handle('project-icons:clear-project-assignment', (_event, themeId: unknown, projectId: unknown) => captureIpcResult(() => projectIconStore.clearProjectAssignment(themeId, projectId)))
  ipcMain.handle('project-icons:list-projects', () => captureIpcResult(() => projectIconStore.listCachedProjects()))
  ipcMain.handle('project-icons:refresh-projects', () => captureIpcResult(async () => projectIconStore.cacheProjects(await codexService.listProjects())))
  ipcMain.handle('assets:commit-video-selection', (_event, themeId: unknown, selectionId: unknown, decisionInput: unknown) => captureIpcResult(async () => {
    if (typeof themeId !== 'string' || typeof selectionId !== 'string') throw new Error('视频选择参数无效。')
    const parsedDecision = videoImportDecisionSchema.safeParse(decisionInput)
    if (!parsedDecision.success) throw new Error('视频导入参数无效。')
    const selection = pendingVideoSelections.begin(themeId, selectionId)
    try {
      assertVideoImportDecisionCompatible(parsedDecision.data, selection.preflight.inspection)
    } catch (error) {
      pendingVideoSelections.restore(selectionId, selection)
      throw error
    }
    const id = randomUUID()
    const controller = new AbortController()
    operationControllers.set(id, controller)
    const settings = parsedDecision.data.mode === 'transcode' ? parsedDecision.data.settings : undefined
    emitProgress({
      id,
      kind: 'media-import',
      phase: settings ? 'optimizing' : 'copying',
      processedBytes: 0,
      totalBytes: null,
      message: settings ? videoTranscodeProgressMessage(selection.preflight.inspection, settings) : localizedMessage('正在导入原视频')
    })
    try {
      const imported = await store.importMediaAsset(
        themeId,
        selection.sourcePath,
        selection.purpose,
        'video',
        controller.signal,
        Boolean(settings),
        selection.preflight,
        settings
      )
      pendingVideoSelections.complete(selectionId, selection)
      emitProgress({ id, kind: 'media-import', phase: 'completed', processedBytes: 0, totalBytes: null, message: localizedMessage('视频导入完成') })
      return imported
    } catch (error) {
      if (controller.signal.aborted) pendingVideoSelections.cancel(selectionId, selection)
      else pendingVideoSelections.restore(selectionId, selection)
      const failure = controller.signal.aborted ? new Error(VIDEO_IMPORT_CANCELLED_MESSAGE) : error
      emitProgress({ id, kind: 'media-import', phase: controller.signal.aborted ? 'cancelled' : 'failed', processedBytes: 0, totalBytes: null, message: localizedMessageFrom(failure, '视频导入失败') })
      throw failure
    } finally {
      operationControllers.delete(id)
    }
  }))
  ipcMain.handle('assets:discard-video-selection', (_event, themeId: unknown, selectionId: unknown) => captureIpcResult(() => {
    if (typeof themeId !== 'string' || typeof selectionId !== 'string') throw new Error('视频选择参数无效。')
    pendingVideoSelections.discard(themeId, selectionId)
  }))
  ipcMain.handle('assets:get-preview-url', (_event, themeId: unknown, asset: unknown) => captureIpcResult(() => store.getMediaPreviewUrl(themeId, asset)))
  ipcMain.handle('assets:inspect-video', (_event, themeId: unknown, asset: unknown) => captureIpcResult(() => store.inspectReferencedVideo(themeId, asset)))
  ipcMain.handle('assets:optimize-video', (_event, themeId: unknown, role: unknown, asset: unknown, settingsInput: unknown) => captureIpcResult(async () => {
    if (!isVideoMediaRole(role)) throw new Error('视频位置无效。')
    const parsedSettings = videoTranscodeSettingsSchema.safeParse(settingsInput)
    if (!parsedSettings.success) throw new Error('视频转换参数无效。')
    const id = randomUUID()
    const controller = new AbortController()
    operationControllers.set(id, controller)
    emitProgress({ id, kind: 'media-import', phase: 'optimizing', processedBytes: 0, totalBytes: null, message: localizedMessage('正在优化当前视频') })
    try {
      const optimized = await store.optimizeReferencedVideo(themeId, role, asset, parsedSettings.data, controller.signal)
      emitProgress({ id, kind: 'media-import', phase: 'completed', processedBytes: 0, totalBytes: null, message: localizedMessage('视频优化完成') })
      return optimized
    } catch (error) {
      emitProgress({ id, kind: 'media-import', phase: controller.signal.aborted ? 'cancelled' : 'failed', processedBytes: 0, totalBytes: null, message: localizedMessageFrom(error, '视频优化失败') })
      throw error
    } finally {
      operationControllers.delete(id)
    }
  }))
  ipcMain.handle('operations:cancel', (_event, id: unknown) => captureIpcResult(() => {
    if (typeof id === 'string') operationControllers.get(id)?.abort()
  }))
  ipcMain.handle('share:export', (_event, profile: unknown, includeIconLibraries: unknown) => captureIpcResult(async () => {
    const name = typeof profile === 'object' && profile !== null && 'name' in profile && typeof profile.name === 'string' ? profile.name : t('主题')
    const safeName = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim().slice(0, 80) || t('主题')
    const result = mainWindow
      ? await dialog.showSaveDialog(mainWindow, { title: t('导出主题'), defaultPath: `${safeName}.cdstheme`, filters: [{ name: 'Codex Dream Theme', extensions: ['cdstheme'] }] })
      : await dialog.showSaveDialog({ title: t('导出主题'), defaultPath: `${safeName}.cdstheme`, filters: [{ name: 'Codex Dream Theme', extensions: ['cdstheme'] }] })
    if (result.canceled || !result.filePath) return null
    const filePath = extname(result.filePath).toLowerCase() === '.cdstheme' ? result.filePath : `${result.filePath}.cdstheme`
    const id = randomUUID()
    emitProgress({ id, kind: 'share-export', phase: 'started', processedBytes: 0, totalBytes: null, message: localizedMessage('正在导出主题') })
    const controller = new AbortController()
    operationControllers.set(id, controller)
    try {
      await themeShareService.exportTheme(profile, filePath, includeIconLibraries, controller.signal)
      emitProgress({ id, kind: 'share-export', phase: 'completed', processedBytes: 0, totalBytes: null, message: localizedMessage('主题导出完成') })
      return { filePath }
    } catch (error) {
      emitProgress({ id, kind: 'share-export', phase: controller.signal.aborted ? 'cancelled' : 'failed', processedBytes: 0, totalBytes: null, message: localizedMessageFrom(error, '主题导出失败') })
      throw error
    } finally {
      operationControllers.delete(id)
    }
  }))
  ipcMain.handle('share:import', () => captureIpcResult(async () => {
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, { title: t('导入主题'), properties: ['openFile'], filters: [{ name: 'Codex Dream Theme', extensions: ['cdstheme'] }] })
      : await dialog.showOpenDialog({ title: t('导入主题'), properties: ['openFile'], filters: [{ name: 'Codex Dream Theme', extensions: ['cdstheme'] }] })
    if (result.canceled || !result.filePaths[0]) return null
    const id = randomUUID()
    emitProgress({ id, kind: 'share-import', phase: 'started', processedBytes: 0, totalBytes: null, message: localizedMessage('正在导入主题') })
    const controller = new AbortController()
    operationControllers.set(id, controller)
    try {
      const profile = await themeShareService.importTheme(result.filePaths[0], controller.signal)
      emitProgress({ id, kind: 'share-import', phase: 'completed', processedBytes: 0, totalBytes: null, message: localizedMessage('主题导入完成') })
      return profile
    } catch (error) {
      emitProgress({ id, kind: 'share-import', phase: controller.signal.aborted ? 'cancelled' : 'failed', processedBytes: 0, totalBytes: null, message: localizedMessageFrom(error, '主题导入失败') })
      throw error
    } finally {
      operationControllers.delete(id)
    }
  }))
  ipcMain.handle('share:import-path', (_event, path: unknown) => captureIpcResult(async () => {
    const id = randomUUID()
    emitProgress({ id, kind: 'share-import', phase: 'started', processedBytes: 0, totalBytes: null, message: localizedMessage('正在导入主题') })
    const controller = new AbortController()
    operationControllers.set(id, controller)
    try {
      const profile = await themeShareService.importTheme(path, controller.signal)
      emitProgress({ id, kind: 'share-import', phase: 'completed', processedBytes: 0, totalBytes: null, message: localizedMessage('主题导入完成') })
      return profile
    } catch (error) {
      emitProgress({ id, kind: 'share-import', phase: controller.signal.aborted ? 'cancelled' : 'failed', processedBytes: 0, totalBytes: null, message: localizedMessageFrom(error, '主题导入失败') })
      throw error
    } finally {
      operationControllers.delete(id)
    }
  }))
  ipcMain.handle('codex:detect', () => captureIpcResult(() => codexService.detect()))
  ipcMain.handle('codex:install-theme', (_event, themeId: string) =>
    captureIpcResult(() => codexService.installTheme(themeId)))
  ipcMain.handle('codex:start', (_event, themeId: string, restartExisting: boolean) =>
    captureIpcResult(() => codexService.start(themeId, restartExisting === true)))
  ipcMain.handle('codex:verify', () => captureIpcResult(() => codexService.verify()))
  ipcMain.handle('codex:reinject', (_event, themeId: string) =>
    captureIpcResult(() => codexService.reinject(themeId)))
  ipcMain.handle('codex:stop', () => captureIpcResult(() => codexService.stop()))
  ipcMain.handle('codex:restore', (_event, restartCodex: boolean) =>
    captureIpcResult(() => codexService.restore(restartCodex === true)))
  ipcMain.handle('runtime:get-status', () => codexService.getStatus())
}

function createWindow(): void {
  const windowOptions: BrowserWindowConstructorOptions = {
    width: 1480,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    icon: appIconPath || undefined,
    backgroundColor: '#eef4f5',
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 13 } }
      : {
          titleBarStyle: 'hidden',
          titleBarOverlay: {
            color: '#eef4f5',
            symbolColor: '#17414a',
            height: 42
          }
        }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  }
  mainWindow = new BrowserWindow(windowOptions)

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('close', (event) => {
    if (codexService.isActive() && !quitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../../dist/index.html'))
  }
}

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, _argv, _workingDirectory, additionalData) => {
    const action = resolveStudioInstanceAction(appVersion, app.isPackaged, additionalData, updatedVersionRelaunching)
    if (action === 'relaunch') relaunchForUpdatedVersion()
    else if (action === 'show') showWindow()
  })

  app.whenReady().then(async () => {
    if (!isSupportedDesktopPlatform(process.platform)) throw new Error('Codex Dream Skin Studio 仅支持 Windows 和 macOS。')
    const sharedResourcesRoot = app.isPackaged ? join(process.resourcesPath, 'shared') : join(app.getAppPath(), 'resources', 'shared')
    const platformResourcesRoot = app.isPackaged
      ? join(process.resourcesPath, process.platform === 'win32' ? 'windows' : 'macos')
      : join(app.getAppPath(), 'resources', process.platform === 'win32' ? 'windows' : 'macos')
    appIconPath = join(platformResourcesRoot, process.platform === 'win32' ? 'codex-dream-skin.ico' : 'codex-dream-skin-trayTemplate.png')
    const customIcon = nativeImage.createFromPath(appIconPath)
    trayIcon = customIcon.isEmpty()
      ? await app.getFileIcon(process.execPath, { size: 'small' }).catch(() => null)
      : customIcon.resize({ width: 16, height: 16 })
    if (process.platform === 'darwin') trayIcon?.setTemplateImage(true)
    if (process.platform === 'win32') app.setAppUserModelId('com.codexdreamskin.studio')
    const studioRoot = process.platform === 'win32'
      ? join(process.env.LOCALAPPDATA ?? app.getPath('appData'), 'CodexDreamSkinStudio')
      : join(app.getPath('appData'), 'CodexDreamSkinStudio')
    store = new ProfileStore(studioRoot, {
      hero: join(sharedResourcesRoot, 'dream-reference.png'),
      polaroid: join(sharedResourcesRoot, 'dream-polaroid.png'),
      conversationBubbles: Object.fromEntries(CONVERSATION_BUBBLE_PRESETS.map((preset) => [preset.id, join(sharedResourcesRoot, 'conversation-bubbles', preset.fileName)])) as Record<(typeof CONVERSATION_BUBBLE_PRESETS)[number]['id'], string>,
      resourcesRoot: sharedResourcesRoot
    })
    await store.initialize()
    projectIconStore = new ProjectIconStore(studioRoot, store)
    await projectIconStore.initialize()
    themeShareService = new ThemeShareService(store, projectIconStore)
    setActiveLocale(await store.getLocale())
    studioMediaProtocol = new StudioMediaProtocol((themeId, asset) => store.resolveReferencedMedia(themeId, asset))
    iconMediaProtocol = new StudioMediaProtocol((libraryId, iconId) => projectIconStore.resolvePreview(libraryId, iconId))
    protocol.handle('studio-media', async (request) => studioMediaProtocol.handleRequest(request))
    protocol.handle('studio-icon', async (request) => iconMediaProtocol.handleRequest(request))
    const platformDriver = process.platform === 'win32'
      ? new WindowsCodexDriver(store.root, platformResourcesRoot)
      : new MacCodexDriver(store.root, app.getPath('home'))
    codexService = new CodexService(store, sharedResourcesRoot, platformDriver, appVersion, (status) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send('runtime:status', status)
      try { updateTray() } catch (error) { console.error('Failed to update tray:', error) }
    }, projectIconStore)
    appUpdateService = new AppUpdateService(
      new ElectronAppUpdateDriver(autoUpdater, () => { quitting = true }),
      app.getVersion(),
      isAppUpdateEnabled(process.platform, app.isPackaged, process.execPath),
      (status) => {
        for (const window of BrowserWindow.getAllWindows()) window.webContents.send('app:update-status', status)
      }
    )
    registerIpc()
    configureApplicationMenu()
    createWindow()
    appUpdateService.start()
    void codexService.resume()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
      else showWindow()
    })
  })
}

async function importIconLibraryPackage(path: unknown): Promise<Awaited<ReturnType<ProjectIconStore['importLibraryPackage']>>> {
  const operationId = randomUUID()
  const controller = new AbortController()
  operationControllers.set(operationId, controller)
  emitProgress({ id: operationId, kind: 'icon-library-import', phase: 'started', processedBytes: 0, totalBytes: null, message: localizedMessage('正在导入素材库') })
  try {
    const library = await projectIconStore.importLibraryPackage(path, controller.signal)
    emitProgress({ id: operationId, kind: 'icon-library-import', phase: 'completed', processedBytes: 0, totalBytes: null, message: localizedMessage('素材库导入完成') })
    return library
  } catch (error) {
    emitProgress({ id: operationId, kind: 'icon-library-import', phase: controller.signal.aborted ? 'cancelled' : 'failed', processedBytes: 0, totalBytes: null, message: localizedMessageFrom(error, '素材库导入失败') })
    throw error
  } finally {
    operationControllers.delete(operationId)
  }
}

function emitProgress(progress: OperationProgress): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send('operations:progress', progress)
}

function videoTranscodeProgressMessage(inspection: VideoAssetInspection, settings: VideoTranscodeSettings): LocalizedMessage {
  const output = resolveVideoOutputSize(inspection, settings)
  const bitRate = settings.videoBitRate === null ? localizedMessage('自动码率') : `${formatMbps(settings.videoBitRate)} Mbps`
  return localizedMessage('正在生成 {width}×{height} / {frameRate} FPS / {bitRate} 视频', {
    width: output.width,
    height: output.height,
    frameRate: formatFrameRate(settings.frameRate),
    bitRate
  })
}

function formatMbps(value: number): string {
  return (value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)
}

function formatFrameRate(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function isVideoMediaRole(value: unknown): value is VideoMediaRole {
  return value === 'hero' || value === 'polaroid' || value === 'conversationBackground' || value === 'windowBackground'
}

app.on('window-all-closed', () => { if (!codexService?.isActive()) app.quit() })
app.on('before-quit', () => { quitting = true; appUpdateService?.stop() })
