import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createDefaultTheme } from '../src/shared/theme'
import { ACCOUNT_MENU_ITEMS } from '../src/shared/account-menu'
import { iconGifPosterAssetKey } from '../src/shared/icon-assets'

const { runPowerShellMock } = vi.hoisted(() => ({ runPowerShellMock: vi.fn() }))

vi.mock('../src/main/powershell', () => ({ runPowerShell: runPowerShellMock }))

import type { CodexPlatformDriver } from '../src/main/codex-platform'
import { CodexService } from '../src/main/codex-service'

const detection = {
  found: true,
  platform: 'win32' as const,
  distribution: 'windows-store' as const,
  version: '26.715.2305.0',
  executable: 'C:\\WindowsApps\\Codex\\app\\ChatGPT.exe',
  installationId: 'OpenAI.Codex_test',
  running: false,
  backupAvailable: false
}

function createService(): CodexService {
  const root = join(tmpdir(), `codex-dream-skin-missing-${process.pid}-${Date.now()}`)
  const store = { root, themesRoot: join(root, 'themes') } as never
  const driver = createDriver()
  return new CodexService(store, join(root, 'resources'), driver, '1.0.5', () => undefined)
}

function createDriver(): CodexPlatformDriver {
  return {
    platform: 'win32',
    detect: vi.fn(() => runPowerShellMock()),
    applyConfig: vi.fn(),
    start: vi.fn(),
    verifySession: vi.fn(),
    restore: vi.fn()
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
    const store = {
      root,
      themesRoot: join(root, 'themes'),
      get: vi.fn().mockResolvedValue(profile),
      compile: vi.fn().mockResolvedValue({ assets: { 'assets/composer.gif': 'data:image/gif;base64,AA==', 'assets/window.png': 'data:image/png;base64,AA==', 'assets/account-menu.gif': 'data:image/gif;base64,AQ==', 'assets/search.gif': 'data:image/gif;base64,Ag==', [searchPosterKey]: 'data:image/png;base64,Aw==' } })
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
    expect(first.script).toContain('"dataUrl":"data:image/gif;base64,AA=="')
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
    expect(first.script).toContain('"asset":"assets/account-menu.gif","dataUrl":"data:image/gif;base64,AQ=="')
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

  it('repairs a stale runtime during manual verification', async () => {
    const service = createService()
    const watcher = {
      verify: vi.fn().mockResolvedValue({ connected: false, targetCount: 1 }),
      inject: vi.fn().mockResolvedValue({ connected: true, targetCount: 1 })
    }
    ;(service as unknown as { watcher: typeof watcher }).watcher = watcher

    await expect(service.verify()).resolves.toMatchObject({
      phase: 'active',
      connected: false,
      targetCount: 0,
      message: '主题已自动修复，共 1 个页面'
    })
    expect(watcher.verify).toHaveBeenCalledTimes(1)
    expect(watcher.inject).toHaveBeenCalledTimes(1)
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
      recoverActiveSessionInternal: (id: string) => Promise<void>
    }
    internals.buildPayload = vi.fn().mockResolvedValue(payload)
    internals.writeRuntimePayload = vi.fn().mockResolvedValue(undefined)
    internals.replaceWatcher = vi.fn().mockImplementation(async () => {
      expect(service.getStatus().port).toBe(9341)
      return { connected: true, targetCount: 1 }
    })

    await internals.recoverActiveSessionInternal(themeId)

    expect(driver.start).toHaveBeenCalledWith(9335, true)
    expect(internals.replaceWatcher).toHaveBeenCalledWith('browser-fallback', payload)
    expect(service.getStatus()).toMatchObject({ phase: 'active', port: 9341 })
    expect(JSON.parse(await readFile(join(root, 'runtime', 'session.json'), 'utf8'))).toMatchObject({
      themeId,
      port: 9341,
      browserId: 'browser-fallback'
    })
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
