import { app, BrowserWindow, dialog, ipcMain, shell, Menu, Tray, nativeImage, protocol, type NativeImage, type OpenDialogOptions } from 'electron'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { randomUUID } from 'node:crypto'
import { extname, join } from 'node:path'
import { ProfileStore } from './profile-store'
import { CodexService } from './codex-service'
import { captureIpcResult } from '../shared/ipc-result'
import type { AssetPurpose, MediaSelectionKind } from '../shared/contracts'

let mainWindow: BrowserWindow | null = null
let store: ProfileStore
let codexService: CodexService
let tray: Tray | null = null
let trayIcon: NativeImage | null = null
let appIconPath = ''
let quitting = false
const operationControllers = new Map<string, AbortController>()
const hasSingleInstanceLock = app.requestSingleInstanceLock()
protocol.registerSchemesAsPrivileged([{ scheme: 'studio-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])

function showWindow(): void {
  mainWindow?.show()
  mainWindow?.focus()
}

function updateTray(): void {
  if (codexService.isActive() && !tray && trayIcon) {
    tray = new Tray(trayIcon)
    tray.setToolTip('Codex Dream Skin Studio')
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '显示主题工作台', click: showWindow },
      { label: '验证当前主题', click: () => void codexService.verify().catch(() => showWindow()) },
      { type: 'separator' },
      { label: '恢复 Codex 并退出', click: () => void codexService.restore(true).finally(() => { quitting = true; app.quit() }) }
    ]))
    tray.on('double-click', showWindow)
  } else if (!codexService.isActive() && tray) {
    tray.destroy()
    tray = null
  }
}

