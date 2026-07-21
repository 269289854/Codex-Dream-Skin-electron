import { createHash, randomUUID } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, open, readFile, readdir, rename, rm, stat, statfs, writeFile } from 'node:fs/promises'
import { createReadStream, createWriteStream } from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createRequire } from 'node:module'
import sharp from 'sharp'
import mediaInfoFactory, { isTrackType } from 'mediainfo.js'
const nodeRequire = createRequire(import.meta.url)
const archiver = nodeRequire('archiver') as typeof import('archiver')
const yauzl = nodeRequire('yauzl') as typeof import('yauzl')
import { createDefaultTheme, createThemeInputSchema, DEFAULT_THEME_COLORS, parseThemeProfile, type ThemeProfile, type ThemeSummary } from '../shared/theme'
import type { AssetPurpose, CompiledTheme, ImportedAsset, ImportedFontAsset, ImportedMediaAsset, MediaSelectionKind } from '../shared/contracts'
import type { ImportedFontFormat } from '../shared/typography'
import { compileTheme } from './theme-compiler'
import { mediaMimeTypeForPath, mediaReferenceForPath } from '../shared/media'
import {
  MAX_SHARE_ENTRIES,
  MAX_SHARE_FONT_BYTES,
  MAX_SHARE_IMAGE_BYTES,
  assetKind,
  assertSharePath,
  collectThemeAssets,
  encodeJson,
  parseThemeShareManifest,
  shareProfileVersionMatches
} from './theme-share'

interface StudioSettings {
  version: 2
  activeThemeId: string
  systemThemeId: string
}

interface LegacyStudioSettings {
  version: 1
  activeThemeId: string
}

interface BundledSystemThemeAssets {
  hero: string
  polaroid: string
}

