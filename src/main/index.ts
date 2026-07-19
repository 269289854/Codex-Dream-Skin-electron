import { app, BrowserWindow, dialog, ipcMain, shell, Menu, Tray, nativeImage, type NativeImage, type OpenDialogOptions } from 'electron'
import { join } from 'node:path'
import { ProfileStore } from './profile-store'
import { CodexService } from './codex-service'
import { captureIpcResult } from '../shared/ipc-result'

let mainWindow: BrowserWindow | null = null
let store: ProfileStore
let codexService: CodexService
let tray: Tray | null = null
let trayIcon: NativeImage | null = null
let appIconPath = ''
let quitting = false
const hasSingleInstanceLock = app.requestSingleInstanceLock()

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
  ipcMain.handle('themes:create', (_event, name: string) => store.create(name))
  ipcMain.handle('themes:duplicate', (_event, profile: unknown, name: unknown) => store.duplicate(profile, name))
  ipcMain.handle('themes:update', (_event, profile: unknown) => store.update(profile))
  ipcMain.handle('themes:delete', (_event, id: string) => store.delete(id))
  ipcMain.handle('themes:activate', (_event, id: string) => store.activate(id))
  ipcMain.handle('themes:compile', (_event, id: string) => store.compile(id))
  ipcMain.handle('assets:select', async (_event, themeId: string, purpose: 'hero' | 'polaroid' | 'icon' | 'font') => {
    const options: OpenDialogOptions = {
      title: purpose === 'font' ? '选择字体' : purpose === 'icon' ? '选择图标' : '选择主题图片',
      properties: ['openFile'],
      filters: purpose === 'font'
        ? [{ name: 'Fonts', extensions: ['ttf', 'otf', 'woff', 'woff2'] }]
        : [{ name: 'Images', extensions: ['png', 'webp', 'jpg', 'jpeg', 'svg'] }]
    }
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    if (purpose === 'font') return store.importFontAsset(themeId, result.filePaths[0])
    return store.importAsset(themeId, result.filePaths[0], purpose)
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
    store = new ProfileStore(join(localAppData, 'CodexDreamSkinStudio'), join(resourcesRoot, 'dream-reference.png'))
    await store.initialize()
    codexService = new CodexService(store, resourcesRoot, (status) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send('runtime:status', status)
      try { updateTray() } catch (error) { console.error('Failed to update tray:', error) }
    }, (update) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send('themes:polaroid-placement', update)
    })
    registerIpc()
    createWindow()
    void codexService.resume()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => { if (!codexService?.isActive()) app.quit() })
app.on('before-quit', () => { quitting = true })
