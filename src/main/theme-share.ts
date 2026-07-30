import { createHash } from 'node:crypto'
import { extname } from 'node:path'
import { Unzip, UnzipInflate } from 'fflate'
import { z } from 'zod'
import { parseThemeProfile, type MediaReference, type ThemeProfile } from '../shared/theme'
import { conversationBubbleMediaReferences } from '../shared/conversation-bubbles'
import { mediaMimeTypeForPath, mediaReferenceAssets } from '../shared/media'
import { importedFontFormatForAsset, type ImportedFontFormat } from '../shared/typography'

export const THEME_SHARE_FORMAT = 'codex-dream-skin-theme' as const
export const THEME_SHARE_VERSION = 2 as const
const GIB = 1024 ** 3
export const MAX_SHARE_COMPRESSED_BYTES = 20 * GIB
export const MAX_SHARE_UNCOMPRESSED_BYTES = 10 * GIB
export const MAX_SHARE_VIDEO_BYTES = 2 * GIB
export const MAX_SHARE_ENTRIES = 128
export const MAX_SHARE_IMAGE_BYTES = 30 * 1024 * 1024
export const MAX_SHARE_FONT_BYTES = 12 * 1024 * 1024
export const MAX_SHARE_METADATA_BYTES = 5 * 1024 * 1024

