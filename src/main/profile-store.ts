import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import sharp from 'sharp'
import { zipSync } from 'fflate'
import { createDefaultTheme, parseThemeProfile, type ThemeProfile, type ThemeSummary } from '../shared/theme'
import type { AssetPurpose, CompiledTheme, ImportedAsset, ImportedFontAsset } from '../shared/contracts'
import type { ImportedFontFormat } from '../shared/typography'
import { compileTheme } from './theme-compiler'
import {
  MAX_SHARE_COMPRESSED_BYTES,
  MAX_SHARE_ENTRIES,
  MAX_SHARE_FONT_BYTES,
  MAX_SHARE_IMAGE_BYTES,
  MAX_SHARE_UNCOMPRESSED_BYTES,
  assetKind,
  collectThemeAssets,
  decodeShareZip,
  encodeJson,
  parseThemeShareManifest,
  sha256,
  validateShareContents
} from './theme-share'

interface StudioSettings {
  version: 1
  activeThemeId: string
}

const MAX_ASSET_BYTES = 30 * 1024 * 1024
const MAX_FONT_BYTES = 12 * 1024 * 1024
const RASTER_EXTENSIONS = new Set(['.png', '.webp', '.jpg', '.jpeg'])
const FONT_EXTENSIONS = new Set<ImportedFontFormat>(['ttf', 'otf', 'woff', 'woff2'])

export class ProfileStore {
  readonly themesRoot: string
  private readonly settingsPath: string

  constructor(readonly root: string, private readonly bundledDefaultAsset?: string) {
    this.themesRoot = join(root, 'themes')
    this.settingsPath = join(root, 'settings.json')
  }

  async initialize(): Promise<void> {
    await mkdir(this.themesRoot, { recursive: true })
    try {
      await this.readSettings()
    } catch {
      const profile = createDefaultTheme(randomUUID())
      if (this.bundledDefaultAsset) {
        const relativePath = 'assets/dream-reference.png'
        const destination = this.resolveAsset(profile.id, relativePath)
        await mkdir(dirname(destination), { recursive: true })
        await copyFile(this.bundledDefaultAsset, destination)
        const metadata = await sharp(destination).metadata()
        if (metadata.width && metadata.height) {
          profile.hero.sourceImage = relativePath
          profile.polaroid.sourceImage = relativePath
          profile.polaroid.sourceSize = { width: metadata.width, height: metadata.height }
          profile.polaroid.fence = [
            { x: 0.850, y: 0.739 },
            { x: 0.981, y: 0.690 },
            { x: 0.999, y: 0.930 },
            { x: 0.871, y: 0.977 }
          ]
          profile.polaroid.placement = { x: 0.76, y: 0.56, width: 0.19, rotation: -2, hideBelowWidth: 920 }
        }
      }
      await this.writeProfile(profile)
      await this.writeJsonAtomic(this.settingsPath, { version: 1, activeThemeId: profile.id })
    }
  }

