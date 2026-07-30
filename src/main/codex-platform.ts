import type { CodexDetection, SupportedDesktopPlatform } from '../shared/contracts'

export class CodexInstallationIdentityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CodexInstallationIdentityError'
  }
}

export interface CodexStartResult {
  port: number
  browserId: string
  version: string
  platform: SupportedDesktopPlatform
  installationId: string
}

export interface CodexPlatformDriver {
  readonly platform: SupportedDesktopPlatform
  detect: () => Promise<CodexDetection>
  applyConfig: (themePath: string) => Promise<void>
  start: (preferredPort: number, restartExisting: boolean, expectedInstallationId?: string) => Promise<CodexStartResult>
  verifySession: (port: number, browserId: string, detection: CodexDetection, expectedInstallationId?: string) => Promise<CodexStartResult>
  restore: (restartCodex: boolean, expectedInstallationId?: string) => Promise<void>
}

export function isSupportedDesktopPlatform(platform: NodeJS.Platform): platform is SupportedDesktopPlatform {
  return platform === 'win32' || platform === 'darwin'
}