const RASTER_EXTENSIONS = new Set(['.png', '.webp', '.jpg', '.jpeg', '.gif'])
const FONT_EXTENSIONS = new Set<ImportedFontFormat>(['ttf', 'otf', 'woff', 'woff2'])
const WINDOWS_RESERVED_NAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'clock$',
  'conin$',
  'conout$',
  ...Array.from({ length: 9 }, (_, index) => `com${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `lpt${index + 1}`)
])

const assetManifestSchema = z.object({
  path: z.string().min(1),
  kind: z.enum(['image', 'video', 'font']),
  size: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/i)
}).strict()

const manifestSchema = z.object({
  format: z.literal(THEME_SHARE_FORMAT),
  version: z.union([z.literal(1), z.literal(THEME_SHARE_VERSION)]),
  themeName: z.string().trim().min(1).max(80),
  profileVersion: z.number().int().min(0).max(28),
  assets: z.array(assetManifestSchema).max(MAX_SHARE_ENTRIES - 2)
}).strict()

export type ThemeShareAsset = z.infer<typeof assetManifestSchema>
export type ThemeShareManifest = z.infer<typeof manifestSchema>

export function collectThemeAssets(profile: ThemeProfile): string[] {
  const assets: Array<string | null> = [profile.hero.sourceImage ?? null, profile.polaroid.sourceImage ?? null]
  for (const reference of themeMediaReferences(profile)) {
    if (reference) assets.push(...mediaReferenceAssets(reference).map((variant) => variant.asset))
  }
  for (const icon of Object.values(profile.icons)) if (icon.kind === 'asset') assets.push(icon.asset)
  for (const font of profile.typography.importedFonts) assets.push(font.asset)
  return [...new Set(assets.filter((value): value is string => Boolean(value)))]
}

export function createShareProfile(profile: ThemeProfile): ThemeProfile {
  const shared = structuredClone(profile)
  for (const reference of themeMediaReferences(shared)) {
    if (!reference?.videoVariants) continue
    reference.asset = reference.videoVariants.optimized.asset
    reference.mimeType = reference.videoVariants.optimized.mimeType
    delete reference.videoVariants
  }
  return parseThemeProfile(shared)
}

export function validateThemeAssetReferences(profile: ThemeProfile): void {
  for (const reference of themeMediaReferences(profile)) {
    if (!reference) continue
    for (const variant of mediaReferenceAssets(reference)) {
      const extension = extname(variant.asset).toLowerCase()
      const expectedKind = extension === '.mp4' || extension === '.webm' ? 'video' : extension === '.png' || extension === '.webp' || extension === '.jpg' || extension === '.jpeg' || extension === '.gif' ? 'image' : null
      const expectedMime = mediaMimeTypeForPath(variant.asset)
      if (!expectedKind || reference.kind !== expectedKind || variant.mimeType !== expectedMime) throw new Error('主题媒体类型与文件扩展名不匹配。')
    }
  }
  for (const icon of Object.values(profile.icons)) if (icon.kind === 'asset' && assetKind(icon.asset) !== 'image') throw new Error('定制图标只能使用图片素材。')
  for (const font of profile.typography.importedFonts) {
    if (assetKind(font.asset) !== 'font' || importedFontFormatForAsset(font.asset) !== font.format) {
      throw new Error('导入字体格式与素材扩展名不匹配。')
    }
  }
}

export function assetKind(path: string): 'image' | 'video' | 'font' {
  const extension = extname(path).toLowerCase()
  if (extension === '.mp4' || extension === '.webm') return 'video'
  if (RASTER_EXTENSIONS.has(extension)) return 'image'
  if (FONT_EXTENSIONS.has(extension.slice(1) as ImportedFontFormat)) return 'font'
  throw new Error('主题包含不支持的素材格式。')
}

export function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

export function parseThemeShareManifest(input: unknown): ThemeShareManifest {
  const manifest = manifestSchema.parse(input)
  const seen = new Set<string>()
  let totalSize = 0
  for (const asset of manifest.assets) {
    assertSharePath(asset.path)
    const canonicalPath = asset.path.toLowerCase()
    if (!asset.path.startsWith('assets/') || seen.has(canonicalPath)) throw new Error('分享包素材清单包含重复或非法路径。')
    seen.add(canonicalPath)
    if (asset.kind !== assetKind(asset.path)) throw new Error('分享包素材类型与文件扩展名不匹配。')
    assertShareEntrySize(asset.path, asset.size)
    totalSize = addShareUncompressedBytes(totalSize, asset.size)
  }
  return manifest
}

export function shareProfileVersionMatches(manifest: ThemeShareManifest, serializedProfile: unknown, parsedVersion: number): boolean {
  if (!serializedProfile || typeof serializedProfile !== 'object' || !('version' in serializedProfile)) return false
  const serializedVersion = serializedProfile.version
  if (typeof serializedVersion !== 'number' || manifest.profileVersion !== serializedVersion) return false
  return serializedVersion === parsedVersion || (parsedVersion === 28 && serializedVersion >= 0 && serializedVersion <= 27)
}

function themeMediaReferences(profile: ThemeProfile): Array<MediaReference | null> {
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

export function assertSharePath(path: string): void {
  const parts = path.split('/')
  if (!path || path.includes('\\') || path.startsWith('/') || /[\u0000-\u001f<>:"|?*]/.test(path) || /^[a-zA-Z]:/.test(path) || parts.some((part) => !part || part === '.' || part === '..' || part.endsWith(' ') || part.endsWith('.') || isWindowsReservedName(part))) {
    throw new Error('分享包路径无效。')
  }
  if (path !== 'manifest.json' && path !== 'theme.json' && !path.startsWith('assets/')) throw new Error('分享包包含额外文件。')
}

function isWindowsReservedName(segment: string): boolean {
  const firstComponent = segment.split('.', 1)[0]?.trimEnd().toLowerCase()
  return firstComponent !== undefined && WINDOWS_RESERVED_NAMES.has(firstComponent)
}

export function assertShareCompressedSize(size: number): void {
  assertSafeByteCount(size)
  if (size > MAX_SHARE_COMPRESSED_BYTES) throw new Error('分享包超过 20 GiB 压缩大小限制。')
}

export function shareEntryLimit(path: string): number {
  assertSharePath(path)
  if (!path.startsWith('assets/')) return MAX_SHARE_METADATA_BYTES
  const kind = assetKind(path)
  if (kind === 'image') return MAX_SHARE_IMAGE_BYTES
  if (kind === 'font') return MAX_SHARE_FONT_BYTES
  return MAX_SHARE_VIDEO_BYTES
}

export function assertShareEntrySize(path: string, size: number): void {
  assertSafeByteCount(size)
  if (size > shareEntryLimit(path)) throw new Error('分享包中的单个条目超过大小限制。')
}

export function addShareUncompressedBytes(total: number, size: number): number {
  assertSafeByteCount(total)
  assertSafeByteCount(size)
  const next = total + size
  if (!Number.isSafeInteger(next) || next > MAX_SHARE_UNCOMPRESSED_BYTES) throw new Error('分享包解压总量超过 10 GiB 限制。')
  return next
}

function assertSafeByteCount(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('分享包大小信息无效。')
}

export function encodeJson(value: unknown): Uint8Array {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

export function decodeShareZip(source: Uint8Array): Map<string, Buffer> {
  assertShareCompressedSize(source.byteLength)
  const hasZipSignature = source.byteLength >= 4 && source[0] === 0x50 && source[1] === 0x4b && ((source[2] === 0x03 && source[3] === 0x04) || (source[2] === 0x05 && source[3] === 0x06))
  if (!hasZipSignature) {
    throw new Error('分享包 ZIP 无效。')
  }
  const entries = new Map<string, Buffer>()
  const seenPaths = new Set<string>()
  let totalSize = 0
  let entryCount = 0
  let failure: Error | null = null
  const unzip = new Unzip((file) => {
    if (failure) return
    try {
      entryCount += 1
      if (entryCount > MAX_SHARE_ENTRIES) throw new Error('分享包条目数量超过限制。')
      assertSharePath(file.name)
      const canonicalPath = file.name.toLowerCase()
      if (seenPaths.has(canonicalPath)) throw new Error('分享包包含重复条目。')
      seenPaths.add(canonicalPath)
      const entryLimit = shareEntryLimit(file.name)
      if (file.originalSize !== undefined) assertShareEntrySize(file.name, file.originalSize)
      if (file.originalSize !== undefined) {
        totalSize = addShareUncompressedBytes(totalSize, file.originalSize)
      }
      const chunks: Buffer[] = []
      let size = 0
      file.ondata = (error, chunk, final) => {
        if (failure) return
        if (error) {
          failure = new Error(`分享包解压失败: ${error.message}`)
          return
        }
        size += chunk.byteLength
        if (size > entryLimit) {
          failure = new Error('分享包中的单个条目超过大小限制。')
          file.terminate()
          return
        }
        if (file.originalSize === undefined) {
          try {
            totalSize = addShareUncompressedBytes(totalSize, chunk.byteLength)
          } catch (error) {
            failure = error instanceof Error ? error : new Error('分享包解压总量超过限制。')
            file.terminate()
            return
          }
        }
        chunks.push(Buffer.from(chunk))
        if (final) {
          if (file.originalSize !== undefined && size !== file.originalSize) {
            failure = new Error('分享包条目大小与 ZIP 目录不一致。')
            return
          }
          entries.set(file.name, Buffer.concat(chunks, size))
        }
      }
      file.start()
    } catch (error) {
      failure = error instanceof Error ? error : new Error('分享包解压失败。')
      file.terminate()
    }
  })
  unzip.register(UnzipInflate)
  try {
    unzip.push(source, true)
  } catch (error) {
    failure = failure ?? (error instanceof Error ? error : new Error('分享包 ZIP 无效。'))
  }
  if (failure) throw failure
  return entries
}

export function validateShareContents(entries: Map<string, Buffer>): { profile: ThemeProfile; manifest: ThemeShareManifest; assets: Map<string, Buffer> } {
  const manifestBytes = entries.get('manifest.json')
  const themeBytes = entries.get('theme.json')
  if (!manifestBytes || !themeBytes) throw new Error('分享包缺少 manifest.json 或 theme.json。')
  let manifestInput: unknown
  let themeInput: unknown
  try {
    manifestInput = JSON.parse(manifestBytes.toString('utf8')) as unknown
    themeInput = JSON.parse(themeBytes.toString('utf8')) as unknown
  } catch {
    throw new Error('分享包中的 JSON 文件无效。')
  }
  const manifest = parseThemeShareManifest(manifestInput)
  const profile = parseThemeProfile(themeInput)
  validateThemeAssetReferences(profile)
  if (manifest.themeName !== profile.name || !shareProfileVersionMatches(manifest, themeInput, profile.version)) throw new Error('分享包清单与主题配置不一致。')
  const listed = new Map(manifest.assets.map((asset) => [asset.path, asset]))
  const referenced = collectThemeAssets(profile)
  if (referenced.length !== listed.size || referenced.some((asset) => !listed.has(asset))) throw new Error('分享包素材清单与主题引用不一致。')
  for (const path of entries.keys()) {
    if (path !== 'manifest.json' && path !== 'theme.json' && !listed.has(path)) throw new Error('分享包包含未列出的素材。')
  }
  for (const asset of manifest.assets) {
    const data = entries.get(asset.path)
    if (!data || data.byteLength !== asset.size || sha256(data).toLowerCase() !== asset.sha256.toLowerCase()) throw new Error(`素材校验失败: ${asset.path}`)
  }
  return { profile, manifest, assets: new Map(manifest.assets.map((asset) => [asset.path, entries.get(asset.path)!])) }
}
