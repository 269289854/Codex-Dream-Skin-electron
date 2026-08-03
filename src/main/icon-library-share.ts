import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, open, readFile, rename, rm, stat, statfs } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createRequire } from 'node:module'
import { z } from 'zod'
import type { CustomIconLibrary } from '../shared/project-icons'
import { inspectImageBytes } from './asset-validation'
import { prepareIconGif } from './icon-assets'
import { finalizeShareArchive, type ShareArchiveWriter } from './profile-store'

const nodeRequire = createRequire(import.meta.url)
const archiver = nodeRequire('archiver') as typeof import('archiver')
const yauzl = nodeRequire('yauzl') as typeof import('yauzl')

export const ICON_LIBRARY_SHARE_FORMAT = 'codex-dream-skin-icons' as const
export const ICON_LIBRARY_SHARE_VERSION = 1 as const
export const MAX_ICON_LIBRARY_PACKAGE_ENTRIES = 129
export const MAX_ICON_LIBRARY_PACKAGE_COMPRESSED_BYTES = 4 * 1024 ** 3
export const MAX_ICON_LIBRARY_PACKAGE_UNCOMPRESSED_BYTES = 4 * 1024 ** 3
export const MAX_ICON_LIBRARY_PACKAGE_ASSET_BYTES = 30 * 1024 * 1024
export const MAX_ICON_LIBRARY_PACKAGE_METADATA_BYTES = 1024 * 1024
const MIN_FREE_BYTES = 10 * 1024 ** 3
const MIN_FREE_RATIO = 0.15

const ASSET_PATH_PATTERN = /^assets\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(png|webp|jpe?g|gif)$/i

const iconManifestEntrySchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  path: z.string().min(1).max(260),
  mimeType: z.enum(['image/png', 'image/webp', 'image/jpeg', 'image/gif']),
  defaultEnabled: z.boolean(),
  defaultWeight: z.number().int().min(1).max(10),
  originalName: z.string().trim().min(1).max(255),
  width: z.number().int().positive().max(8192),
  height: z.number().int().positive().max(8192),
  size: z.number().int().positive().max(MAX_ICON_LIBRARY_PACKAGE_ASSET_BYTES),
  sha256: z.string().regex(/^[0-9a-f]{64}$/)
}).strict()

const iconLibraryManifestSchema = z.object({
  format: z.literal(ICON_LIBRARY_SHARE_FORMAT),
  version: z.literal(ICON_LIBRARY_SHARE_VERSION),
  libraryName: z.string().trim().min(1).max(80),
  icons: z.array(iconManifestEntrySchema).min(1).max(MAX_ICON_LIBRARY_PACKAGE_ENTRIES - 1)
}).strict()

export type IconLibraryShareManifest = z.infer<typeof iconLibraryManifestSchema>

export interface ExtractedIconLibraryPackage {
  root: string
  manifest: IconLibraryShareManifest
  assetPaths: string[]
}

export async function exportIconLibraryPackage(
  library: CustomIconLibrary,
  libraryRoot: string,
  destinationPath: string,
  signal?: AbortSignal
): Promise<void> {
  if (!isAbsolute(destinationPath) || extname(destinationPath).toLowerCase() !== '.cdsicons') throw new Error('素材库包保存路径必须是绝对的 .cdsicons 文件。')
  throwIfAborted(signal, '素材库导出已取消。')
  const sourceRoot = resolve(libraryRoot)
  const assets = new Map<string, string>()
  const icons: IconLibraryShareManifest['icons'] = []
  let total = 0
  for (const icon of library.icons) {
    throwIfAborted(signal, '素材库导出已取消。')
    assertIconLibraryAssetPath(icon.asset, icon.id)
    const source = resolveWithinRoot(sourceRoot, icon.asset)
    const file = await stat(source)
    if (!file.isFile()) throw new Error(`素材库图标不存在: ${icon.name}`)
    assertPackageEntrySize(icon.asset, file.size)
    total = addPackageBytes(total, file.size)
    const data = await readFile(source, { signal })
    if (data.byteLength !== file.size || sha256(data) !== icon.sha256) throw new Error(`素材库图标校验失败: ${icon.name}`)
    assets.set(icon.asset, source)
    icons.push({
      id: icon.id,
      name: icon.name,
      path: icon.asset,
      mimeType: icon.mimeType,
      defaultEnabled: icon.defaultEnabled,
      defaultWeight: icon.defaultWeight,
      originalName: icon.originalName,
      width: icon.width,
      height: icon.height,
      size: file.size,
      sha256: icon.sha256
    })
  }
  if (icons.length === 0) throw new Error('空素材库不能导出。')
  const manifest = parseIconLibraryShareManifest({ format: ICON_LIBRARY_SHARE_FORMAT, version: ICON_LIBRARY_SHARE_VERSION, libraryName: library.name, icons })
  const manifestData = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  if (manifestData.byteLength > MAX_ICON_LIBRARY_PACKAGE_METADATA_BYTES) throw new Error('素材库包元数据过大。')
  total = addPackageBytes(total, manifestData.byteLength)
  await assertDiskSpace(dirname(destinationPath), total)
  await writeArchiveAtomic(destinationPath, assets, manifestData, signal)
}

