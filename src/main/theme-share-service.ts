import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, open, readFile, rename, rm, stat, statfs } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { z } from 'zod'
import {
  SYSTEM_ICON_LIBRARY_ID,
  projectIconRefSchema,
  type ProjectIconRef,
  type ThemeProjectIconSettings
} from '../shared/project-icons'
import { parseThemeProfile, type ThemeProfile } from '../shared/theme'
import {
  MAX_ICON_LIBRARY_PACKAGE_COMPRESSED_BYTES,
  type IconLibraryShareManifest
} from './icon-library-share'
import type { ProjectIconStore } from './project-icon-store'
import { finalizeShareArchive, type ProfileStore, type ShareArchiveWriter } from './profile-store'
import { MAX_SHARE_COMPRESSED_BYTES, MAX_SHARE_METADATA_BYTES, THEME_SHARE_FORMAT } from './theme-share'

const nodeRequire = createRequire(import.meta.url)
const archiver = nodeRequire('archiver') as typeof import('archiver')
const yauzl = nodeRequire('yauzl') as typeof import('yauzl')

export const THEME_SHARE_COMPOSITE_VERSION = 3 as const
const MAX_COMPOSITE_LIBRARIES = 32
const MAX_COMPOSITE_ENTRIES = MAX_COMPOSITE_LIBRARIES + 2
const MAX_COMPOSITE_UNCOMPRESSED_BYTES = 20 * 1024 ** 3
const MIN_FREE_BYTES = 10 * 1024 ** 3
const MIN_FREE_RATIO = 0.15
const THEME_PACKAGE_PATH = 'theme.cdstheme'
const LIBRARY_PACKAGE_PATTERN = /^icon-libraries\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.cdsicons$/i

const packageEntrySchema = z.object({
  path: z.string().min(1).max(260),
  size: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/)
}).strict()

const shareableSettingsSchema = z.object({
  enabledLibraryIds: z.array(z.union([z.literal(SYSTEM_ICON_LIBRARY_ID), z.string().uuid()])).max(MAX_COMPOSITE_LIBRARIES),
  weightOverrides: z.array(z.object({
    ref: projectIconRefSchema,
    enabled: z.boolean(),
    weight: z.number().int().min(1).max(10)
  }).strict()).max(MAX_COMPOSITE_LIBRARIES * 128)
}).strict()

const compositeManifestSchema = z.object({
  format: z.literal(THEME_SHARE_FORMAT),
  version: z.literal(THEME_SHARE_COMPOSITE_VERSION),
  themeName: z.string().trim().min(1).max(80),
  profileVersion: z.number().int().min(0).max(31),
  themePackage: packageEntrySchema.extend({ path: z.literal(THEME_PACKAGE_PATH) }).strict(),
  iconLibraries: z.array(z.object({
    originalLibraryId: z.string().uuid(),
    package: packageEntrySchema
  }).strict()).max(MAX_COMPOSITE_LIBRARIES),
  projectIconSettings: shareableSettingsSchema
}).strict()

export type ThemeShareCompositeManifest = z.infer<typeof compositeManifestSchema>

interface ExtractedCompositePackage {
  root: string
  manifest: ThemeShareCompositeManifest
  themePackagePath: string
  libraryPackages: Map<string, string>
}

interface ScannedCompositeArchive {
  entries: import('yauzl').Entry[]
  totalSize: number
}

export class ThemeShareService {
  private operationTail: Promise<void> = Promise.resolve()

  constructor(
    private readonly profiles: ProfileStore,
    private readonly projectIcons: ProjectIconStore
  ) {}

