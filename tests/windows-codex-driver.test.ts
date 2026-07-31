import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { runPowerShellMock } = vi.hoisted(() => ({ runPowerShellMock: vi.fn() }))

vi.mock('../src/main/powershell', () => ({ runPowerShell: runPowerShellMock }))

import { WindowsCodexDriver } from '../src/main/windows-codex-driver'
import { CodexInstallationIdentityError } from '../src/main/codex-platform'

const windowsDetection = {
  found: true,
  version: '26.715.2305.0',
  executable: 'C:\\Program Files\\WindowsApps\\OpenAI.Codex\\app\\ChatGPT.exe',
  packageFamilyName: 'OpenAI.Codex_test',
  running: true,
  backupAvailable: true
}

describe('WindowsCodexDriver', () => {
  beforeEach(() => runPowerShellMock.mockReset())

  it('maps the Store identity into the platform-neutral detection contract', async () => {
    runPowerShellMock.mockResolvedValueOnce(windowsDetection)
    const driver = new WindowsCodexDriver('C:\\Studio', 'C:\\Resources')

    await expect(driver.detect()).resolves.toEqual({
      found: true,
      platform: 'win32',
      distribution: 'windows-store',
      version: windowsDetection.version,
      executable: windowsDetection.executable,
      installationId: windowsDetection.packageFamilyName,
      running: true,
      backupAvailable: true
    })
    expect(runPowerShellMock).toHaveBeenCalledWith(
      join('C:\\Resources', 'studio-bridge.ps1'),
      ['-Action', 'Detect', '-StudioRoot', 'C:\\Studio'],
      undefined
    )
  })

  it('reuses the verified endpoint without requesting a process restart', async () => {
    const driver = new WindowsCodexDriver('C:\\Studio', 'C:\\Resources')
    const detection = {
      found: true,
      platform: 'win32' as const,
      distribution: 'windows-store' as const,
      version: windowsDetection.version,
      executable: windowsDetection.executable,
      installationId: windowsDetection.packageFamilyName,
      running: true,
      backupAvailable: true
    }
    runPowerShellMock.mockResolvedValueOnce({ port: 9335, browserId: 'browser-1', version: windowsDetection.version })

    await expect(driver.verifySession(9335, 'browser-1', detection)).resolves.toEqual({
      port: 9335,
      browserId: 'browser-1',
      version: windowsDetection.version,
      platform: 'win32',
      installationId: windowsDetection.packageFamilyName
    })
    expect(runPowerShellMock).toHaveBeenCalledWith(
      join('C:\\Resources', 'studio-bridge.ps1'),
      ['-Action', 'Start', '-StudioRoot', 'C:\\Studio', '-Port', '9335'],
      10_000
    )
  })

  it('rejects stopped or mismatched saved sessions', async () => {
    const driver = new WindowsCodexDriver('C:\\Studio', 'C:\\Resources')
    const detection = {
      found: true,
      platform: 'win32' as const,
      distribution: 'windows-store' as const,
      version: windowsDetection.version,
      executable: windowsDetection.executable,
      installationId: windowsDetection.packageFamilyName,
      running: false,
      backupAvailable: true
    }
    await expect(driver.verifySession(9335, 'browser-1', detection)).rejects.toThrow('保存的 Codex 会话已不再运行。')
    expect(runPowerShellMock).not.toHaveBeenCalled()

    runPowerShellMock.mockResolvedValueOnce({ port: 9335, browserId: 'browser-2', version: windowsDetection.version })
    await expect(driver.verifySession(9335, 'browser-1', { ...detection, running: true })).rejects.toThrow('保存的 Codex 浏览器身份不再匹配。')
  })

  it('marks a changed installation as safe for configuration-only restore fallback', async () => {
    const driver = new WindowsCodexDriver('C:\\Studio', 'C:\\Resources')
    runPowerShellMock.mockResolvedValueOnce(windowsDetection)

    await expect(driver.restore(true, 'OpenAI.Codex_old')).rejects.toBeInstanceOf(CodexInstallationIdentityError)

    expect(runPowerShellMock).toHaveBeenCalledOnce()
  })

  it('reports configuration restore and restart outcomes independently', async () => {
    const driver = new WindowsCodexDriver('C:\\Studio', 'C:\\Resources')
    runPowerShellMock
      .mockResolvedValueOnce({
        restored: false,
        archiveCompleted: false,
        archiveError: null,
        backupAvailable: false,
        restarted: false,
        restartError: null
      })
      .mockResolvedValueOnce({
        restored: true,
        archiveCompleted: false,
        archiveError: 'Backup archive failed',
        backupAvailable: true,
        restarted: false,
        restartError: 'Codex launch failed'
      })

    await expect(driver.restore(true)).resolves.toEqual({
      configRestored: false,
      backupArchive: { status: 'not-attempted' },
      restart: { status: 'not-requested' }
    })
    await expect(driver.restore(true)).resolves.toEqual({
      configRestored: true,
      backupArchive: { status: 'failed', error: 'Backup archive failed', backupAvailable: true },
      restart: { status: 'failed', error: 'Codex launch failed' }
    })
  })

  it('keeps restore and restart outcomes separate in the packaged PowerShell bridge', async () => {
    const bridge = await readFile(join(process.cwd(), 'resources', 'windows', 'studio-bridge.ps1'), 'utf8')
    const restoreBlock = bridge.slice(bridge.indexOf("if ($Action -eq 'Restore')"))
    const restartGuard = 'if ($RestartCodex -and $restored)'
    const configBlock = restoreBlock.slice(0, restoreBlock.indexOf(restartGuard))

    expect(restoreBlock).toContain('$restored = $false')
    expect(restoreBlock).toContain('$archiveCompleted = $false')
    expect(restoreBlock).toContain('$archiveError = $null')
    expect(restoreBlock).toContain('$backupAvailable = $false')
    expect(restoreBlock).toContain('$restarted = $false')
    expect(restoreBlock).toContain('$restartError = $null')
    expect(configBlock.indexOf('$restored = $true')).toBeLessThan(configBlock.indexOf('Archive-DreamSkinConfigBackup'))
    expect(configBlock).toMatch(/try\s*\{[\s\S]*Archive-DreamSkinConfigBackup[\s\S]*\$archiveCompleted = \$true[\s\S]*\}\s*catch\s*\{\s*\$archiveError = \$_\.Exception\.Message/)
    expect(configBlock).toContain('Test-Path -LiteralPath $paths.Backup -PathType Leaf -ErrorAction Stop')
    expect(restoreBlock).toContain(restartGuard)
    expect(restoreBlock).toMatch(/catch\s*\{\s*\$restartError = \$_\.Exception\.Message\s*\}/)
    expect(restoreBlock).toMatch(/restored = \$restored\s+archiveCompleted = \$archiveCompleted\s+archiveError = \$archiveError\s+backupAvailable = \$backupAvailable\s+restarted = \$restarted\s+restartError = \$restartError/)
  })
})
