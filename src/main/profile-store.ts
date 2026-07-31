import { createHash, randomUUID } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, open, readFile, readdir, rename, rm, rmdir, stat, statfs, writeFile } from 'node:fs/promises'
import { createReadStream, createWriteStream } from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createRequire } from 'node:module'
import sharp from 'sharp'
import mediaInfoFactory, { isTrackType } from 'mediainfo.js'
const nodeRequire = createRequire(import.meta.url)
const archiver = nodeRequire('archiver') as typeof import('archiver')
const yauzl = nodeRequire('yauzl') as typeof import('yauzl')
import { createDefaultTheme, createThemeInputSchema, DEFAULT_THEME_COLORS, parseThemeProfile, type ConversationBubblePresetId, type MediaReference, type ThemeProfile, type ThemeSummary, type VideoAssetVariant } from '../shared/theme'
import type { AssetPurpose, CompiledTheme, ImportedAsset, ImportedFontAsset, ImportedMediaAsset, MediaAssetPurpose, MediaSelectionKind, VideoAssetInspection, VideoMediaRole } from '../shared/contracts'
import { importedFontFormatForAsset, type ImportedFontFormat } from '../shared/typography'
import { compileTheme, compiledAssetNames } from './theme-compiler'
import { createVideoVariantReference, mediaMimeTypeForPath, mediaReferenceAssets, mediaReferenceForPath } from '../shared/media'
import { conversationBubbleMediaReferences } from '../shared/conversation-bubbles'
import { ensureGifInfiniteLoop, gifPosterAssetKey } from '../shared/gif'
import { MAX_ICON_GIF_BYTES } from '../shared/icon-assets'
import { prepareGif } from './gif-assets'
import { inspectIconGif, prepareIconGif } from './icon-assets'
import {
  addShareUncompressedBytes,
  assertShareCompressedSize,
  assertShareEntrySize,
  MAX_SHARE_ENTRIES,
  MAX_SHARE_FONT_BYTES,
  MAX_SHARE_IMAGE_BYTES,
  MAX_SHARE_METADATA_BYTES,
  assetKind,
  assertSharePath,
  collectThemeAssets,
  createShareProfile,
  encodeJson,
  parseThemeShareManifest,
  shareEntryLimit,
  shareProfileVersionMatches
} from './theme-share'
import { assertOptimizedVideoInspection, transcodeVideo } from './video-transcoder'
import { assertPortableVideoInspection, isPortableVideo } from './video-compatibility'
import { inspectImageBytes, validateFontBytes } from './asset-validation'
import { dataUrlByteLength, EmbeddedAssetBudget } from './embedded-assets'
import { budgetSelectedBuiltinFonts } from './theme-fonts'

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
  conversationBubbles?: Record<ConversationBubblePresetId, string>
  resourcesRoot?: string
}

export interface ShareArchiveWriter {
  pipe: (stream: NodeJS.WritableStream) => void
  append: (input: NodeJS.ReadableStream | Buffer, options: { name: string }) => void
  on: (event: 'error', listener: (reason: unknown) => void) => unknown
  off: (event: 'error', listener: (reason: unknown) => void) => unknown
  finalize: () => Promise<void>
  abort?: () => void
}

interface ShareArchiveOutput {
  destroyed?: boolean
  destroy: (error?: Error) => void
  once: {
    (event: 'close', listener: () => void): unknown
    (event: 'error', listener: (reason: unknown) => void): unknown
  }
  off: {
    (event: 'close', listener: () => void): unknown
    (event: 'error', listener: (reason: unknown) => void): unknown
  }
}

export interface VideoSourcePreflight {
  sourcePath: string
  size: number
  mtimeMs: number
  inspection: VideoAssetInspection
}

