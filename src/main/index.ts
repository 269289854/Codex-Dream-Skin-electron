import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron'
import { join } from 'node:path'
import { ProfileStore } from './profile-store'

let mainWindow: BrowserWindow | null = null
let store: ProfileStore

function registerIpc(): void {
  ipcMain.handle('app:get-info', () => ({ version: app.getVersion(), platform: process.platform }))
  ipcMain.handle('themes:list', () => store.list())
  ipcMain.handle('themes:get', (_event, id: string) => store.get(id))
  ipcMain.handle('themes:create', (_event, name: string) => store.create(name))
  ipcMain.handle('themes:duplicate', (_event, id: string, name: string) => store.duplicate(id, name))
  ipcMain.handle('themes:update', (_event, profile: unknown) => store.update(profile))
  ipcMain.handle('themes:delete', (_event, id: string) => store.delete(id))
  ipcMain.handle('themes:activate', (_event, id: string) => store.activate(id))
  ipcMain.handle('themes:compile', (_event, id: string) => store.compile(id))
  ipcMain.handle('assets:select', async (_event, themeId: string, purpose: 'hero' | 'polaroid' | 'icon') => {
    const options: OpenDialogOptions = {
      title: purpose === 'icon' ? '选择图标' : '选择主题图片',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'webp', 'jpg', 'jpeg', 'svg'] }]
    }
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    return store.importAsset(themeId, result.filePaths[0], purpose)
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    backgroundColor: '#eef4f5',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#eef4f5',
      symbolColor: '#17414a',
      height: 42
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
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

app.whenReady().then(async () => {
  if (process.platform !== 'win32') throw new Error('Codex Dream Skin Studio only supports Windows.')
  const localAppData = process.env.LOCALAPPDATA ?? app.getPath('userData')
  store = new ProfileStore(join(localAppData, 'CodexDreamSkinStudio'))
  await store.initialize()
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => app.quit())
