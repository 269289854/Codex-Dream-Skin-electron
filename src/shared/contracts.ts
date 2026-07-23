import type { CreateThemeInput, MediaReference, ThemeProfile, ThemeSummary } from './theme'
import type { ImportedFontFormat } from './typography'

export interface AppInfo {
  version: string
  platform: NodeJS.Platform
}

export type AppUpdatePhase = 'disabled' | 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'downloaded' | 'error'

export interface AppUpdateStatus {
  phase: AppUpdatePhase
  currentVersion: string
  availableVersion: string | null
  downloadPercent: number | null
  error: string | null
}

export interface ImportedAsset {
  relativePath: string
  dataUrl: string
  mediaType: string
  originalName: string
  width: number
  height: number
}

export interface ImportedMediaAsset {
  reference: MediaReference
  relativePath: string
  previewUrl: string
  originalName: string
  width: number
  height: number
}

export interface VideoAssetInspection {
  width: number
  height: number
  frameRate: number
  duration: number
  codec: string
  bitRate: number | null
  hasAudio: boolean
  highLoad: boolean
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

export interface OperationProgress {
  id: string
  kind: 'media-import' | 'theme-copy' | 'share-export' | 'share-import'
  phase: 'started' | 'copying' | 'validating' | 'optimizing' | 'writing' | 'completed' | 'failed' | 'cancelled'
  processedBytes: number
  totalBytes: number | null
  message: string
}

export type MediaAssetPurpose = 'hero' | 'polaroid' | 'conversationBackground' | 'windowBackground' | 'composerMelody'
export type VideoMediaRole = Exclude<MediaAssetPurpose, 'composerMelody'>
export type AssetPurpose = MediaAssetPurpose | 'icon' | 'font'
export type MediaSelectionKind = 'image' | 'gif' | 'video'

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

export interface StudioApi {
  app: {
    getInfo: () => Promise<AppInfo>
    quit: () => void
    getUpdateStatus: () => Promise<AppUpdateStatus>
    checkForUpdates: () => Promise<AppUpdateStatus>
    downloadUpdate: () => Promise<AppUpdateStatus>
    installUpdate: () => Promise<void>
    subscribeUpdateStatus: (listener: (status: AppUpdateStatus) => void) => () => void
  }
  themes: {
    list: () => Promise<ThemeSummary[]>
    get: (id: string) => Promise<ThemeProfile>
    create: (input: CreateThemeInput) => Promise<ThemeProfile>
    getDefault: (id: string) => Promise<ThemeProfile>
    duplicate: (profile: ThemeProfile, name: string) => Promise<ThemeProfile>
    update: (profile: ThemeProfile) => Promise<ThemeProfile>
    delete: (id: string) => Promise<void>
    activate: (id: string) => Promise<ThemeProfile>
    compile: (id: string) => Promise<CompiledTheme>
  }
  assets: {
    selectImage: (themeId: string, purpose: Exclude<MediaAssetPurpose, 'composerMelody'>) => Promise<ImportedAsset | null>
    selectMedia: (themeId: string, purpose: MediaAssetPurpose, kind?: MediaSelectionKind) => Promise<ImportedMediaAsset | null>
    getPreviewUrl: (themeId: string, asset: string) => Promise<string>
    inspectVideo: (themeId: string, asset: string) => Promise<VideoAssetInspection>
    optimizeVideo: (themeId: string, role: VideoMediaRole, asset: string) => Promise<ImportedMediaAsset>
    selectIcon: (themeId: string) => Promise<ImportedAsset | null>
    selectFont: (themeId: string) => Promise<ImportedFontAsset | null>
  }
  share: {
    exportTheme: (profile: ThemeProfile) => Promise<{ filePath: string } | null>
    importTheme: () => Promise<ThemeProfile | null>
    importThemePath: (path: string) => Promise<ThemeProfile>
  }
  files: {
    getPathForFile: (file: unknown) => string
  }
  operations: {
    cancel: (id: string) => Promise<void>
    subscribeProgress: (listener: (progress: OperationProgress) => void) => () => void
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
