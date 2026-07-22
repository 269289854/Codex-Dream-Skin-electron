import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  APP_UPDATE_CHECK_INTERVAL_MS,
  AppUpdateService,
  isAppUpdateEnabled,
  type AppUpdateDriver
} from '../src/main/app-update-service'
import type { AppUpdateStatus } from '../src/shared/contracts'

type DriverHandlers = Parameters<AppUpdateDriver['start']>[0]

class FakeUpdateDriver implements AppUpdateDriver {
  handlers: DriverHandlers | null = null
  readonly unsubscribe = vi.fn()
  readonly start = vi.fn((handlers: DriverHandlers) => {
    this.handlers = handlers
    return this.unsubscribe
  })
  readonly checkForUpdates = vi.fn<() => Promise<void>>(async () => undefined)
  readonly downloadUpdate = vi.fn<() => Promise<void>>(async () => undefined)
  readonly installUpdate = vi.fn()
}

describe('AppUpdateService', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('stays disabled outside packaged builds', async () => {
    const driver = new FakeUpdateDriver()
    const onStatus = vi.fn()
    const service = new AppUpdateService(driver, '1.0.3', false, onStatus)

    service.start()

    expect(service.getStatus()).toEqual({ phase: 'disabled', currentVersion: '1.0.3', availableVersion: null, downloadPercent: null, error: null })
    expect(driver.start).not.toHaveBeenCalled()
    expect(driver.checkForUpdates).not.toHaveBeenCalled()
    expect(onStatus).not.toHaveBeenCalled()
    await expect(service.checkForUpdates()).rejects.toThrow('仅正式安装版支持检查更新。')
  })

  it('disables updates for electron-builder unpacked output', () => {
    expect(isAppUpdateEnabled(false, 'D:\\repo\\electron.exe')).toBe(false)
    expect(isAppUpdateEnabled(true, 'D:\\repo\\release\\win-unpacked\\Codex Dream Skin Studio.exe')).toBe(false)
    expect(isAppUpdateEnabled(true, 'C:\\Program Files\\Codex Dream Skin Studio\\Codex Dream Skin Studio.exe')).toBe(true)
  })

  it('checks on startup and every six hours without overlapping requests', async () => {
    const driver = new FakeUpdateDriver()
    let finishCheck: () => void = () => { throw new Error('Check has not started.') }
    driver.checkForUpdates.mockImplementation(() => new Promise<void>((resolve) => { finishCheck = resolve }))
    const service = new AppUpdateService(driver, '1.0.3', true, vi.fn())

    service.start()
    expect(driver.checkForUpdates).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(APP_UPDATE_CHECK_INTERVAL_MS)
    expect(driver.checkForUpdates).toHaveBeenCalledTimes(1)

    finishCheck()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(APP_UPDATE_CHECK_INTERVAL_MS)
    expect(driver.checkForUpdates).toHaveBeenCalledTimes(2)

    service.stop()
    expect(driver.unsubscribe).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(APP_UPDATE_CHECK_INTERVAL_MS)
    expect(driver.checkForUpdates).toHaveBeenCalledTimes(2)
  })

  it('reports that the installed version is current after a manual check', async () => {
    const driver = new FakeUpdateDriver()
    driver.checkForUpdates.mockImplementation(async () => { driver.handlers?.notAvailable() })
    const service = new AppUpdateService(driver, '1.0.3', true, vi.fn())
    service.start()
    await Promise.resolve()

    const status = await service.checkForUpdates()

    expect(driver.checkForUpdates).toHaveBeenCalledTimes(2)
    expect(status).toEqual({ phase: 'up-to-date', currentVersion: '1.0.3', availableVersion: null, downloadPercent: null, error: null })
    service.stop()
  })

  it('returns the available version after a manual check', async () => {
    const driver = new FakeUpdateDriver()
    driver.checkForUpdates
      .mockImplementationOnce(async () => { driver.handlers?.notAvailable() })
      .mockImplementationOnce(async () => { driver.handlers?.available('1.1.0') })
    const service = new AppUpdateService(driver, '1.0.3', true, vi.fn())
    service.start()
    await Promise.resolve()

    const status = await service.checkForUpdates()

    expect(status).toEqual({ phase: 'available', currentVersion: '1.0.3', availableVersion: '1.1.0', downloadPercent: null, error: null })
    service.stop()
  })

  it('exposes manual check failures and permits retrying', async () => {
    const driver = new FakeUpdateDriver()
    const service = new AppUpdateService(driver, '1.0.3', true, vi.fn())
    service.start()
    await Promise.resolve()
    driver.checkForUpdates.mockRejectedValueOnce(new Error('network unavailable'))

    await expect(service.checkForUpdates()).rejects.toThrow('检查更新失败，请稍后重试。')
    expect(service.getStatus()).toEqual({ phase: 'error', currentVersion: '1.0.3', availableVersion: null, downloadPercent: null, error: '检查更新失败，请稍后重试。' })

    driver.checkForUpdates.mockImplementationOnce(async () => { driver.handlers?.notAvailable() })
    await expect(service.checkForUpdates()).resolves.toMatchObject({ phase: 'up-to-date', error: null })
    service.stop()
  })

  it('suppresses a manual check while another check is running', async () => {
    const driver = new FakeUpdateDriver()
    driver.checkForUpdates.mockImplementation(() => new Promise<void>(() => undefined))
    const service = new AppUpdateService(driver, '1.0.3', true, vi.fn())
    service.start()

    await expect(service.checkForUpdates()).resolves.toMatchObject({ phase: 'checking' })
    expect(driver.checkForUpdates).toHaveBeenCalledTimes(1)
    service.stop()
  })

  it('reports an available version, download progress, and downloaded installation state', async () => {
    const driver = new FakeUpdateDriver()
    const statuses: AppUpdateStatus[] = []
    const service = new AppUpdateService(driver, '1.0.3', true, (status) => statuses.push(status))
    service.start()
    driver.handlers?.available('1.1.0')
    driver.downloadUpdate.mockImplementation(async () => {
      driver.handlers?.progress(47.6)
      driver.handlers?.downloaded('1.1.0')
    })

    const downloaded = await service.downloadUpdate()

    expect(statuses).toContainEqual({ phase: 'available', currentVersion: '1.0.3', availableVersion: '1.1.0', downloadPercent: null, error: null })
    expect(statuses).toContainEqual({ phase: 'downloading', currentVersion: '1.0.3', availableVersion: '1.1.0', downloadPercent: 47.6, error: null })
    expect(downloaded).toEqual({ phase: 'downloaded', currentVersion: '1.0.3', availableVersion: '1.1.0', downloadPercent: 100, error: null })

    service.installUpdate()
    expect(driver.installUpdate).toHaveBeenCalledTimes(1)
    service.stop()
  })

  it('keeps a known version available after a scheduled check error', async () => {
    const driver = new FakeUpdateDriver()
    const service = new AppUpdateService(driver, '1.0.3', true, vi.fn())
    service.start()
    driver.handlers?.available('1.1.0')
    driver.handlers?.error(new Error('network unavailable'))
    await Promise.resolve()

    expect(service.getStatus()).toEqual({ phase: 'available', currentVersion: '1.0.3', availableVersion: '1.1.0', downloadPercent: null, error: null })
    service.stop()
  })

  it('keeps initial check errors silent and retries failed downloads', async () => {
    const driver = new FakeUpdateDriver()
    driver.checkForUpdates.mockRejectedValueOnce(new Error('network unavailable'))
    const service = new AppUpdateService(driver, '1.0.3', true, vi.fn())
    service.start()
    await Promise.resolve()
    await Promise.resolve()

    expect(service.getStatus()).toEqual({ phase: 'idle', currentVersion: '1.0.3', availableVersion: null, downloadPercent: null, error: null })

    driver.handlers?.available('1.1.0')
    driver.downloadUpdate.mockRejectedValueOnce(new Error('download unavailable'))
    await expect(service.downloadUpdate()).rejects.toThrow('更新下载失败，请重试。')
    expect(service.getStatus()).toEqual({ phase: 'error', currentVersion: '1.0.3', availableVersion: '1.1.0', downloadPercent: null, error: '更新下载失败，请重试。' })

    driver.downloadUpdate.mockImplementationOnce(async () => { driver.handlers?.downloaded('1.1.0') })
    await expect(service.downloadUpdate()).resolves.toMatchObject({ phase: 'downloaded', downloadPercent: 100 })
    service.stop()
  })

  it('rejects concurrent download requests', async () => {
    const driver = new FakeUpdateDriver()
    let finishDownload: () => void = () => { throw new Error('Download has not started.') }
    driver.downloadUpdate.mockImplementation(() => new Promise<void>((resolve) => { finishDownload = resolve }))
    const service = new AppUpdateService(driver, '1.0.3', true, vi.fn())
    service.start()
    driver.handlers?.available('1.1.0')

    const firstDownload = service.downloadUpdate()
    await expect(service.downloadUpdate()).rejects.toThrow('更新正在下载中。')
    await expect(service.checkForUpdates()).resolves.toMatchObject({ phase: 'downloading' })
    expect(driver.downloadUpdate).toHaveBeenCalledTimes(1)
    expect(driver.checkForUpdates).toHaveBeenCalledTimes(1)

    driver.handlers?.downloaded('1.1.0')
    finishDownload()
    await expect(firstDownload).resolves.toMatchObject({ phase: 'downloaded', downloadPercent: 100 })
    await expect(service.checkForUpdates()).resolves.toMatchObject({ phase: 'downloaded' })
    expect(driver.checkForUpdates).toHaveBeenCalledTimes(1)
    service.stop()
  })
})