export async function extractIconLibraryPackage(sourcePath: string, workingRoot: string, signal?: AbortSignal): Promise<ExtractedIconLibraryPackage> {
  if (!isAbsolute(sourcePath) || extname(sourcePath).toLowerCase() !== '.cdsicons') throw new Error('请选择 .cdsicons 素材库文件。')
  throwIfAborted(signal, '素材库导入已取消。')
  const source = await stat(sourcePath)
  if (!source.isFile()) throw new Error('素材库包必须是文件。')
  if (source.size > MAX_ICON_LIBRARY_PACKAGE_COMPRESSED_BYTES) throw new Error('素材库包压缩大小超过 4 GiB 限制。')
  const temporaryRoot = await mkdtemp(join(workingRoot, '.cdsicons-import-'))
  try {
    const entries = await extractArchive(sourcePath, temporaryRoot, signal)
    throwIfAborted(signal, '素材库导入已取消。')
    const manifestEntry = entries.get('manifest.json')
    if (!manifestEntry) throw new Error('素材库包缺少 manifest.json。')
    if (manifestEntry.size > MAX_ICON_LIBRARY_PACKAGE_METADATA_BYTES) throw new Error('素材库包元数据过大。')
    let input: unknown
    try { input = JSON.parse(await readFile(manifestEntry.path, 'utf8')) as unknown } catch { throw new Error('素材库包清单 JSON 无效。') }
    const manifest = parseIconLibraryShareManifest(input)
    if (entries.size !== manifest.icons.length + 1) throw new Error('素材库包包含未列出的文件。')
    const assetPaths: string[] = []
    for (const icon of manifest.icons) {
      throwIfAborted(signal, '素材库导入已取消。')
      const entry = entries.get(icon.path)
      if (!entry) throw new Error(`素材库包缺少图标: ${icon.name}`)
      if (entry.size !== icon.size) throw new Error(`素材库图标大小校验失败: ${icon.name}`)
      const data = await readFile(entry.path, { signal })
      if (data.byteLength !== entry.size || sha256(data) !== icon.sha256) throw new Error(`素材库图标校验失败: ${icon.name}`)
      const extension = extname(icon.path).toLowerCase()
      const inspection = extension === '.gif' ? await prepareIconGif(data) : await inspectImageBytes(data, extension)
      if (inspection.width !== icon.width || inspection.height !== icon.height || mimeTypeForExtension(extension) !== icon.mimeType) {
        throw new Error(`素材库图标元数据不一致: ${icon.name}`)
      }
      assetPaths.push(entry.path)
    }
    return { root: temporaryRoot, manifest, assetPaths }
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

export function parseIconLibraryShareManifest(input: unknown): IconLibraryShareManifest {
  const manifest = iconLibraryManifestSchema.parse(input)
  const paths = new Set<string>()
  const ids = new Set<string>()
  let total = 0
  for (const icon of manifest.icons) {
    assertIconLibraryAssetPath(icon.path, icon.id)
    const path = icon.path.toLowerCase()
    const id = icon.id.toLowerCase()
    if (paths.has(path) || ids.has(id)) throw new Error('素材库包包含重复图标。')
    paths.add(path)
    ids.add(id)
    if (mimeTypeForExtension(extname(icon.path).toLowerCase()) !== icon.mimeType) throw new Error('素材库图标类型与扩展名不匹配。')
    total = addPackageBytes(total, icon.size)
  }
  return manifest
}

function assertIconLibraryPackagePath(path: string): void {
  if (path === 'manifest.json') return
  if (!ASSET_PATH_PATTERN.test(path) || path.includes('\\') || path.startsWith('/') || path.includes('..')) throw new Error('素材库包路径无效。')
}

function assertIconLibraryAssetPath(path: string, iconId: string): void {
  const match = ASSET_PATH_PATTERN.exec(path)
  if (!match || match[1]?.toLowerCase() !== iconId.toLowerCase()) throw new Error('素材库图标路径与 ID 不一致。')
}

function assertPackageEntrySize(path: string, size: number): void {
  if (!Number.isSafeInteger(size) || size < 0) throw new Error('素材库包大小信息无效。')
  const limit = path === 'manifest.json' ? MAX_ICON_LIBRARY_PACKAGE_METADATA_BYTES : MAX_ICON_LIBRARY_PACKAGE_ASSET_BYTES
  if (size > limit) throw new Error('素材库包中的单个条目超过大小限制。')
}

function addPackageBytes(total: number, size: number): number {
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(size) || total < 0 || size < 0) throw new Error('素材库包大小信息无效。')
  const next = total + size
  if (!Number.isSafeInteger(next) || next > MAX_ICON_LIBRARY_PACKAGE_UNCOMPRESSED_BYTES) throw new Error('素材库包解压总量超过 4 GiB 限制。')
  return next
}

async function writeArchiveAtomic(destinationPath: string, assets: Map<string, string>, manifest: Buffer, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal, '素材库导出已取消。')
  await mkdir(dirname(destinationPath), { recursive: true })
  const temporary = `${destinationPath}.${randomUUID()}.tmp`
  const output = createWriteStream(temporary, { flags: 'wx' })
  const ZipArchive = (archiver as unknown as { ZipArchive: new (options?: Record<string, unknown>) => ShareArchiveWriter }).ZipArchive
  const archive = new ZipArchive({ forceZip64: true, zlib: { level: 6 } })
  try {
    await finalizeShareArchive(archive, output, () => {
      archive.pipe(output)
      archive.append(manifest, { name: 'manifest.json' })
      for (const [path, source] of assets) archive.append(createReadStream(source), { name: path })
    }, signal)
    throwIfAborted(signal, '素材库导出已取消。')
    const compressed = await stat(temporary)
    if (compressed.size > MAX_ICON_LIBRARY_PACKAGE_COMPRESSED_BYTES) throw new Error('素材库包压缩大小超过 4 GiB 限制。')
    const file = await open(temporary, 'r+')
    try { await file.sync() } finally { await file.close() }
    const backup = `${destinationPath}.previous`
    let hadOriginal = false
    try {
      try { await rename(destinationPath, backup); hadOriginal = true } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      await rename(temporary, destinationPath)
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined)
      if (hadOriginal) await rename(backup, destinationPath).catch(() => undefined)
      throw error
    }
    if (hadOriginal) await rm(backup, { force: true }).catch(() => undefined)
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined)
    throw error
  }
}