  async exportTheme(profileInput: unknown, destinationPath: unknown, includeIconLibraries: unknown, signal?: AbortSignal): Promise<void> {
    return this.runExclusive(async () => {
      const profile = parseThemeProfile(profileInput)
      if (includeIconLibraries !== true) {
        await this.profiles.exportSharePackage(profile, destinationPath, signal)
        return
      }
      if (typeof destinationPath !== 'string' || !isAbsolute(destinationPath) || extname(destinationPath).toLowerCase() !== '.cdstheme') {
        throw new Error('分享包保存路径必须是绝对的 .cdstheme 文件。')
      }
      this.throwIfAborted(signal, '主题导出已取消。')
      const temporaryRoot = await mkdtemp(join(this.profiles.root, '.cdstheme-v3-export-'))
      try {
        const themePackagePath = join(temporaryRoot, THEME_PACKAGE_PATH)
        await this.profiles.exportSharePackage(profile, themePackagePath, signal)
        const settings = await this.projectIcons.getShareableThemeSettings(profile.id)
        const enabledLibraryIds = [...new Set(settings.enabledLibraryIds)]
        const customLibraryIds = enabledLibraryIds.filter((id) => id !== SYSTEM_ICON_LIBRARY_ID)
        const includedCustomLibraryIds: string[] = []
        const libraryPackages = new Map<string, string>()
        const manifestLibraries: ThemeShareCompositeManifest['iconLibraries'] = []
        for (const libraryId of customLibraryIds) {
          this.throwIfAborted(signal, '主题导出已取消。')
          const library = await this.projectIcons.getLibrary(libraryId)
          if (library.icons.length === 0) continue
          const packagePath = join(temporaryRoot, `${libraryId}.cdsicons`)
          await this.projectIcons.exportLibraryPackage(libraryId, packagePath, signal)
          const file = await stat(packagePath)
          const archivePath = `icon-libraries/${libraryId}.cdsicons`
          libraryPackages.set(archivePath, packagePath)
          includedCustomLibraryIds.push(libraryId)
          manifestLibraries.push({
            originalLibraryId: libraryId,
            package: { path: archivePath, size: file.size, sha256: await hashFile(packagePath, signal, '主题导出已取消。') }
          })
        }
        const shareableLibraryIds = new Set([SYSTEM_ICON_LIBRARY_ID, ...includedCustomLibraryIds])
        const projectIconSettings = {
          enabledLibraryIds: enabledLibraryIds.filter((id) => shareableLibraryIds.has(id)),
          weightOverrides: settings.weightOverrides.filter((entry) => shareableLibraryIds.has(entry.ref.libraryId))
        }
        const themePackage = await stat(themePackagePath)
        const manifest = parseThemeShareCompositeManifest({
          format: THEME_SHARE_FORMAT,
          version: THEME_SHARE_COMPOSITE_VERSION,
          themeName: profile.name,
          profileVersion: profile.version,
          themePackage: { path: THEME_PACKAGE_PATH, size: themePackage.size, sha256: await hashFile(themePackagePath, signal, '主题导出已取消。') },
          iconLibraries: manifestLibraries,
          projectIconSettings
        })
        const manifestData = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
        if (manifestData.byteLength > MAX_SHARE_METADATA_BYTES) throw new Error('分享包元数据过大。')
        const uncompressedBytes = addCompositeBytes(
          manifestLibraries.reduce((total, entry) => addCompositeBytes(total, entry.package.size), themePackage.size),
          manifestData.byteLength
        )
        await assertDiskSpace(dirname(destinationPath), uncompressedBytes)
        await writeCompositeArchiveAtomic(destinationPath, themePackagePath, libraryPackages, manifestData, signal)
      } finally {
        await rm(temporaryRoot, { recursive: true, force: true }).catch(() => undefined)
      }
    })
  }

