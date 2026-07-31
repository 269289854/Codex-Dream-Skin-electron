import { join } from 'node:path'
import type { CodexDetection } from '../shared/contracts'
import {
  CodexInstallationIdentityError,
  type CodexPlatformDriver,
  type CodexRestoreResult,
  type CodexStartResult
} from './codex-platform'
import { runPowerShell } from './powershell'

interface WindowsDetectionResult {
  found: boolean
  version: string
  executable: string
  packageFamilyName: string
  running: boolean
  backupAvailable: boolean
}

interface WindowsStartResult {
  port: number
  browserId: string
  version: string
}

interface WindowsRestoreResult {
  restored: boolean
  archiveCompleted: boolean
  archiveError: string | null
  backupAvailable: boolean
  restarted: boolean
  restartError: string | null
}

export class WindowsCodexDriver implements CodexPlatformDriver {
  readonly platform = 'win32' as const

  constructor(
    private readonly studioRoot: string,
    private readonly resourcesRoot: string
  ) {}

  async detect(): Promise<CodexDetection> {
    const result = await this.bridge<WindowsDetectionResult>('Detect')
    return {
      found: result.found,
      platform: this.platform,
      distribution: 'windows-store',
      version: result.version,
      executable: result.executable,
      installationId: result.packageFamilyName,
      running: result.running,
      backupAvailable: result.backupAvailable
    }
  }

  async applyConfig(themePath: string): Promise<void> {
    await this.bridge('ApplyConfig', ['-ThemePath', themePath])
  }

  async start(preferredPort: number, restartExisting: boolean, expectedInstallationId?: string): Promise<CodexStartResult> {
    const detection = await this.detect()
    if (expectedInstallationId && expectedInstallationId !== detection.installationId) {
      throw new CodexInstallationIdentityError('Saved Codex session belongs to another installation.')
    }
    const argumentsList = ['-Port', String(preferredPort)]
    if (restartExisting) argumentsList.push('-RestartExisting')
    const result = await this.bridge<WindowsStartResult>('Start', argumentsList, 65_000)
    return this.toStartResult(result, expectedInstallationId ?? detection.installationId)
  }

  async verifySession(port: number, browserId: string, detection: CodexDetection, expectedInstallationId = detection.installationId): Promise<CodexStartResult> {
    if (detection.platform !== this.platform || expectedInstallationId !== detection.installationId || !detection.running) {
      throw new Error('Saved Codex session is no longer running.')
    }
    const result = await this.bridge<WindowsStartResult>('Start', ['-Port', String(port)], 10_000)
    if (result.browserId !== browserId) throw new Error('Saved Codex browser identity no longer matches.')
    return this.toStartResult(result, expectedInstallationId)
  }

  async restore(restartCodex: boolean, expectedInstallationId?: string): Promise<CodexRestoreResult> {
    if (restartCodex && expectedInstallationId) {
      const detection = await this.detect()
      if (expectedInstallationId !== detection.installationId) {
        throw new CodexInstallationIdentityError('Saved Codex session belongs to another installation.')
      }
    }
    const result = await this.bridge<WindowsRestoreResult>('Restore', restartCodex ? ['-RestartCodex'] : [], 65_000)
    return {
      configRestored: result.restored,
      backupArchive: !result.restored
        ? { status: 'not-attempted' }
        : result.archiveCompleted
          ? { status: 'succeeded' }
          : {
              status: 'failed',
              error: result.archiveError || 'Codex configuration backup archive failed.',
              backupAvailable: result.backupAvailable
            },
      restart: !restartCodex || !result.restored
        ? { status: 'not-requested' }
        : result.restarted
          ? { status: 'succeeded' }
          : { status: 'failed', error: result.restartError || 'Codex restart failed.' }
    }
  }

  private toStartResult(result: WindowsStartResult, installationId: string): CodexStartResult {
    return { ...result, platform: this.platform, installationId }
  }

  private bridge<T>(action: string, extra: string[] = [], timeoutMs?: number): Promise<T> {
    return runPowerShell<T>(join(this.resourcesRoot, 'studio-bridge.ps1'), ['-Action', action, '-StudioRoot', this.studioRoot, ...extra], timeoutMs)
  }
}