async function extractArchive(sourcePath: string, destinationRoot: string, signal?: AbortSignal): Promise<Map<string, { path: string; size: number }>> {
  throwIfAborted(signal, '素材库导入已取消。')
  const zip = await openZip(sourcePath)
  const abortImport = (): void => zip.close()
  signal?.addEventListener('abort', abortImport, { once: true })
  try {
    const scanned = await scanZip(zip, signal)
    await assertDiskSpace(destinationRoot, scanned.totalSize)
    const extracted = new Map<string, { path: string; size: number }>()
    let actualTotal = 0
    for (const entry of scanned.entries) {
      throwIfAborted(signal, '素材库导入已取消。')
      const destination = resolveWithinRoot(destinationRoot, entry.fileName)
      await mkdir(dirname(destination), { recursive: true })
      const stream = await openEntryStream(zip, entry)
      let actualSize = 0
      const limiter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          try {
            actualSize += chunk.byteLength
            assertPackageEntrySize(entry.fileName, actualSize)
            actualTotal = addPackageBytes(actualTotal, chunk.byteLength)
            callback(null, chunk)
          } catch (error) {
            callback(error instanceof Error ? error : new Error('素材库包解压失败。'))
          }
        }
      })
      await pipeline(stream, limiter, createWriteStream(destination, { flags: 'wx' }), { signal })
      if (actualSize !== entry.uncompressedSize) throw new Error('素材库包条目大小与 ZIP 目录不一致。')
      extracted.set(entry.fileName, { path: destination, size: actualSize })
    }
    return extracted
  } catch (error) {
    if (signal?.aborted) throw new Error('素材库导入已取消。')
    throw error
  } finally {
    signal?.removeEventListener('abort', abortImport)
    zip.close()
  }
}

