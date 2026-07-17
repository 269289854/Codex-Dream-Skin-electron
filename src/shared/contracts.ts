import type { ThemeProfile, ThemeSummary } from './theme'
import type { ImportedFontFormat } from './typography'

export interface AppInfo {
  version: string
  platform: NodeJS.Platform
}

export interface ImportedAsset {
  relativePath: string
  dataUrl: string
  mediaType: string
  originalName: string
  width: number
  height: number
}

export interface ImportedFontAsset {
  id: string
  relativePath: string
  dataUrl: string
  mediaType: string
  originalName: string
  family: string
  format: ImportedFontFormat
}

export interface CompiledTheme {
  css: string
  rendererPayload: string
  assets: Record<string, string>
}

export type AssetPurpose = 'hero' | 'polaroid' | 'icon' | 'font'

export type RuntimePhase = 'idle' | 'detecting' | 'ready' | 'installing' | 'starting' | 'injecting' | 'active' | 'stopped' | 'restoring' | 'error'

export interface CodexDetection {
  found: boolean
  version: string
  executable: string
  packageFamilyName: string
  running: boolean
  backupAvailable: boolean
}

export interface RuntimeStatus {
  phase: RuntimePhase
  port: number
  connected: boolean
  targetCount: number
  codexVersion: string | null
  backupAvailable: boolean
  lastError: string | null
  message: string
}

export interface PolaroidPlacementUpdate {
  themeId: string
  x: number
  y: number
}

export interface StudioApi {
  app: {
    getInfo: () => Promise<AppInfo>
  }
  themes: {
    list: () => Promise<ThemeSummary[]>
    get: (id: string) => Promise<ThemeProfile>
    create: (name: string) => Promise<ThemeProfile>
    duplicate: (id: string, name: string) => Promise<ThemeProfile>
    update: (profile: ThemeProfile) => Promise<ThemeProfile>
    delete: (id: string) => Promise<void>
    activate: (id: string) => Promise<ThemeProfile>
    compile: (id: string) => Promise<CompiledTheme>
    subscribePolaroidPlacement: (listener: (update: PolaroidPlacementUpdate) => void) => () => void
  }
  assets: {
    selectImage: (themeId: string, purpose: Exclude<AssetPurpose, 'icon' | 'font'>) => Promise<ImportedAsset | null>
    selectIcon: (themeId: string) => Promise<ImportedAsset | null>
    selectFont: (themeId: string) => Promise<ImportedFontAsset | null>
  }
  codex: {
    detect: () => Promise<CodexDetection>
    installTheme: (themeId: string) => Promise<RuntimeStatus>
    start: (themeId: string, restartExisting: boolean) => Promise<RuntimeStatus>
    verify: () => Promise<RuntimeStatus>
    reinject: (themeId: string) => Promise<RuntimeStatus>
    stop: () => Promise<RuntimeStatus>
    restore: (restartCodex: boolean) => Promise<RuntimeStatus>
  }
  runtime: {
    getStatus: () => Promise<RuntimeStatus>
    subscribeStatus: (listener: (status: RuntimeStatus) => void) => () => void
  }
}