function registerIpc(): void {
  ipcMain.handle('app:get-info', () => ({ version: app.getVersion(), platform: process.platform }))
  ipcMain.handle('themes:list', () => store.list())
  ipcMain.handle('themes:get', (_event, id: string) => store.get(id))
  ipcMain.handle('themes:create', (_event, input: unknown) => store.create(input))
  ipcMain.handle('themes:get-default', (_event, id: string) => store.getDefault(id))
  ipcMain.handle('themes:duplicate', (_event, profile: unknown, name: unknown) => store.duplicate(profile, name))
  ipcMain.handle('themes:update', (_event, profile: unknown) => store.update(profile))
  ipcMain.handle('themes:delete', (_event, id: string) => store.delete(id))
  ipcMain.handle('themes:activate', (_event, id: string) => store.activate(id))
  ipcMain.handle('themes:compile', (_event, id: string) => store.compile(id))
  ipcMain.handle('assets:select', async (_event, themeId: unknown, purpose: unknown) => {
    if (typeof themeId !== 'string') throw new Error('主题 ID 无效。')
    if (purpose !== 'hero' && purpose !== 'polaroid' && purpose !== 'conversationBackground' && purpose !== 'icon' && purpose !== 'font') throw new Error('素材用途无效。')
    const safePurpose = purpose as AssetPurpose
    const options: OpenDialogOptions = {
      title: safePurpose === 'font' ? '选择字体' : safePurpose === 'icon' ? '选择图标' : '选择主题图片',
      properties: ['openFile'],
      filters: safePurpose === 'font'
        ? [{ name: 'Fonts', extensions: ['ttf', 'otf', 'woff', 'woff2'] }]
        : [{ name: 'Images', extensions: ['png', 'webp', 'jpg', 'jpeg', 'svg'] }]
    }
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    if (safePurpose === 'font') return store.importFontAsset(themeId, result.filePaths[0])
    return store.importAsset(themeId, result.filePaths[0], safePurpose)
  })
  ipcMain.handle('assets:select-media', async (_event, themeId: unknown, purpose: unknown, requestedKind: unknown) => {
    if (typeof themeId !== 'string') throw new Error('主题 ID 无效。')
    if (purpose !== 'hero' && purpose !== 'polaroid' && purpose !== 'conversationBackground') throw new Error('媒体用途无效。')
    if (requestedKind !== undefined && requestedKind !== 'image' && requestedKind !== 'gif' && requestedKind !== 'video') throw new Error('媒体类型无效。')
    const kind = requestedKind as MediaSelectionKind | undefined
    const filters = kind === 'image'
      ? [{ name: 'Images', extensions: ['png', 'webp', 'jpg', 'jpeg', 'svg'] }]
      : kind === 'gif'
        ? [{ name: 'GIF', extensions: ['gif'] }]
        : kind === 'video'
          ? [{ name: 'Video', extensions: ['mp4', 'webm'] }]
          : [{ name: 'Images and Video', extensions: ['png', 'webp', 'jpg', 'jpeg', 'gif', 'svg', 'mp4', 'webm'] }]
    const options: OpenDialogOptions = {
      title: purpose === 'hero' ? '选择主视觉媒体' : purpose === 'polaroid' ? '选择拍立得媒体' : '选择对话区域背景',
      properties: ['openFile'],
      filters
    }
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    const id = randomUUID()
    const controller = new AbortController()
    operationControllers.set(id, controller)
    emitProgress({ id, kind: 'media-import', phase: 'started', processedBytes: 0, totalBytes: null, message: '正在导入媒体' })
    try {
      const imported = await store.importMediaAsset(themeId, result.filePaths[0], purpose, kind, controller.signal)
      emitProgress({ id, kind: 'media-import', phase: 'completed', processedBytes: 0, totalBytes: null, message: '媒体导入完成' })
      return imported
    } catch (error) {
      emitProgress({ id, kind: 'media-import', phase: controller.signal.aborted ? 'cancelled' : 'failed', processedBytes: 0, totalBytes: null, message: error instanceof Error ? error.message : '媒体导入失败' })
      throw error
    } finally {
      operationControllers.delete(id)
    }
  })
  ipcMain.handle('assets:get-preview-url', (_event, themeId: unknown, asset: unknown) => store.getMediaPreviewUrl(themeId, asset))
  ipcMain.handle('operations:cancel', (_event, id: unknown) => {
    if (typeof id === 'string') operationControllers.get(id)?.abort()
  })
  ipcMain.handle('share:export', async (_event, profile: unknown) => {
    const name = typeof profile === 'object' && profile !== null && 'name' in profile && typeof profile.name === 'string' ? profile.name : '主题'
    const safeName = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim().slice(0, 80) || '主题'
    const result = mainWindow
      ? await dialog.showSaveDialog(mainWindow, { title: '导出主题', defaultPath: `${safeName}.cdstheme`, filters: [{ name: 'Codex Dream Theme', extensions: ['cdstheme'] }] })
      : await dialog.showSaveDialog({ title: '导出主题', defaultPath: `${safeName}.cdstheme`, filters: [{ name: 'Codex Dream Theme', extensions: ['cdstheme'] }] })
    if (result.canceled || !result.filePath) return null
    const filePath = extname(result.filePath).toLowerCase() === '.cdstheme' ? result.filePath : `${result.filePath}.cdstheme`
    const id = randomUUID()
    emitProgress({ id, kind: 'share-export', phase: 'started', processedBytes: 0, totalBytes: null, message: '正在导出主题' })
    const controller = new AbortController()
    operationControllers.set(id, controller)
    try {
      await store.exportSharePackage(profile, filePath, controller.signal)
      emitProgress({ id, kind: 'share-export', phase: 'completed', processedBytes: 0, totalBytes: null, message: '主题导出完成' })
      return { filePath }
    } catch (error) {
      emitProgress({ id, kind: 'share-export', phase: controller.signal.aborted ? 'cancelled' : 'failed', processedBytes: 0, totalBytes: null, message: error instanceof Error ? error.message : '主题导出失败' })
      throw error
    } finally {
      operationControllers.delete(id)
    }
  })
  ipcMain.handle('share:import', async () => {
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, { title: '导入主题', properties: ['openFile'], filters: [{ name: 'Codex Dream Theme', extensions: ['cdstheme'] }] })
      : await dialog.showOpenDialog({ title: '导入主题', properties: ['openFile'], filters: [{ name: 'Codex Dream Theme', extensions: ['cdstheme'] }] })
    if (result.canceled || !result.filePaths[0]) return null
    const id = randomUUID()
    emitProgress({ id, kind: 'share-import', phase: 'started', processedBytes: 0, totalBytes: null, message: '正在导入主题' })
    const controller = new AbortController()
    operationControllers.set(id, controller)
    try {
      const profile = await store.importSharePackage(result.filePaths[0], controller.signal)
      emitProgress({ id, kind: 'share-import', phase: 'completed', processedBytes: 0, totalBytes: null, message: '主题导入完成' })
      return profile
    } catch (error) {
      emitProgress({ id, kind: 'share-import', phase: controller.signal.aborted ? 'cancelled' : 'failed', processedBytes: 0, totalBytes: null, message: error instanceof Error ? error.message : '主题导入失败' })
      throw error
    } finally {
      operationControllers.delete(id)
    }
  })
  ipcMain.handle('share:import-path', async (_event, path: unknown) => {
    const id = randomUUID()
    emitProgress({ id, kind: 'share-import', phase: 'started', processedBytes: 0, totalBytes: null, message: '正在导入主题' })
    const controller = new AbortController()
    operationControllers.set(id, controller)
    try {
      const profile = await store.importSharePackage(path, controller.signal)
      emitProgress({ id, kind: 'share-import', phase: 'completed', processedBytes: 0, totalBytes: null, message: '主题导入完成' })
      return profile
    } catch (error) {
      emitProgress({ id, kind: 'share-import', phase: controller.signal.aborted ? 'cancelled' : 'failed', processedBytes: 0, totalBytes: null, message: error instanceof Error ? error.message : '主题导入失败' })
      throw error
    } finally {
      operationControllers.delete(id)
    }
  })
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
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    icon: appIconPath || undefined,
    backgroundColor: '#eef4f5',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#eef4f5',
      symbolColor: '#17414a',
      height: 42
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

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
  app.on('second-instance', () => showWindow())

  app.whenReady().then(async () => {
    if (process.platform !== 'win32') throw new Error('Codex Dream Skin Studio only supports Windows.')
    const localAppData = process.env.LOCALAPPDATA ?? app.getPath('userData')
    const resourcesRoot = app.isPackaged ? join(process.resourcesPath, 'windows') : join(app.getAppPath(), 'resources', 'windows')
    appIconPath = join(resourcesRoot, 'codex-dream-skin.ico')
    const customIcon = nativeImage.createFromPath(appIconPath)
    trayIcon = customIcon.isEmpty()
      ? await app.getFileIcon(process.execPath, { size: 'small' }).catch(() => null)
      : customIcon.resize({ width: 16, height: 16 })
    app.setAppUserModelId('com.codexdreamskin.studio')
    store = new ProfileStore(join(localAppData, 'CodexDreamSkinStudio'), {
      hero: join(resourcesRoot, 'dream-reference.png'),
      polaroid: join(resourcesRoot, 'dream-polaroid.png')
    })
    await store.initialize()
    protocol.handle('studio-media', async (request) => handleStudioMediaRequest(request))
    codexService = new CodexService(store, resourcesRoot, (status) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send('runtime:status', status)
      try { updateTray() } catch (error) { console.error('Failed to update tray:', error) }
    })
    registerIpc()
    createWindow()
    void codexService.resume()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

function emitProgress(progress: { id: string; kind: 'media-import' | 'theme-copy' | 'share-export' | 'share-import'; phase: 'started' | 'copying' | 'validating' | 'writing' | 'completed' | 'failed' | 'cancelled'; processedBytes: number; totalBytes: number | null; message: string }): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send('operations:progress', progress)
}

