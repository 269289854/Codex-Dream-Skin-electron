import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createStudioInstanceData, resolveStudioInstanceAction } from '../src/main/app-lifecycle'

describe('Studio application lifecycle contract', () => {
  it('hands an installed update to the new version exactly once', () => {
    const currentVersion = '1.0.5'
    const updated = createStudioInstanceData('1.0.6')

    expect(resolveStudioInstanceAction(currentVersion, true, updated, false)).toBe('relaunch')
    expect(resolveStudioInstanceAction(currentVersion, true, updated, true)).toBe('ignore')
    expect(resolveStudioInstanceAction(currentVersion, true, createStudioInstanceData(currentVersion), false)).toBe('show')
    expect(resolveStudioInstanceAction(currentVersion, false, updated, false)).toBe('show')
    expect(resolveStudioInstanceAction(currentVersion, true, { ...updated, protocol: 2 }, false)).toBe('show')
    expect(resolveStudioInstanceAction(currentVersion, true, { ...updated, appId: 'other-app' }, false)).toBe('show')
    expect(resolveStudioInstanceAction(currentVersion, true, { ...updated, version: 'invalid' }, false)).toBe('show')
  })

  it('routes direct exit through preload without stopping or restoring Codex', async () => {
    const [main, preload] = await Promise.all([
      readFile(join(process.cwd(), 'src', 'main', 'index.ts'), 'utf8'),
      readFile(join(process.cwd(), 'src', 'preload', 'index.ts'), 'utf8')
    ])
    const quitStudio = main.match(/function quitStudio\(\): void \{[\s\S]*?\n\}/)?.[0]

    expect(preload).toContain("quit: () => ipcRenderer.send('app:quit')")
    expect(main).toContain("ipcMain.on('app:quit', () => quitStudio())")
    expect(main).toContain("label: '退出 Studio（保留当前主题）', click: quitStudio")
    expect(quitStudio).toContain('quitting = true')
    expect(quitStudio).toContain('app.quit()')
    expect(quitStudio).not.toContain('codexService.stop')
    expect(quitStudio).not.toContain('codexService.restore')
  })

  it('relaunches an updated instance without removing the active Codex session', async () => {
    const main = await readFile(join(process.cwd(), 'src', 'main', 'index.ts'), 'utf8')
    const relaunch = main.match(/function relaunchForUpdatedVersion\(\): void \{[\s\S]*?\n\}/)?.[0]

    expect(main).toContain('app.requestSingleInstanceLock(createStudioInstanceData(appVersion))')
    expect(main).toContain("app.on('second-instance', (_event, _argv, _workingDirectory, additionalData) =>")
    expect(relaunch).toContain('if (updatedVersionRelaunching) return')
    expect(relaunch).toContain('appUpdateService?.stop()')
    expect(relaunch).toContain('app.relaunch({ execPath: process.execPath })')
    expect(relaunch).toContain('app.quit()')
    expect(relaunch).not.toContain('codexService.stop')
    expect(relaunch).not.toContain('codexService.restore')
  })

  it('restores minimized windows from every entry point and reveals hidden runtime errors', async () => {
    const main = await readFile(join(process.cwd(), 'src', 'main', 'index.ts'), 'utf8')
    const showWindow = main.match(/function showWindow\(\): void \{[\s\S]*?\r?\n\}/)?.[0]
    const updateTray = main.match(/function updateTray\(\): void \{[\s\S]*?\r?\n\}/)?.[0]

    expect(showWindow).toContain('if (mainWindow?.isMinimized()) mainWindow.restore()')
    expect(showWindow).toContain('mainWindow?.show()')
    expect(showWindow).toContain('mainWindow?.focus()')
    expect(main).toContain("{ label: '显示主题工作台', click: showWindow }")
    expect(main).toContain("else if (action === 'show') showWindow()")
    expect(main).toContain('else showWindow()')
    expect(updateTray).toContain('const shouldRevealRuntimeError = tray !== null')
    expect(updateTray).toContain("codexService.getStatus().phase === 'error'")
    expect(updateTray).toContain('!mainWindow.isVisible()')
    expect(updateTray).toContain('if (shouldRevealRuntimeError) showWindow()')
    expect(updateTray?.indexOf('if (shouldRevealRuntimeError) showWindow()')).toBeLessThan(updateTray?.indexOf('tray?.destroy()') ?? -1)
  })
})
