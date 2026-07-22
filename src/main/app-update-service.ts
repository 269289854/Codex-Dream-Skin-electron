import type { AppUpdater, ProgressInfo, UpdateInfo } from 'electron-updater'
import { basename, dirname } from 'node:path'
import type { AppUpdateStatus } from '../shared/contracts'

export const APP_UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

export function isAppUpdateEnabled(isPackaged: boolean, executablePath: string): boolean {
  if (!isPackaged) return false
  return !basename(dirname(executablePath)).toLowerCase().endsWith('-unpacked')
}

interface AppUpdateDriverHandlers {
  checking: () => void
  available: (version: string) => void
  notAvailable: () => void
  progress: (percent: number) => void
  downloaded: (version: string) => void
  error: (error: Error) => void
}

export interface AppUpdateDriver {
  start: (handlers: AppUpdateDriverHandlers) => () => void
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  installUpdate: () => void
}

export class ElectronAppUpdateDriver implements AppUpdateDriver {
  constructor(
    private readonly updater: AppUpdater,
    private readonly onBeforeInstall: () => void = () => undefined
  ) {}

  start(handlers: AppUpdateDriverHandlers): () => void {
    this.updater.autoDownload = false
    this.updater.autoInstallOnAppQuit = true
    this.updater.autoRunAppAfterInstall = true
    this.updater.allowPrerelease = false
    this.updater.allowDowngrade = false
    this.updater.fullChangelog = false
    this.updater.disableWebInstaller = true

    const onChecking = (): void => handlers.checking()
    const onAvailable = (info: UpdateInfo): void => handlers.available(info.version)
    const onNotAvailable = (): void => handlers.notAvailable()
    const onProgress = (info: ProgressInfo): void => handlers.progress(info.percent)
    const onDownloaded = (info: UpdateInfo): void => handlers.downloaded(info.version)
    const onError = (error: Error): void => handlers.error(error)

    this.updater.on('checking-for-update', onChecking)
    this.updater.on('update-available', onAvailable)
    this.updater.on('update-not-available', onNotAvailable)
    this.updater.on('download-progress', onProgress)
    this.updater.on('update-downloaded', onDownloaded)
    this.updater.on('error', onError)

    return () => {
      this.updater.removeListener('checking-for-update', onChecking)
      this.updater.removeListener('update-available', onAvailable)
      this.updater.removeListener('update-not-available', onNotAvailable)
      this.updater.removeListener('download-progress', onProgress)
      this.updater.removeListener('update-downloaded', onDownloaded)
      this.updater.removeListener('error', onError)
    }
  }

  async checkForUpdates(): Promise<void> { await this.updater.checkForUpdates() }
  async downloadUpdate(): Promise<void> { await this.updater.downloadUpdate() }
  installUpdate(): void {
    this.onBeforeInstall()
    this.updater.quitAndInstall(false, true)
  }
}

export class AppUpdateService {
  private status: AppUpdateStatus
  private timer: NodeJS.Timeout | null = null
  private unsubscribeDriver: (() => void) | null = null
  private started = false
  private checkingBusy = false
  private downloadBusy = false
  private reportCheckErrors = false
  private checkErrorHandled = false

  constructor(
    private readonly driver: AppUpdateDriver,
    currentVersion: string,
    private readonly enabled: boolean,
    private readonly onStatus: (status: AppUpdateStatus) => void,
    private readonly checkIntervalMs = APP_UPDATE_CHECK_INTERVAL_MS
  ) {
    this.status = {
      phase: enabled ? 'idle' : 'disabled',
      currentVersion,
      availableVersion: null,
      downloadPercent: null,
      error: null
    }
  }

  getStatus(): AppUpdateStatus { return { ...this.status } }

  start(): void {
    if (!this.enabled || this.started) return
    this.started = true
    this.unsubscribeDriver = this.driver.start({
      checking: () => this.patch({ phase: 'checking', error: null }),
      available: (version) => this.patch({ phase: 'available', availableVersion: version, downloadPercent: null, error: null }),
      notAvailable: () => this.patch({ phase: 'up-to-date', availableVersion: null, downloadPercent: null, error: null }),
      progress: (percent) => this.patch({ phase: 'downloading', downloadPercent: clampPercent(percent), error: null }),
      downloaded: (version) => this.patch({ phase: 'downloaded', availableVersion: version, downloadPercent: 100, error: null }),
      error: () => this.handleDriverError()
    })
    this.timer = setInterval(() => { void this.performCheck(false) }, this.checkIntervalMs)
    this.timer.unref()
    void this.performCheck(false)
  }

  stop(): void {
    this.started = false
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.unsubscribeDriver?.()
    this.unsubscribeDriver = null
  }

  async downloadUpdate(): Promise<AppUpdateStatus> {
    if (!this.enabled) throw new Error('自动更新仅在已安装的正式版本中可用。')
    if (!this.status.availableVersion) throw new Error('当前没有可下载的新版本。')
    if (this.status.phase === 'downloaded') return this.getStatus()
    if (this.downloadBusy || this.status.phase === 'downloading') throw new Error('更新正在下载中。')

    this.downloadBusy = true
    this.patch({ phase: 'downloading', downloadPercent: 0, error: null })
    try {
      await this.driver.downloadUpdate()
      return this.getStatus()
    } catch {
      this.patch({ phase: 'error', downloadPercent: null, error: '更新下载失败，请重试。' })
      throw new Error('更新下载失败，请重试。')
    } finally {
      this.downloadBusy = false
    }
  }

  async checkForUpdates(): Promise<AppUpdateStatus> {
    if (!this.enabled) throw new Error('仅正式安装版支持检查更新。')
    return this.performCheck(true)
  }

  installUpdate(): void {
    if (!this.enabled) throw new Error('自动更新仅在已安装的正式版本中可用。')
    if (this.status.phase !== 'downloaded') throw new Error('更新尚未下载完成。')
    this.driver.installUpdate()
  }

  private async performCheck(reportErrors: boolean): Promise<AppUpdateStatus> {
    if (!this.started) throw new Error('更新服务尚未启动。')
    if (this.checkingBusy || this.downloadBusy || this.status.phase === 'downloading' || this.status.phase === 'downloaded') return this.getStatus()
    this.checkingBusy = true
    this.reportCheckErrors = reportErrors
    this.checkErrorHandled = false
    this.patch({ phase: 'checking', error: null })
    try {
      await this.driver.checkForUpdates()
      return this.getStatus()
    } catch {
      if (!this.checkErrorHandled) this.handleCheckError(reportErrors)
      if (reportErrors) throw new Error('检查更新失败，请稍后重试。')
      return this.getStatus()
    } finally {
      this.checkingBusy = false
      this.reportCheckErrors = false
      this.checkErrorHandled = false
    }
  }

  private handleDriverError(): void {
    if (this.downloadBusy || this.status.phase === 'downloading') {
      this.patch({ phase: 'error', downloadPercent: null, error: '更新下载失败，请重试。' })
      return
    }
    this.checkErrorHandled = true
    this.handleCheckError(this.reportCheckErrors)
  }

  private handleCheckError(reportError: boolean): void {
    if (this.status.availableVersion) {
      this.patch({ phase: 'available', error: null })
      return
    }
    this.patch({
      phase: reportError ? 'error' : 'idle',
      downloadPercent: null,
      error: reportError ? '检查更新失败，请稍后重试。' : null
    })
  }

  private patch(next: Partial<AppUpdateStatus>): void {
    this.status = { ...this.status, ...next }
    this.onStatus(this.getStatus())
  }
}

function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0
  return Math.min(100, Math.max(0, percent))
}
