import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createDefaultTheme } from '../src/shared/theme'
import { ACCOUNT_MENU_ITEMS } from '../src/shared/account-menu'
import { iconGifPosterAssetKey } from '../src/shared/icon-assets'
import { gifPosterAssetKey } from '../src/shared/gif'
import type { RuntimeStatus } from '../src/shared/contracts'
import { translateLocalizedMessage } from '../src/shared/i18n'

const { runPowerShellMock } = vi.hoisted(() => ({ runPowerShellMock: vi.fn() }))

vi.mock('../src/main/powershell', () => ({ runPowerShell: runPowerShellMock }))

import { CodexInstallationIdentityError, type CodexPlatformDriver, type CodexStartResult } from '../src/main/codex-platform'
import { CodexService } from '../src/main/codex-service'

function localizedStatus(status: RuntimeStatus): Omit<RuntimeStatus, 'message' | 'lastError'> & { message: string; lastError: string | null } {
  return {
    ...status,
    message: translateLocalizedMessage('zh-CN', status.message),
    lastError: status.lastError ? translateLocalizedMessage('zh-CN', status.lastError) : null
  }
}

const detection = {
  found: true,
  platform: 'win32' as const,
  distribution: 'windows-store' as const,
  version: '26.715.2305.0',
  executable: 'C:\\WindowsApps\\Codex\\app\\ChatGPT.exe',
  installationId: 'OpenAI.Codex_test',
  running: false,
  backupAvailable: true
}

function createService(): CodexService {
  const root = join(tmpdir(), `codex-dream-skin-missing-${process.pid}-${Date.now()}`)
  const store = { root, themesRoot: join(root, 'themes') } as never
  const driver = createDriver()
  return new CodexService(store, join(root, 'resources'), driver, '1.0.5', () => undefined)
}

function createDriver(platform: CodexPlatformDriver['platform'] = 'win32'): CodexPlatformDriver {
  return {
    platform,
    detect: vi.fn(() => runPowerShellMock()),
    applyConfig: vi.fn(),
    start: vi.fn(),
    verifySession: vi.fn(),
    restore: vi.fn(async (restartCodex: boolean) => ({
      configRestored: true,
      backupArchive: { status: 'succeeded' as const },
      restart: restartCodex ? { status: 'succeeded' as const } : { status: 'not-requested' as const }
    }))
  }
}