async function openZip(path: string): Promise<import('yauzl').ZipFile> {
  return await new Promise((resolvePromise, reject) => yauzl.open(path, { lazyEntries: true, autoClose: false, validateEntrySizes: true }, (error, zip) => {
    if (error || !zip) reject(error ?? new Error('素材库包 ZIP 无效。'))
    else resolvePromise(zip)
  }))
}

async function scanZip(zip: import('yauzl').ZipFile, signal?: AbortSignal): Promise<{ entries: import('yauzl').Entry[]; totalSize: number }> {
  return await new Promise((resolvePromise, reject) => {
    const entries: import('yauzl').Entry[] = []
    const seen = new Set<string>()
    let total = 0
    let settled = false
    const cleanup = (): void => {
      zip.removeListener('entry', onEntry)
      zip.removeListener('end', onEnd)
      zip.removeListener('error', fail)
    }
    const finish = (): void => {
      if (settled) return
      settled = true
      cleanup()
      resolvePromise({ entries, totalSize: total })
    }
    const fail = (reason: unknown): void => {
      if (settled) return
      settled = true
      cleanup()
      reject(reason instanceof Error ? reason : new Error(String(reason)))
    }
    const onEnd = (): void => finish()
    const onEntry = (entry: import('yauzl').Entry): void => {
      try {
        assertIconLibraryPackagePath(entry.fileName)
        if ((entry.generalPurposeBitFlag & 1) !== 0) throw new Error('素材库包不能包含加密条目。')
        const unixType = (entry.externalFileAttributes >>> 16) & 0xf000
        if (unixType === 0xa000 || entry.fileName.endsWith('/')) throw new Error('素材库包不能包含链接或目录条目。')
        const canonical = entry.fileName.toLowerCase()
        if (seen.has(canonical)) throw new Error('素材库包包含重复条目。')
        seen.add(canonical)
        if (seen.size > MAX_ICON_LIBRARY_PACKAGE_ENTRIES) throw new Error('素材库包条目数量超过限制。')
        assertPackageEntrySize(entry.fileName, entry.uncompressedSize)
        total = addPackageBytes(total, entry.uncompressedSize)
        entries.push(entry)
        zip.readEntry()
      } catch (error) { fail(error) }
    }
    zip.on('entry', onEntry)
    zip.once('end', onEnd)
    zip.once('error', fail)
    if (signal?.aborted) {
      fail(new Error('素材库导入已取消。'))
      return
    }
    zip.readEntry()
  })
}

async function openEntryStream(zip: import('yauzl').ZipFile, entry: import('yauzl').Entry): Promise<NodeJS.ReadableStream> {
  return await new Promise((resolvePromise, reject) => zip.openReadStream(entry, (error, stream) => {
    if (error || !stream) reject(error ?? new Error('素材库包条目不可读。'))
    else resolvePromise(stream)
  }))
}

function resolveWithinRoot(root: string, path: string): string {
  const resolvedRoot = resolve(root)
  const candidate = resolve(resolvedRoot, path)
  const rel = relative(resolvedRoot, candidate)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('素材库包路径超出解压目录。')
  return candidate
}

function mimeTypeForExtension(extension: string): IconLibraryShareManifest['icons'][number]['mimeType'] {
  if (extension === '.png') return 'image/png'
  if (extension === '.webp') return 'image/webp'
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
  if (extension === '.gif') return 'image/gif'
  throw new Error('素材库图标格式无效。')
}

function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

async function assertDiskSpace(targetRoot: string, incomingBytes: number): Promise<void> {
  const usage = await statfs(targetRoot).catch(() => null)
  if (!usage) return
  const available = Number(usage.bavail) * Number(usage.bsize)
  const total = Number(usage.blocks) * Number(usage.bsize)
  const minimum = Math.max(MIN_FREE_BYTES, total * MIN_FREE_RATIO)
  if (available - incomingBytes < minimum) throw new Error('磁盘空间不足，需要至少保留 10 GB 或 15% 的可用空间。')
}

function throwIfAborted(signal: AbortSignal | undefined, message: string): void {
  if (signal?.aborted) throw new Error(message)
}