const MAX_ASSET_BYTES = 30 * 1024 * 1024
const MAX_FONT_BYTES = 12 * 1024 * 1024
const BUNDLED_SYSTEM_ASSETS = new Set(['assets/dream-reference.png', 'assets/dream-polaroid.png'])
const RASTER_EXTENSIONS = new Set(['.png', '.webp', '.jpg', '.jpeg'])
const MEDIA_IMAGE_EXTENSIONS = new Set(['.png', '.webp', '.jpg', '.jpeg', '.gif'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm'])
const FONT_EXTENSIONS = new Set<ImportedFontFormat>(['ttf', 'otf', 'woff', 'woff2'])
const MIN_FREE_BYTES = 10 * 1024 * 1024 * 1024
const MIN_FREE_RATIO = 0.15
const MAX_VIDEO_DIMENSION = 4096
const MAX_SHARE_METADATA_BYTES = 5 * 1024 * 1024

export class ProfileStore {
  readonly themesRoot: string
  private readonly settingsPath: string
  private readonly pendingMediaAssets = new Map<string, Set<string>>()

  constructor(readonly root: string, private readonly bundledSystemAssets?: BundledSystemThemeAssets) {
    this.themesRoot = join(root, 'themes')
    this.settingsPath = join(root, 'settings.json')
  }

  async initialize(): Promise<void> {
    await mkdir(this.themesRoot, { recursive: true })
    let settings: StudioSettings
    try {
      settings = await this.readSettings()
    } catch {
      const profile = await this.createSystemTheme()
      await this.writeSettings({ version: 2, activeThemeId: profile.id, systemThemeId: profile.id })
      return
    }

    const systemExists = await this.get(settings.systemThemeId).then(() => true).catch(() => false)
    const activeExists = settings.activeThemeId === settings.systemThemeId
      ? systemExists
      : await this.get(settings.activeThemeId).then(() => true).catch(() => false)
    if (systemExists && activeExists) return

    const systemThemeId = systemExists ? settings.systemThemeId : (await this.createSystemTheme()).id
    await this.writeSettings({
      version: 2,
      activeThemeId: activeExists ? settings.activeThemeId : systemThemeId,
      systemThemeId
    })
  }

  async list(): Promise<ThemeSummary[]> {
    const settings = await this.readSettings()
    const entries = await readdir(this.themesRoot, { withFileTypes: true })
    const profiles = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
      try { return await this.get(entry.name) } catch { return null }
    }))
    return profiles
      .filter((profile): profile is ThemeProfile => profile !== null)
      .map((profile) => ({ id: profile.id, name: profile.name, updatedAt: profile.updatedAt, active: profile.id === settings.activeThemeId, system: profile.id === settings.systemThemeId }))
      .sort((a, b) => Number(b.system) - Number(a.system) || b.updatedAt.localeCompare(a.updatedAt))
  }

  async get(id: string): Promise<ThemeProfile> {
    this.assertId(id)
    const content = await readFile(join(this.themeRoot(id), 'theme.json'), 'utf8')
    const profile = parseThemeProfile(JSON.parse(content) as unknown)
    if (profile.id !== id) throw new Error('Theme directory does not match its profile ID.')
    return profile
  }

  async create(input: unknown): Promise<ThemeProfile> {
    const request = createThemeInputSchema.parse(typeof input === 'string' ? { name: input, colors: DEFAULT_THEME_COLORS } : input)
    const profile = createDefaultTheme(randomUUID(), request.name, request.colors)
    await this.writeProfile(profile)
    return profile
  }

  async getDefault(id: string): Promise<ThemeProfile> {
    const current = await this.get(id)
    const settings = await this.readSettings()
    const profile = createDefaultTheme(current.id, current.name, current.resetColors)
    if (id === settings.systemThemeId) await this.applyBundledSystemPreset(profile)
    return profile
  }

  async duplicate(input: unknown, name: unknown): Promise<ThemeProfile> {
    const source = parseThemeProfile(input)
    await this.get(source.id)
    await this.validateProfileMedia(source)
    await this.validateProfileAssets(source)
    const duplicate = { ...structuredClone(source), id: randomUUID(), name: this.cleanName(name), updatedAt: new Date().toISOString() }
    const duplicateRoot = this.themeRoot(duplicate.id)
    try {
      await mkdir(this.assetRoot(duplicate.id), { recursive: true })
      for (const asset of this.collectAssets(source)) {
        const sourcePath = this.resolveAsset(source.id, asset)
        const targetPath = this.resolveAsset(duplicate.id, asset)
        const sourceStat = await stat(sourcePath)
        if (!sourceStat.isFile()) throw new Error(`主题素材不存在: ${asset}`)
        await this.assertDiskSpace(duplicateRoot, sourceStat.size)
        await mkdir(dirname(targetPath), { recursive: true })
        await copyFile(sourcePath, targetPath)
      }
      await this.writeProfile(duplicate)
      return duplicate
    } catch (error) {
      await rm(duplicateRoot, { recursive: true, force: true }).catch(() => undefined)
      throw error
    }
  }

  async exportSharePackage(input: unknown, destinationPath: unknown, signal?: AbortSignal): Promise<void> {
    const profile = parseThemeProfile(input)
    await this.get(profile.id)
    await this.validateProfileMedia(profile)
    await this.validateProfileAssets(profile)
    this.throwIfAborted(signal, '主题导出已取消。')
    if (typeof destinationPath !== 'string' || !isAbsolute(destinationPath)) throw new Error('分享包保存路径必须是绝对路径。')
    const sourceAssets = new Map<string, string>()
    const manifestAssets: Array<{ path: string; kind: 'image' | 'video' | 'font'; size: number; sha256: string }> = []
    for (const asset of collectThemeAssets(profile)) {
      this.throwIfAborted(signal, '主题导出已取消。')
      const sourcePath = this.resolveAsset(profile.id, asset)
      const sourceStat = await stat(sourcePath)
      if (!sourceStat.isFile()) throw new Error(`主题素材不存在: ${asset}`)
      const kind = assetKind(asset)
      if (kind === 'image' && sourceStat.size > MAX_SHARE_IMAGE_BYTES) throw new Error('图片素材超过 30 MB 限制。')
      if (kind === 'font' && sourceStat.size > MAX_SHARE_FONT_BYTES) throw new Error('字体素材超过 12 MB 限制。')
      await this.assertDiskSpace(dirname(destinationPath), sourceStat.size)
      sourceAssets.set(asset, sourcePath)
      manifestAssets.push({ path: asset, kind, size: sourceStat.size, sha256: await hashFile(sourcePath, signal) })
    }
    const manifest = {
      format: 'codex-dream-skin-theme',
      version: 2,
      themeName: profile.name,
      profileVersion: profile.version,
      assets: manifestAssets
    }
    parseThemeShareManifest(manifest)
    if (manifestAssets.length + 2 > MAX_SHARE_ENTRIES) throw new Error('分享包条目数量超过限制。')
    const manifestData = encodeJson(manifest)
    const profileData = encodeJson(profile)
    if (manifestData.byteLength + profileData.byteLength > MAX_SHARE_METADATA_BYTES) throw new Error('分享包元数据过大。')
    await this.writeShareArchiveAtomic(destinationPath, sourceAssets, manifestData, profileData, signal)
  }

  async importSharePackage(sourcePath: unknown, signal?: AbortSignal): Promise<ThemeProfile> {
    if (typeof sourcePath !== 'string' || !isAbsolute(sourcePath)) throw new Error('分享包路径必须是绝对路径。')
    if (extname(sourcePath).toLowerCase() !== '.cdstheme') throw new Error('请选择 .cdstheme 分享文件。')
    const sourceStat = await stat(sourcePath)
    if (!sourceStat.isFile()) throw new Error('分享包必须是文件。')
    const temporaryRoot = await mkdtemp(join(this.themesRoot, '.cdstheme-import-'))
    try {
      this.throwIfAborted(signal, '主题导入已取消。')
      const entries = await this.extractShareArchive(sourcePath, sourceStat.size, temporaryRoot, signal)
      this.throwIfAborted(signal, '主题导入已取消。')
      const manifestBytes = await readFile(join(temporaryRoot, 'manifest.json'))
      const themeBytes = await readFile(join(temporaryRoot, 'theme.json'))
      let manifestInput: unknown
      let themeInput: unknown
      try {
        manifestInput = JSON.parse(manifestBytes.toString('utf8')) as unknown
        themeInput = JSON.parse(themeBytes.toString('utf8')) as unknown
      } catch { throw new Error('分享包中的 JSON 文件无效。') }
      const manifest = parseThemeShareManifest(manifestInput)
      const source = parseThemeProfile(themeInput)
      this.validateProfileAssetReferences(source)
      if (manifest.themeName !== source.name || !shareProfileVersionMatches(manifest, themeInput, source.version)) throw new Error('分享包清单与主题配置不一致。')
      const listed = new Map(manifest.assets.map((asset) => [asset.path, asset]))
      const referenced = collectThemeAssets(source)
      if (referenced.length !== listed.size || referenced.some((asset) => !listed.has(asset))) throw new Error('分享包素材清单与主题引用不一致。')
      for (const [path, entry] of entries) {
        this.throwIfAborted(signal, '主题导入已取消。')
        if (path !== 'manifest.json' && path !== 'theme.json' && !listed.has(path)) throw new Error('分享包包含未列出的素材。')
        if (path.startsWith('assets/')) {
          const file = await stat(entry.path)
          if (file.size !== entry.size) throw new Error(`素材大小校验失败: ${path}`)
          const manifestAsset = listed.get(path)
          if (!manifestAsset || manifestAsset.size !== file.size || (await hashFile(entry.path)).toLowerCase() !== manifestAsset.sha256.toLowerCase()) throw new Error(`素材校验失败: ${path}`)
          await this.validateShareAssetFile(path, entry.path, assetKind(path))
        }
      }
      for (const asset of manifest.assets) if (!entries.has(asset.path)) throw new Error(`分享包缺少素材: ${asset.path}`)

      const imported = { ...structuredClone(source), id: randomUUID(), updatedAt: new Date().toISOString(), resetColors: { ...source.colors } }
      const importedRoot = this.themeRoot(imported.id)
      this.throwIfAborted(signal, '主题导入已取消。')
      await this.writeJsonAtomic(join(temporaryRoot, 'theme.json'), imported)
      await rename(temporaryRoot, importedRoot)
      return imported
    } catch (error) {
      await rm(temporaryRoot, { recursive: true, force: true }).catch(() => undefined)
      throw error
    }
  }

  async update(input: unknown): Promise<ThemeProfile> {
    const profile = parseThemeProfile(input)
    await this.get(profile.id)
    await this.validateProfileMedia(profile)
    await this.validateProfileAssets(profile)
    const next = { ...profile, name: this.cleanName(profile.name), updatedAt: new Date().toISOString() }
    for (const asset of this.collectAssets(next)) this.resolveAsset(next.id, asset)
    await this.writeProfile(next)
    return next
  }

  async delete(id: string): Promise<void> {
    const settings = await this.readSettings()
    this.assertId(id)
    if (settings.systemThemeId === id) throw new Error('系统默认主题不能删除。')
    const themes = await this.list()
    if (themes.length <= 1) throw new Error('At least one theme must remain.')
    await rm(this.themeRoot(id), { recursive: true, force: false })
    if (settings.activeThemeId === id) {
      const fallback = themes.find((theme) => theme.id !== id)
      if (!fallback) throw new Error('No fallback theme is available.')
      await this.writeSettings({ ...settings, activeThemeId: fallback.id })
    }
  }

  async activate(id: string): Promise<ThemeProfile> {
    const profile = await this.get(id)
    const settings = await this.readSettings()
    await this.writeSettings({ ...settings, activeThemeId: id })
    return profile
  }

  async importAsset(themeId: string, sourcePath: string, purpose: AssetPurpose): Promise<ImportedAsset> {
    if (purpose === 'font') throw new Error('Fonts must be imported through the font importer.')
    await this.get(themeId)
    if (!isAbsolute(sourcePath)) throw new Error('The selected asset path must be absolute.')
    const sourceStat = await stat(sourcePath)
    if (!sourceStat.isFile() || sourceStat.size > MAX_ASSET_BYTES) throw new Error('Asset must be a file no larger than 30 MB.')

    const extension = extname(sourcePath).toLowerCase()
    if (extension !== '.svg' && !RASTER_EXTENSIONS.has(extension)) throw new Error('Unsupported image format.')
    const outputExtension = extension === '.svg' ? '.png' : extension
    const relativePath = `assets/${purpose}-${randomUUID()}${outputExtension}`
    const destination = this.resolveAsset(themeId, relativePath)
    await mkdir(dirname(destination), { recursive: true })

    if (extension === '.svg') {
      const source = await readFile(sourcePath, 'utf8')
      this.assertSafeSvg(source)
      await sharp(Buffer.from(source)).png().toFile(destination)
    } else {
      await this.inspectImage(sourcePath, extension)
      await copyFile(sourcePath, destination)
    }

    const metadata = await sharp(destination).metadata()
    if (!metadata.width || !metadata.height) throw new Error('Imported image dimensions are unavailable.')
    return {
      relativePath,
      dataUrl: await this.readAssetDataUrl(themeId, relativePath),
      mediaType: this.mediaType(outputExtension),
      originalName: basename(sourcePath),
      width: metadata.width,
      height: metadata.height
    }
  }

  async importFontAsset(themeId: string, sourcePath: string): Promise<ImportedFontAsset> {
    await this.get(themeId)
    if (!isAbsolute(sourcePath)) throw new Error('The selected font path must be absolute.')
    const sourceStat = await stat(sourcePath)
    if (!sourceStat.isFile() || sourceStat.size > MAX_FONT_BYTES) throw new Error('Font must be a file no larger than 12 MB.')

    const extension = extname(sourcePath).toLowerCase().slice(1) as ImportedFontFormat
    if (!FONT_EXTENSIONS.has(extension)) throw new Error('Unsupported font format.')
    const header = await readFile(sourcePath).then((data) => data.subarray(0, 4))
    this.assertFontHeader(extension, header)

    const relativePath = `assets/font-${randomUUID()}.${extension}`
    const destination = this.resolveAsset(themeId, relativePath)
    await mkdir(dirname(destination), { recursive: true })
    await copyFile(sourcePath, destination)
    const originalName = basename(sourcePath)
    const family = basename(sourcePath, extname(sourcePath)).trim().slice(0, 80) || 'Imported font'
    return {
      id: `font-${randomUUID()}`,
      relativePath,
      dataUrl: await this.readAssetDataUrl(themeId, relativePath),
      mediaType: this.fontMediaType(extension),
      originalName,
      family,
      format: extension
    }
  }

  async compile(id: string): Promise<CompiledTheme> {
    const profile = await this.get(id)
    return compileTheme(profile, (asset) => this.readAssetDataUrl(id, asset))
  }

  resolveAsset(themeId: string, asset: string): string {
    this.assertId(themeId)
    if (!asset || isAbsolute(asset) || asset.includes('\\')) throw new Error('Asset path is invalid.')
    const root = resolve(this.themeRoot(themeId))
    const candidate = resolve(root, asset)
    const rel = relative(root, candidate)
    if (!rel || rel.startsWith('..') || isAbsolute(rel) || !rel.startsWith(`assets${requireSeparator()}`)) {
      throw new Error('Asset path escapes the theme directory.')
    }
    return candidate
  }

  private async readAssetDataUrl(themeId: string, asset: string): Promise<string> {
    const path = this.resolveAsset(themeId, asset)
    const data = await readFile(path)
    return `data:${this.mediaType(extname(path).toLowerCase())};base64,${data.toString('base64')}`
  }

  private collectAssets(profile: ThemeProfile): string[] { return collectThemeAssets(profile) }

  private async writeProfile(profile: ThemeProfile): Promise<void> {
    await mkdir(this.assetRoot(profile.id), { recursive: true })
    await this.writeJsonAtomic(join(this.themeRoot(profile.id), 'theme.json'), profile)
  }

  private async readSettings(): Promise<StudioSettings> {
    const parsed = JSON.parse(await readFile(this.settingsPath, 'utf8')) as Partial<StudioSettings> | Partial<LegacyStudioSettings>
    if (parsed.version === 2 && parsed.activeThemeId && parsed.systemThemeId) {
      this.assertId(parsed.activeThemeId)
      this.assertId(parsed.systemThemeId)
      return parsed as StudioSettings
    }
    if (parsed.version === 1 && parsed.activeThemeId) {
      this.assertId(parsed.activeThemeId)
      return await this.migrateLegacySettings(parsed.activeThemeId)
    }
    throw new Error('Studio settings are invalid.')
  }

  async importMediaAsset(themeId: string, sourcePath: string, purpose: 'hero' | 'polaroid' | 'conversationBackground', expectedKind?: MediaSelectionKind, signal?: AbortSignal): Promise<ImportedMediaAsset> {
    await this.get(themeId)
    if (!isAbsolute(sourcePath)) throw new Error('所选媒体路径必须是绝对路径。')
    const sourceStat = await stat(sourcePath)
    if (!sourceStat.isFile()) throw new Error('所选媒体必须是文件。')
    const extension = extname(sourcePath).toLowerCase()
    if (extension !== '.svg' && !MEDIA_IMAGE_EXTENSIONS.has(extension) && !VIDEO_EXTENSIONS.has(extension)) throw new Error('仅支持 PNG、WebP、JPEG、GIF、SVG、MP4 和 WebM。')
    if (expectedKind === 'image' && (extension === '.gif' || VIDEO_EXTENSIONS.has(extension))) throw new Error('图片背景只支持 PNG、WebP、JPEG 或 SVG。')
    if (expectedKind === 'gif' && extension !== '.gif') throw new Error('GIF 背景必须选择 GIF 文件。')
    if (expectedKind === 'video' && !VIDEO_EXTENSIONS.has(extension)) throw new Error('视频背景只支持 MP4 或 WebM。')
    if ((extension === '.svg' || MEDIA_IMAGE_EXTENSIONS.has(extension)) && sourceStat.size > MAX_ASSET_BYTES) throw new Error('图片和 GIF 文件不能超过 30 MB。')
    if (signal?.aborted) throw new Error('媒体导入已取消。')

    let metadata: { width: number; height: number }
    if (VIDEO_EXTENSIONS.has(extension)) {
      metadata = await this.inspectVideo(sourcePath, extension, sourceStat.size)
    } else if (extension === '.svg') {
      const source = await readFile(sourcePath, 'utf8')
      this.assertSafeSvg(source)
      metadata = await this.inspectImage(sourcePath, extension)
    } else {
      metadata = await this.inspectImage(sourcePath, extension)
    }
    await this.assertDiskSpace(this.assetRoot(themeId), sourceStat.size)

    const outputExtension = extension === '.svg' ? '.png' : extension
    const relativePath = `assets/${purpose}-${randomUUID()}${outputExtension}`
    const destination = this.resolveAsset(themeId, relativePath)
    const temporary = `${destination}.${randomUUID()}.tmp`
    await mkdir(dirname(destination), { recursive: true })
    try {
      if (extension === '.svg') {
        const source = await readFile(sourcePath, 'utf8')
        this.assertSafeSvg(source)
        await sharp(Buffer.from(source)).png().toFile(temporary)
        this.throwIfAborted(signal, '媒体导入已取消。')
      } else {
        await pipeline(createReadStream(sourcePath), createWriteStreamChecked(temporary), { signal })
      }
      const temporaryFile = await open(temporary, 'r+')
      try { await temporaryFile.sync() } finally { await temporaryFile.close() }
      await rename(temporary, destination)
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined)
      await rm(destination, { force: true }).catch(() => undefined)
      if (signal?.aborted) throw new Error('媒体导入已取消。')
      throw error
    }

    const reference = mediaReferenceForPath(relativePath)
    const pending = this.pendingMediaAssets.get(themeId) ?? new Set<string>()
    pending.add(relativePath)
    this.pendingMediaAssets.set(themeId, pending)
    return {
      reference,
      relativePath,
      previewUrl: this.mediaPreviewUrl(themeId, relativePath),
      originalName: basename(sourcePath),
      width: metadata.width,
      height: metadata.height
    }
  }

  async getMediaPreviewUrl(themeId: unknown, asset: unknown): Promise<string> {
    if (typeof themeId !== 'string' || typeof asset !== 'string') throw new Error('媒体预览参数无效。')
    const profile = await this.get(themeId)
    const reference = [profile.hero.source, profile.polaroid.source, profile.conversationBackground.source].find((media) => media?.asset === asset)
    if (!reference && !this.pendingMediaAssets.get(themeId)?.has(asset) && !(await this.isBundledSystemAsset(themeId, asset))) throw new Error('该媒体未被当前主题引用。')
    const path = this.resolveAsset(themeId, asset)
    const file = await stat(path)
    if (!file.isFile()) throw new Error('媒体文件不存在。')
    return this.mediaPreviewUrl(themeId, asset)
  }

  async resolveReferencedMedia(themeId: unknown, asset: unknown): Promise<{ path: string; mimeType: string; size: number }> {
    if (typeof themeId !== 'string' || typeof asset !== 'string') throw new Error('媒体参数无效。')
    const profile = await this.get(themeId)
    const reference = [profile.hero.source, profile.polaroid.source, profile.conversationBackground.source].find((media) => media?.asset === asset)
    if (!reference && !this.pendingMediaAssets.get(themeId)?.has(asset) && !(await this.isBundledSystemAsset(themeId, asset))) throw new Error('该媒体未被主题引用。')
    const path = this.resolveAsset(themeId, asset)
    const file = await stat(path)
    if (!file.isFile()) throw new Error('媒体文件不存在。')
    return { path, mimeType: reference?.mimeType ?? mediaMimeTypeForPath(asset), size: file.size }
  }

  private async isBundledSystemAsset(themeId: string, asset: string): Promise<boolean> {
    if (!this.bundledSystemAssets || !BUNDLED_SYSTEM_ASSETS.has(asset)) return false
    const settings = await this.readSettings()
    return settings.systemThemeId === themeId
  }

  async getRuntimeMediaBindings(themeId: string): Promise<Array<{ role: 'hero' | 'polaroid' | 'conversationBackground'; path: string; mimeType: string }>> {
    const profile = await this.get(themeId)
    const bindings: Array<{ role: 'hero' | 'polaroid' | 'conversationBackground'; path: string; mimeType: string }> = []
    for (const [role, reference] of [['hero', profile.hero.source], ['polaroid', profile.polaroid.source], ['conversationBackground', profile.conversationBackground.source]] as const) {
      if (reference?.kind !== 'video') continue
      const resolved = await this.resolveReferencedMedia(themeId, reference.asset)
      bindings.push({ role, path: resolved.path, mimeType: resolved.mimeType })
    }
    return bindings
  }

  private async migrateLegacySettings(activeThemeId: string): Promise<StudioSettings> {
    const entries = await readdir(this.themesRoot, { withFileTypes: true })
    const candidates = (await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
      try {
        const profile = await this.get(entry.name)
        const themeStat = await stat(join(this.themeRoot(profile.id), 'theme.json'))
        const hasBundledAsset = await stat(join(this.assetRoot(profile.id), 'dream-reference.png')).then((value) => value.isFile()).catch(() => false)
        return { id: profile.id, hasBundledAsset, createdAt: themeStat.birthtimeMs || themeStat.ctimeMs }
      } catch {
        return null
      }
    }))).filter((candidate): candidate is { id: string; hasBundledAsset: boolean; createdAt: number } => candidate !== null)
    candidates.sort((a, b) => Number(b.hasBundledAsset) - Number(a.hasBundledAsset) || a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    let systemThemeId = candidates.find((candidate) => candidate.hasBundledAsset)?.id
    if (!systemThemeId && this.bundledSystemAssets) systemThemeId = (await this.createSystemTheme()).id
    systemThemeId ??= candidates[0]?.id
    if (!systemThemeId) throw new Error('Studio settings cannot identify the system theme.')
    const settings: StudioSettings = {
      version: 2,
      activeThemeId: candidates.some((candidate) => candidate.id === activeThemeId) ? activeThemeId : systemThemeId,
      systemThemeId
    }
    await this.writeSettings(settings)
    return settings
  }

  private async createSystemTheme(): Promise<ThemeProfile> {
    const profile = createDefaultTheme(randomUUID())
    const root = this.themeRoot(profile.id)
    try {
      await this.applyBundledSystemPreset(profile)
      await this.writeProfile(profile)
      return profile
    } catch (error) {
      await rm(root, { recursive: true, force: true }).catch(() => undefined)
      throw error
    }
  }

  private async applyBundledSystemPreset(profile: ThemeProfile): Promise<void> {
    if (!this.bundledSystemAssets) return
    const heroAsset = 'assets/dream-reference.png'
    const polaroidAsset = 'assets/dream-polaroid.png'
    const heroDestination = this.resolveAsset(profile.id, heroAsset)
    const polaroidDestination = this.resolveAsset(profile.id, polaroidAsset)
    const heroTemporary = `${heroDestination}.${randomUUID()}.tmp`
    const polaroidTemporary = `${polaroidDestination}.${randomUUID()}.tmp`
    await mkdir(dirname(heroDestination), { recursive: true })
    try {
      await copyFile(this.bundledSystemAssets.hero, heroTemporary)
      await copyFile(this.bundledSystemAssets.polaroid, polaroidTemporary)
      await this.inspectImage(heroTemporary, '.png')
      const polaroidSize = await this.inspectImage(polaroidTemporary, '.png')
      for (const temporary of [heroTemporary, polaroidTemporary]) {
        const file = await open(temporary, 'r+')
        try { await file.sync() } finally { await file.close() }
      }
      await rename(heroTemporary, heroDestination)
      await rename(polaroidTemporary, polaroidDestination)

      profile.hero.source = mediaReferenceForPath(heroAsset)
      profile.polaroid.source = mediaReferenceForPath(polaroidAsset)
      profile.polaroid.sourceSize = polaroidSize
      profile.polaroid.placement = { x: 0.8278561014524648, y: 0.7127831468304384, width: 0.15, rotation: -15, hideBelowWidth: 920 }
      profile.icons.backgroundRain = { kind: 'builtin', name: 'wand-sparkles' }
      profile.decorations.sparkles = {
        visible: true,
        effect: 'rain',
        speed: 1,
        count: 20,
        minSize: 20,
        maxSize: 32,
        opacity: 0.72,
        glow: 10,
        seed: 0,
        extraColors: []
      }
      await this.validateProfileMedia(profile)
    } catch (error) {
      await Promise.all([heroTemporary, polaroidTemporary].map((path) => rm(path, { force: true }).catch(() => undefined)))
      throw error
    }
  }

  private async writeSettings(settings: StudioSettings): Promise<void> {
    this.assertId(settings.activeThemeId)
    this.assertId(settings.systemThemeId)
    await this.writeJsonAtomic(this.settingsPath, settings)
  }

  private async writeJsonAtomic(path: string, value: unknown): Promise<void> {
    await mkdir(dirname(path), { recursive: true })
    const temporary = `${path}.${randomUUID()}.tmp`
    const backup = `${path}.previous`
    const file = await open(temporary, 'wx')
    try {
      await file.writeFile(`${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8' })
      await file.sync()
    } finally {
      await file.close()
    }
    let hadOriginal = false
    try {
      try { await rename(path, backup); hadOriginal = true } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      await rename(temporary, path)
      if (hadOriginal) await rm(backup, { force: true })
    } catch (error) {
      await rm(temporary, { force: true })
      if (hadOriginal) await rename(backup, path).catch(() => undefined)
      throw error
    }
  }

  private async writeBinaryAtomic(path: string, data: Buffer): Promise<void> {
    await mkdir(dirname(path), { recursive: true })
    const temporary = `${path}.${randomUUID()}.tmp`
    const backup = `${path}.previous`
    const file = await open(temporary, 'wx')
    try {
      await file.write(data)
      await file.sync()
    } finally {
      await file.close()
    }
    let hadOriginal = false
    try {
      try { await rename(path, backup); hadOriginal = true } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      await rename(temporary, path)
      if (hadOriginal) await rm(backup, { force: true })
    } catch (error) {
      await rm(temporary, { force: true })
      if (hadOriginal) await rename(backup, path).catch(() => undefined)
      throw error
    }
  }

  private async writeShareArchiveAtomic(path: string, assets: Map<string, string>, manifest: Uint8Array, profile: Uint8Array, signal?: AbortSignal): Promise<void> {
    this.throwIfAborted(signal, '主题导出已取消。')
    await mkdir(dirname(path), { recursive: true })
    const temporary = `${path}.${randomUUID()}.tmp`
    const output = createWriteStream(temporary, { flags: 'wx' })
    const ZipArchive = (archiver as unknown as { ZipArchive: new (options?: Record<string, unknown>) => {
      pipe: (stream: NodeJS.WritableStream) => void
      append: (input: NodeJS.ReadableStream | Buffer, options: { name: string }) => void
      on: (event: string, listener: (...args: unknown[]) => void) => void
      finalize: () => Promise<void>
      abort?: () => void
    } }).ZipArchive
    const archive = new ZipArchive({ forceZip64: true, zlib: { level: 6 } })
    const completion = new Promise<void>((resolvePromise, reject) => {
      output.once('close', resolvePromise)
      output.once('error', reject)
      archive.on('error', reject)
    })
    const abortExport = (): void => {
      archive.abort?.()
      output.destroy(new Error('主题导出已取消。'))
    }
    signal?.addEventListener('abort', abortExport, { once: true })
    archive.pipe(output)
    archive.append(Buffer.from(manifest), { name: 'manifest.json' })
    archive.append(Buffer.from(profile), { name: 'theme.json' })
    for (const [asset, sourcePath] of assets) archive.append(createReadStream(sourcePath), { name: asset })
    try {
      await archive.finalize()
      await completion
      this.throwIfAborted(signal, '主题导出已取消。')
      const file = await open(temporary, 'r+')
      try { await file.sync() } finally { await file.close() }
      const backup = `${path}.previous`
      let hadOriginal = false
      try {
        try { await rename(path, backup); hadOriginal = true } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
        await rename(temporary, path)
        if (hadOriginal) await rm(backup, { force: true })
      } catch (error) {
        await rm(temporary, { force: true })
        if (hadOriginal) await rename(backup, path).catch(() => undefined)
        throw error
      }
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined)
      throw error
    } finally {
      signal?.removeEventListener('abort', abortExport)
    }
  }

  private async extractShareArchive(sourcePath: string, compressedSize: number, temporaryRoot: string, signal?: AbortSignal): Promise<Map<string, { path: string; size: number }>> {
    await this.assertDiskSpace(temporaryRoot, compressedSize)
    this.throwIfAborted(signal, '主题导入已取消。')
    return await new Promise((resolvePromise, reject) => {
      yauzl.open(sourcePath, { lazyEntries: true, autoClose: true }, (error, zipFile) => {
        if (error || !zipFile) { reject(error ?? new Error('分享包 ZIP 无效。')); return }
        const entries = new Map<string, { path: string; size: number }>()
        const seen = new Set<string>()
        let settled = false
        const fail = (reason: unknown): void => {
          if (settled) return
          settled = true
          zipFile.close()
          reject(reason instanceof Error ? reason : new Error(String(reason)))
        }
        const abortImport = (): void => fail(new Error('主题导入已取消。'))
        signal?.addEventListener('abort', abortImport, { once: true })
        zipFile.on('error', fail)
        zipFile.on('end', () => {
          signal?.removeEventListener('abort', abortImport)
          if (!settled) { settled = true; resolvePromise(entries) }
        })
        zipFile.on('entry', (entry) => {
          if (settled) return
          void (async () => {
            try {
              this.throwIfAborted(signal, '主题导入已取消。')
              assertSharePath(entry.fileName)
              const canonical = entry.fileName.toLowerCase()
              if (seen.has(canonical)) throw new Error('分享包包含重复条目。')
              seen.add(canonical)
              if (seen.size > MAX_SHARE_ENTRIES) throw new Error('分享包条目数量超过限制。')
              const kind = entry.fileName.startsWith('assets/') ? assetKind(entry.fileName) : null
              const limit = kind === 'image' ? MAX_SHARE_IMAGE_BYTES : kind === 'font' ? MAX_SHARE_FONT_BYTES : kind === 'video' ? Number.MAX_SAFE_INTEGER : MAX_SHARE_METADATA_BYTES
              if (entry.uncompressedSize > limit) throw new Error('分享包条目超过大小限制。')
              await this.assertDiskSpace(temporaryRoot, entry.uncompressedSize)
              const destination = entry.fileName.startsWith('assets/')
                ? this.resolveWithinRoot(temporaryRoot, entry.fileName)
                : join(temporaryRoot, entry.fileName)
              await mkdir(dirname(destination), { recursive: true })
              await new Promise<void>((resolveStream, rejectStream) => {
                zipFile.openReadStream(entry, (streamError, stream) => {
                  if (streamError || !stream) { rejectStream(streamError ?? new Error('分享包条目读取失败。')); return }
                  void pipeline(stream, createWriteStreamChecked(destination), { signal }).then(() => resolveStream(), rejectStream)
                })
              })
              entries.set(entry.fileName, { path: destination, size: entry.uncompressedSize })
              zipFile.readEntry()
            } catch (reason) { fail(reason) }
          })()
        })
        zipFile.readEntry()
      })
    })
  }

  private async readShareEntries(sourcePath: string, compressedSize: number): Promise<Map<string, Buffer>> {
    await this.assertDiskSpace(this.themesRoot, compressedSize)
    return await new Promise((resolvePromise, reject) => {
      yauzl.open(sourcePath, { lazyEntries: true, autoClose: true }, (error, zipFile) => {
        if (error || !zipFile) { reject(error ?? new Error('分享包 ZIP 无效。')); return }
        const entries = new Map<string, Buffer>()
        const seen = new Set<string>()
        let settled = false
        const fail = (reason: unknown): void => {
          if (settled) return
          settled = true
          zipFile.close()
          reject(reason instanceof Error ? reason : new Error(String(reason)))
        }
        zipFile.on('error', fail)
        zipFile.on('end', () => { if (!settled) { settled = true; resolvePromise(entries) } })
        zipFile.on('entry', (entry) => {
          if (settled) return
          try {
            assertSharePath(entry.fileName)
            const canonical = entry.fileName.toLowerCase()
            if (seen.has(canonical)) throw new Error('分享包包含重复条目。')
            seen.add(canonical)
            if (seen.size > MAX_SHARE_ENTRIES) throw new Error('分享包条目数量超过限制。')
            const kind = entry.fileName.startsWith('assets/') ? assetKind(entry.fileName) : null
            const limit = kind === 'image' ? MAX_SHARE_IMAGE_BYTES : kind === 'font' ? MAX_SHARE_FONT_BYTES : kind === 'video' ? Number.MAX_SAFE_INTEGER : MAX_SHARE_METADATA_BYTES
            if (entry.uncompressedSize > limit) throw new Error('分享包条目超过大小限制。')
            zipFile.openReadStream(entry, (streamError, stream) => {
              if (streamError || !stream) { fail(streamError ?? new Error('分享包条目读取失败。')); return }
              const chunks: Buffer[] = []
              let size = 0
              stream.on('data', (chunk: Buffer) => { size += chunk.length; chunks.push(chunk) })
              stream.on('error', fail)
              stream.on('end', () => { entries.set(entry.fileName, Buffer.concat(chunks, size)); zipFile.readEntry() })
            })
          } catch (reason) { fail(reason) }
        })
        zipFile.readEntry()
      })
    })
  }

  private async validateShareAssetFile(asset: string, path: string, kind: 'image' | 'video' | 'font'): Promise<void> {
    const file = await stat(path)
    if (kind === 'image') {
      if (file.size > MAX_SHARE_IMAGE_BYTES) throw new Error('图片素材超过 30 MB 限制。')
      await this.inspectImage(path, extname(asset).toLowerCase())
      return
    }
    if (kind === 'video') {
      await this.inspectVideo(path, extname(asset).toLowerCase(), file.size)
      return
    }
    if (file.size > MAX_SHARE_FONT_BYTES) throw new Error('字体素材超过 12 MB 限制。')
    const header = await readFile(path).then((data) => data.subarray(0, 4))
    this.assertFontHeader(extname(asset).toLowerCase().slice(1) as ImportedFontFormat, header)
  }

  private async validateShareAsset(asset: string, data: Buffer, kind: 'image' | 'video' | 'font'): Promise<void> {
    if (kind === 'image') {
      if (data.byteLength > MAX_SHARE_IMAGE_BYTES) throw new Error('图片素材超过 30 MB 限制。')
      const metadata = await sharp(data).metadata()
      if (!metadata.width || !metadata.height) throw new Error(`图片素材无效: ${asset}`)
      const imageExtension = extname(asset).toLowerCase()
      const expectedFormat = imageExtension === '.jpg' || imageExtension === '.jpeg' ? 'jpeg' : imageExtension.slice(1)
      if (metadata.format !== expectedFormat) throw new Error(`图片素材扩展名与内容不匹配: ${asset}`)
      return
    }
    if (kind === 'video') {
      const extension = extname(asset).toLowerCase()
      if (extension === '.mp4' && (data.length < 12 || data.toString('latin1', 4, 8) !== 'ftyp')) throw new Error(`视频素材无效: ${asset}`)
      if (extension === '.webm' && !(data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3)) throw new Error(`视频素材无效: ${asset}`)
      const temporaryRoot = await mkdtemp(join(this.themesRoot, '.media-validate-'))
      const temporary = join(temporaryRoot, `probe${extension}`)
      try {
        await writeFile(temporary, data)
        await this.inspectVideo(temporary, extension, data.byteLength)
      } finally { await rm(temporaryRoot, { recursive: true, force: true }).catch(() => undefined) }
      return
    }
    if (data.byteLength > MAX_SHARE_FONT_BYTES) throw new Error('字体素材超过 12 MB 限制。')
    const extension = extname(asset).toLowerCase().slice(1) as ImportedFontFormat
    this.assertFontHeader(extension, data.subarray(0, 4))
  }

  private async inspectImage(sourcePath: string, extension: string): Promise<{ width: number; height: number }> {
    const metadata = await sharp(sourcePath, { animated: extension === '.gif' }).metadata().catch(() => null)
    if (!metadata?.width || !metadata.height) throw new Error('媒体图片无效或无法读取尺寸。')
    const expectedFormat = extension === '.jpg' || extension === '.jpeg' ? 'jpeg' : extension.slice(1)
    if (metadata.format !== expectedFormat) throw new Error('媒体图片内容与扩展名不匹配。')
    return { width: metadata.width, height: metadata.height }
  }

  private async validateProfileMedia(profile: ThemeProfile): Promise<void> {
    this.validateProfileAssetReferences(profile)
    for (const reference of [profile.hero.source, profile.polaroid.source, profile.conversationBackground.source]) {
      if (!reference) continue
      const extension = extname(reference.asset).toLowerCase()
      if (!MEDIA_IMAGE_EXTENSIONS.has(extension) && !VIDEO_EXTENSIONS.has(extension)) throw new Error('主题媒体扩展名不受支持。')
      const expected = mediaMimeTypeForPath(reference.asset)
      if (expected !== reference.mimeType || (reference.kind === 'video') !== VIDEO_EXTENSIONS.has(extension)) throw new Error('主题媒体类型与文件扩展名不匹配。')
      const sourcePath = this.resolveAsset(profile.id, reference.asset)
      const sourceStat = await stat(sourcePath)
      if (!sourceStat.isFile()) throw new Error(`主题媒体不存在: ${reference.asset}`)
      if (reference.kind === 'video') await this.inspectVideo(sourcePath, extension, sourceStat.size)
      else {
        if (sourceStat.size > MAX_ASSET_BYTES) throw new Error('图片和 GIF 文件不能超过 30 MB。')
        await this.inspectImage(sourcePath, extension)
      }
    }
  }

  private async validateProfileAssets(profile: ThemeProfile): Promise<void> {
    this.validateProfileAssetReferences(profile)
    for (const asset of this.collectAssets(profile)) {
      const sourcePath = this.resolveAsset(profile.id, asset)
      const sourceStat = await stat(sourcePath)
      if (!sourceStat.isFile()) throw new Error(`主题素材不存在: ${asset}`)
      await this.validateShareAssetFile(asset, sourcePath, assetKind(asset))
    }
  }

  private validateProfileAssetReferences(profile: ThemeProfile): void {
    for (const reference of [profile.hero.source, profile.polaroid.source, profile.conversationBackground.source]) {
      if (!reference) continue
      const extension = extname(reference.asset).toLowerCase()
      if (!MEDIA_IMAGE_EXTENSIONS.has(extension) && !VIDEO_EXTENSIONS.has(extension)) throw new Error('主题媒体扩展名不受支持。')
      const expected = mediaMimeTypeForPath(reference.asset)
      if (expected !== reference.mimeType || (reference.kind === 'video') !== VIDEO_EXTENSIONS.has(extension)) throw new Error('主题媒体类型与文件扩展名不匹配。')
    }
    for (const icon of Object.values(profile.icons)) {
      if (icon.kind === 'asset' && assetKind(icon.asset) !== 'image') throw new Error('定制图标只能使用图片素材。')
    }
    for (const font of profile.typography.importedFonts) {
      if (assetKind(font.asset) !== 'font') throw new Error('导入字体素材类型无效。')
    }
  }

  private async inspectVideo(sourcePath: string, extension: string, size: number): Promise<{ width: number; height: number }> {
    const handle = await open(sourcePath, 'r')
    try {
      const header = Buffer.alloc(Math.min(64 * 1024, size))
      const result = await handle.read(header, 0, header.length, 0)
      const bytes = header.subarray(0, result.bytesRead)
      if (extension === '.mp4' && (bytes.length < 12 || bytes.toString('latin1', 4, 8) !== 'ftyp')) throw new Error('MP4 文件头无效。')
      if (extension === '.webm' && !(bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3)) throw new Error('WebM 文件头无效。')
    } finally { await handle.close() }

    let width = 0
    let height = 0
    try {
      const info = await mediaInfoFactory({ format: 'object' })
      try {
        const result = await info.analyzeData(size, async (chunkSize, offset) => {
          const file = await open(sourcePath, 'r')
          try {
            const chunk = Buffer.alloc(chunkSize)
            const read = await file.read(chunk, 0, chunkSize, offset)
            return chunk.subarray(0, read.bytesRead)
          } finally { await file.close() }
        })
        const track = result.media?.track?.find((item) => isTrackType(item, 'Video'))
        width = typeof track?.Width === 'number' ? track.Width : Number(track?.Width ?? 0)
        height = typeof track?.Height === 'number' ? track.Height : Number(track?.Height ?? 0)
        const codec = `${track?.CodecID ?? ''} ${track?.Format ?? ''}`.toLowerCase()
        const supported = extension === '.mp4'
          ? /avc|h264|hevc|h265|mpeg-4/.test(codec)
          : /vp8|vp9|av1/.test(codec)
        if (!supported) throw new Error('视频编码不是 Chromium 常见支持格式。')
      } finally { info.close() }
    } catch {
      throw new Error('视频元数据无法读取，文件可能损坏或编码不受支持。')
    }
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('视频尺寸无效。')
    if (Math.max(width, height) > MAX_VIDEO_DIMENSION) throw new Error('视频最长边不能超过 4096px。')
    return { width: Math.round(width), height: Math.round(height) }
  }

  private async assertDiskSpace(targetRoot: string, incomingBytes: number): Promise<void> {
    const usage = await statfs(targetRoot).catch(() => null)
    if (!usage) return
    const available = Number(usage.bavail) * Number(usage.bsize)
    const total = Number(usage.blocks) * Number(usage.bsize)
    const minimum = Math.max(MIN_FREE_BYTES, total * MIN_FREE_RATIO)
    if (available - incomingBytes < minimum) throw new Error('磁盘空间不足，需要至少保留 10 GB 或 15% 的可用空间。')
  }

  private throwIfAborted(signal: AbortSignal | undefined, message: string): void {
    if (signal?.aborted) throw new Error(message)
  }

  private mediaPreviewUrl(themeId: string, asset: string): string {
    return `studio-media://${encodeURIComponent(themeId)}/${asset.split('/').map((part) => encodeURIComponent(part)).join('/')}`
  }

  private resolveWithinRoot(root: string, asset: string): string {
    if (!asset || asset.includes('\\') || isAbsolute(asset)) throw new Error('Asset path is invalid.')
    const base = resolve(root)
    const candidate = resolve(base, asset)
    const rel = relative(base, candidate)
    if (!rel || rel.startsWith('..') || isAbsolute(rel) || !rel.startsWith(`assets${requireSeparator()}`)) throw new Error('Asset path escapes the theme directory.')
    return candidate
  }

  private themeRoot(id: string): string { this.assertId(id); return join(this.themesRoot, id) }
  private assetRoot(id: string): string { return join(this.themeRoot(id), 'assets') }
  private assertId(id: string): void { if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) throw new Error('Theme ID is invalid.') }
  private cleanName(name: unknown): string { if (typeof name !== 'string') throw new Error('Theme name must be 1-80 characters.'); const result = name.trim(); if (!result || result.length > 80) throw new Error('Theme name must be 1-80 characters.'); return result }
  private mediaType(extension: string): string {
    if (extension === '.png') return 'image/png'
    if (extension === '.webp') return 'image/webp'
    if (extension === '.ttf') return 'font/ttf'
    if (extension === '.otf') return 'font/otf'
    if (extension === '.woff') return 'font/woff'
    if (extension === '.woff2') return 'font/woff2'
    return 'image/jpeg'
  }
  private fontMediaType(format: ImportedFontFormat): string { return this.mediaType(`.${format}`) }
  private assertFontHeader(format: ImportedFontFormat, header: Buffer): void {
    const signature = header.toString('latin1')
    const valid = format === 'ttf'
      ? header.equals(Buffer.from([0x00, 0x01, 0x00, 0x00])) || signature === 'true'
      : format === 'otf'
        ? signature === 'OTTO'
        : format === 'woff'
          ? signature === 'wOFF'
          : signature === 'wOF2'
    if (!valid || signature === 'ttcf') throw new Error('Font file header does not match its extension or is a font collection.')
  }
  private assertSafeSvg(source: string): void {
    if (source.length > 2_000_000 || /<(?:script|foreignObject|iframe|object|embed)\b|<!DOCTYPE|<!ENTITY|(?:href|src)\s*=\s*["']\s*(?:https?:|file:|javascript:)/i.test(source)) {
      throw new Error('SVG contains unsupported or external content.')
    }
  }
}

function requireSeparator(): string {
  return process.platform === 'win32' ? '\\' : '/'
}

function createWriteStreamChecked(path: string): ReturnType<typeof createWriteStream> {
  return createWriteStream(path, { flags: 'wx' })
}

async function hashFile(path: string, signal?: AbortSignal): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) {
    if (signal?.aborted) throw new Error('主题导出已取消。')
    hash.update(chunk as Buffer)
  }
  return hash.digest('hex')
}