  async importTheme(sourcePath: unknown, signal?: AbortSignal): Promise<ThemeProfile> {
    return this.runExclusive(async () => {
      if (typeof sourcePath !== 'string' || !isAbsolute(sourcePath) || extname(sourcePath).toLowerCase() !== '.cdstheme') {
        throw new Error('请选择 .cdstheme 分享文件。')
      }
      const version = await readThemeShareVersion(sourcePath, signal)
      if (version !== THEME_SHARE_COMPOSITE_VERSION) return this.profiles.importSharePackage(sourcePath, signal)

      const extracted = await extractCompositePackage(sourcePath, this.profiles.root, signal)
      let importedTheme: ThemeProfile | null = null
      const importedLibraryIds: string[] = []
      try {
        importedTheme = await this.profiles.importSharePackage(extracted.themePackagePath, signal)
        if (importedTheme.name !== extracted.manifest.themeName || importedTheme.version !== extracted.manifest.profileVersion) {
          throw new Error('组合分享包清单与主题包不一致。')
        }
        const mappings = new Map<string, { libraryId: string; iconIds: Map<string, string> }>()
        for (const entry of extracted.manifest.iconLibraries) {
          this.throwIfAborted(signal, '主题导入已取消。')
          const packagePath = extracted.libraryPackages.get(entry.originalLibraryId)
          if (!packagePath) throw new Error('组合分享包缺少素材库。')
          const imported = await this.projectIcons.importLibraryPackageWithMapping(packagePath, signal)
          importedLibraryIds.push(imported.library.id)
          mappings.set(entry.originalLibraryId, { libraryId: imported.library.id, iconIds: imported.iconIdMap })
        }
        const remapped = remapProjectIconSettings(extracted.manifest.projectIconSettings, mappings)
        await this.projectIcons.applyShareableThemeSettings(importedTheme.id, remapped)
        this.throwIfAborted(signal, '主题导入已取消。')
        return importedTheme
      } catch (error) {
        const rollbackErrors: unknown[] = []
        if (importedTheme) {
          await this.projectIcons.deleteThemeSettings(importedTheme.id).catch((reason) => rollbackErrors.push(reason))
          await this.profiles.delete(importedTheme.id).catch((reason) => rollbackErrors.push(reason))
        }
        for (const libraryId of importedLibraryIds.reverse()) {
          await this.projectIcons.deleteLibrary(libraryId).catch((reason) => rollbackErrors.push(reason))
        }
        if (rollbackErrors.length > 0) throw new AggregateError([error, ...rollbackErrors], '主题与素材库导入失败，回滚未完全完成。')
        throw error
      } finally {
        await rm(extracted.root, { recursive: true, force: true }).catch(() => undefined)
      }
    })
  }

  private async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation)
    this.operationTail = result.then(() => undefined, () => undefined)
    return result
  }

  private throwIfAborted(signal: AbortSignal | undefined, message: string): void {
    if (signal?.aborted) throw new Error(message)
  }
}

export function parseThemeShareCompositeManifest(input: unknown): ThemeShareCompositeManifest {
  const manifest = compositeManifestSchema.parse(input)
  if (new Set(manifest.projectIconSettings.enabledLibraryIds).size !== manifest.projectIconSettings.enabledLibraryIds.length) {
    throw new Error('组合分享包包含重复的素材库设置。')
  }
  const libraryIds = new Set<string>()
  const packagePaths = new Set<string>()
  for (const library of manifest.iconLibraries) {
    const expectedPath = `icon-libraries/${library.originalLibraryId}.cdsicons`
    if (library.package.path !== expectedPath || libraryIds.has(library.originalLibraryId) || packagePaths.has(library.package.path.toLowerCase())) {
      throw new Error('组合分享包素材库清单无效。')
    }
    if (library.package.size > MAX_ICON_LIBRARY_PACKAGE_COMPRESSED_BYTES) throw new Error('素材库包压缩大小超过 4 GiB 限制。')
    libraryIds.add(library.originalLibraryId)
    packagePaths.add(library.package.path.toLowerCase())
  }
  const shareableIds = new Set([SYSTEM_ICON_LIBRARY_ID, ...libraryIds])
  if (manifest.projectIconSettings.enabledLibraryIds.some((id) => !shareableIds.has(id)) ||
      manifest.projectIconSettings.weightOverrides.some((entry) => !shareableIds.has(entry.ref.libraryId))) {
    throw new Error('组合分享包引用了未包含的素材库。')
  }
  if (manifest.themePackage.size > MAX_SHARE_COMPRESSED_BYTES) throw new Error('内嵌主题包超过 20 GiB 限制。')
  return manifest
}