describe('CodexService operation queue', () => {
  it('serializes startup recovery detection with a manual detection', async () => {
    let release!: (value: typeof detection) => void
    const firstOperation = new Promise<typeof detection>((resolve) => { release = resolve })
    runPowerShellMock
      .mockReturnValueOnce(firstOperation)
      .mockResolvedValueOnce(detection)

    const service = createService()
    const resume = service.resume()
    const detect = service.detect()
    await new Promise<void>((resolve) => setImmediate(resolve))

    expect(runPowerShellMock).toHaveBeenCalledTimes(1)
    release(detection)
    await Promise.all([resume, detect])
    expect(runPowerShellMock).toHaveBeenCalledTimes(2)
  })

  it('keeps identical renderer payload versions stable and changes them with content', async () => {
    const root = join(tmpdir(), `codex-dream-skin-payload-${process.pid}-${Date.now()}`)
    const profile = createDefaultTheme('11111111-1111-4111-8111-111111111111')
    profile.updatedAt = '2026-07-20T00:00:00.000Z'
    profile.conversationBubbles.visible = false
    profile.toolActivityBubbles.visible = false
    profile.polaroid.source = { asset: 'asset-polaroid', kind: 'video', mimeType: 'video/mp4' }
    profile.decorations.composerMelody.mode = 'gif'
    profile.decorations.composerMelody.source = { asset: 'assets/composer.gif', kind: 'image', mimeType: 'image/gif' }
    profile.conversationBackground.overlay = {
      paint: { kind: 'linear', angle: 120, stops: [{ color: '#123456', position: 0 }, { color: '#abcdef', position: 1 }] },
      opacity: .4,
      shape: 'ellipse',
      position: { x: .3, y: .6 },
      size: { width: .5, height: .4 },
      softness: 12,
      cornerRadius: 28
    }
    profile.windowBackground.visible = true
    profile.windowBackground.mode = 'image'
    profile.windowBackground.source = { asset: 'assets/window.png', kind: 'image', mimeType: 'image/png' }
    profile.windowBackground.opacity = .82
    profile.windowBackground.focus = { x: .35, y: .65 }
    profile.windowBackground.scale = 1.25
    profile.windowBackground.mediaTransform.flipHorizontal = true
    profile.windowBackground.masks = [{
      id: '22222222-2222-4222-8222-222222222222',
      visible: true,
      paint: { kind: 'radial', center: { x: .4, y: .6 }, stops: [{ color: '#FFFFFF', position: 0 }, { color: 'transparent', position: 1 }] },
      opacity: .45,
      shape: 'roundedRect',
      position: { x: .3, y: .7 },
      size: { width: .5, height: .4 },
      softness: 16,
      cornerRadius: 32
    }]
    profile.accountMenuBackground = {
      mode: 'gif',
      source: { asset: 'assets/account-menu.gif', kind: 'image', mimeType: 'image/gif' },
      opacity: .72,
      focus: { x: .25, y: .75 },
      scale: 1.4
    }
    profile.icons.sidebarSearch = { kind: 'asset', asset: 'assets/search.gif' }
    profile.icons.composerAdd = { kind: 'asset', asset: 'assets/search.gif' }
    profile.icons.composerMicrophone = { kind: 'asset', asset: 'assets/window.png' }
    const searchPosterKey = iconGifPosterAssetKey('assets/search.gif')
    const composerPosterKey = gifPosterAssetKey('assets/composer.gif')
    const accountMenuPosterKey = gifPosterAssetKey('assets/account-menu.gif')
    const store = {
      root,
      themesRoot: join(root, 'themes'),
      assertRuntimeVideoCompatibility: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(profile),
      compile: vi.fn().mockResolvedValue({ assets: { 'assets/composer.gif': 'data:image/gif;base64,AA==', [composerPosterKey]: 'data:image/png;base64,BA==', 'assets/window.png': 'data:image/png;base64,AA==', 'assets/account-menu.gif': 'data:image/gif;base64,AQ==', [accountMenuPosterKey]: 'data:image/png;base64,BQ==', 'assets/search.gif': 'data:image/gif;base64,Ag==', [searchPosterKey]: 'data:image/png;base64,Aw==' } })
    }
    const service = new CodexService(store as never, join(process.cwd(), 'resources', 'shared'), createDriver(), '1.0.5', () => undefined)
    const builder = service as unknown as { buildPayload(themeId: string): Promise<{ script: string; version: string }> }

    const first = await builder.buildPayload(profile.id)
    const second = await builder.buildPayload(profile.id)
    const updatedService = new CodexService(store as never, join(process.cwd(), 'resources', 'shared'), createDriver(), '1.0.6', () => undefined)
    const updatedBuilder = updatedService as unknown as { buildPayload(themeId: string): Promise<{ script: string; version: string }> }
    const updated = await updatedBuilder.buildPayload(profile.id)
    profile.decorations.sparkles.performanceMode = 'performance'
    const third = await builder.buildPayload(profile.id)
    const versionPattern = /const VERSION = "([^"]+)"/
    const firstVersion = first.script.match(versionPattern)?.[1]
    const secondVersion = second.script.match(versionPattern)?.[1]
    const thirdVersion = third.script.match(versionPattern)?.[1]

    expect(firstVersion).toMatch(/^studio-[0-9a-f]{24}$/)
    expect(first.version).toBe(firstVersion)
    expect(secondVersion).toBe(firstVersion)
    expect(updated.version).not.toBe(first.version)
    expect(thirdVersion).not.toBe(firstVersion)
    expect(first.script).toContain('"asset":"asset-polaroid"')
    expect(first.script).toContain('"dataUrl":"data:image/gif;base64,AA==","posterDataUrl":"data:image/png;base64,BA=="')
    expect(first.script).toContain('"overlayStyle":{"background":"linear-gradient(120deg, #123456 0%, #abcdef 100%)"')
    expect(first.script).toContain('"left":"30%","top":"60%","width":"50%","height":"40%"')
    expect(first.script).toContain('"borderRadius":"50%","filter":"blur(12px)"')
    expect(first.script).not.toContain('"overlay":{"paint"')
    expect(first.script).toContain('"windowBackground":{"visible":true,"mode":"image"')
    expect(first.script).toContain('"backgroundStyle":{"background":"#FFFFFF","opacity":"0.82","objectPosition":"35% 65%","transform":"scale(1.25) scaleX(-1) scaleY(1)"}')
    expect(first.script).toContain('"dataUrl":"data:image/png;base64,AA=="')
    expect(first.script).toContain('"id":"22222222-2222-4222-8222-222222222222","visible":true,"style":{"background":"radial-gradient(circle at 40% 60%, #FFFFFF 0%, transparent 100%)"')
    expect(first.script).not.toContain('"windowBackground":{"visible":true,"mode":"image","paint"')
    expect(first.script).toContain('"accountMenuBackground":{"mode":"gif","style":{"opacity":"0.72","objectPosition":"25% 75%","transform":"scale(1.4)","transformOrigin":"25% 75%"}')
    expect(first.script).toContain('"asset":"assets/account-menu.gif","dataUrl":"data:image/gif;base64,AQ==","posterDataUrl":"data:image/png;base64,BQ=="')
    expect(first.script).toContain('"conversationBubbles":{"visible":false,"user":{"mode":"none","dataUrl":null,"slice":25,"sliceInsets":[25,25,25,25],"frameWidth":24,"borderWidths":[24,48,24,48],"contentPadding":20}')
    expect(first.script).toContain('"codex":{"mode":"none","dataUrl":null,"slice":25,"sliceInsets":[25,25,25,25],"frameWidth":24,"borderWidths":[24,48,24,48],"contentPadding":20}')
    expect(first.script).toContain('"toolActivityBubbles":{"visible":false}')
    expect(first.script).toContain(`"accountMenu":${JSON.stringify(ACCOUNT_MENU_ITEMS)}`)
    expect(first.script).toContain('"accountMenuUsage":{"name":"clock"}')
    expect(first.script).toContain('"sidebarSearch":{"dataUrl":"data:image/gif;base64,Ag==","posterDataUrl":"data:image/png;base64,Aw=="}')
    expect(first.script).toContain('"composerAdd":{"dataUrl":"data:image/gif;base64,Ag==","posterDataUrl":"data:image/png;base64,Aw=="}')
    expect(first.script).toContain('"composerMicrophone":{"dataUrl":"data:image/png;base64,AA=="}')
    expect(first.script).toContain('--dream-font-account-menu-usage')
    expect(first.script).toContain('"sparklePolicy":{"mode":"balanced"')
    expect(first.script).toContain('"sparkleCyclePositionPolicy":{"x":{"min":5,"max":95,"minDelta":12},"y":{"min":5,"max":91,"minDelta":12}}')
    expect(third.script).toContain('"sparklePolicy":{"mode":"performance"')
  })

  it('blocks install, start, and reinjection before mutating runtime state when videos need conversion', async () => {
    const themeId = '11111111-1111-4111-8111-111111111111'
    const oldThemeId = '22222222-2222-4222-8222-222222222222'
    const message = '主题中有 1 个视频需要转换，转换完成后才能应用到 Codex。'
    const createBlockedService = () => {
      const root = join(tmpdir(), `codex-dream-skin-incompatible-${Date.now()}-${Math.random()}`)
      const store = {
        root,
        themesRoot: join(root, 'themes'),
        assertRuntimeVideoCompatibility: vi.fn().mockRejectedValue(new Error(message)),
        get: vi.fn(),
        compile: vi.fn(),
        getRuntimeMediaBindings: vi.fn()
      }
      const driver = createDriver()
      const service = new CodexService(store as never, join(process.cwd(), 'resources', 'shared'), driver, '1.1.0', () => undefined)
      const writeRuntimePayload = vi.fn()
      ;(service as unknown as { writeRuntimePayload: typeof writeRuntimePayload }).writeRuntimePayload = writeRuntimePayload
      return { service, store, driver, writeRuntimePayload }
    }

    const install = createBlockedService()
    await expect(install.service.installTheme(themeId)).rejects.toThrow(message)
    expect(install.writeRuntimePayload).not.toHaveBeenCalled()
    expect(install.driver.applyConfig).not.toHaveBeenCalled()

    const start = createBlockedService()
    await expect(start.service.start(themeId, false)).rejects.toThrow(message)
    expect(start.writeRuntimePayload).not.toHaveBeenCalled()
    expect(start.driver.applyConfig).not.toHaveBeenCalled()
    expect(start.driver.start).not.toHaveBeenCalled()

    const reinject = createBlockedService()
    const activeSession: CodexStartResult = {
      port: 9335,
      browserId: 'browser-active',
      version: detection.version,
      platform: 'win32',
      installationId: detection.installationId
    }
    const reinjectInternals = reinject.service as unknown as {
      watcher: object
      activeThemeId: string
      activeSession: CodexStartResult
      activePayload: { script: string; version: string }
      sessionGeneration: number
      activeSessionGeneration: number
      status: { phase: string }
    }
    reinjectInternals.watcher = {}
    reinjectInternals.activeThemeId = oldThemeId
    reinjectInternals.activeSession = activeSession
    reinjectInternals.activePayload = { script: 'old', version: 'studio-0123456789abcdef01234567' }
    reinjectInternals.sessionGeneration = 1
    reinjectInternals.activeSessionGeneration = 1
    reinjectInternals.status.phase = 'active'
    await expect(reinject.service.reinject(themeId)).rejects.toThrow(message)
    expect(reinject.writeRuntimePayload).not.toHaveBeenCalled()
    expect(reinject.store.getRuntimeMediaBindings).not.toHaveBeenCalled()
  })

  it('repairs a stale runtime during manual verification', async () => {
    const service = createService()
    const watcher = {
      verify: vi.fn().mockResolvedValue({ connected: false, targetCount: 1 }),
      inject: vi.fn().mockResolvedValue({ connected: true, targetCount: 1 })
    }
    ;(service as unknown as { watcher: typeof watcher }).watcher = watcher

    await expect(service.verify().then(localizedStatus)).resolves.toMatchObject({
      phase: 'active',
      connected: false,
      targetCount: 0,
      message: '主题已自动修复，共 1 个页面'
    })
    expect(watcher.verify).toHaveBeenCalledTimes(1)
    expect(watcher.inject).toHaveBeenCalledTimes(1)
  })

  it('keeps the active watcher and persisted session when page cleanup fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-stop-cleanup-failure-'))
    const themeId = '11111111-1111-4111-8111-111111111111'
    const service = new CodexService({ root, themesRoot: join(root, 'themes') } as never, join(process.cwd(), 'resources', 'shared'), createDriver(), '1.0.9', () => undefined)
    const watcher = { stop: vi.fn().mockRejectedValue(new Error('Codex 页面主题清理失败')) }
    const activeSession: CodexStartResult = {
      port: 9335,
      browserId: 'browser-1',
      version: detection.version,
      platform: 'win32',
      installationId: detection.installationId
    }
    const internals = service as unknown as {
      watcher: typeof watcher
      activeThemeId: string
      activeSession: CodexStartResult
      activeSessionGeneration: number
      sessionGeneration: number
    }
    internals.watcher = watcher
    internals.activeThemeId = themeId
    internals.activeSession = activeSession
    internals.activeSessionGeneration = 1
    internals.sessionGeneration = 1
    await mkdir(join(root, 'runtime'), { recursive: true })
    await writeFile(join(root, 'runtime', 'session.json'), `${JSON.stringify({
      version: 2,
      themeId,
      port: activeSession.port,
      browserId: activeSession.browserId,
      platform: activeSession.platform,
      installationId: activeSession.installationId
    })}\n`)

    await expect(service.stop()).rejects.toThrow('Codex 页面主题清理失败')

    expect(internals.watcher).toBe(watcher)
    expect(internals.activeThemeId).toBe(themeId)
    expect(internals.activeSession).toBe(activeSession)
    expect(internals.activeSessionGeneration).toBe(2)
    expect(service.isActive()).toBe(true)
    expect(localizedStatus(service.getStatus())).toMatchObject({
      phase: 'active',
      lastError: 'Codex 页面主题清理失败',
      message: '停止注入失败，当前主题会话仍在运行，可重试恢复'
    })
    await expect(readFile(join(root, 'runtime', 'session.json'), 'utf8')).resolves.toContain(themeId)
    await rm(root, { recursive: true, force: true })
  })

  it('keeps the active watcher and generation when restore page cleanup fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-restore-cleanup-failure-'))
    const themeId = '11111111-1111-4111-8111-111111111111'
    const driver = createDriver()
    const service = new CodexService({ root, themesRoot: join(root, 'themes') } as never, join(process.cwd(), 'resources', 'shared'), driver, '1.0.9', () => undefined)
    const watcher = { stop: vi.fn().mockRejectedValue(new Error('Codex 页面主题清理失败')) }
    const activeSession: CodexStartResult = {
      port: 9335,
      browserId: 'browser-1',
      version: detection.version,
      platform: 'win32',
      installationId: detection.installationId
    }
    const internals = service as unknown as {
      watcher: typeof watcher
      activeThemeId: string
      activeSession: CodexStartResult
      activeSessionGeneration: number
      sessionGeneration: number
    }
    internals.watcher = watcher
    internals.activeThemeId = themeId
    internals.activeSession = activeSession
    internals.activeSessionGeneration = 1
    internals.sessionGeneration = 1
    await mkdir(join(root, 'runtime'), { recursive: true })
    await writeFile(join(root, 'runtime', 'session.json'), `${JSON.stringify({
      version: 2,
      themeId,
      port: activeSession.port,
      browserId: activeSession.browserId,
      platform: activeSession.platform,
      installationId: activeSession.installationId
    })}\n`)

    await expect(service.restore(true)).rejects.toThrow('Codex 页面主题清理失败')

    expect(watcher.stop).toHaveBeenCalledWith(true)
    expect(driver.restore).not.toHaveBeenCalled()
    expect(internals.watcher).toBe(watcher)
    expect(internals.activeThemeId).toBe(themeId)
    expect(internals.activeSession).toBe(activeSession)
    expect(internals.activeSessionGeneration).toBe(2)
    expect(service.isActive()).toBe(true)
    expect(localizedStatus(service.getStatus())).toMatchObject({
      phase: 'active',
      lastError: 'Codex 页面主题清理失败',
      message: '恢复失败，当前主题会话仍在运行，可重试恢复'
    })
    await expect(readFile(join(root, 'runtime', 'session.json'), 'utf8')).resolves.toContain(themeId)
    await rm(root, { recursive: true, force: true })
  })

  it('keeps detection and config installation active while a theme session is running', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-active-maintenance-'))
    const themeId = '11111111-1111-4111-8111-111111111111'
    const statuses: Array<ReturnType<CodexService['getStatus']>> = []
    const driver = createDriver()
    vi.mocked(driver.detect).mockResolvedValue(detection)
    const service = new CodexService({ root, themesRoot: join(root, 'themes') } as never, join(process.cwd(), 'resources', 'shared'), driver, '1.0.9', (status) => statuses.push(status))
    const payload = { script: 'true', version: 'studio-0123456789abcdef01234567' }
    const activeSession: CodexStartResult = {
      port: 9335,
      browserId: 'browser-1',
      version: detection.version,
      platform: 'win32',
      installationId: detection.installationId
    }
    const internals = service as unknown as {
      watcher: object
      activeThemeId: string
      activeSession: CodexStartResult
      activePayload: typeof payload
      sessionGeneration: number
      activeSessionGeneration: number
      buildPayload: (id: string) => Promise<typeof payload>
      writeRuntimePayload: (script: string) => Promise<void>
    }
    internals.watcher = {}
    internals.activeThemeId = themeId
    internals.activeSession = activeSession
    internals.activePayload = payload
    internals.sessionGeneration = 1
    internals.activeSessionGeneration = 1
    internals.buildPayload = vi.fn().mockResolvedValue(payload)
    internals.writeRuntimePayload = vi.fn().mockResolvedValue(undefined)

    await service.detect()
    await service.installTheme(themeId)

    expect(statuses.length).toBeGreaterThan(0)
    expect(statuses.every((status) => status.phase === 'active')).toBe(true)
    expect(service.isActive()).toBe(true)
    expect(driver.applyConfig).toHaveBeenCalledWith(join(root, 'themes', themeId, 'theme.json'))
    await rm(root, { recursive: true, force: true })
  })

  it('uses the driver-selected fallback port during automatic recovery', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-recovery-port-'))
    const themeId = '11111111-1111-4111-8111-111111111111'
    const store = { root, themesRoot: join(root, 'themes') } as never
    const driver = createDriver()
    vi.mocked(driver.start).mockResolvedValue({
      port: 9341,
      browserId: 'browser-fallback',
      version: detection.version,
      platform: 'win32',
      installationId: detection.installationId
    })
    const service = new CodexService(store, join(process.cwd(), 'resources', 'shared'), driver, '1.0.8', () => undefined)
    const payload = { script: 'true', version: 'studio-0123456789abcdef01234567' }
    const internals = service as unknown as {
      buildPayload: (id: string) => Promise<typeof payload>
      writeRuntimePayload: (script: string) => Promise<void>
      replaceWatcher: (browserId: string, nextPayload: typeof payload) => Promise<{ connected: boolean; targetCount: number }>
      watcher: object | null
      activeThemeId: string | null
      activeSession: CodexStartResult | null
      sessionGeneration: number
      activeSessionGeneration: number | null
      recoverActiveSessionInternal: (id: string, generation: number) => Promise<void>
    }
    internals.buildPayload = vi.fn().mockResolvedValue(payload)
    internals.writeRuntimePayload = vi.fn().mockResolvedValue(undefined)
    internals.replaceWatcher = vi.fn().mockImplementation(async () => {
      expect(service.getStatus().port).toBe(9341)
      return { connected: true, targetCount: 1 }
    })
    internals.watcher = {}
    internals.activeThemeId = themeId
    internals.activeSession = {
      port: 9335,
      browserId: 'browser-old',
      version: detection.version,
      platform: 'win32',
      installationId: detection.installationId
    }
    internals.sessionGeneration = 1
    internals.activeSessionGeneration = 1

    await internals.recoverActiveSessionInternal(themeId, 1)

    expect(driver.start).toHaveBeenCalledWith(9335, true, detection.installationId)
    expect(internals.replaceWatcher).toHaveBeenCalledWith('browser-fallback', payload)
    expect(localizedStatus(service.getStatus())).toMatchObject({ phase: 'active', port: 9341 })
    expect(JSON.parse(await readFile(join(root, 'runtime', 'session.json'), 'utf8'))).toMatchObject({
      themeId,
      port: 9341,
      browserId: 'browser-fallback'
    })
    await rm(root, { recursive: true, force: true })
  })

  it('discards the active watcher when automatic recovery cannot persist the new session', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-recovery-session-failure-'))
    const themeId = '11111111-1111-4111-8111-111111111111'
    const driver = createDriver()
    const recoveredSession: CodexStartResult = {
      port: 9341,
      browserId: 'browser-fallback',
      version: detection.version,
      platform: 'win32',
      installationId: detection.installationId
    }
    vi.mocked(driver.start).mockResolvedValue(recoveredSession)
    const service = new CodexService({ root, themesRoot: join(root, 'themes') } as never, join(process.cwd(), 'resources', 'shared'), driver, '1.0.9', () => undefined)
    const payload = { script: 'true', version: 'studio-0123456789abcdef01234567' }
    const watcher = { stop: vi.fn().mockResolvedValue({ connected: false, targetCount: 0 }) }
    const internals = service as unknown as {
      watcher: typeof watcher | null
      activeThemeId: string | null
      activeSession: CodexStartResult | null
      activePayload: typeof payload | null
      sessionGeneration: number
      activeSessionGeneration: number | null
      buildPayload: () => Promise<typeof payload>
      writeRuntimePayload: (script: string) => Promise<void>
      writeSession: (id: string, session: CodexStartResult) => Promise<void>
      replaceWatcher: (browserId: string, nextPayload: typeof payload) => Promise<{ connected: boolean; targetCount: number }>
      recoverActiveSessionInternal: (id: string, generation: number) => Promise<void>
    }
    internals.watcher = watcher
    internals.activeThemeId = themeId
    internals.activeSession = { ...recoveredSession, port: 9335, browserId: 'browser-old' }
    internals.activePayload = payload
    internals.sessionGeneration = 1
    internals.activeSessionGeneration = 1
    internals.buildPayload = vi.fn().mockResolvedValue(payload)
    internals.writeRuntimePayload = vi.fn().mockResolvedValue(undefined)
    internals.writeSession = vi.fn().mockRejectedValue(new Error('session write failed'))
    internals.replaceWatcher = vi.fn()

    await internals.recoverActiveSessionInternal(themeId, 1)

    expect(watcher.stop).toHaveBeenCalledWith(true)
    expect(internals.replaceWatcher).not.toHaveBeenCalled()
    expect(internals.watcher).toBeNull()
    expect(internals.activeThemeId).toBeNull()
    expect(internals.activeSession).toBeNull()
    expect(localizedStatus(service.getStatus())).toMatchObject({
      phase: 'error',
      lastError: 'session write failed',
      message: '自动恢复失败，请重新启动主题'
    })
    await expect(readFile(join(root, 'runtime', 'session.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    await rm(root, { recursive: true, force: true })
  })

  it('drops a queued automatic recovery after a restore intent invalidates its generation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-recovery-restore-'))
    let releaseDetection!: (value: typeof detection) => void
    const blockedDetection = new Promise<typeof detection>((resolve) => { releaseDetection = resolve })
    const driver = createDriver()
    vi.mocked(driver.detect).mockReturnValue(blockedDetection)
    const service = new CodexService({ root, themesRoot: join(root, 'themes') } as never, join(process.cwd(), 'resources', 'shared'), driver, '1.0.8', () => undefined)
    const watcher = { stop: vi.fn().mockResolvedValue({ connected: false, targetCount: 0 }) }
    const activeSession: CodexStartResult = {
      port: 9335,
      browserId: 'browser-old',
      version: detection.version,
      platform: 'win32',
      installationId: detection.installationId
    }
    const internals = service as unknown as {
      watcher: typeof watcher
      activeThemeId: string
      activeSession: CodexStartResult
      sessionGeneration: number
      activeSessionGeneration: number
      recoverActiveSession: (generation: number) => Promise<void>
    }
    internals.watcher = watcher
    internals.activeThemeId = '11111111-1111-4111-8111-111111111111'
    internals.activeSession = activeSession
    internals.sessionGeneration = 1
    internals.activeSessionGeneration = 1

    const detectionOperation = service.detect()
    await new Promise<void>((resolve) => setImmediate(resolve))
    const recovery = internals.recoverActiveSession(1)
    const restore = service.restore(false)
    releaseDetection(detection)
    await Promise.all([detectionOperation, recovery, restore])

    expect(driver.start).not.toHaveBeenCalled()
    expect(driver.restore).toHaveBeenCalledWith(false, undefined)
    await rm(root, { recursive: true, force: true })
  })

  it('drops a queued automatic recovery after a new theme start intent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-recovery-start-'))
    let releaseDetection!: (value: typeof detection) => void
    const blockedDetection = new Promise<typeof detection>((resolve) => { releaseDetection = resolve })
    const driver = createDriver()
    vi.mocked(driver.detect).mockReturnValue(blockedDetection)
    const service = new CodexService({ root, themesRoot: join(root, 'themes') } as never, join(process.cwd(), 'resources', 'shared'), driver, '1.0.8', () => undefined)
    const watcher = {}
    const activeSession: CodexStartResult = {
      port: 9335,
      browserId: 'browser-old',
      version: detection.version,
      platform: 'win32',
      installationId: detection.installationId
    }
    const startResult = { ...service.getStatus(), phase: 'active' as const }
    const startInternal = vi.fn().mockResolvedValue(startResult)
    const internals = service as unknown as {
      watcher: typeof watcher
      activeThemeId: string
      activeSession: CodexStartResult
      sessionGeneration: number
      activeSessionGeneration: number
      recoverActiveSession: (generation: number) => Promise<void>
      startInternal: typeof startInternal
    }
    internals.watcher = watcher
    internals.activeThemeId = '11111111-1111-4111-8111-111111111111'
    internals.activeSession = activeSession
    internals.sessionGeneration = 1
    internals.activeSessionGeneration = 1
    internals.startInternal = startInternal

    const detectionOperation = service.detect()
    await new Promise<void>((resolve) => setImmediate(resolve))
    const recovery = internals.recoverActiveSession(1)
    const start = service.start('22222222-2222-4222-8222-222222222222', true)
    releaseDetection(detection)
    await Promise.all([detectionOperation, recovery, start])

    expect(driver.start).not.toHaveBeenCalled()
    expect(startInternal).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      true,
      2,
      detection.installationId
    )
    await rm(root, { recursive: true, force: true })
  })

  it('keeps the old watcher current when a new theme fails before changing runtime state', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-start-build-failure-'))
    const oldThemeId = '11111111-1111-4111-8111-111111111111'
    const newThemeId = '22222222-2222-4222-8222-222222222222'
    const payload = { script: 'old', version: 'studio-0123456789abcdef01234567' }
    const driver = createDriver()
    const service = new CodexService({ root, themesRoot: join(root, 'themes') } as never, join(process.cwd(), 'resources', 'shared'), driver, '1.0.9', () => undefined)
    const watcher = {}
    const activeSession: CodexStartResult = {
      port: 9335,
      browserId: 'browser-old',
      version: detection.version,
      platform: 'win32',
      installationId: detection.installationId
    }
    const internals = service as unknown as {
      watcher: typeof watcher
      activeThemeId: string
      activeSession: CodexStartResult
      activePayload: typeof payload
      sessionGeneration: number
      activeSessionGeneration: number
      buildPayload: () => Promise<never>
      hasCurrentActiveSession: () => boolean
    }
    internals.watcher = watcher
    internals.activeThemeId = oldThemeId
    internals.activeSession = activeSession
    internals.activePayload = payload
    internals.sessionGeneration = 1
    internals.activeSessionGeneration = 1
    internals.buildPayload = vi.fn().mockRejectedValue(new Error('compile failed'))

    await expect(service.start(newThemeId, true)).rejects.toThrow('compile failed')

    expect(internals.watcher).toBe(watcher)
    expect(internals.activeThemeId).toBe(oldThemeId)
    expect(internals.activeSession).toBe(activeSession)
    expect(internals.activeSessionGeneration).toBe(2)
    expect(internals.hasCurrentActiveSession()).toBe(true)
    expect(driver.start).not.toHaveBeenCalled()
    expect(localizedStatus(service.getStatus())).toMatchObject({
      phase: 'active',
      lastError: 'compile failed',
      message: '新主题启动失败，原主题会话仍在运行'
    })
    await rm(root, { recursive: true, force: true })
  })

  it('does not start a watcher when a new session cannot be persisted', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-start-session-failure-'))
    const themeId = '11111111-1111-4111-8111-111111111111'
    const payload = { script: 'new', version: 'studio-0123456789abcdef01234567' }
    const startedSession: CodexStartResult = {
      port: 9341,
      browserId: 'browser-new',
      version: detection.version,
      platform: 'win32',
      installationId: detection.installationId
    }
    const driver = createDriver()
    vi.mocked(driver.start).mockResolvedValue(startedSession)
    const service = new CodexService({ root, themesRoot: join(root, 'themes') } as never, join(process.cwd(), 'resources', 'shared'), driver, '1.0.9', () => undefined)
    const internals = service as unknown as {
      watcher: object | null
      activeThemeId: string | null
      activeSession: CodexStartResult | null
      buildPayload: () => Promise<typeof payload>
      writeRuntimePayload: (script: string) => Promise<void>
      writeSession: (id: string, session: CodexStartResult) => Promise<void>
      replaceWatcher: (browserId: string, nextPayload: typeof payload) => Promise<{ connected: boolean; targetCount: number }>
    }
    internals.buildPayload = vi.fn().mockResolvedValue(payload)
    internals.writeRuntimePayload = vi.fn().mockResolvedValue(undefined)
    internals.writeSession = vi.fn().mockRejectedValue(new Error('session write failed'))
    internals.replaceWatcher = vi.fn()

    await expect(service.start(themeId, true)).rejects.toThrow('session write failed')

    expect(driver.start).toHaveBeenCalledWith(9335, true, undefined)
    expect(internals.replaceWatcher).not.toHaveBeenCalled()
    expect(internals.watcher).toBeNull()
    expect(internals.activeThemeId).toBeNull()
    expect(internals.activeSession).toBeNull()
    expect(localizedStatus(service.getStatus())).toMatchObject({ phase: 'error', lastError: 'session write failed' })
    await expect(readFile(join(root, 'runtime', 'session.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    await rm(root, { recursive: true, force: true })
  })

  it('restores the old theme session when switching themes cannot be committed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-start-rollback-'))
    const oldThemeId = '11111111-1111-4111-8111-111111111111'
    const newThemeId = '22222222-2222-4222-8222-222222222222'
    const oldPayload = { script: 'old', version: 'studio-0123456789abcdef01234567' }
    const newPayload = { script: 'new', version: 'studio-89abcdef0123456701234567' }
    const oldBindings = [{ role: 'hero' as const, path: 'C:\\themes\\old.mp4', mimeType: 'video/mp4' }]
    const driver = createDriver()
    const activeSession: CodexStartResult = {
      port: 9335,
      browserId: 'browser-old',
      version: detection.version,
      platform: 'win32',
      installationId: detection.installationId
    }
    const newSession = { ...activeSession, port: 9341, browserId: 'browser-new' }
    const restoredSession = { ...activeSession, browserId: 'browser-restored' }
    vi.mocked(driver.start)
      .mockResolvedValueOnce(newSession)
      .mockResolvedValueOnce(restoredSession)
    const service = new CodexService({ root, themesRoot: join(root, 'themes') } as never, join(process.cwd(), 'resources', 'shared'), driver, '1.0.9', () => undefined)
    const oldWatcher = { stop: vi.fn().mockResolvedValue({ connected: false, targetCount: 0 }) }
    const restoredWatcher = {}
    const internals = service as unknown as {
      watcher: typeof oldWatcher | typeof restoredWatcher | null
      activeThemeId: string
      activeSession: CodexStartResult
      activePayload: typeof oldPayload
      activeMediaBindings: typeof oldBindings
      sessionGeneration: number
      activeSessionGeneration: number
      buildPayload: () => Promise<typeof newPayload>
      writeRuntimePayload: (script: string) => Promise<void>
      writeSession: (id: string, session: CodexStartResult) => Promise<void>
      replaceWatcher: (browserId: string, payload: typeof oldPayload, bindings?: typeof oldBindings) => Promise<{ connected: boolean; targetCount: number }>
    }
    internals.watcher = oldWatcher
    internals.activeThemeId = oldThemeId
    internals.activeSession = activeSession
    internals.activePayload = oldPayload
    internals.activeMediaBindings = oldBindings
    internals.sessionGeneration = 1
    internals.activeSessionGeneration = 1
    internals.buildPayload = vi.fn().mockResolvedValue(newPayload)
    internals.writeRuntimePayload = vi.fn().mockResolvedValue(undefined)
    internals.writeSession = vi.fn()
      .mockRejectedValueOnce(new Error('session write failed'))
      .mockResolvedValueOnce(undefined)
    internals.replaceWatcher = vi.fn().mockImplementation(async () => {
      internals.watcher = restoredWatcher
      internals.activePayload = oldPayload
      internals.activeMediaBindings = oldBindings
      return { connected: true, targetCount: 1 }
    })

    await expect(service.start(newThemeId, true)).rejects.toThrow('session write failed')

    expect(internals.writeRuntimePayload).toHaveBeenNthCalledWith(1, newPayload.script)
    expect(internals.writeRuntimePayload).toHaveBeenNthCalledWith(2, oldPayload.script)
    expect(driver.applyConfig).toHaveBeenNthCalledWith(1, join(root, 'themes', newThemeId, 'theme.json'))
    expect(driver.applyConfig).toHaveBeenNthCalledWith(2, join(root, 'themes', oldThemeId, 'theme.json'))
    expect(driver.start).toHaveBeenNthCalledWith(1, 9335, true, detection.installationId)
    expect(driver.start).toHaveBeenNthCalledWith(2, 9335, true, detection.installationId)
    expect(internals.writeSession).toHaveBeenNthCalledWith(1, newThemeId, newSession)
    expect(internals.writeSession).toHaveBeenNthCalledWith(2, oldThemeId, restoredSession)
    expect(internals.replaceWatcher).toHaveBeenCalledWith('browser-restored', oldPayload, oldBindings)
    expect(internals.watcher).toBe(restoredWatcher)
    expect(internals.activeThemeId).toBe(oldThemeId)
    expect(internals.activeSession).toBe(restoredSession)
    expect(internals.activeSessionGeneration).toBe(2)
    expect(localizedStatus(service.getStatus())).toMatchObject({
      phase: 'active',
      message: '新主题启动失败，已恢复原主题会话'
    })
    await rm(root, { recursive: true, force: true })
  })

  it('keeps restoring Codex through the persisted session installation after Studio restarts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-restore-installation-'))
    const driver = createDriver('darwin')
    const themeId = '11111111-1111-4111-8111-111111111111'
    const installationId = 'com.openai.codex:2DC432GLL2:/Applications/Codex.app'
    const activeSession: CodexStartResult = {
      port: 9335,
      browserId: 'browser-old',
      version: '26.721.81911',
      platform: 'darwin',
      installationId
    }
    vi.mocked(driver.restore).mockRejectedValueOnce(new Error('config restore failed'))
    const service = new CodexService({ root, themesRoot: join(root, 'themes') } as never, join(process.cwd(), 'resources', 'shared'), driver, '1.0.9', () => undefined)
    const watcher = { stop: vi.fn().mockResolvedValue({ connected: false, targetCount: 0 }) }
    const internals = service as unknown as {
      watcher: typeof watcher
      activeThemeId: string
      activeSession: CodexStartResult
      sessionGeneration: number
      activeSessionGeneration: number
    }
    internals.watcher = watcher
    internals.activeThemeId = themeId
    internals.activeSession = activeSession
    internals.sessionGeneration = 1
    internals.activeSessionGeneration = 1
    await mkdir(join(root, 'runtime'), { recursive: true })
    await writeFile(join(root, 'runtime', 'session.json'), `${JSON.stringify({
      version: 2,
      themeId,
      port: activeSession.port,
      browserId: activeSession.browserId,
      platform: activeSession.platform,
      installationId: activeSession.installationId
    })}\n`)

    await expect(service.restore(true)).rejects.toThrow('config restore failed')
    expect(JSON.parse(await readFile(join(root, 'runtime', 'session.json'), 'utf8'))).toMatchObject({
      themeId,
      installationId
    })

    expect(watcher.stop).toHaveBeenCalledWith(true)
    expect(driver.restore).toHaveBeenCalledWith(true, installationId)

    const restartedDriver = createDriver('darwin')
    vi.mocked(restartedDriver.detect).mockResolvedValue({
      ...detection,
      platform: 'darwin',
      distribution: 'mac-app-bundle',
      executable: '/Applications/Codex.app/Contents/MacOS/Codex',
      installationId: 'com.openai.codex:2DC432GLL2:/Applications/Codex.app',
      backupAvailable: true
    })
    vi.mocked(restartedDriver.verifySession).mockRejectedValue(new Error('saved app is unavailable'))
    const restartedStore = {
      root,
      themesRoot: join(root, 'themes'),
      get: vi.fn().mockResolvedValue({ id: themeId })
    }
    const restartedService = new CodexService(restartedStore as never, join(process.cwd(), 'resources', 'shared'), restartedDriver, '1.0.9', () => undefined)

    await restartedService.resume()

    expect(JSON.parse(await readFile(join(root, 'runtime', 'session.json'), 'utf8'))).toMatchObject({
      themeId,
      installationId
    })
    await restartedService.restore(true)

    expect(restartedDriver.restore).toHaveBeenCalledWith(true, installationId)
    await expect(readFile(join(root, 'runtime', 'session.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    await rm(root, { recursive: true, force: true })
  })

  it('keeps the session when the platform reports that no configuration backup was restored', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-restore-no-backup-'))
    const driver = createDriver()
    const themeId = '11111111-1111-4111-8111-111111111111'
    vi.mocked(driver.restore).mockResolvedValueOnce({
      configRestored: false,
      backupArchive: { status: 'not-attempted' },
      restart: { status: 'not-requested' }
    })
    const service = new CodexService({ root, themesRoot: join(root, 'themes') } as never, join(process.cwd(), 'resources', 'shared'), driver, '1.0.9', () => undefined)
    await mkdir(join(root, 'runtime'), { recursive: true })
    await writeFile(join(root, 'runtime', 'session.json'), `${JSON.stringify({
      version: 2,
      themeId,
      port: 9335,
      browserId: 'browser-old',
      platform: 'win32',
      installationId: detection.installationId
    })}\n`)

    await expect(service.restore(true)).rejects.toThrow('未找到可恢复的 Codex 配置备份')

    expect(localizedStatus(service.getStatus())).toMatchObject({
      phase: 'error',
      backupAvailable: false,
      lastError: '未找到可恢复的 Codex 配置备份'
    })
    await expect(readFile(join(root, 'runtime', 'session.json'), 'utf8')).resolves.toContain(themeId)
    await expect(readFile(join(root, 'runtime', 'session.restore-completed.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    await rm(root, { recursive: true, force: true })
  })

  it('commits configuration restore and retires the session when only the restart fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-restore-restart-failure-'))
    const driver = createDriver()
    const themeId = '11111111-1111-4111-8111-111111111111'
    vi.mocked(driver.restore).mockResolvedValueOnce({
      configRestored: true,
      backupArchive: { status: 'succeeded' },
      restart: { status: 'failed', error: 'Codex launch failed' }
    })
    const service = new CodexService({ root, themesRoot: join(root, 'themes') } as never, join(process.cwd(), 'resources', 'shared'), driver, '1.0.9', () => undefined)
    await mkdir(join(root, 'runtime'), { recursive: true })
    await writeFile(join(root, 'runtime', 'session.json'), `${JSON.stringify({
      version: 2,
      themeId,
      port: 9335,
      browserId: 'browser-old',
      platform: 'win32',
      installationId: detection.installationId
    })}\n`)

    const status = await service.restore(true)

    expect(localizedStatus(status)).toMatchObject({
      phase: 'stopped',
      backupAvailable: false,
      lastError: 'Codex launch failed',
      message: '已恢复 Codex 配置；Codex 配置已恢复，但自动重启失败'
    })
    await expect(readFile(join(root, 'runtime', 'session.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(root, 'runtime', 'session.restore-completed.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    await rm(root, { recursive: true, force: true })
  })

  it.each([true, false])('commits configuration restore and reports backup availability as %s when archiving fails', async (backupAvailable) => {
    const root = await mkdtemp(join(tmpdir(), `dream-skin-restore-archive-failure-${backupAvailable}-`))
    const driver = createDriver()
    const themeId = '11111111-1111-4111-8111-111111111111'
    vi.mocked(driver.restore).mockResolvedValueOnce({
      configRestored: true,
      backupArchive: { status: 'failed', error: 'Backup archive failed', backupAvailable },
      restart: { status: 'succeeded' }
    })
    const service = new CodexService({ root, themesRoot: join(root, 'themes') } as never, join(process.cwd(), 'resources', 'shared'), driver, '1.0.9', () => undefined)
    await mkdir(join(root, 'runtime'), { recursive: true })
    await writeFile(join(root, 'runtime', 'session.json'), `${JSON.stringify({
      version: 2,
      themeId,
      port: 9335,
      browserId: 'browser-old',
      platform: 'win32',
      installationId: detection.installationId
    })}\n`)

    const status = await service.restore(true)

    expect(localizedStatus(status)).toMatchObject({
      phase: 'stopped',
      backupAvailable,
      lastError: 'Backup archive failed',
      message: '已恢复配置并正常重启 Codex；Codex 配置已恢复，但配置备份归档失败'
    })
    await expect(readFile(join(root, 'runtime', 'session.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(root, 'runtime', 'session.restore-completed.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    await rm(root, { recursive: true, force: true })
  })

  it('restores configuration without restarting when a persisted macOS identity is invalid', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-restore-invalid-installation-'))
    const driver = createDriver('darwin')
    const service = new CodexService({ root, themesRoot: join(root, 'themes') } as never, join(process.cwd(), 'resources', 'shared'), driver, '1.0.9', () => undefined)
    await mkdir(join(root, 'runtime'), { recursive: true })
    await writeFile(join(root, 'runtime', 'session.json'), `${JSON.stringify({
      version: 2,
      themeId: '11111111-1111-4111-8111-111111111111',
      port: 9335,
      browserId: 'browser-old',
      platform: 'darwin',
      installationId: 'com.openai.codex:WRONGTEAM:/Applications/Codex.app'
    })}\n`)

    await expect(service.restore(true).then(localizedStatus)).resolves.toMatchObject({
      phase: 'stopped',
      backupAvailable: false,
      message: expect.stringContaining('未自动重启 Codex')
    })

    expect(driver.restore).toHaveBeenCalledOnce()
    expect(driver.restore).toHaveBeenCalledWith(false, undefined)
    await expect(readFile(join(root, 'runtime', 'session.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    await rm(root, { recursive: true, force: true })
  })

  it('restores configuration without restarting when session JSON is damaged', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-restore-damaged-session-'))
    const driver = createDriver()
    const service = new CodexService({ root, themesRoot: join(root, 'themes') } as never, join(process.cwd(), 'resources', 'shared'), driver, '1.0.9', () => undefined)
    await mkdir(join(root, 'runtime'), { recursive: true })
    await writeFile(join(root, 'runtime', 'session.json'), '{ damaged')

    const status = await service.restore(true)

    expect(driver.restore).toHaveBeenCalledWith(false, undefined)
    expect(localizedStatus(status)).toMatchObject({
      phase: 'stopped',
      backupAvailable: false,
      lastError: '保存的运行会话无效。',
      message: expect.stringContaining('未自动重启 Codex')
    })
    await expect(readFile(join(root, 'runtime', 'session.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    await rm(root, { recursive: true, force: true })
  })

  it('restores configuration without restarting when session metadata is unreadable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-restore-unreadable-session-'))
    const driver = createDriver()
    const service = new CodexService({ root, themesRoot: join(root, 'themes') } as never, join(process.cwd(), 'resources', 'shared'), driver, '1.0.9', () => undefined)
    const internals = service as unknown as {
      readPersistedInstallationId: () => Promise<string | undefined>
    }
    internals.readPersistedInstallationId = vi.fn().mockRejectedValue(Object.assign(new Error('access denied'), { code: 'EACCES' }))

    const status = await service.restore(true)

    expect(driver.restore).toHaveBeenCalledWith(false, undefined)
    expect(localizedStatus(status)).toMatchObject({
      phase: 'stopped',
      lastError: 'access denied',
      message: expect.stringContaining('未自动重启 Codex')
    })
    await rm(root, { recursive: true, force: true })
  })

  it('falls back to configuration-only restore when the saved Windows installation changed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-restore-old-windows-installation-'))
    const driver = createDriver()
    const oldInstallationId = 'OpenAI.Codex_old'
    vi.mocked(driver.restore)
      .mockRejectedValueOnce(new CodexInstallationIdentityError('Saved Codex session belongs to another installation.'))
      .mockResolvedValueOnce({
        configRestored: true,
        backupArchive: { status: 'succeeded' },
        restart: { status: 'not-requested' }
      })
    const service = new CodexService({ root, themesRoot: join(root, 'themes') } as never, join(process.cwd(), 'resources', 'shared'), driver, '1.0.9', () => undefined)
    await mkdir(join(root, 'runtime'), { recursive: true })
    await writeFile(join(root, 'runtime', 'session.json'), `${JSON.stringify({
      version: 2,
      themeId: '11111111-1111-4111-8111-111111111111',
      port: 9335,
      browserId: 'browser-old',
      platform: 'win32',
      installationId: oldInstallationId
    })}\n`)

    const status = await service.restore(true)

    expect(driver.restore).toHaveBeenNthCalledWith(1, true, oldInstallationId)
    expect(driver.restore).toHaveBeenNthCalledWith(2, false)
    expect(localizedStatus(status)).toMatchObject({
      phase: 'stopped',
      backupAvailable: false,
      message: expect.stringContaining('安装身份已失效')
    })
    await rm(root, { recursive: true, force: true })
  })

  it('commits platform restore even when session cleanup fails and ignores the residue after restart', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-restore-cleanup-failure-'))
    const driver = createDriver()
    const themeId = '11111111-1111-4111-8111-111111111111'
    const installationId = detection.installationId
    const service = new CodexService({ root, themesRoot: join(root, 'themes') } as never, join(process.cwd(), 'resources', 'shared'), driver, '1.0.9', () => undefined)
    const internals = service as unknown as {
      retirePersistedSession: () => Promise<void>
    }
    internals.retirePersistedSession = vi.fn().mockRejectedValue(new Error('session cleanup denied'))
    await mkdir(join(root, 'runtime'), { recursive: true })
    await writeFile(join(root, 'runtime', 'session.json'), `${JSON.stringify({
      version: 2,
      themeId,
      port: 9335,
      browserId: 'browser-old',
      platform: 'win32',
      installationId
    })}\n`)

    const status = await service.restore(true)

    expect(driver.restore).toHaveBeenCalledOnce()
    expect(driver.restore).toHaveBeenCalledWith(true, installationId)
    expect(localizedStatus(status)).toMatchObject({
      phase: 'stopped',
      backupAvailable: false,
      lastError: 'session cleanup denied',
      message: expect.stringContaining('运行会话记录清理失败')
    })
    await expect(readFile(join(root, 'runtime', 'session.json'), 'utf8')).resolves.toContain(themeId)
    await expect(readFile(join(root, 'runtime', 'session.restore-completed.json'), 'utf8')).resolves.toContain('sha256:')

    const restartedDriver = createDriver()
    vi.mocked(restartedDriver.detect).mockResolvedValue({ ...detection, running: true, backupAvailable: false })
    const restartedService = new CodexService({ root, themesRoot: join(root, 'themes') } as never, join(process.cwd(), 'resources', 'shared'), restartedDriver, '1.0.9', () => undefined)
    await restartedService.resume()

    expect(restartedDriver.verifySession).not.toHaveBeenCalled()
    expect(restartedService.getStatus()).toMatchObject({ phase: 'ready', backupAvailable: false })
    await expect(readFile(join(root, 'runtime', 'session.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(root, 'runtime', 'session.restore-completed.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    await rm(root, { recursive: true, force: true })
  })

  it('verifies a valid active session even when its configuration backup is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-session-without-backup-'))
    const themeId = '11111111-1111-4111-8111-111111111111'
    const store = {
      root,
      themesRoot: join(root, 'themes'),
      get: vi.fn().mockResolvedValue({ id: themeId })
    }
    const driver = createDriver()
    const activeSession: CodexStartResult = {
      port: 9335,
      browserId: 'browser-active',
      version: detection.version,
      platform: 'win32',
      installationId: detection.installationId
    }
    vi.mocked(driver.detect).mockResolvedValue({ ...detection, running: true, backupAvailable: false })
    vi.mocked(driver.verifySession).mockResolvedValue(activeSession)
    const service = new CodexService(store as never, join(process.cwd(), 'resources', 'shared'), driver, '1.0.9', () => undefined)
    const internals = service as unknown as {
      buildPayload: () => Promise<{ script: string; version: string }>
      replaceWatcher: () => Promise<{ connected: boolean; targetCount: number }>
    }
    internals.buildPayload = vi.fn().mockResolvedValue({ script: 'true', version: 'studio-0123456789abcdef01234567' })
    internals.replaceWatcher = vi.fn().mockResolvedValue({ connected: true, targetCount: 1 })
    await mkdir(join(root, 'runtime'), { recursive: true })
    await writeFile(join(root, 'runtime', 'session.json'), `${JSON.stringify({
      version: 2,
      themeId,
      port: activeSession.port,
      browserId: activeSession.browserId,
      platform: activeSession.platform,
      installationId: activeSession.installationId
    })}\n`)

    await service.resume()

    expect(driver.verifySession).toHaveBeenCalledWith(
      activeSession.port,
      activeSession.browserId,
      expect.objectContaining({ backupAvailable: false }),
      activeSession.installationId
    )
    expect(localizedStatus(service.getStatus())).toMatchObject({ phase: 'active', backupAvailable: false })
    await expect(readFile(join(root, 'runtime', 'session.json'), 'utf8')).resolves.toContain(themeId)
    await rm(root, { recursive: true, force: true })
  })

  it('persists the new active theme after a successful reinjection', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-reinject-session-'))
    const oldThemeId = '11111111-1111-4111-8111-111111111111'
    const newThemeId = '22222222-2222-4222-8222-222222222222'
    const store = {
      root,
      themesRoot: join(root, 'themes'),
      getRuntimeMediaBindings: vi.fn().mockResolvedValue([])
    }
    const service = new CodexService(store as never, join(process.cwd(), 'resources', 'shared'), createDriver(), '1.0.8', () => undefined)
    const payload = { script: 'true', version: 'studio-0123456789abcdef01234567' }
    const watcher = {
      setPayload: vi.fn(),
      setMediaBindings: vi.fn(),
      inject: vi.fn().mockResolvedValue({ connected: true, targetCount: 2 })
    }
    const activeSession: CodexStartResult = {
      port: 9335,
      browserId: 'browser-1',
      version: detection.version,
      platform: 'win32',
      installationId: detection.installationId
    }
    const internals = service as unknown as {
      watcher: typeof watcher
      activeThemeId: string
      activeSession: CodexStartResult
      activePayload: typeof payload
      activeMediaBindings: []
      sessionGeneration: number
      activeSessionGeneration: number
      buildPayload: (id: string) => Promise<typeof payload>
      writeRuntimePayload: (script: string) => Promise<void>
    }
    internals.watcher = watcher
    internals.activeThemeId = oldThemeId
    internals.activeSession = activeSession
    internals.activePayload = payload
    internals.activeMediaBindings = []
    internals.sessionGeneration = 1
    internals.activeSessionGeneration = 1
    internals.buildPayload = vi.fn().mockResolvedValue(payload)
    internals.writeRuntimePayload = vi.fn().mockResolvedValue(undefined)

    await service.reinject(newThemeId)

    expect(internals.activeThemeId).toBe(newThemeId)
    expect(internals.activeSessionGeneration).toBe(2)
    expect(JSON.parse(await readFile(join(root, 'runtime', 'session.json'), 'utf8'))).toEqual({
      version: 2,
      themeId: newThemeId,
      port: 9335,
      browserId: 'browser-1',
      platform: 'win32',
      installationId: detection.installationId
    })
    await rm(root, { recursive: true, force: true })
  })

  it('keeps the old watcher recoverable when reinjection fails before changing runtime state', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-reinject-build-failure-'))
    const themeId = '11111111-1111-4111-8111-111111111111'
    const payload = { script: 'old', version: 'studio-0123456789abcdef01234567' }
    const service = new CodexService({ root, themesRoot: join(root, 'themes') } as never, join(process.cwd(), 'resources', 'shared'), createDriver(), '1.0.9', () => undefined)
    const activeSession: CodexStartResult = {
      port: 9335,
      browserId: 'browser-1',
      version: detection.version,
      platform: 'win32',
      installationId: detection.installationId
    }
    const internals = service as unknown as {
      watcher: object
      activeThemeId: string
      activeSession: CodexStartResult
      activePayload: typeof payload
      sessionGeneration: number
      activeSessionGeneration: number
      buildPayload: () => Promise<never>
    }
    internals.watcher = {}
    internals.activeThemeId = themeId
    internals.activeSession = activeSession
    internals.activePayload = payload
    internals.sessionGeneration = 1
    internals.activeSessionGeneration = 1
    internals.buildPayload = vi.fn().mockRejectedValue(new Error('compile failed'))

    await expect(service.reinject(themeId)).rejects.toThrow('compile failed')

    expect(internals.activeThemeId).toBe(themeId)
    expect(internals.activeSessionGeneration).toBe(2)
    expect(localizedStatus(service.getStatus())).toMatchObject({
      phase: 'active',
      lastError: 'compile failed',
      message: '重新注入失败，原主题会话仍在运行'
    })
    expect(service.isActive()).toBe(true)
    await rm(root, { recursive: true, force: true })
  })

  it('rolls back DOM, payload, theme state, and session when reinjection persistence fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-reinject-rollback-'))
    const oldThemeId = '11111111-1111-4111-8111-111111111111'
    const newThemeId = '22222222-2222-4222-8222-222222222222'
    const oldPayload = { script: 'old', version: 'studio-0123456789abcdef01234567' }
    const newPayload = { script: 'new', version: 'studio-89abcdef0123456701234567' }
    const oldBindings = [{ role: 'hero' as const, path: 'C:\\themes\\old.mp4', mimeType: 'video/mp4' }]
    const newBindings = [{ role: 'windowBackground' as const, path: 'C:\\themes\\new.mp4', mimeType: 'video/mp4' }]
    const store = {
      root,
      themesRoot: join(root, 'themes'),
      getRuntimeMediaBindings: vi.fn().mockResolvedValue(newBindings)
    }
    const service = new CodexService(store as never, join(process.cwd(), 'resources', 'shared'), createDriver(), '1.0.9', () => undefined)
    const watcher = {
      setPayload: vi.fn(),
      setMediaBindings: vi.fn(),
      inject: vi.fn().mockResolvedValue({ connected: true, targetCount: 1 }),
      stop: vi.fn()
    }
    const activeSession: CodexStartResult = {
      port: 9335,
      browserId: 'browser-1',
      version: detection.version,
      platform: 'win32',
      installationId: detection.installationId
    }
    const internals = service as unknown as {
      watcher: typeof watcher
      activeThemeId: string
      activeSession: CodexStartResult
      activePayload: typeof oldPayload
      activeMediaBindings: typeof oldBindings
      sessionGeneration: number
      activeSessionGeneration: number
      buildPayload: () => Promise<typeof newPayload>
      writeRuntimePayload: (script: string) => Promise<void>
      writeSession: (id: string, session: CodexStartResult) => Promise<void>
    }
    internals.watcher = watcher
    internals.activeThemeId = oldThemeId
    internals.activeSession = activeSession
    internals.activePayload = oldPayload
    internals.activeMediaBindings = oldBindings
    internals.sessionGeneration = 1
    internals.activeSessionGeneration = 1
    internals.buildPayload = vi.fn().mockResolvedValue(newPayload)
    internals.writeRuntimePayload = vi.fn().mockResolvedValue(undefined)
    const writeSession = internals.writeSession.bind(service)
    await writeSession(oldThemeId, activeSession)
    internals.writeSession = vi.fn()
      .mockRejectedValueOnce(new Error('session write failed'))
      .mockImplementation(writeSession)

    await expect(service.reinject(newThemeId)).rejects.toThrow('session write failed')

    expect(internals.writeRuntimePayload).toHaveBeenNthCalledWith(1, newPayload.script)
    expect(internals.writeRuntimePayload).toHaveBeenNthCalledWith(2, oldPayload.script)
    expect(watcher.setPayload).toHaveBeenNthCalledWith(1, newPayload.script, newPayload.version)
    expect(watcher.setPayload).toHaveBeenNthCalledWith(2, oldPayload.script, oldPayload.version)
    expect(watcher.setMediaBindings).toHaveBeenNthCalledWith(1, newBindings)
    expect(watcher.setMediaBindings).toHaveBeenNthCalledWith(2, oldBindings)
    expect(watcher.inject).toHaveBeenCalledTimes(2)
    expect(internals.activeThemeId).toBe(oldThemeId)
    expect(internals.activePayload).toEqual(oldPayload)
    expect(internals.activeSessionGeneration).toBe(2)
    expect(localizedStatus(service.getStatus())).toMatchObject({ phase: 'active', message: '重新注入失败，已恢复原主题会话' })
    expect(JSON.parse(await readFile(join(root, 'runtime', 'session.json'), 'utf8'))).toMatchObject({ themeId: oldThemeId })
    await rm(root, { recursive: true, force: true })
  })

  it('verifies and migrates a legacy Windows session before reconnecting', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-session-v1-'))
    const themeId = '11111111-1111-4111-8111-111111111111'
    const store = { root, themesRoot: join(root, 'themes'), get: vi.fn().mockResolvedValue({ id: themeId }) } as never
    const driver = createDriver()
    vi.mocked(driver.detect).mockResolvedValue(detection)
    vi.mocked(driver.verifySession).mockResolvedValue({
      port: 9335,
      browserId: 'browser-1',
      version: detection.version,
      platform: 'win32',
      installationId: detection.installationId
    })
    const service = new CodexService(store, join(process.cwd(), 'resources', 'shared'), driver, '1.0.8', () => undefined)
    ;(service as unknown as { buildPayload: () => Promise<{ script: string; version: string }> }).buildPayload = vi.fn().mockResolvedValue({ script: 'true', version: 'studio-0123456789abcdef01234567' })
    ;(service as unknown as { replaceWatcher: () => Promise<{ connected: boolean; targetCount: number }> }).replaceWatcher = vi.fn().mockResolvedValue({ connected: true, targetCount: 1 })
    await mkdir(join(root, 'runtime'), { recursive: true })
    await writeFile(join(root, 'runtime', 'session.json'), `${JSON.stringify({ version: 1, themeId, port: 9335, browserId: 'browser-1' })}\n`)

    await service.resume()

    expect(driver.verifySession).toHaveBeenCalledWith(9335, 'browser-1', detection)
    expect(JSON.parse(await readFile(join(root, 'runtime', 'session.json'), 'utf8'))).toEqual({
      version: 2,
      themeId,
      port: 9335,
      browserId: 'browser-1',
      platform: 'win32',
      installationId: detection.installationId
    })
    await rm(root, { recursive: true, force: true })
  })

  it('does not start a watcher when legacy session migration cannot be persisted', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-session-migration-failure-'))
    const themeId = '11111111-1111-4111-8111-111111111111'
    const store = { root, themesRoot: join(root, 'themes'), get: vi.fn().mockResolvedValue({ id: themeId }) } as never
    const driver = createDriver()
    vi.mocked(driver.detect).mockResolvedValue(detection)
    vi.mocked(driver.verifySession).mockResolvedValue({
      port: 9335,
      browserId: 'browser-1',
      version: detection.version,
      platform: 'win32',
      installationId: detection.installationId
    })
    const service = new CodexService(store, join(process.cwd(), 'resources', 'shared'), driver, '1.0.9', () => undefined)
    const replaceWatcher = vi.fn().mockResolvedValue({ connected: true, targetCount: 1 })
    const internals = service as unknown as {
      watcher: object | null
      activeThemeId: string | null
      buildPayload: () => Promise<{ script: string; version: string }>
      replaceWatcher: typeof replaceWatcher
      writeSession: () => Promise<void>
    }
    internals.buildPayload = vi.fn().mockResolvedValue({ script: 'true', version: 'studio-0123456789abcdef01234567' })
    internals.replaceWatcher = replaceWatcher
    internals.writeSession = vi.fn().mockRejectedValue(new Error('disk full'))
    await mkdir(join(root, 'runtime'), { recursive: true })
    await writeFile(join(root, 'runtime', 'session.json'), `${JSON.stringify({ version: 1, themeId, port: 9335, browserId: 'browser-1' })}\n`)

    await service.resume()

    expect(replaceWatcher).not.toHaveBeenCalled()
    expect(internals.watcher).toBeNull()
    expect(internals.activeThemeId).toBeNull()
    expect(service.isActive()).toBe(false)
    await expect(readFile(join(root, 'runtime', 'session.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    await rm(root, { recursive: true, force: true })
  })

  it('verifies and migrates the exact legacy macOS installation identifier', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-session-macos-legacy-'))
    const themeId = '11111111-1111-4111-8111-111111111111'
    const macDetection = {
      ...detection,
      platform: 'darwin' as const,
      distribution: 'mac-app-bundle' as const,
      executable: '/Applications/Codex.app/Contents/MacOS/Codex',
      installationId: 'com.openai.codex:2DC432GLL2:/Applications/Codex.app'
    }
    const store = { root, themesRoot: join(root, 'themes'), get: vi.fn().mockResolvedValue({ id: themeId }) } as never
    const driver = createDriver('darwin')
    vi.mocked(driver.detect).mockResolvedValue(macDetection)
    vi.mocked(driver.verifySession).mockResolvedValue({
      port: 9335,
      browserId: 'browser-1',
      version: macDetection.version,
      platform: 'darwin',
      installationId: macDetection.installationId
    })
    const service = new CodexService(store, join(process.cwd(), 'resources', 'shared'), driver, '1.0.9', () => undefined)
    ;(service as unknown as { buildPayload: () => Promise<{ script: string; version: string }> }).buildPayload = vi.fn().mockResolvedValue({ script: 'true', version: 'studio-0123456789abcdef01234567' })
    ;(service as unknown as { replaceWatcher: () => Promise<{ connected: boolean; targetCount: number }> }).replaceWatcher = vi.fn().mockResolvedValue({ connected: true, targetCount: 1 })
    await mkdir(join(root, 'runtime'), { recursive: true })
    await writeFile(join(root, 'runtime', 'session.json'), `${JSON.stringify({
      version: 2,
      themeId,
      port: 9335,
      browserId: 'browser-1',
      platform: 'darwin',
      installationId: 'com.openai.codex:2DC432GLL2'
    })}\n`)

    await service.resume()

    expect(driver.verifySession).toHaveBeenCalledWith(9335, 'browser-1', macDetection, macDetection.installationId)
    expect(JSON.parse(await readFile(join(root, 'runtime', 'session.json'), 'utf8'))).toEqual({
      version: 2,
      themeId,
      port: 9335,
      browserId: 'browser-1',
      platform: 'darwin',
      installationId: macDetection.installationId
    })
    await rm(root, { recursive: true, force: true })
  })

  it('verifies a path-scoped macOS session against its saved app instead of the detected copy', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-session-macos-path-'))
    const themeId = '11111111-1111-4111-8111-111111111111'
    const detectedInstallationId = 'com.openai.codex:2DC432GLL2:/Applications/Codex.app'
    const savedInstallationId = 'com.openai.codex:2DC432GLL2:/Volumes/Codex Preview/Codex.app'
    const macDetection = {
      ...detection,
      platform: 'darwin' as const,
      distribution: 'mac-app-bundle' as const,
      executable: '/Applications/Codex.app/Contents/MacOS/Codex',
      installationId: detectedInstallationId
    }
    const store = { root, themesRoot: join(root, 'themes'), get: vi.fn().mockResolvedValue({ id: themeId }) } as never
    const driver = createDriver('darwin')
    vi.mocked(driver.detect).mockResolvedValue(macDetection)
    vi.mocked(driver.verifySession).mockResolvedValue({
      port: 9335,
      browserId: 'browser-mounted',
      version: macDetection.version,
      platform: 'darwin',
      installationId: savedInstallationId
    })
    const service = new CodexService(store, join(process.cwd(), 'resources', 'shared'), driver, '1.0.9', () => undefined)
    ;(service as unknown as { buildPayload: () => Promise<{ script: string; version: string }> }).buildPayload = vi.fn().mockResolvedValue({ script: 'true', version: 'studio-0123456789abcdef01234567' })
    ;(service as unknown as { replaceWatcher: () => Promise<{ connected: boolean; targetCount: number }> }).replaceWatcher = vi.fn().mockResolvedValue({ connected: true, targetCount: 1 })
    await mkdir(join(root, 'runtime'), { recursive: true })
    await writeFile(join(root, 'runtime', 'session.json'), `${JSON.stringify({
      version: 2,
      themeId,
      port: 9335,
      browserId: 'browser-mounted',
      platform: 'darwin',
      installationId: savedInstallationId
    })}\n`)

    await service.resume()

    expect(driver.verifySession).toHaveBeenCalledWith(9335, 'browser-mounted', macDetection, savedInstallationId)
    expect(localizedStatus(service.getStatus())).toMatchObject({ phase: 'active', port: 9335 })
    expect(JSON.parse(await readFile(join(root, 'runtime', 'session.json'), 'utf8'))).toMatchObject({
      themeId,
      installationId: savedInstallationId
    })
    await rm(root, { recursive: true, force: true })
  })

  it('rejects any other legacy macOS installation identifier before opening CDP', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-session-macos-rejected-'))
    const themeId = '11111111-1111-4111-8111-111111111111'
    const macDetection = {
      ...detection,
      platform: 'darwin' as const,
      distribution: 'mac-app-bundle' as const,
      executable: '/Applications/Codex.app/Contents/MacOS/Codex',
      installationId: 'com.openai.codex:2DC432GLL2:/Applications/Codex.app'
    }
    const store = { root, themesRoot: join(root, 'themes'), get: vi.fn() }
    const driver = createDriver('darwin')
    vi.mocked(driver.detect).mockResolvedValue(macDetection)
    const service = new CodexService(store as never, join(process.cwd(), 'resources', 'shared'), driver, '1.0.9', () => undefined)
    await mkdir(join(root, 'runtime'), { recursive: true })
    await writeFile(join(root, 'runtime', 'session.json'), `${JSON.stringify({
      version: 2,
      themeId,
      port: 9335,
      browserId: 'browser-1',
      platform: 'darwin',
      installationId: 'com.openai.codex:WRONGTEAM'
    })}\n`)

    await service.resume()

    expect(driver.verifySession).not.toHaveBeenCalled()
    expect(store.get).not.toHaveBeenCalled()
    await expect(readFile(join(root, 'runtime', 'session.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    await rm(root, { recursive: true, force: true })
  })

  it('rejects a saved session from another platform before opening CDP', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-session-platform-'))
    const themeId = '11111111-1111-4111-8111-111111111111'
    const store = { root, themesRoot: join(root, 'themes'), get: vi.fn() } as never
    const driver = createDriver()
    vi.mocked(driver.detect).mockResolvedValue(detection)
    const service = new CodexService(store, join(process.cwd(), 'resources', 'shared'), driver, '1.0.8', () => undefined)
    await mkdir(join(root, 'runtime'), { recursive: true })
    await writeFile(join(root, 'runtime', 'session.json'), `${JSON.stringify({ version: 2, themeId, port: 9335, browserId: 'browser-1', platform: 'darwin', installationId: 'com.openai.codex' })}\n`)

    await service.resume()

    expect(driver.verifySession).not.toHaveBeenCalled()
    await expect(readFile(join(root, 'runtime', 'session.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    await rm(root, { recursive: true, force: true })
  })

})
