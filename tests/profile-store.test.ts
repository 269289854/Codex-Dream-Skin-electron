import { mkdtemp, readFile, readdir, rm, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ProfileStore } from '../src/main/profile-store'

const roots: string[] = []
const TEST_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/69R9WQAAAABJRU5ErkJggg==', 'base64')

async function writeBundledSystemAssets(root: string): Promise<{ hero: string; polaroid: string }> {
  const assets = { hero: join(root, 'bundled-hero.png'), polaroid: join(root, 'bundled-polaroid.png') }
  await Promise.all([writeFile(assets.hero, TEST_PNG), writeFile(assets.polaroid, TEST_PNG)])
  return assets
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('ProfileStore', () => {
  it('persists named profiles atomically and confines assets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-store-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const [systemTheme] = await store.list()
    expect(systemTheme).toMatchObject({ active: true, system: true })

    const created = await store.create('中文主题')
    expect((await store.list()).find((item) => item.id === created.id)?.system).toBe(false)
    const activated = await store.activate(created.id)
    expect(activated.name).toBe('中文主题')
    expect((await store.list()).find((item) => item.id === created.id)?.active).toBe(true)
    const originalPlacement = activated.polaroid.placement
    activated.polaroid.placement = { ...originalPlacement, x: 0.24, y: 0.68 }
    const moved = await store.update(activated)
    expect(moved.polaroid.placement).toEqual({ ...originalPlacement, x: 0.24, y: 0.68 })
    expect(moved.name).toBe('中文主题')
    expect(() => store.resolveAsset(created.id, '../outside.png')).toThrow('escapes')
    expect(() => store.resolveAsset(created.id, 'theme.json')).toThrow('escapes')

    const profileFile = await readFile(join(root, 'themes', created.id, 'theme.json'), 'utf8')
    expect(profileFile).toContain('中文主题')
    expect(profileFile.endsWith('\n')).toBe(true)
    if (!systemTheme) throw new Error('System theme was not initialized.')
    await expect(store.delete(systemTheme.id)).rejects.toThrow('系统默认主题不能删除')
    await store.delete(created.id)
    expect(await store.list()).toEqual([expect.objectContaining({ id: systemTheme.id, active: true, system: true })])
  })

  it('migrates legacy settings and keeps the original bundled theme editable but undeletable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-system-theme-'))
    roots.push(root)
    const bundledAssets = await writeBundledSystemAssets(root)
    const store = new ProfileStore(root, bundledAssets)
    await store.initialize()
    const systemTheme = (await store.list()).find((theme) => theme.system)
    if (!systemTheme) throw new Error('System theme was not initialized.')
    const systemProfile = await store.get(systemTheme.id)
    expect(systemProfile).toMatchObject({
      version: 12,
      hero: {
        source: { asset: 'assets/dream-reference.png', kind: 'image', mimeType: 'image/png' },
        playback: { autoplay: true, loop: true, sound: false, volume: 0.7 },
        mediaTransform: { flipHorizontal: false, flipVertical: false }
      },
      polaroid: {
        source: { asset: 'assets/dream-polaroid.png', kind: 'image', mimeType: 'image/png' },
        sourceSize: { width: 1, height: 1 },
        placement: { x: 0.8278561014524648, y: 0.7127831468304384, width: 0.15, rotation: -15, hideBelowWidth: 920 },
        playback: { autoplay: true, loop: true, sound: false, volume: 0.7 },
        mediaTransform: { flipHorizontal: false, flipVertical: false }
      },
      icons: { backgroundRain: { kind: 'builtin', name: 'wand-sparkles' } },
      decorations: {
        sparkles: { visible: true, effect: 'rain', speed: 1, count: 20, minSize: 20, maxSize: 32, opacity: 0.72, glow: 10, seed: 0, extraColors: [] }
      }
    })
    await expect(readFile(join(root, 'themes', systemTheme.id, 'assets', 'dream-reference.png'))).resolves.toEqual(TEST_PNG)
    await expect(readFile(join(root, 'themes', systemTheme.id, 'assets', 'dream-polaroid.png'))).resolves.toEqual(TEST_PNG)
    const customTheme = await store.create('自定义主题')
    expect(customTheme.hero.source).toBeNull()
    expect(customTheme.polaroid.source).toBeNull()
    await store.activate(customTheme.id)
    await writeFile(join(root, 'settings.json'), `${JSON.stringify({ version: 1, activeThemeId: customTheme.id }, null, 2)}\n`, 'utf8')

    const reopened = new ProfileStore(root, bundledAssets)
    await reopened.initialize()
    const migrated = await reopened.list()
    expect(migrated.find((theme) => theme.id === systemTheme.id)).toMatchObject({ system: true, active: false })
    expect(migrated.find((theme) => theme.id === customTheme.id)).toMatchObject({ system: false, active: true })
    expect(JSON.parse(await readFile(join(root, 'settings.json'), 'utf8'))).toEqual({ version: 2, activeThemeId: customTheme.id, systemThemeId: systemTheme.id })

    const editableSystem = await reopened.get(systemTheme.id)
    editableSystem.name = '修改后的系统主题'
    await reopened.update(editableSystem)
    const preserved = new ProfileStore(root, bundledAssets)
    await preserved.initialize()
    expect((await preserved.list()).find((theme) => theme.id === systemTheme.id)).toMatchObject({ name: '修改后的系统主题', system: true })
    await expect(reopened.delete(systemTheme.id)).rejects.toThrow('系统默认主题不能删除')
    await reopened.delete(customTheme.id)
    expect((await reopened.list()).map((theme) => theme.id)).toEqual([systemTheme.id])
  })

  it.each([1, 2] as const)('recreates a missing system theme from v%s settings without replacing the active custom theme', async (settingsVersion) => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-missing-system-'))
    roots.push(root)
    const bundledAssets = await writeBundledSystemAssets(root)
    const store = new ProfileStore(root, bundledAssets)
    await store.initialize()
    const originalSystem = (await store.list()).find((theme) => theme.system)
    if (!originalSystem) throw new Error('System theme was not initialized.')
    const customTheme = await store.create('保留的自定义主题')
    await rm(join(store.themesRoot, originalSystem.id), { recursive: true, force: true })
    const settings = settingsVersion === 1
      ? { version: 1, activeThemeId: customTheme.id }
      : { version: 2, activeThemeId: customTheme.id, systemThemeId: originalSystem.id }
    await writeFile(join(root, 'settings.json'), `${JSON.stringify(settings, null, 2)}\n`, 'utf8')

    const reopened = new ProfileStore(root, bundledAssets)
    await reopened.initialize()
    const themes = await reopened.list()
    expect(themes).toHaveLength(2)
    expect(themes.find((theme) => theme.system)?.id).not.toBe(customTheme.id)
    expect(themes.find((theme) => theme.id === customTheme.id)).toMatchObject({ active: true, system: false })
  })

  it.each(['missing', 'corrupt'] as const)('cleans up an incomplete system theme when a bundled asset is %s', async (failure) => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-invalid-system-'))
    roots.push(root)
    const hero = join(root, 'bundled-hero.png')
    const polaroid = join(root, 'bundled-polaroid.png')
    await writeFile(hero, TEST_PNG)
    if (failure === 'corrupt') await writeFile(polaroid, 'not-an-image')

    await expect(new ProfileStore(root, { hero, polaroid }).initialize()).rejects.toThrow()
    expect(await readdir(join(root, 'themes'))).toEqual([])
  })

  it('creates the production system preset from the bundled hero and polaroid images', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-production-system-'))
    roots.push(root)
    const resources = join(process.cwd(), 'resources', 'windows')
    const store = new ProfileStore(root, {
      hero: join(resources, 'dream-reference.png'),
      polaroid: join(resources, 'dream-polaroid.png')
    })

    await store.initialize()
    const systemTheme = (await store.list()).find((theme) => theme.system)
    if (!systemTheme) throw new Error('System theme was not initialized.')
    const profile = await store.get(systemTheme.id)
    expect(profile.hero.source?.asset).toBe('assets/dream-reference.png')
    expect(profile.polaroid.source?.asset).toBe('assets/dream-polaroid.png')
    expect(profile.polaroid.sourceSize).toEqual({ width: 1122, height: 1402 })
  })

  it('restores the complete bundled preset for the system theme without saving the draft', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-reset-system-'))
    roots.push(root)
    const bundledAssets = await writeBundledSystemAssets(root)
    const store = new ProfileStore(root, bundledAssets)
    await store.initialize()
    const systemTheme = (await store.list()).find((theme) => theme.system)
    if (!systemTheme) throw new Error('System theme was not initialized.')

    const edited = await store.get(systemTheme.id)
    edited.hero.source = null
    edited.polaroid.source = null
    edited.decorations.sparkles.effect = 'twinkle'
    edited.decorations.sparkles.count = 6
    await store.update(edited)
    const heroPath = join(root, 'themes', systemTheme.id, 'assets', 'dream-reference.png')
    const polaroidPath = join(root, 'themes', systemTheme.id, 'assets', 'dream-polaroid.png')
    await Promise.all([writeFile(heroPath, 'stale'), writeFile(polaroidPath, 'stale')])

    const reset = await store.getDefault(systemTheme.id)
    expect(reset).toMatchObject({
      id: systemTheme.id,
      hero: { source: { asset: 'assets/dream-reference.png', kind: 'image', mimeType: 'image/png' } },
      polaroid: {
        source: { asset: 'assets/dream-polaroid.png', kind: 'image', mimeType: 'image/png' },
        sourceSize: { width: 1, height: 1 },
        placement: { x: 0.8278561014524648, y: 0.7127831468304384, width: 0.15, rotation: -15, hideBelowWidth: 920 }
      },
      icons: { backgroundRain: { kind: 'builtin', name: 'wand-sparkles' } },
      decorations: { sparkles: { effect: 'rain', count: 20, minSize: 20, maxSize: 32 } }
    })
    expect((await store.get(systemTheme.id)).hero.source).toBeNull()
    await expect(readFile(heroPath)).resolves.toEqual(TEST_PNG)
    await expect(readFile(polaroidPath)).resolves.toEqual(TEST_PNG)
    await expect(store.getMediaPreviewUrl(systemTheme.id, 'assets/dream-reference.png')).resolves.toContain('studio-media://')
    await expect(store.resolveReferencedMedia(systemTheme.id, 'assets/dream-polaroid.png')).resolves.toMatchObject({ mimeType: 'image/png', size: TEST_PNG.length })

    const custom = await store.create('自定义主题')
    const customReset = await store.getDefault(custom.id)
    expect(customReset.hero.source).toBeNull()
    expect(customReset.polaroid.source).toBeNull()
    expect(customReset.decorations.sparkles).toMatchObject({ effect: 'twinkle', count: 6 })
    await expect(store.getMediaPreviewUrl(custom.id, 'assets/dream-reference.png')).rejects.toThrow('未被当前主题引用')
  })

  it('imports, persists, compiles, and duplicates validated font assets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-font-store-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const profile = await store.create('字体主题')
    const source = join(root, 'my-font.woff2')
    await writeFile(source, Buffer.from('wOF2'))

    const imported = await store.importFontAsset(profile.id, source)
    expect(imported).toMatchObject({ family: 'my-font', format: 'woff2', mediaType: 'font/woff2', originalName: 'my-font.woff2' })
    expect(imported.dataUrl).toBe('data:font/woff2;base64,d09GMg==')
    profile.typography.importedFonts.push({
      id: imported.id,
      family: imported.family,
      asset: imported.relativePath,
      originalName: imported.originalName,
      format: imported.format
    })
    profile.typography.slots.brandTitle = { kind: 'imported', id: imported.id }
    await store.update(profile)

    const compiled = await store.compile(profile.id)
    expect(compiled.assets[imported.relativePath]).toBe(imported.dataUrl)
    const duplicate = await store.duplicate(profile, '字体主题副本')
    expect((await store.compile(duplicate.id)).assets[imported.relativePath]).toBe(imported.dataUrl)
  })

  it('imports media atomically without leaving a temporary file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-media-store-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const profile = await store.create('媒体主题')
    const source = join(root, 'hero.png')
    await writeFile(source, TEST_PNG)

    const imported = await store.importMediaAsset(profile.id, source, 'hero')
    const assetDirectory = join(store.themesRoot, profile.id, 'assets')
    expect(await readFile(join(store.themesRoot, profile.id, imported.relativePath))).toEqual(TEST_PNG)
    expect((await readdir(assetDirectory)).some((entry) => entry.endsWith('.tmp'))).toBe(false)
  })

  it('duplicates the current draft and every referenced asset without changing the source profile', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-draft-duplicate-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const profile = await store.create('原主题')
    const imageSource = join(root, 'art.png')
    const fontSource = join(root, 'title.woff2')
    await writeFile(imageSource, TEST_PNG)
    await writeFile(fontSource, Buffer.from('wOF2'))
    const image = await store.importAsset(profile.id, imageSource, 'hero')
    const font = await store.importFontAsset(profile.id, fontSource)

    profile.copy.brandTitle = '尚未保存的标题'
    profile.hero.sourceImage = image.relativePath
    profile.polaroid.sourceImage = image.relativePath
    profile.icons.cardPrimary = { kind: 'asset', asset: image.relativePath }
    profile.typography.importedFonts.push({
      id: font.id,
      family: font.family,
      asset: font.relativePath,
      originalName: font.originalName,
      format: font.format
    })
    profile.typography.slots.brandTitle = { kind: 'imported', id: font.id }

    const duplicate = await store.duplicate(profile, ' 当前设计副本 ')
    expect(duplicate).toMatchObject({ name: '当前设计副本', copy: { brandTitle: '尚未保存的标题' } })
    expect(duplicate.id).not.toBe(profile.id)
    expect(Date.parse(duplicate.updatedAt)).toBeGreaterThanOrEqual(Date.parse(profile.updatedAt))
    expect((await store.get(profile.id)).copy.brandTitle).not.toBe('尚未保存的标题')
    expect((await store.get(profile.id)).hero.sourceImage).toBeNull()
    const compiled = await store.compile(duplicate.id)
    expect(compiled.assets[image.relativePath]).toBe(image.dataUrl)
    expect(compiled.assets[font.relativePath]).toBe(font.dataUrl)
  })

  it('rejects untrusted duplicate input and removes incomplete destination directories', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-duplicate-validation-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const profile = await store.create('安全主题')
    const originalDirectories = (await readdir(store.themesRoot)).sort()

    await expect(store.duplicate({}, '非法主题')).rejects.toThrow()
    await expect(store.duplicate({ ...profile, id: '00000000-0000-4000-8000-000000000099' }, '未知主题')).rejects.toThrow()
    await expect(store.duplicate({ ...profile, hero: { ...profile.hero, sourceImage: '../outside.png' } }, '越界主题')).rejects.toThrow('escapes')
    await expect(store.duplicate({ ...profile, hero: { ...profile.hero, sourceImage: 'assets/missing.png' } }, '缺失素材')).rejects.toThrow()
    await expect(store.duplicate(profile, 123)).rejects.toThrow('1-80')
    await expect(store.duplicate(profile, 'x'.repeat(81))).rejects.toThrow('1-80')

    expect((await readdir(store.themesRoot)).sort()).toEqual(originalDirectories)
  })

  it('rejects unsupported, mismatched, collection, and oversized font files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-font-validation-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const profile = await store.create('字体校验')

    const mismatched = join(root, 'mismatch.woff2')
    await writeFile(mismatched, Buffer.from('OTTO'))
    await expect(store.importFontAsset(profile.id, mismatched)).rejects.toThrow('header')
    const collection = join(root, 'collection.ttf')
    await writeFile(collection, Buffer.from('ttcf'))
    await expect(store.importFontAsset(profile.id, collection)).rejects.toThrow('collection')
    const unsupported = join(root, 'collection.ttc')
    await writeFile(unsupported, Buffer.from('ttcf'))
    await expect(store.importFontAsset(profile.id, unsupported)).rejects.toThrow('Unsupported')
    const oversized = join(root, 'large.woff')
    await writeFile(oversized, Buffer.from('wOFF'))
    await truncate(oversized, 12 * 1024 * 1024 + 1)
    await expect(store.importFontAsset(profile.id, oversized)).rejects.toThrow('12 MB')
  })
})