function remapProjectIconSettings(
  settings: ThemeShareCompositeManifest['projectIconSettings'],
  mappings: Map<string, { libraryId: string; iconIds: Map<string, string> }>
): Pick<ThemeProjectIconSettings, 'enabledLibraryIds' | 'weightOverrides'> {
  const remapRef = (ref: ProjectIconRef): ProjectIconRef => {
    if (ref.libraryId === SYSTEM_ICON_LIBRARY_ID) return ref
    const mapping = mappings.get(ref.libraryId)
    const iconId = mapping?.iconIds.get(ref.iconId)
    if (!mapping || !iconId) throw new Error('组合分享包的素材库图标映射不完整。')
    return { libraryId: mapping.libraryId, iconId }
  }
  return {
    enabledLibraryIds: settings.enabledLibraryIds.map((id) => id === SYSTEM_ICON_LIBRARY_ID
      ? id
      : mappings.get(id)?.libraryId ?? (() => { throw new Error('组合分享包的素材库映射不完整。') })()),
    weightOverrides: settings.weightOverrides.map((entry) => ({ ...entry, ref: remapRef(entry.ref) }))
  }
}

async function readThemeShareVersion(sourcePath: string, signal?: AbortSignal): Promise<number> {
  const file = await stat(sourcePath)
  if (!file.isFile()) throw new Error('分享包必须是文件。')
  if (file.size > MAX_SHARE_COMPRESSED_BYTES) throw new Error('分享包超过 20 GiB 压缩大小限制。')
  const zip = await openZip(sourcePath)
  const abort = (): void => zip.close()
  signal?.addEventListener('abort', abort, { once: true })
  try {
    const entry = await findManifestEntry(zip, signal)
    const bytes = await readEntryBuffer(zip, entry, MAX_SHARE_METADATA_BYTES, signal)
    let input: unknown
    try { input = JSON.parse(bytes.toString('utf8')) as unknown } catch { throw new Error('分享包中的 manifest.json 无效。') }
    if (!input || typeof input !== 'object' || !('version' in input) || typeof input.version !== 'number') throw new Error('分享包清单版本无效。')
    return input.version
  } catch (error) {
    if (signal?.aborted) throw new Error('主题导入已取消。')
    throw error
  } finally {
    signal?.removeEventListener('abort', abort)
    zip.close()
  }
}