async function handleStudioMediaRequest(request: Request): Promise<Response> {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 })
    const url = new URL(request.url)
    const themeId = decodeURIComponent(url.hostname)
    const asset = url.pathname.replace(/^\//, '').split('/').map((part) => decodeURIComponent(part)).join('/')
    const resolved = await store.resolveReferencedMedia(themeId, asset)
    const range = request.headers.get('range') ?? url.searchParams.get('range')
    const fileStat = await stat(resolved.path)
    let start = 0
    let end = fileStat.size - 1
    let status = 200
    const headers = new Headers({ 'Content-Type': resolved.mimeType, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' })
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (!match) return new Response('Invalid range', { status: 416 })
      if (match[1]) start = Number(match[1])
      if (match[2]) end = Number(match[2])
      if (!match[1] && match[2]) { const length = Number(match[2]); start = Math.max(0, fileStat.size - length); end = fileStat.size - 1 }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= fileStat.size) return new Response('Range not satisfiable', { status: 416 })
      end = Math.min(end, fileStat.size - 1)
      status = 206
      headers.set('Content-Range', `bytes ${start}-${end}/${fileStat.size}`)
    }
    headers.set('Content-Length', String(end - start + 1))
    if (request.method === 'HEAD') return new Response(null, { status, headers })
    const stream = createReadStream(resolved.path, { start, end })
    return new Response(Readable.toWeb(stream) as ReadableStream, { status, headers })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}

app.on('window-all-closed', () => { if (!codexService?.isActive()) app.quit() })
app.on('before-quit', () => { quitting = true })