const MAX_ASSET_BYTES = 30 * 1024 * 1024
const MAX_FONT_BYTES = 12 * 1024 * 1024
const BUNDLED_SYSTEM_ASSETS = new Set(['assets/dream-reference.png', 'assets/dream-polaroid.png'])
const RASTER_EXTENSIONS = new Set(['.png', '.webp', '.jpg', '.jpeg', '.gif'])
const MEDIA_IMAGE_EXTENSIONS = new Set(['.png', '.webp', '.jpg', '.jpeg', '.gif'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm'])
const FONT_EXTENSIONS = new Set<ImportedFontFormat>(['ttf', 'otf', 'woff', 'woff2'])
const MIN_FREE_BYTES = 10 * 1024 * 1024 * 1024
const MIN_FREE_RATIO = 0.15
const MAX_VIDEO_DIMENSION = 4096
const MAX_CONVERSATION_BUBBLE_BYTES = 10 * 1024 * 1024
const MAX_CONVERSATION_BUBBLE_DIMENSION = 2048
const MAX_CONVERSATION_BUBBLE_GIF_FRAMES = 180
const THEME_DELETE_TOMBSTONE_PATTERN = /^\.theme-delete-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-[0-9a-f-]{36}$/i
const THEME_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CONTROLLED_TEMP_DIRECTORY_PATTERN = /^\.(?:cdstheme-import|media-validate)-/
const CONTROLLED_TEMP_FILE_PATTERN = /\.[0-9a-f]{8}-[0-9a-f-]{27}\.tmp(?:\.mp4)?$/i

export async function finalizeShareArchive(
  archive: ShareArchiveWriter,
  output: ShareArchiveOutput,
  prepare: () => void,
  signal?: AbortSignal
): Promise<void> {
  let failed = false
  let rejectFailure!: (reason: Error) => void
  let startFinalization!: () => void
  const failure = new Promise<never>((_resolve, reject) => { rejectFailure = reject })
  const outputCompletion = new Promise<void>((resolve) => { output.once('close', resolve) })
  const finalization = new Promise<void>((resolve, reject) => {
    startFinalization = () => {
      void Promise.resolve().then(() => archive.finalize()).then(resolve, reject)
    }
  })
  const completion = Promise.race([Promise.all([finalization, outputCompletion]).then(() => undefined), failure])
  void completion.catch(() => undefined)

  const terminate = (reason: unknown): void => {
    if (failed) return
    failed = true
    const error = reason instanceof Error ? reason : new Error(String(reason))
    try { archive.abort?.() } catch { /* Preserve the triggering failure. */ }
    try {
      if (!output.destroyed) output.destroy(error)
    } catch { /* Preserve the triggering failure. */ }
    rejectFailure(error)
  }
  const onArchiveError = (reason: unknown): void => terminate(reason)
  const onOutputError = (reason: unknown): void => terminate(reason)
  const onAbort = (): void => terminate(new Error('主题导出已取消。'))
  archive.on('error', onArchiveError)
  output.once('error', onOutputError)
  signal?.addEventListener('abort', onAbort, { once: true })

  try {
    if (signal?.aborted) onAbort()
    else {
      prepare()
      startFinalization()
    }
    await completion
  } catch (reason) {
    terminate(reason)
    throw (reason instanceof Error ? reason : new Error(String(reason)))
  } finally {
    signal?.removeEventListener('abort', onAbort)
    if (!failed) {
      archive.off('error', onArchiveError)
      output.off('error', onOutputError)
    }
  }
}

export class ProfileStore {
  readonly themesRoot: string
  private readonly settingsPath: string
  private readonly pendingAssets = new Map<string, Set<string>>()

  constructor(readonly root: string, private readonly bundledSystemAssets?: BundledSystemThemeAssets) {
    this.themesRoot = join(root, 'themes')
    this.settingsPath = join(root, 'settings.json')
  }

  async initialize(): Promise<void> {
    await mkdir(this.themesRoot, { recursive: true })
    await this.cleanupStartupArtifacts()
    let settings: StudioSettings
    try {
      settings = await this.readSettings()
    } catch {
      const profile = await this.createSystemTheme()
      await this.writeSettings({ version: 2, activeThemeId: profile.id, systemThemeId: profile.id })
      await this.cleanupOrphanedAssets()
      return
    }
    await this.reconcileThemeTombstones(settings)

    const systemExists = await this.get(settings.systemThemeId).then(() => true).catch(() => false)
    const activeExists = settings.activeThemeId === settings.systemThemeId
      ? systemExists
      : await this.get(settings.activeThemeId).then(() => true).catch(() => false)
    if (!systemExists || !activeExists) {
      const systemThemeId = systemExists ? settings.systemThemeId : (await this.createSystemTheme()).id
      await this.writeSettings({
        version: 2,
        activeThemeId: activeExists ? settings.activeThemeId : systemThemeId,
        systemThemeId
      })
    }
    await this.cleanupOrphanedAssets()
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
    const profile = await this.readJsonWithRecovery(join(this.themeRoot(id), 'theme.json'), (content) =>
      parseThemeProfile(JSON.parse(content) as unknown))
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
    await this.assertProfileEmbeddedBudget(source)
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
    const localProfile = parseThemeProfile(input)
    await this.get(localProfile.id)
    const profile = createShareProfile(localProfile)
    await this.validateProfileMedia(profile)
    await this.validateProfileAssets(profile)
    await this.assertProfileEmbeddedBudget(profile, undefined, signal, '主题导出已取消。')
    this.throwIfAborted(signal, '主题导出已取消。')
    if (typeof destinationPath !== 'string' || !isAbsolute(destinationPath)) throw new Error('分享包保存路径必须是绝对路径。')
    const sourceAssets = new Map<string, string>()
    const manifestAssets: Array<{ path: string; kind: 'image' | 'video' | 'font'; size: number; sha256: string }> = []
    let uncompressedSize = 0
    for (const asset of collectThemeAssets(profile)) {
      this.throwIfAborted(signal, '主题导出已取消。')
      const sourcePath = this.resolveAsset(profile.id, asset)
      const sourceStat = await stat(sourcePath)
      if (!sourceStat.isFile()) throw new Error(`主题素材不存在: ${asset}`)
      const kind = assetKind(asset)
      assertShareEntrySize(asset, sourceStat.size)
      uncompressedSize = addShareUncompressedBytes(uncompressedSize, sourceStat.size)
      sourceAssets.set(asset, sourcePath)
      manifestAssets.push({ path: asset, kind, size: sourceStat.size, sha256: await hashFile(sourcePath, signal, '主题导出已取消。') })
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
    uncompressedSize = addShareUncompressedBytes(uncompressedSize, manifestData.byteLength)
    uncompressedSize = addShareUncompressedBytes(uncompressedSize, profileData.byteLength)
    await this.assertDiskSpace(dirname(destinationPath), uncompressedSize)
    await this.writeShareArchiveAtomic(destinationPath, sourceAssets, manifestData, profileData, signal)
  }

  async importSharePackage(sourcePath: unknown, signal?: AbortSignal): Promise<ThemeProfile> {
    if (typeof sourcePath !== 'string' || !isAbsolute(sourcePath)) throw new Error('分享包路径必须是绝对路径。')
    if (extname(sourcePath).toLowerCase() !== '.cdstheme') throw new Error('请选择 .cdstheme 分享文件。')
    const sourceStat = await stat(sourcePath)
    if (!sourceStat.isFile()) throw new Error('分享包必须是文件。')
    assertShareCompressedSize(sourceStat.size)
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
      const gifIconAssets = new Set(Object.values(source.icons)
        .filter((icon) => icon.kind === 'asset' && extname(icon.asset).toLowerCase() === '.gif')
        .map((icon) => icon.kind === 'asset' ? icon.asset : ''))
      if (referenced.length !== listed.size || referenced.some((asset) => !listed.has(asset))) throw new Error('分享包素材清单与主题引用不一致。')
      for (const [path, entry] of entries) {
        this.throwIfAborted(signal, '主题导入已取消。')
        if (path !== 'manifest.json' && path !== 'theme.json' && !listed.has(path)) throw new Error('分享包包含未列出的素材。')
        if (path.startsWith('assets/')) {
          const file = await stat(entry.path)
          if (file.size !== entry.size) throw new Error(`素材大小校验失败: ${path}`)
          const manifestAsset = listed.get(path)
          if (!manifestAsset || manifestAsset.size !== file.size || (await hashFile(entry.path, signal, '主题导入已取消。')).toLowerCase() !== manifestAsset.sha256.toLowerCase()) throw new Error(`素材校验失败: ${path}`)
          await this.validateShareAssetFile(path, entry.path, assetKind(path), signal, true)
          if (gifIconAssets.has(path)) {
            const source = await readFile(entry.path)
            await inspectIconGif(source)
            const normalized = ensureGifInfiniteLoop(source)
            if (normalized !== source) await writeFile(entry.path, normalized)
          }
        }
      }
      for (const asset of manifest.assets) if (!entries.has(asset.path)) throw new Error(`分享包缺少素材: ${asset.path}`)
      await this.assertProfileEmbeddedBudget(source, (asset) => this.resolveWithinRoot(temporaryRoot, asset), signal, '主题导入已取消。')

      const imported = parseThemeProfile({ ...structuredClone(source), id: randomUUID(), updatedAt: new Date().toISOString(), resetColors: { ...source.colors } })
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
    const previous = await this.get(profile.id)
    await this.validateProfileMedia(profile)
    await this.validateProfileAssets(profile)
    await this.assertProfileEmbeddedBudget(profile)
    const next = { ...profile, name: this.cleanName(profile.name), updatedAt: new Date().toISOString() }
    for (const asset of this.collectAssets(next)) this.resolveAsset(next.id, asset)
    await this.writeProfile(next)
    await this.pruneReplacedAssets(previous, next)
    return next
  }

  async delete(id: string): Promise<void> {
    const settings = await this.readSettings()
    this.assertId(id)
    if (settings.systemThemeId === id) throw new Error('系统默认主题不能删除。')
    const themes = await this.list()
    if (themes.length <= 1) throw new Error('At least one theme must remain.')
    const fallback = settings.activeThemeId === id ? themes.find((theme) => theme.id !== id) : undefined
    if (settings.activeThemeId === id && !fallback) throw new Error('No fallback theme is available.')
    const themeRoot = this.themeRoot(id)
    const tombstone = join(this.themesRoot, `.theme-delete-${id}-${randomUUID()}`)
    await rename(themeRoot, tombstone)
    await this.syncParentDirectory(tombstone)
    try {
      if (fallback) await this.writeSettings({ ...settings, activeThemeId: fallback.id })
    } catch (error) {
      try {
        await rename(tombstone, themeRoot)
        await this.syncParentDirectory(themeRoot)
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], '主题删除设置写入失败，目录将在下次启动时恢复。')
      }
      throw error
    }
    await rm(tombstone, { recursive: true, force: true }).catch(() => undefined)
    await this.syncParentDirectory(tombstone)
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
    if (extension === '.gif' && purpose !== 'icon') throw new Error('GIF 仅支持作为自定义图标导入。')
    if (extension === '.gif' && sourceStat.size > MAX_ICON_GIF_BYTES) throw new Error('GIF 图标不能超过 5 MB。')
    const outputExtension = extension === '.svg' ? '.png' : extension
    const relativePath = `assets/${purpose}-${randomUUID()}${outputExtension}`
    const destination = this.resolveAsset(themeId, relativePath)
    const temporary = `${destination}.${randomUUID()}.tmp`
    await mkdir(dirname(destination), { recursive: true })

    try {
      let gifPosterDataUrl: string | undefined
      let importedMetadata: { width: number; height: number } | null = null
      if (extension === '.svg') {
        const source = await readFile(sourcePath, 'utf8')
        this.assertSafeSvg(source)
        await this.inspectImage(Buffer.from(source), extension)
        await sharp(Buffer.from(source)).png().toFile(temporary)
        importedMetadata = await this.inspectImage(temporary, '.png')
      } else if (extension === '.gif') {
        const source = await readFile(sourcePath)
        await this.inspectImage(source, extension)
        const prepared = await prepareIconGif(source)
        await writeFile(temporary, prepared.bytes)
        gifPosterDataUrl = prepared.posterDataUrl
        importedMetadata = prepared
      } else {
        await this.inspectImage(sourcePath, extension)
        await copyFile(sourcePath, temporary)
      }

      const metadata = importedMetadata ?? await sharp(temporary).metadata()
      if (!metadata.width || !metadata.height) throw new Error('Imported image dimensions are unavailable.')
      await this.syncFile(temporary)
      await rename(temporary, destination)
      this.trackPendingAsset(themeId, relativePath)
      return {
        relativePath,
        dataUrl: await this.readAssetDataUrl(themeId, relativePath),
        gifPosterDataUrl,
        mediaType: this.mediaType(outputExtension),
        originalName: basename(sourcePath),
        width: metadata.width,
        height: metadata.height
      }
    } catch (error) {
      await Promise.all([
        rm(temporary, { force: true }).catch(() => undefined),
        rm(destination, { force: true }).catch(() => undefined)
      ])
      throw error
    }
  }

  async importFontAsset(themeId: string, sourcePath: string): Promise<ImportedFontAsset> {
    await this.get(themeId)
    if (!isAbsolute(sourcePath)) throw new Error('The selected font path must be absolute.')
    const sourceStat = await stat(sourcePath)
    if (!sourceStat.isFile() || sourceStat.size > MAX_FONT_BYTES) throw new Error('Font must be a file no larger than 12 MB.')

    const extension = extname(sourcePath).toLowerCase().slice(1) as ImportedFontFormat
    if (!FONT_EXTENSIONS.has(extension)) throw new Error('Unsupported font format.')
    const data = await readFile(sourcePath)
    if (data.byteLength !== sourceStat.size || data.byteLength > MAX_FONT_BYTES) throw new Error('字体文件在读取期间发生变化。')
    await validateFontBytes(data, extension)

    const relativePath = `assets/font-${randomUUID()}.${extension}`
    const destination = this.resolveAsset(themeId, relativePath)
    const temporary = `${destination}.${randomUUID()}.tmp`
    await mkdir(dirname(destination), { recursive: true })
    try {
      await writeFile(temporary, data, { flag: 'wx' })
      await this.syncFile(temporary)
      await rename(temporary, destination)
      this.trackPendingAsset(themeId, relativePath)
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
    } catch (error) {
      await Promise.all([
        rm(temporary, { force: true }).catch(() => undefined),
        rm(destination, { force: true }).catch(() => undefined)
      ])
      throw error
    }
  }

  async compile(id: string): Promise<CompiledTheme> {
    const profile = await this.get(id)
    await this.assertProfileEmbeddedBudget(profile)
    const budget = new EmbeddedAssetBudget()
    const readPreset = this.bundledSystemAssets?.conversationBubbles
      ? async (presetId: ConversationBubblePresetId): Promise<string> => {
        const path = this.bundledSystemAssets?.conversationBubbles?.[presetId]
        if (!path) throw new Error(`内置聊天气泡预设缺失: ${presetId}`)
        const data = await this.readEmbeddedFile(path, `builtin/conversation-bubbles/${presetId}`, budget)
        return `data:image/png;base64,${data.toString('base64')}`
      }
      : undefined
    return compileTheme(profile, (asset) => this.readAssetDataUrl(id, asset, budget), readPreset)
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

  private async readAssetDataUrl(themeId: string, asset: string, budget?: EmbeddedAssetBudget): Promise<string> {
    const path = this.resolveAsset(themeId, asset)
    const data = await this.readEmbeddedFile(path, asset, budget)
    return `data:${this.mediaType(extname(path).toLowerCase())};base64,${data.toString('base64')}`
  }

  private collectAssets(profile: ThemeProfile): string[] { return collectThemeAssets(profile) }

  private async readEmbeddedFile(path: string, key: string, budget?: EmbeddedAssetBudget): Promise<Buffer> {
    const handle = await open(path, 'r')
    try {
      const before = await handle.stat()
      if (!before.isFile()) throw new Error(`主题素材不是普通文件: ${key}`)
      budget?.set(key, before.size)
      const data = await handle.readFile()
      const after = await handle.stat()
      if (after.size !== before.size || data.byteLength !== before.size) throw new Error(`主题素材在读取期间发生变化: ${key}`)
      return data
    } finally {
      await handle.close()
    }
  }

  private async assertProfileEmbeddedBudget(
    profile: ThemeProfile,
    resolveAssetPath: (asset: string) => string = (asset) => this.resolveAsset(profile.id, asset),
    signal?: AbortSignal,
    cancelledMessage = '主题操作已取消。'
  ): Promise<void> {
    const budget = new EmbeddedAssetBudget()
    const gifIconAssets = new Set(Object.values(profile.icons)
      .filter((icon) => icon.kind === 'asset' && extname(icon.asset).toLowerCase() === '.gif')
      .map((icon) => icon.kind === 'asset' ? icon.asset : ''))
    for (const asset of compiledAssetNames(profile)) {
      this.throwIfAborted(signal, cancelledMessage)
      const source = resolveAssetPath(asset)
      const data = await this.readEmbeddedFile(source, asset, budget)
      if (gifIconAssets.has(asset)) {
        const prepared = await prepareIconGif(data)
        budget.set(asset, prepared.bytes.byteLength)
        budget.set(gifPosterAssetKey(asset), dataUrlByteLength(prepared.posterDataUrl))
      } else if (extname(asset).toLowerCase() === '.gif') {
        const prepared = await prepareGif(data)
        budget.set(asset, prepared.bytes.byteLength)
        budget.set(gifPosterAssetKey(asset), dataUrlByteLength(prepared.posterDataUrl))
      }
    }
    if (this.bundledSystemAssets?.conversationBubbles) {
      for (const [presetId, path] of Object.entries(this.bundledSystemAssets.conversationBubbles)) {
        this.throwIfAborted(signal, cancelledMessage)
        await this.readEmbeddedFile(path, `builtin/conversation-bubbles/${presetId}`, budget)
      }
    }
    if (this.bundledSystemAssets?.resourcesRoot) {
      await budgetSelectedBuiltinFonts(profile, this.bundledSystemAssets.resourcesRoot, budget)
    }
  }

  private async importOptimizedVideo(themeId: string, sourcePath: string, purpose: VideoMediaRole, inspection: VideoAssetInspection, signal?: AbortSignal): Promise<ImportedMediaAsset> {
    const preserveOriginal = inspection.portable
    const sourceExtension = extname(sourcePath).toLowerCase()
    const token = randomUUID()
    const originalAsset = `assets/${purpose}-${token}${sourceExtension}`
    const optimizedAsset = `assets/${purpose}-${token}-optimized.mp4`
    const originalPath = this.resolveAsset(themeId, originalAsset)
    const optimizedPath = this.resolveAsset(themeId, optimizedAsset)
    const originalTemporary = `${originalPath}.${randomUUID()}.tmp`
    const optimizedTemporary = `${optimizedPath}.${randomUUID()}.tmp.mp4`
    await mkdir(dirname(originalPath), { recursive: true })
    try {
      if (preserveOriginal) await pipeline(createReadStream(sourcePath), createWriteStreamChecked(originalTemporary), { signal })
      await transcodeVideo({ inputPath: sourcePath, outputPath: optimizedTemporary, inspection, signal })
      this.throwIfAborted(signal, '视频优化已取消。')
      const optimizedStat = await stat(optimizedTemporary)
      const optimizedInspection = await this.inspectVideo(optimizedTemporary, '.mp4', optimizedStat.size, signal, '视频优化已取消。')
      assertOptimizedVideoInspection(inspection, optimizedInspection)
      await Promise.all([
        ...(preserveOriginal ? [this.syncFile(originalTemporary)] : []),
        this.syncFile(optimizedTemporary)
      ])
      if (preserveOriginal) await rename(originalTemporary, originalPath)
      await rename(optimizedTemporary, optimizedPath)

      const optimized = this.videoVariant(optimizedAsset, 'video/mp4', optimizedInspection)
      const reference = preserveOriginal
        ? createVideoVariantReference(
            this.videoVariant(originalAsset, mediaMimeTypeForPath(originalAsset) as 'video/mp4' | 'video/webm', inspection),
            optimized
          )
        : mediaReferenceForPath(optimizedAsset)
      if (preserveOriginal) this.trackPendingAsset(themeId, originalAsset)
      this.trackPendingAsset(themeId, optimizedAsset)
      return {
        reference,
        relativePath: optimizedAsset,
        previewUrl: this.mediaPreviewUrl(themeId, optimizedAsset),
        originalName: basename(sourcePath),
        width: optimized.width,
        height: optimized.height
      }
    } catch (error) {
      await Promise.all([
        rm(originalTemporary, { force: true }).catch(() => undefined),
        rm(optimizedTemporary, { force: true }).catch(() => undefined),
        rm(originalPath, { force: true }).catch(() => undefined),
        rm(optimizedPath, { force: true }).catch(() => undefined)
      ])
      if (signal?.aborted) throw new Error('视频优化已取消。')
      throw error
    }
  }

  private videoVariant(asset: string, mimeType: 'video/mp4' | 'video/webm', inspection: VideoAssetInspection): VideoAssetVariant {
    return {
      asset,
      mimeType,
      width: inspection.width,
      height: inspection.height,
      frameRate: inspection.frameRate
    }
  }

  private trackPendingAsset(themeId: string, asset: string): void {
    const pending = this.pendingAssets.get(themeId) ?? new Set<string>()
    pending.add(asset)
    this.pendingAssets.set(themeId, pending)
  }

  private mediaReferences(profile: ThemeProfile): Array<MediaReference | null> {
    return [
      profile.hero.source,
      profile.polaroid.source,
      profile.conversationBackground.source,
      profile.windowBackground.source,
      profile.accountMenuBackground.source,
      profile.brandSignature.source,
      profile.decorations.composerMelody.source,
      ...conversationBubbleMediaReferences(profile)
    ]
  }

  private mediaReferenceForRole(profile: ThemeProfile, role: VideoMediaRole): MediaReference | null {
    if (role === 'hero') return profile.hero.source
    if (role === 'polaroid') return profile.polaroid.source
    if (role === 'conversationBackground') return profile.conversationBackground.source
    return profile.windowBackground.source
  }

  private async syncFile(path: string): Promise<void> {
    const file = await open(path, 'r+')
    try { await file.sync() } finally { await file.close() }
  }

  private async pruneReplacedAssets(previous: ThemeProfile, next: ThemeProfile): Promise<void> {
    const retained = new Set(this.collectAssets(next))
    const candidates = new Set([...this.collectAssets(previous), ...(this.pendingAssets.get(next.id) ?? [])])
    await Promise.all([...candidates]
      .filter((asset) => !retained.has(asset))
      .map((asset) => rm(this.resolveAsset(next.id, asset), { force: true }).catch(() => undefined)))
    this.pendingAssets.delete(next.id)
  }

  private async writeProfile(profile: ThemeProfile): Promise<void> {
    await mkdir(this.assetRoot(profile.id), { recursive: true })
    await this.writeJsonAtomic(join(this.themeRoot(profile.id), 'theme.json'), profile)
  }

  private async readSettings(): Promise<StudioSettings> {
    const parsed = await this.readJsonWithRecovery(this.settingsPath, (content) =>
      JSON.parse(content) as Partial<StudioSettings> | Partial<LegacyStudioSettings>)
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

  private async readJsonWithRecovery<T>(path: string, parse: (content: string) => T): Promise<T> {
    let content: string
    try {
      content = await readFile(path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !(await this.restoreMissingJsonFile(path))) throw error
      content = await readFile(path, 'utf8')
    }
    const value = parse(content)
    await rm(`${path}.previous`, { force: true }).catch(() => undefined)
    return value
  }

  private async restoreMissingJsonFile(path: string): Promise<boolean> {
    const backup = `${path}.previous`
    try {
      await stat(path)
      await rm(backup, { force: true }).catch(() => undefined)
      return false
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    try {
      await rename(backup, path)
      await this.syncParentDirectory(path)
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw error
    }
  }

  private async reconcileThemeTombstones(settings: StudioSettings): Promise<void> {
    const referenced = new Set([settings.activeThemeId, settings.systemThemeId])
    const entries = await readdir(this.themesRoot, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const match = THEME_DELETE_TOMBSTONE_PATTERN.exec(entry.name)
      const id = match?.[1]
      if (!id) continue
      const tombstone = join(this.themesRoot, entry.name)
      const themeRoot = this.themeRoot(id)
      if (referenced.has(id) && !(await pathExists(themeRoot))) {
        await rename(tombstone, themeRoot)
      } else {
        await rm(tombstone, { recursive: true, force: true }).catch(() => undefined)
      }
      await this.syncParentDirectory(tombstone)
    }
  }

  private async cleanupStartupArtifacts(): Promise<void> {
    const rootEntries = await readdir(this.root, { withFileTypes: true }).catch(() => [])
    await Promise.all(rootEntries
      .filter((entry) => !entry.isDirectory() && CONTROLLED_TEMP_FILE_PATTERN.test(entry.name))
      .map((entry) => rm(join(this.root, entry.name), { force: true }).catch(() => undefined)))

    const themeEntries = await readdir(this.themesRoot, { withFileTypes: true })
    for (const entry of themeEntries) {
      const entryPath = join(this.themesRoot, entry.name)
      if (entry.isDirectory() && CONTROLLED_TEMP_DIRECTORY_PATTERN.test(entry.name)) {
        await rm(entryPath, { recursive: true, force: true })
        continue
      }
      if (entry.isDirectory() && THEME_ID_PATTERN.test(entry.name)) await this.cleanupControlledTempFiles(entryPath)
      else if (!entry.isDirectory() && CONTROLLED_TEMP_FILE_PATTERN.test(entry.name)) await rm(entryPath, { force: true })
    }
  }

  private async cleanupControlledTempFiles(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const entryPath = join(directory, entry.name)
      if (entry.isDirectory()) await this.cleanupControlledTempFiles(entryPath)
      else if (CONTROLLED_TEMP_FILE_PATTERN.test(entry.name)) await rm(entryPath, { force: true }).catch(() => undefined)
    }
  }

  private async cleanupOrphanedAssets(): Promise<void> {
    const entries = await readdir(this.themesRoot, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory() || !THEME_ID_PATTERN.test(entry.name)) continue
      const profile = await this.get(entry.name).catch(() => null)
      if (!profile) continue
      const retained = new Set(this.collectAssets(profile))
      const themeRoot = this.themeRoot(profile.id)
      await this.cleanupOrphanedAssetDirectory(this.assetRoot(profile.id), themeRoot, retained)
    }
  }

  private async cleanupOrphanedAssetDirectory(directory: string, themeRoot: string, retained: Set<string>): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const entryPath = join(directory, entry.name)
      if (entry.isDirectory()) {
        await this.cleanupOrphanedAssetDirectory(entryPath, themeRoot, retained)
        await rmdir(entryPath).catch(() => undefined)
        continue
      }
      const asset = relative(themeRoot, entryPath).split(requireSeparator()).join('/')
      if (!retained.has(asset)) await rm(entryPath, { force: true }).catch(() => undefined)
    }
  }

  private async syncParentDirectory(path: string): Promise<void> {
    let directory: Awaited<ReturnType<typeof open>> | null = null
    try {
      directory = await open(dirname(path), 'r')
      await directory.sync()
    } catch {
      // Directory fsync is unavailable on some supported Windows filesystems.
    } finally {
      await directory?.close().catch(() => undefined)
    }
  }

  async importMediaAsset(themeId: string, sourcePath: string, purpose: MediaAssetPurpose, expectedKind?: MediaSelectionKind, signal?: AbortSignal, optimizeVideo = false, preflight?: VideoSourcePreflight): Promise<ImportedMediaAsset> {
    await this.get(themeId)
    if (!isAbsolute(sourcePath)) throw new Error('所选媒体路径必须是绝对路径。')
    const sourceStat = await stat(sourcePath)
    if (!sourceStat.isFile()) throw new Error('所选媒体必须是文件。')
    const extension = extname(sourcePath).toLowerCase()
    const conversationBubble = isConversationBubblePurpose(purpose)
    if (extension !== '.svg' && !MEDIA_IMAGE_EXTENSIONS.has(extension) && !VIDEO_EXTENSIONS.has(extension)) throw new Error('仅支持 PNG、WebP、JPEG、GIF、SVG、MP4 和 WebM。')
    if (purpose === 'brandSignature' && VIDEO_EXTENSIONS.has(extension)) throw new Error('品牌签名只能选择图片或 GIF 文件。')
    if (purpose === 'composerMelody' && VIDEO_EXTENSIONS.has(extension)) throw new Error('输入框装饰只能选择图片或 GIF 文件。')
    if (purpose === 'accountMenuBackground' && VIDEO_EXTENSIONS.has(extension)) throw new Error('账号菜单背景只能选择图片或 GIF 文件。')
    if (conversationBubble && VIDEO_EXTENSIONS.has(extension)) throw new Error('聊天气泡只能选择图片或 GIF 文件。')
    if (expectedKind === 'image' && (extension === '.gif' || VIDEO_EXTENSIONS.has(extension))) throw new Error('图片背景只支持 PNG、WebP、JPEG 或 SVG。')
    if (expectedKind === 'gif' && extension !== '.gif') throw new Error('GIF 背景必须选择 GIF 文件。')
    if (expectedKind === 'video' && !VIDEO_EXTENSIONS.has(extension)) throw new Error('视频背景只支持 MP4 或 WebM。')
    if (conversationBubble && expectedKind === 'video') throw new Error('聊天气泡不支持视频素材。')
    if ((extension === '.svg' || MEDIA_IMAGE_EXTENSIONS.has(extension)) && sourceStat.size > (conversationBubble ? MAX_CONVERSATION_BUBBLE_BYTES : MAX_ASSET_BYTES)) {
      throw new Error(conversationBubble ? '聊天气泡图片和 GIF 不能超过 10 MB。' : '图片和 GIF 文件不能超过 30 MB。')
    }
    if (signal?.aborted) throw new Error('媒体导入已取消。')

    let metadata: { width: number; height: number; pages?: number }
    let videoInspection: VideoAssetInspection | null = null
    if (VIDEO_EXTENSIONS.has(extension)) {
      videoInspection = preflight
        && preflight.sourcePath === sourcePath
        && preflight.size === sourceStat.size
        && preflight.mtimeMs === sourceStat.mtimeMs
        ? preflight.inspection
        : await this.inspectVideo(sourcePath, extension, sourceStat.size, signal, '媒体导入已取消。')
      metadata = videoInspection
    } else if (extension === '.svg') {
      const source = await readFile(sourcePath, 'utf8')
      this.assertSafeSvg(source)
      metadata = await this.inspectImage(Buffer.from(source), extension, signal, '媒体导入已取消。')
    } else {
      metadata = await this.inspectImage(sourcePath, extension, signal, '媒体导入已取消。')
    }
    if (conversationBubble) this.assertConversationBubbleInspection(metadata, extension)
    await this.assertDiskSpace(this.assetRoot(themeId), sourceStat.size)
    if (videoInspection && !videoInspection.portable && !optimizeVideo) {
      throw new Error('该视频需要转换为跨平台兼容格式后才能导入。')
    }
    if (videoInspection && optimizeVideo) {
      return this.importOptimizedVideo(themeId, sourcePath, purpose as VideoMediaRole, videoInspection, signal)
    }

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
        metadata = await this.inspectImage(temporary, '.png', signal, '媒体导入已取消。')
      } else if (purpose === 'brandSignature' && extension === '.gif') {
        const normalized = ensureGifInfiniteLoop(await readFile(sourcePath, { signal }))
        if (normalized.byteLength > MAX_ASSET_BYTES) throw new Error('图片和 GIF 文件不能超过 30 MB。')
        await writeFile(temporary, normalized, { signal })
      } else {
        await pipeline(createReadStream(sourcePath), createWriteStreamChecked(temporary), { signal })
      }
      const temporaryFile = await open(temporary, 'r+')
      try { await temporaryFile.sync() } finally { await temporaryFile.close() }
      await rename(temporary, destination)
      if (conversationBubble && (await stat(destination)).size > MAX_CONVERSATION_BUBBLE_BYTES) {
        throw new Error('聊天气泡图片和 GIF 不能超过 10 MB。')
      }
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined)
      await rm(destination, { force: true }).catch(() => undefined)
      if (signal?.aborted) throw new Error('媒体导入已取消。')
      throw error
    }

    const reference = mediaReferenceForPath(relativePath)
    this.trackPendingAsset(themeId, relativePath)
    return {
      reference,
      relativePath,
      previewUrl: this.mediaPreviewUrl(themeId, relativePath),
      originalName: basename(sourcePath),
      width: metadata.width,
      height: metadata.height
    }
  }

  async inspectVideoSource(sourcePath: string, signal?: AbortSignal): Promise<VideoAssetInspection> {
    return (await this.preflightVideoSource(sourcePath, signal)).inspection
  }

  async preflightVideoSource(sourcePath: string, signal?: AbortSignal): Promise<VideoSourcePreflight> {
    this.throwIfAborted(signal, '媒体导入已取消。')
    if (!isAbsolute(sourcePath)) throw new Error('所选视频路径必须是绝对路径。')
    const extension = extname(sourcePath).toLowerCase()
    if (!VIDEO_EXTENSIONS.has(extension)) throw new Error('视频只支持 MP4 或 WebM。')
    const sourceStat = await stat(sourcePath)
    if (!sourceStat.isFile()) throw new Error('所选视频必须是文件。')
    const inspection = await this.inspectVideo(sourcePath, extension, sourceStat.size, signal, '媒体导入已取消。')
    return { sourcePath, size: sourceStat.size, mtimeMs: sourceStat.mtimeMs, inspection }
  }

  async inspectReferencedVideo(themeId: unknown, asset: unknown): Promise<VideoAssetInspection> {
    if (typeof themeId !== 'string' || typeof asset !== 'string') throw new Error('视频参数无效。')
    const profile = await this.get(themeId)
    const reference = this.mediaReferences(profile).find((candidate) =>
      candidate?.kind === 'video' && mediaReferenceAssets(candidate).some((variant) => variant.asset === asset)
    )
    if (!reference && !this.pendingAssets.get(themeId)?.has(asset)) throw new Error('该视频未被当前主题引用。')
    const path = this.resolveAsset(themeId, asset)
    const file = await stat(path)
    if (!file.isFile()) throw new Error('视频文件不存在。')
    return this.inspectVideo(path, extname(asset).toLowerCase(), file.size)
  }

  async optimizeReferencedVideo(themeId: unknown, role: unknown, asset: unknown, signal?: AbortSignal): Promise<ImportedMediaAsset> {
    if (typeof themeId !== 'string' || !isVideoMediaRole(role) || typeof asset !== 'string') throw new Error('视频优化参数无效。')
    const profile = await this.get(themeId)
    const savedReference = this.mediaReferenceForRole(profile, role)
    const reference = savedReference?.kind === 'video' && savedReference.asset === asset
      ? savedReference
      : this.pendingAssets.get(themeId)?.has(asset) ? mediaReferenceForPath(asset) : null
    if (reference?.kind !== 'video') throw new Error('视频与主题位置不匹配。')
    if (reference.videoVariants) throw new Error('该视频已经包含优化版本。')
    const sourcePath = this.resolveAsset(themeId, reference.asset)
    const sourceStat = await stat(sourcePath)
    if (!sourceStat.isFile()) throw new Error('视频文件不存在。')
    if (reference.mimeType !== 'video/mp4' && reference.mimeType !== 'video/webm') throw new Error('视频 MIME 类型无效。')
    const inspection = await this.inspectVideo(sourcePath, extname(sourcePath).toLowerCase(), sourceStat.size, signal, '视频优化已取消。')
    if (!inspection.highLoad && inspection.portable) throw new Error('该视频无需优化。')
    await this.assertDiskSpace(this.assetRoot(themeId), sourceStat.size)

    const optimizedAsset = `assets/${role}-${randomUUID()}-optimized.mp4`
    const optimizedPath = this.resolveAsset(themeId, optimizedAsset)
    const temporary = `${optimizedPath}.${randomUUID()}.tmp.mp4`
    await mkdir(dirname(optimizedPath), { recursive: true })
    try {
      await transcodeVideo({ inputPath: sourcePath, outputPath: temporary, inspection, signal })
      this.throwIfAborted(signal, '视频优化已取消。')
      const optimizedStat = await stat(temporary)
      const optimizedInspection = await this.inspectVideo(temporary, '.mp4', optimizedStat.size, signal, '视频优化已取消。')
      assertOptimizedVideoInspection(inspection, optimizedInspection)
      await this.syncFile(temporary)
      await rename(temporary, optimizedPath)
      const optimized = this.videoVariant(optimizedAsset, 'video/mp4', optimizedInspection)
      const nextReference = inspection.portable
        ? createVideoVariantReference(this.videoVariant(reference.asset, reference.mimeType, inspection), optimized)
        : mediaReferenceForPath(optimizedAsset)
      this.trackPendingAsset(themeId, optimizedAsset)
      return {
        reference: nextReference,
        relativePath: optimizedAsset,
        previewUrl: this.mediaPreviewUrl(themeId, optimizedAsset),
        originalName: basename(reference.asset),
        width: optimized.width,
        height: optimized.height
      }
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined)
      await rm(optimizedPath, { force: true }).catch(() => undefined)
      if (signal?.aborted) throw new Error('视频优化已取消。')
      throw error
    }
  }

  async getMediaPreviewUrl(themeId: unknown, asset: unknown): Promise<string> {
    if (typeof themeId !== 'string' || typeof asset !== 'string') throw new Error('媒体预览参数无效。')
    const profile = await this.get(themeId)
    const reference = this.mediaReferences(profile).find((media) => media && mediaReferenceAssets(media).some((variant) => variant.asset === asset))
    if (!reference && !this.pendingAssets.get(themeId)?.has(asset) && !(await this.isBundledSystemAsset(themeId, asset))) throw new Error('该媒体未被当前主题引用。')
    const path = this.resolveAsset(themeId, asset)
    const file = await stat(path)
    if (!file.isFile()) throw new Error('媒体文件不存在。')
    return this.mediaPreviewUrl(themeId, asset)
  }

  async resolveReferencedMedia(themeId: unknown, asset: unknown): Promise<{ path: string; mimeType: string; size: number }> {
    if (typeof themeId !== 'string' || typeof asset !== 'string') throw new Error('媒体参数无效。')
    const profile = await this.get(themeId)
    const reference = this.mediaReferences(profile).find((media) => media && mediaReferenceAssets(media).some((variant) => variant.asset === asset))
    if (!reference && !this.pendingAssets.get(themeId)?.has(asset) && !(await this.isBundledSystemAsset(themeId, asset))) throw new Error('该媒体未被主题引用。')
    const path = this.resolveAsset(themeId, asset)
    const file = await stat(path)
    if (!file.isFile()) throw new Error('媒体文件不存在。')
    const variant = reference ? mediaReferenceAssets(reference).find((candidate) => candidate.asset === asset) : null
    return { path, mimeType: variant?.mimeType ?? mediaMimeTypeForPath(asset), size: file.size }
  }

  private async isBundledSystemAsset(themeId: string, asset: string): Promise<boolean> {
    if (!this.bundledSystemAssets || !BUNDLED_SYSTEM_ASSETS.has(asset)) return false
    const settings = await this.readSettings()
    return settings.systemThemeId === themeId
  }

  async getRuntimeMediaBindings(themeId: string): Promise<Array<{ role: 'hero' | 'polaroid' | 'conversationBackground' | 'windowBackground'; path: string; mimeType: string }>> {
    const profile = await this.get(themeId)
    const bindings: Array<{ role: 'hero' | 'polaroid' | 'conversationBackground' | 'windowBackground'; path: string; mimeType: string }> = []
    for (const [role, reference] of [['hero', profile.hero.source], ['polaroid', profile.polaroid.source], ['conversationBackground', profile.conversationBackground.source], ['windowBackground', profile.windowBackground.source]] as const) {
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
      profile.polaroid.sourceSize = { width: polaroidSize.width, height: polaroidSize.height }
      profile.polaroid.placement = { x: 0.8278561014524648, y: 0.7127831468304384, width: 0.15, rotation: -15, hideBelowWidth: 920 }
      profile.icons.backgroundRain = { kind: 'builtin', name: 'wand-sparkles' }
      profile.decorations.sparkles = {
        visible: true,
        effect: 'rain',
        speed: 1,
        performanceMode: 'balanced',
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
    try {
      await this.restoreMissingJsonFile(path)
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined)
      throw error
    }
    let hadOriginal = false
    try {
      try { await rename(path, backup); hadOriginal = true } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      if (hadOriginal) await this.syncParentDirectory(path)
      await rename(temporary, path)
      await this.syncParentDirectory(path)
    } catch (error) {
      await rm(temporary, { force: true })
      if (hadOriginal) {
        await rename(backup, path).catch(() => undefined)
        await this.syncParentDirectory(path)
      }
      throw error
    }
    if (hadOriginal) {
      await rm(backup, { force: true }).catch(() => undefined)
      await this.syncParentDirectory(path)
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
    const ZipArchive = (archiver as unknown as { ZipArchive: new (options?: Record<string, unknown>) => ShareArchiveWriter }).ZipArchive
    const archive = new ZipArchive({ forceZip64: true, zlib: { level: 6 } })
    try {
      await finalizeShareArchive(archive, output, () => {
        archive.pipe(output)
        archive.append(Buffer.from(manifest), { name: 'manifest.json' })
        archive.append(Buffer.from(profile), { name: 'theme.json' })
        for (const [asset, sourcePath] of assets) archive.append(createReadStream(sourcePath), { name: asset })
      }, signal)
      this.throwIfAborted(signal, '主题导出已取消。')
      assertShareCompressedSize((await stat(temporary)).size)
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
    }
  }

  private async extractShareArchive(sourcePath: string, compressedSize: number, temporaryRoot: string, signal?: AbortSignal): Promise<Map<string, { path: string; size: number }>> {
    assertShareCompressedSize(compressedSize)
    this.throwIfAborted(signal, '主题导入已取消。')
    const zipFile = await openShareZip(sourcePath)
    const abortImport = (): void => zipFile.close()
    signal?.addEventListener('abort', abortImport, { once: true })
    try {
      const scanned = await scanShareZip(zipFile, signal)
      await this.assertDiskSpace(temporaryRoot, scanned.totalSize)
      const extracted = new Map<string, { path: string; size: number }>()
      let actualTotal = 0
      for (const entry of scanned.entries) {
        this.throwIfAborted(signal, '主题导入已取消。')
        const destination = entry.fileName.startsWith('assets/')
          ? this.resolveWithinRoot(temporaryRoot, entry.fileName)
          : join(temporaryRoot, entry.fileName)
        await mkdir(dirname(destination), { recursive: true })
        const stream = await openShareEntryStream(zipFile, entry, signal)
        let actualSize = 0
        const limiter = new Transform({
          transform: (chunk: Buffer, _encoding, callback) => {
            try {
              actualSize += chunk.byteLength
              if (actualSize > shareEntryLimit(entry.fileName)) throw new Error('分享包中的单个条目超过大小限制。')
              actualTotal = addShareUncompressedBytes(actualTotal, chunk.byteLength)
              callback(null, chunk)
            } catch (error) {
              callback(error instanceof Error ? error : new Error('分享包解压大小超过限制。'))
            }
          }
        })
        await pipeline(stream, limiter, createWriteStreamChecked(destination), { signal })
        if (actualSize !== entry.uncompressedSize) throw new Error('分享包条目大小与 ZIP 目录不一致。')
        extracted.set(entry.fileName, { path: destination, size: actualSize })
      }
      return extracted
    } catch (error) {
      if (signal?.aborted) throw new Error('主题导入已取消。')
      throw error
    } finally {
      signal?.removeEventListener('abort', abortImport)
      zipFile.close()
    }
  }

  private async validateShareAssetFile(asset: string, path: string, kind: 'image' | 'video' | 'font', signal?: AbortSignal, requirePortable = false): Promise<void> {
    const file = await stat(path)
    if (kind === 'image') {
      if (file.size > MAX_SHARE_IMAGE_BYTES) throw new Error('图片素材超过 30 MB 限制。')
      await this.inspectImage(path, extname(asset).toLowerCase(), signal, '主题导入已取消。')
      return
    }
    if (kind === 'video') {
      const inspection = await this.inspectVideo(path, extname(asset).toLowerCase(), file.size, signal, '主题导入已取消。')
      if (requirePortable) assertPortableVideoInspection(inspection)
      return
    }
    if (file.size > MAX_SHARE_FONT_BYTES) throw new Error('字体素材超过 12 MB 限制。')
    const format = extname(asset).toLowerCase().slice(1) as ImportedFontFormat
    const data = await readFile(path, { signal })
    if (data.byteLength !== file.size) throw new Error('字体素材在读取期间发生变化。')
    await validateFontBytes(data, format, signal, '主题导入已取消。')
  }

  private async validateShareAsset(asset: string, data: Buffer, kind: 'image' | 'video' | 'font'): Promise<void> {
    if (kind === 'image') {
      if (data.byteLength > MAX_SHARE_IMAGE_BYTES) throw new Error('图片素材超过 30 MB 限制。')
      await this.inspectImage(data, extname(asset).toLowerCase())
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
        const inspection = await this.inspectVideo(temporary, extension, data.byteLength)
        assertPortableVideoInspection(inspection)
      } finally { await rm(temporaryRoot, { recursive: true, force: true }).catch(() => undefined) }
      return
    }
    if (data.byteLength > MAX_SHARE_FONT_BYTES) throw new Error('字体素材超过 12 MB 限制。')
    const extension = extname(asset).toLowerCase().slice(1) as ImportedFontFormat
    await validateFontBytes(data, extension)
  }

  private async inspectImage(
    source: string | Buffer,
    extension: string,
    signal?: AbortSignal,
    cancelledMessage = '图片读取已取消。'
  ): Promise<{ width: number; height: number; pages: number }> {
    let bytes: Buffer
    try {
      bytes = typeof source === 'string' ? await readFile(source, { signal }) : source
    } catch (error) {
      if (signal?.aborted) throw new Error(cancelledMessage)
      throw error
    }
    return inspectImageBytes(bytes, extension, signal, cancelledMessage)
  }

  private assertConversationBubbleInspection(metadata: { width: number; height: number; pages?: number }, extension: string): void {
    if (Math.max(metadata.width, metadata.height) > MAX_CONVERSATION_BUBBLE_DIMENSION) {
      throw new Error('聊天气泡图片最长边不能超过 2048px。')
    }
    if (extension === '.gif' && (metadata.pages ?? 1) > MAX_CONVERSATION_BUBBLE_GIF_FRAMES) {
      throw new Error('聊天气泡 GIF 不能超过 180 帧。')
    }
  }

  private async validateProfileMedia(profile: ThemeProfile): Promise<void> {
    this.validateProfileAssetReferences(profile)
    for (const reference of this.mediaReferences(profile)) {
      if (!reference) continue
      for (const variant of mediaReferenceAssets(reference)) {
        const extension = extname(variant.asset).toLowerCase()
        if (!MEDIA_IMAGE_EXTENSIONS.has(extension) && !VIDEO_EXTENSIONS.has(extension)) throw new Error('主题媒体扩展名不受支持。')
        const expected = mediaMimeTypeForPath(variant.asset)
        if (expected !== variant.mimeType || (reference.kind === 'video') !== VIDEO_EXTENSIONS.has(extension)) throw new Error('主题媒体类型与文件扩展名不匹配。')
        const sourcePath = this.resolveAsset(profile.id, variant.asset)
        const sourceStat = await stat(sourcePath)
        if (!sourceStat.isFile()) throw new Error(`主题媒体不存在: ${variant.asset}`)
        if (reference.kind === 'video') {
          const inspection = await this.inspectVideo(sourcePath, extension, sourceStat.size)
          if (variant.asset === reference.asset) assertPortableVideoInspection(inspection)
        } else {
          if (sourceStat.size > MAX_ASSET_BYTES) throw new Error('图片和 GIF 文件不能超过 30 MB。')
          await this.inspectImage(sourcePath, extension)
        }
      }
    }
    for (const reference of conversationBubbleMediaReferences(profile)) {
      const sourcePath = this.resolveAsset(profile.id, reference.asset)
      const sourceStat = await stat(sourcePath)
      if (sourceStat.size > MAX_CONVERSATION_BUBBLE_BYTES) throw new Error('聊天气泡图片和 GIF 不能超过 10 MB。')
      const extension = extname(reference.asset).toLowerCase()
      const metadata = await this.inspectImage(sourcePath, extension)
      this.assertConversationBubbleInspection(metadata, extension)
    }
    const gifIconAssets = new Set(Object.values(profile.icons)
      .filter((icon) => icon.kind === 'asset' && extname(icon.asset).toLowerCase() === '.gif')
      .map((icon) => icon.kind === 'asset' ? icon.asset : ''))
    for (const asset of gifIconAssets) {
      const sourcePath = this.resolveAsset(profile.id, asset)
      const sourceStat = await stat(sourcePath)
      if (!sourceStat.isFile()) throw new Error(`GIF 图标不存在: ${asset}`)
      if (sourceStat.size > MAX_ICON_GIF_BYTES) throw new Error('GIF 图标不能超过 5 MB。')
      await inspectIconGif(await readFile(sourcePath))
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
    for (const reference of this.mediaReferences(profile)) {
      if (!reference) continue
      for (const variant of mediaReferenceAssets(reference)) {
        const extension = extname(variant.asset).toLowerCase()
        if (!MEDIA_IMAGE_EXTENSIONS.has(extension) && !VIDEO_EXTENSIONS.has(extension)) throw new Error('主题媒体扩展名不受支持。')
        const expected = mediaMimeTypeForPath(variant.asset)
        if (expected !== variant.mimeType || (reference.kind === 'video') !== VIDEO_EXTENSIONS.has(extension)) throw new Error('主题媒体类型与文件扩展名不匹配。')
      }
    }
    for (const icon of Object.values(profile.icons)) {
      if (icon.kind === 'asset' && assetKind(icon.asset) !== 'image') throw new Error('定制图标只能使用图片素材。')
    }
    for (const font of profile.typography.importedFonts) {
      if (assetKind(font.asset) !== 'font' || importedFontFormatForAsset(font.asset) !== font.format) {
        throw new Error('导入字体格式与素材扩展名不匹配。')
      }
    }
  }

  private async inspectVideo(sourcePath: string, extension: string, size: number, signal?: AbortSignal, cancelledMessage = '视频读取已取消。'): Promise<VideoAssetInspection> {
    this.throwIfAborted(signal, cancelledMessage)
    const handle = await open(sourcePath, 'r')
    try {
      const header = Buffer.alloc(Math.min(64 * 1024, size))
      const result = await handle.read(header, 0, header.length, 0)
      this.throwIfAborted(signal, cancelledMessage)
      const bytes = header.subarray(0, result.bytesRead)
      if (extension === '.mp4' && (bytes.length < 12 || bytes.toString('latin1', 4, 8) !== 'ftyp')) throw new Error('MP4 文件头无效。')
      if (extension === '.webm' && !(bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3)) throw new Error('WebM 文件头无效。')

      let width = 0
      let height = 0
      let frameRate = 0
      let duration = 0
      let codec = ''
      let videoProfile: string | null = null
      let bitDepth: number | null = null
      let chromaSubsampling: string | null = null
      let audioCodec: string | null = null
      let audioProfile: string | null = null
      let bitRate: number | null = null
      let hasAudio = false
      let portable = false
      try {
        this.throwIfAborted(signal, cancelledMessage)
        const info = await mediaInfoFactory({ format: 'object' })
        try {
          this.throwIfAborted(signal, cancelledMessage)
          const analyzed = await info.analyzeData(size, async (chunkSize, offset) => {
            this.throwIfAborted(signal, cancelledMessage)
            const chunk = Buffer.alloc(chunkSize)
            const read = await handle.read(chunk, 0, chunkSize, offset)
            this.throwIfAborted(signal, cancelledMessage)
            return chunk.subarray(0, read.bytesRead)
          })
          this.throwIfAborted(signal, cancelledMessage)
          const tracks = analyzed.media?.track ?? []
          const videoTracks = tracks.filter((item) => isTrackType(item, 'Video'))
          const audioTracks = tracks.filter((item) => isTrackType(item, 'Audio'))
          const track = videoTracks[0]
          const general = tracks.find((item) => isTrackType(item, 'General'))
          width = numericMediaInfoValue(track?.Width)
          height = numericMediaInfoValue(track?.Height)
          frameRate = numericMediaInfoValue(track?.FrameRate) || numericMediaInfoValue(track?.FrameRate_Original)
          duration = numericMediaInfoValue(track?.Duration) || numericMediaInfoValue(general?.Duration)
          const parsedBitRate = numericMediaInfoValue(track?.BitRate) || numericMediaInfoValue(general?.OverallBitRate)
          bitRate = parsedBitRate > 0 ? parsedBitRate : null
          codec = `${track?.Format ?? ''} ${track?.CodecID ?? ''}`.trim()
          videoProfile = mediaInfoStringValue(track?.Format_Profile)
          const parsedBitDepth = numericMediaInfoValue(track?.BitDepth)
          bitDepth = parsedBitDepth > 0 ? parsedBitDepth : null
          chromaSubsampling = mediaInfoStringValue(track?.ChromaSubsampling)
          const audioCodecs = audioTracks.map((item) => `${item.Format ?? ''} ${item.CodecID ?? ''}`.trim()).filter(Boolean)
          audioCodec = audioCodecs.length > 0 ? audioCodecs.join(', ') : null
          const audioProfiles = audioTracks
            .map((item) => mediaInfoStringValue(item.Format_AdditionalFeatures) ?? mediaInfoStringValue(item.Format_Profile))
            .filter((value): value is string => value !== null)
          audioProfile = audioProfiles.length > 0 ? audioProfiles.join(', ') : null
          hasAudio = audioTracks.length > 0
          portable = isPortableVideo({
            extension,
            videoCodec: codec,
            videoProfile,
            bitDepth,
            chromaSubsampling,
            audioCodec,
            audioProfile,
            videoTrackCount: videoTracks.length,
            audioTrackCount: audioTracks.length
          })
        } finally {
          info.close()
        }
      } catch {
        if (signal?.aborted) throw new Error(cancelledMessage)
        throw new Error('视频元数据无法读取，文件可能损坏或编码不受支持。')
      }
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('视频尺寸无效。')
      if (!Number.isFinite(frameRate) || frameRate <= 0 || frameRate > 240) throw new Error('视频帧率无效。')
      if (Math.max(width, height) > MAX_VIDEO_DIMENSION) throw new Error('视频最长边不能超过 4096px。')
      const roundedWidth = Math.round(width)
      const roundedHeight = Math.round(height)
      const longEdge = Math.max(roundedWidth, roundedHeight)
      const shortEdge = Math.min(roundedWidth, roundedHeight)
      return {
        width: roundedWidth,
        height: roundedHeight,
        frameRate,
        duration: Math.max(0, duration),
        codec: codec || 'Unknown',
        videoProfile,
        bitDepth,
        chromaSubsampling,
        audioCodec,
        audioProfile,
        bitRate,
        hasAudio,
        portable,
        highLoad: longEdge > 1920 || shortEdge > 1080 || frameRate > 30.5
      }
    } finally {
      await handle.close()
    }
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
  private assertId(id: string): void { if (!THEME_ID_PATTERN.test(id)) throw new Error('Theme ID is invalid.') }
  private cleanName(name: unknown): string { if (typeof name !== 'string') throw new Error('Theme name must be 1-80 characters.'); const result = name.trim(); if (!result || result.length > 80) throw new Error('Theme name must be 1-80 characters.'); return result }
  private mediaType(extension: string): string {
    if (extension === '.png') return 'image/png'
    if (extension === '.webp') return 'image/webp'
    if (extension === '.gif') return 'image/gif'
    if (extension === '.ttf') return 'font/ttf'
    if (extension === '.otf') return 'font/otf'
    if (extension === '.woff') return 'font/woff'
    if (extension === '.woff2') return 'font/woff2'
    return 'image/jpeg'
  }
  private fontMediaType(format: ImportedFontFormat): string { return this.mediaType(`.${format}`) }
  private assertSafeSvg(source: string): void {
    if (source.length > 2_000_000 || /<(?:script|foreignObject|iframe|object|embed)\b|<!DOCTYPE|<!ENTITY|(?:href|src)\s*=\s*["']\s*(?:https?:|file:|javascript:)/i.test(source)) {
      throw new Error('SVG contains unsupported or external content.')
    }
  }
}

function numericMediaInfoValue(value: unknown): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0
  return Number.isFinite(parsed) ? parsed : 0
}

function mediaInfoStringValue(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const normalized = String(value).trim()
  return normalized || null
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

function isVideoMediaRole(value: unknown): value is VideoMediaRole {
  return value === 'hero' || value === 'polaroid' || value === 'conversationBackground' || value === 'windowBackground'
}

function isConversationBubblePurpose(purpose: MediaAssetPurpose): purpose is 'conversationUserBubble' | 'conversationCodexBubble' | 'conversationPlanBubble' {
  return purpose === 'conversationUserBubble' || purpose === 'conversationCodexBubble' || purpose === 'conversationPlanBubble'
}

function requireSeparator(): string {
  return process.platform === 'win32' ? '\\' : '/'
}

function createWriteStreamChecked(path: string): ReturnType<typeof createWriteStream> {
  return createWriteStream(path, { flags: 'wx' })
}

async function openShareZip(path: string): Promise<import('yauzl').ZipFile> {
  return await new Promise((resolvePromise, reject) => {
    yauzl.open(path, { lazyEntries: true, autoClose: false, validateEntrySizes: true }, (error, zipFile) => {
      if (error || !zipFile) reject(error ?? new Error('分享包 ZIP 无效。'))
      else resolvePromise(zipFile)
    })
  })
}

async function scanShareZip(zipFile: import('yauzl').ZipFile, signal?: AbortSignal): Promise<{ entries: import('yauzl').Entry[]; totalSize: number }> {
  if (signal?.aborted) throw new Error('主题导入已取消。')
  return await new Promise((resolvePromise, reject) => {
    const entries: import('yauzl').Entry[] = []
    const seen = new Set<string>()
    let totalSize = 0
    let settled = false
    const cleanup = (): void => {
      zipFile.removeListener('entry', onEntry)
      zipFile.removeListener('end', onEnd)
      zipFile.removeListener('error', fail)
      signal?.removeEventListener('abort', onAbort)
    }
    const finish = (result: { entries: import('yauzl').Entry[]; totalSize: number }): void => {
      if (settled) return
      settled = true
      cleanup()
      resolvePromise(result)
    }
    const fail = (reason: unknown): void => {
      if (settled) return
      settled = true
      cleanup()
      reject(reason instanceof Error ? reason : new Error(String(reason)))
    }
    const onAbort = (): void => fail(new Error('主题导入已取消。'))
    const onEnd = (): void => finish({ entries, totalSize })
    const onEntry = (entry: import('yauzl').Entry): void => {
      try {
        assertSharePath(entry.fileName)
        const canonical = entry.fileName.toLowerCase()
        if (seen.has(canonical)) throw new Error('分享包包含重复条目。')
        seen.add(canonical)
        if (seen.size > MAX_SHARE_ENTRIES) throw new Error('分享包条目数量超过限制。')
        assertShareEntrySize(entry.fileName, entry.uncompressedSize)
        totalSize = addShareUncompressedBytes(totalSize, entry.uncompressedSize)
        entries.push(entry)
        zipFile.readEntry()
      } catch (error) {
        fail(error)
      }
    }
    zipFile.on('entry', onEntry)
    zipFile.once('end', onEnd)
    zipFile.once('error', fail)
    signal?.addEventListener('abort', onAbort, { once: true })
    zipFile.readEntry()
  })
}

async function openShareEntryStream(zipFile: import('yauzl').ZipFile, entry: import('yauzl').Entry, signal?: AbortSignal): Promise<NodeJS.ReadableStream> {
  return await new Promise((resolvePromise, reject) => {
    let settled = false
    const cleanup = (): void => signal?.removeEventListener('abort', onAbort)
    const onAbort = (): void => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error('主题导入已取消。'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) {
      onAbort()
      return
    }
    zipFile.openReadStream(entry, (error, stream) => {
      if (settled) {
        stream?.destroy()
        return
      }
      settled = true
      cleanup()
      if (error || !stream) reject(error ?? new Error('分享包条目读取失败。'))
      else resolvePromise(stream)
    })
  })
}

export async function hashFile(path: string, signal?: AbortSignal, cancelledMessage = '操作已取消。'): Promise<string> {
  const hash = createHash('sha256')
  try {
    for await (const chunk of createReadStream(path, { signal })) {
      if (signal?.aborted) throw new Error(cancelledMessage)
      hash.update(chunk as Buffer)
    }
    return hash.digest('hex')
  } catch (error) {
    if (signal?.aborted) throw new Error(cancelledMessage)
    throw error
  }
}