async function extractCompositePackage(sourcePath: string, workingRoot: string, signal?: AbortSignal): Promise<ExtractedCompositePackage> {
  const source = await stat(sourcePath)
  if (!source.isFile() || source.size > MAX_SHARE_COMPRESSED_BYTES) throw new Error('组合分享包无效或超过大小限制。')
  const root = await mkdtemp(join(workingRoot, '.cdstheme-v3-import-'))
  try {
    const entries = await extractCompositeArchive(sourcePath, root, signal)
    const manifestEntry = entries.get('manifest.json')
    if (!manifestEntry) throw new Error('组合分享包缺少 manifest.json。')
    let input: unknown
    try { input = JSON.parse(await readFile(manifestEntry.path, { encoding: 'utf8', signal })) as unknown } catch (error) {
      if (signal?.aborted) throw new Error('主题导入已取消。')
      throw new Error('组合分享包清单 JSON 无效。', { cause: error })
    }
    const manifest = parseThemeShareCompositeManifest(input)
    const expectedPaths = new Set(['manifest.json', manifest.themePackage.path, ...manifest.iconLibraries.map((entry) => entry.package.path)])
    if (entries.size !== expectedPaths.size || [...entries.keys()].some((path) => !expectedPaths.has(path))) throw new Error('组合分享包包含未列出的文件。')
    await validateCompositeEntry(entries, manifest.themePackage, signal)
    const libraryPackages = new Map<string, string>()
    for (const library of manifest.iconLibraries) {
      await validateCompositeEntry(entries, library.package, signal)
      libraryPackages.set(library.originalLibraryId, entries.get(library.package.path)!.path)
    }
    return {
      root,
      manifest,
      themePackagePath: entries.get(manifest.themePackage.path)!.path,
      libraryPackages
    }
  } catch (error) {
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

async function validateCompositeEntry(
  entries: Map<string, { path: string; size: number }>,
  expected: { path: string; size: number; sha256: string },
  signal?: AbortSignal
): Promise<void> {
  const entry = entries.get(expected.path)
  if (!entry || entry.size !== expected.size || await hashFile(entry.path, signal, '主题导入已取消。') !== expected.sha256) {
    throw new Error(`组合分享包条目校验失败: ${expected.path}`)
  }
}

async function writeCompositeArchiveAtomic(
  destinationPath: string,
  themePackagePath: string,
  libraryPackages: Map<string, string>,
  manifest: Buffer,
  signal?: AbortSignal
): Promise<void> {
  await mkdir(dirname(destinationPath), { recursive: true })
  const temporary = `${destinationPath}.${randomUUID()}.tmp`
  const output = createWriteStream(temporary, { flags: 'wx' })
  const ZipArchive = (archiver as unknown as { ZipArchive: new (options?: Record<string, unknown>) => ShareArchiveWriter }).ZipArchive
  const archive = new ZipArchive({ forceZip64: true, zlib: { level: 0 } })
  try {
    await finalizeShareArchive(archive, output, () => {
      archive.pipe(output)
      archive.append(manifest, { name: 'manifest.json' })
      archive.append(createReadStream(themePackagePath), { name: THEME_PACKAGE_PATH, store: true })
      for (const [path, source] of libraryPackages) archive.append(createReadStream(source), { name: path, store: true })
    }, signal)
    if (signal?.aborted) throw new Error('主题导出已取消。')
    const compressed = await stat(temporary)
    if (compressed.size > MAX_SHARE_COMPRESSED_BYTES) throw new Error('分享包超过 20 GiB 压缩大小限制。')
    const file = await open(temporary, 'r+')
    try { await file.sync() } finally { await file.close() }
    const backup = `${destinationPath}.previous`
    let hadOriginal = false
    try {
      try { await rename(destinationPath, backup); hadOriginal = true } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      await rename(temporary, destinationPath)
      if (hadOriginal) await rm(backup, { force: true })
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined)
      if (hadOriginal) await rename(backup, destinationPath).catch(() => undefined)
      throw error
    }
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined)
    throw error
  }
}

async function extractCompositeArchive(sourcePath: string, destinationRoot: string, signal?: AbortSignal): Promise<Map<string, { path: string; size: number }>> {
  const zip = await openZip(sourcePath)
  const abort = (): void => zip.close()
  signal?.addEventListener('abort', abort, { once: true })
  try {
    const scanned = await scanCompositeZip(zip, signal)
    await assertDiskSpace(destinationRoot, scanned.totalSize)
    const extracted = new Map<string, { path: string; size: number }>()
    let actualTotal = 0
    for (const entry of scanned.entries) {
      if (signal?.aborted) throw new Error('主题导入已取消。')
      const destination = resolveWithinRoot(destinationRoot, entry.fileName)
      await mkdir(dirname(destination), { recursive: true })
      const stream = await openEntryStream(zip, entry)
      let actualSize = 0
      const limit = compositeEntryLimit(entry.fileName)
      const limiter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          try {
            actualSize += chunk.byteLength
            if (actualSize > limit) throw new Error('组合分享包中的单个条目超过大小限制。')
            actualTotal = addCompositeBytes(actualTotal, chunk.byteLength)
            callback(null, chunk)
          } catch (error) { callback(error instanceof Error ? error : new Error('组合分享包解压失败。')) }
        }
      })
      await pipeline(stream, limiter, createWriteStream(destination, { flags: 'wx' }), { signal })
      if (actualSize !== entry.uncompressedSize) throw new Error('组合分享包条目大小与 ZIP 目录不一致。')
      extracted.set(entry.fileName, { path: destination, size: actualSize })
    }
    return extracted
  } catch (error) {
    if (signal?.aborted) throw new Error('主题导入已取消。')
    throw error
  } finally {
    signal?.removeEventListener('abort', abort)
    zip.close()
  }
}

