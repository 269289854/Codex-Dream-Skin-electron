import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import sharp from 'sharp'
import { createDefaultTheme, parseThemeProfile, type ThemeProfile, type ThemeSummary } from '../shared/theme'
import type { AssetPurpose, CompiledTheme, ImportedAsset } from '../shared/contracts'
import { compileTheme } from './theme-compiler'

interface StudioSettings {
  version: 1
  activeThemeId: string
}

const MAX_ASSET_BYTES = 30 * 1024 * 1024
const RASTER_EXTENSIONS = new Set(['.png', '.webp', '.jpg', '.jpeg'])

export class ProfileStore {
  readonly themesRoot: string
  private readonly settingsPath: string

  constructor(readonly root: string) {
    this.themesRoot = join(root, 'themes')
    this.settingsPath = join(root, 'settings.json')
  }

  async initialize(): Promise<void> {
    await mkdir(this.themesRoot, { recursive: true })
    try {
      await this.readSettings()
    } catch {
      const profile = createDefaultTheme(randomUUID())
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

  async duplicate(id: string, name: string): Promise<ThemeProfile> {
    const source = await this.get(id)
    const duplicate = { ...structuredClone(source), id: randomUUID(), name: this.cleanName(name), updatedAt: new Date().toISOString() }
    await mkdir(this.assetRoot(duplicate.id), { recursive: true })
    for (const asset of this.collectAssets(source)) {
      const sourcePath = this.resolveAsset(id, asset)
      const targetPath = this.resolveAsset(duplicate.id, asset)
      await mkdir(dirname(targetPath), { recursive: true })
      await copyFile(sourcePath, targetPath)
    }
    await this.writeProfile(duplicate)
    return duplicate
  }

  async update(input: unknown): Promise<ThemeProfile> {
    const profile = parseThemeProfile(input)
    await this.get(profile.id)
    const next = { ...profile, name: this.cleanName(profile.name), updatedAt: new Date().toISOString() }
    for (const asset of this.collectAssets(next)) this.resolveAsset(next.id, asset)
    await this.writeProfile(next)
    return next
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

  private collectAssets(profile: ThemeProfile): string[] {
    const assets = [profile.hero.sourceImage, profile.polaroid.sourceImage]
    for (const icon of Object.values(profile.icons)) if (icon.kind === 'asset') assets.push(icon.asset)
    return [...new Set(assets.filter((value): value is string => Boolean(value)))]
  }

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

  private themeRoot(id: string): string { this.assertId(id); return join(this.themesRoot, id) }
  private assetRoot(id: string): string { return join(this.themeRoot(id), 'assets') }
  private assertId(id: string): void { if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) throw new Error('Theme ID is invalid.') }
  private cleanName(name: string): string { const result = name.trim(); if (!result || result.length > 80) throw new Error('Theme name must be 1-80 characters.'); return result }
  private mediaType(extension: string): string { return extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg' }
  private assertSafeSvg(source: string): void {
    if (source.length > 2_000_000 || /<(?:script|foreignObject|iframe|object|embed)\b|<!DOCTYPE|<!ENTITY|(?:href|src)\s*=\s*["']\s*(?:https?:|file:|javascript:)/i.test(source)) {
      throw new Error('SVG contains unsupported or external content.')
    }
  }
}

function requireSeparator(): string {
  return process.platform === 'win32' ? '\\' : '/'
}
