import type { ThemeProfile, ThemeSummary } from './theme'

export interface AppInfo {
  version: string
  platform: NodeJS.Platform
}

export interface ImportedAsset {
  relativePath: string
  dataUrl: string
  mediaType: string
  originalName: string
}

export interface CompiledTheme {
  css: string
  rendererPayload: string
  assets: Record<string, string>
}

export type AssetPurpose = 'hero' | 'polaroid' | 'icon'

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
  }
  assets: {
    selectImage: (themeId: string, purpose: Exclude<AssetPurpose, 'icon'>) => Promise<ImportedAsset | null>
    selectIcon: (themeId: string) => Promise<ImportedAsset | null>
  }
}