async function scanCompositeZip(zip: import('yauzl').ZipFile, signal?: AbortSignal): Promise<ScannedCompositeArchive> {
  return await new Promise((resolvePromise, reject) => {
    const entries: import('yauzl').Entry[] = []
    const seen = new Set<string>()
    let totalSize = 0
    let settled = false
    const cleanup = (): void => {
      zip.removeListener('entry', onEntry)
      zip.removeListener('end', onEnd)
      zip.removeListener('error', fail)
    }
    const fail = (reason: unknown): void => {
      if (settled) return
      settled = true
      cleanup()
      reject(reason instanceof Error ? reason : new Error(String(reason)))
    }
    const onEnd = (): void => {
      if (settled) return
      settled = true
      cleanup()
      resolvePromise({ entries, totalSize })
    }
    const onEntry = (entry: import('yauzl').Entry): void => {
      try {
        assertCompositePath(entry.fileName)
        if ((entry.generalPurposeBitFlag & 1) !== 0) throw new Error('组合分享包不能包含加密条目。')
        const unixType = (entry.externalFileAttributes >>> 16) & 0xf000
        if (unixType === 0xa000 || entry.fileName.endsWith('/')) throw new Error('组合分享包不能包含链接或目录条目。')
        const canonical = entry.fileName.toLowerCase()
        if (seen.has(canonical)) throw new Error('组合分享包包含重复条目。')
        seen.add(canonical)
        if (seen.size > MAX_COMPOSITE_ENTRIES) throw new Error('组合分享包条目数量超过限制。')
        if (entry.uncompressedSize > compositeEntryLimit(entry.fileName)) throw new Error('组合分享包中的单个条目超过大小限制。')
        totalSize = addCompositeBytes(totalSize, entry.uncompressedSize)
        entries.push(entry)
        zip.readEntry()
      } catch (error) { fail(error) }
    }
    zip.on('entry', onEntry)
    zip.once('end', onEnd)
    zip.once('error', fail)
    if (signal?.aborted) fail(new Error('主题导入已取消。'))
    else zip.readEntry()
  })
}

async function findManifestEntry(zip: import('yauzl').ZipFile, signal?: AbortSignal): Promise<import('yauzl').Entry> {
  return await new Promise((resolvePromise, reject) => {
    let settled = false
    const cleanup = (): void => {
      zip.removeListener('entry', onEntry)
      zip.removeListener('end', onEnd)
      zip.removeListener('error', fail)
    }
    const fail = (reason: unknown): void => {
      if (settled) return
      settled = true
      cleanup()
      reject(reason instanceof Error ? reason : new Error(String(reason)))
    }
    const onEnd = (): void => fail(new Error('分享包缺少 manifest.json。'))
    const onEntry = (entry: import('yauzl').Entry): void => {
      if (entry.fileName === 'manifest.json') {
        settled = true
        cleanup()
        resolvePromise(entry)
      } else zip.readEntry()
    }
    zip.on('entry', onEntry)
    zip.once('end', onEnd)
    zip.once('error', fail)
    if (signal?.aborted) fail(new Error('主题导入已取消。'))
    else zip.readEntry()
  })
}