  async list(): Promise<ThemeSummary[]> {
    const settings = await this.readSettings()
    const entries = await import('node:fs/promises').then(({ readdir }) => readdir(this.themesRoot, { withFileTypes: true }))
    const profiles = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
      try { return await this.get(entry.name) } catch { return null }
    }))
    return profiles
      .filter((profile): profile is ThemeProfile => profile !== null)
      .map((profile) => ({ id: profile.id, name: profile.name, updatedAt: profile.updatedAt, active: profile.id === settings.activeThemeId }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async get(id: string): Promise<ThemeProfile> {
    this.assertId(id)
    const content = await readFile(join(this.themeRoot(id), 'theme.json'), 'utf8')
    const profile = parseThemeProfile(JSON.parse(content) as unknown)
    if (profile.id !== id) throw new Error('Theme directory does not match its profile ID.')
    return profile
  }

  async create(name: string): Promise<ThemeProfile> {
    const profile = createDefaultTheme(randomUUID(), this.cleanName(name))
    await this.writeProfile(profile)
    return profile
  }

  async duplicate(input: unknown, name: unknown): Promise<ThemeProfile> {
    const source = parseThemeProfile(input)
    await this.get(source.id)
    const duplicate = { ...structuredClone(source), id: randomUUID(), name: this.cleanName(name), updatedAt: new Date().toISOString() }
    const duplicateRoot = this.themeRoot(duplicate.id)
    try {
      await mkdir(this.assetRoot(duplicate.id), { recursive: true })
      for (const asset of this.collectAssets(source)) {
        const sourcePath = this.resolveAsset(source.id, asset)
        const targetPath = this.resolveAsset(duplicate.id, asset)
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

  async exportSharePackage(input: unknown, destinationPath: unknown): Promise<void> {
    const profile = parseThemeProfile(input)
    await this.get(profile.id)
    if (typeof destinationPath !== 'string' || !isAbsolute(destinationPath)) throw new Error('分享包保存路径必须是绝对路径。')
    const assets: Record<string, Uint8Array> = {}
    const manifestAssets = []
    let totalAssetBytes = 0
    for (const asset of collectThemeAssets(profile)) {
      const sourcePath = this.resolveAsset(profile.id, asset)
      const data = await readFile(sourcePath)
      const kind = assetKind(asset)
      await this.validateShareAsset(asset, data, kind)
      assets[asset] = data
      totalAssetBytes += data.byteLength
      manifestAssets.push({ path: asset, kind, size: data.byteLength, sha256: sha256(data) })
    }
    const manifest = {
      format: 'codex-dream-skin-theme',
      version: 1,
      themeName: profile.name,
      profileVersion: profile.version,
      assets: manifestAssets
    }
    parseThemeShareManifest(manifest)
    if (manifestAssets.length + 2 > MAX_SHARE_ENTRIES) throw new Error('分享包条目数量超过限制。')
    const manifestData = encodeJson(manifest)
    const profileData = encodeJson(profile)
    if (totalAssetBytes + manifestData.byteLength + profileData.byteLength > MAX_SHARE_UNCOMPRESSED_BYTES) throw new Error('分享包解压总量超过 1 GB 限制。')
    assets['manifest.json'] = manifestData
    assets['theme.json'] = profileData
    const packageData = zipSync(assets, { level: 6 })
    if (packageData.byteLength > MAX_SHARE_COMPRESSED_BYTES) throw new Error('分享包超过 500 MB 压缩大小限制。')
    await this.writeBinaryAtomic(destinationPath, Buffer.from(packageData))
  }

  async importSharePackage(sourcePath: unknown): Promise<ThemeProfile> {
    if (typeof sourcePath !== 'string' || !isAbsolute(sourcePath)) throw new Error('分享包路径必须是绝对路径。')
    if (extname(sourcePath).toLowerCase() !== '.cdstheme') throw new Error('请选择 .cdstheme 分享文件。')
    const sourceStat = await stat(sourcePath)
    if (!sourceStat.isFile()) throw new Error('分享包必须是文件。')
    if (sourceStat.size > MAX_SHARE_COMPRESSED_BYTES) throw new Error('分享包超过 500 MB 压缩大小限制。')
    const entries = decodeShareZip(await readFile(sourcePath))
    const { profile: source, assets } = validateShareContents(entries)
    for (const [asset, data] of assets) await this.validateShareAsset(asset, data, assetKind(asset))

    const imported = { ...structuredClone(source), id: randomUUID(), updatedAt: new Date().toISOString() }
    const temporaryRoot = await mkdtemp(join(this.themesRoot, '.cdstheme-import-'))
    const importedRoot = this.themeRoot(imported.id)
    try {
      for (const [asset, data] of assets) {
        const destination = this.resolveWithinRoot(temporaryRoot, asset)
        await mkdir(dirname(destination), { recursive: true })
        await writeFile(destination, data)
      }
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
    const next = { ...profile, name: this.cleanName(profile.name), updatedAt: new Date().toISOString() }
    for (const asset of this.collectAssets(next)) this.resolveAsset(next.id, asset)
    await this.writeProfile(next)
    return next
  }

  async updatePolaroidPlacement(id: string, placement: Pick<ThemeProfile['polaroid']['placement'], 'x' | 'y'>): Promise<ThemeProfile> {
    const profile = await this.get(id)
    profile.polaroid.placement = { ...profile.polaroid.placement, ...placement }
    return await this.update(profile)
  }

  async delete(id: string): Promise<void> {
    const themes = await this.list()
    if (themes.length <= 1) throw new Error('At least one theme must remain.')
    const settings = await this.readSettings()
    await rm(this.themeRoot(id), { recursive: true, force: false })
    if (settings.activeThemeId === id) {
      const fallback = themes.find((theme) => theme.id !== id)
      if (!fallback) throw new Error('No fallback theme is available.')
      await this.writeJsonAtomic(this.settingsPath, { version: 1, activeThemeId: fallback.id })
    }
  }

  async activate(id: string): Promise<ThemeProfile> {
    const profile = await this.get(id)
    await this.writeJsonAtomic(this.settingsPath, { version: 1, activeThemeId: id })
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
      await sharp(sourcePath).metadata()
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
    const parsed = JSON.parse(await readFile(this.settingsPath, 'utf8')) as Partial<StudioSettings>
    if (parsed.version !== 1 || !parsed.activeThemeId) throw new Error('Studio settings are invalid.')
    this.assertId(parsed.activeThemeId)
    return parsed as StudioSettings
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

  private async validateShareAsset(asset: string, data: Buffer, kind: 'image' | 'font'): Promise<void> {
    if (kind === 'image') {
      if (data.byteLength > MAX_SHARE_IMAGE_BYTES) throw new Error('图片素材超过 30 MB 限制。')
      const metadata = await sharp(data).metadata()
      if (!metadata.width || !metadata.height) throw new Error(`图片素材无效: ${asset}`)
      return
    }
    if (data.byteLength > MAX_SHARE_FONT_BYTES) throw new Error('字体素材超过 12 MB 限制。')
    const extension = extname(asset).toLowerCase().slice(1) as ImportedFontFormat
    this.assertFontHeader(extension, data.subarray(0, 4))
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