async function readEntryBuffer(zip: import('yauzl').ZipFile, entry: import('yauzl').Entry, limit: number, signal?: AbortSignal): Promise<Buffer> {
  if (entry.uncompressedSize > limit) throw new Error('分享包元数据过大。')
  const stream = await openEntryStream(zip, entry)
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    if (signal?.aborted) throw new Error('主题导入已取消。')
    const bytes = Buffer.from(chunk)
    size += bytes.byteLength
    if (size > limit) throw new Error('分享包元数据过大。')
    chunks.push(bytes)
  }
  if (size !== entry.uncompressedSize) throw new Error('分享包元数据大小与 ZIP 目录不一致。')
  return Buffer.concat(chunks, size)
}

async function openZip(path: string): Promise<import('yauzl').ZipFile> {
  return await new Promise((resolvePromise, reject) => yauzl.open(path, { lazyEntries: true, autoClose: false, validateEntrySizes: true }, (error, zip) => {
    if (error || !zip) reject(error ?? new Error('分享包 ZIP 无效。'))
    else resolvePromise(zip)
  }))
}

async function openEntryStream(zip: import('yauzl').ZipFile, entry: import('yauzl').Entry): Promise<NodeJS.ReadableStream> {
  return await new Promise((resolvePromise, reject) => zip.openReadStream(entry, (error, stream) => {
    if (error || !stream) reject(error ?? new Error('分享包条目不可读。'))
    else resolvePromise(stream)
  }))
}

function assertCompositePath(path: string): void {
  if (path === 'manifest.json' || path === THEME_PACKAGE_PATH || LIBRARY_PACKAGE_PATTERN.test(path)) return
  throw new Error('组合分享包路径无效。')
}

function compositeEntryLimit(path: string): number {
  assertCompositePath(path)
  if (path === 'manifest.json') return MAX_SHARE_METADATA_BYTES
  if (path === THEME_PACKAGE_PATH) return MAX_SHARE_COMPRESSED_BYTES
  return MAX_ICON_LIBRARY_PACKAGE_COMPRESSED_BYTES
}

function addCompositeBytes(total: number, size: number): number {
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(size) || total < 0 || size < 0) throw new Error('组合分享包大小信息无效。')
  const next = total + size
  if (!Number.isSafeInteger(next) || next > MAX_COMPOSITE_UNCOMPRESSED_BYTES) throw new Error('组合分享包解压总量超过 20 GiB 限制。')
  return next
}

function resolveWithinRoot(root: string, path: string): string {
  const resolvedRoot = resolve(root)
  const candidate = resolve(resolvedRoot, path)
  const rel = relative(resolvedRoot, candidate)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('组合分享包路径超出解压目录。')
  return candidate
}

async function hashFile(path: string, signal: AbortSignal | undefined, cancelledMessage: string): Promise<string> {
  const hash = createHash('sha256')
  const stream = createReadStream(path)
  const abort = (): void => { stream.destroy(new Error(cancelledMessage)) }
  signal?.addEventListener('abort', abort, { once: true })
  try {
    for await (const chunk of stream) {
      if (signal?.aborted) throw new Error(cancelledMessage)
      hash.update(chunk as Buffer)
    }
    return hash.digest('hex')
  } finally {
    signal?.removeEventListener('abort', abort)
    stream.destroy()
  }
}

async function assertDiskSpace(targetRoot: string, incomingBytes: number): Promise<void> {
  const usage = await statfs(targetRoot).catch(() => null)
  if (!usage) return
  const available = Number(usage.bavail) * Number(usage.bsize)
  const total = Number(usage.blocks) * Number(usage.bsize)
  const minimum = Math.max(MIN_FREE_BYTES, total * MIN_FREE_RATIO)
  if (available - incomingBytes < minimum) throw new Error('磁盘空间不足，需要至少保留 10 GB 或 15% 的可用空间。')
}

export type { IconLibraryShareManifest }
