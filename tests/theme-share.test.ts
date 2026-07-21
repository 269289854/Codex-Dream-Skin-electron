import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unzipSync, zipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'
import { ProfileStore } from '../src/main/profile-store'
import { decodeShareZip, sha256, validateShareContents } from '../src/main/theme-share'

const roots: string[] = []
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/69R9WQAAAABJRU5ErkJggg==', 'base64')

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('theme share packages', () => {
  it('exports the current draft once per referenced asset and imports it as a new theme', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-share-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const original = await store.create('分享主题')
    const source = join(root, 'hero.png')
    const fontSource = join(root, 'title.woff2')
    await writeFile(source, png)
    await writeFile(fontSource, Buffer.from('wOF2'))
    const image = await store.importAsset(original.id, source, 'hero')
    const font = await store.importFontAsset(original.id, fontSource)
    const draft = structuredClone(original)
    draft.copy.brandTitle = '尚未保存的分享标题'
    draft.colors.accent = '#123456'
    draft.hero.sourceImage = image.relativePath
    draft.polaroid.sourceImage = image.relativePath
    draft.hero.mediaTransform = { flipHorizontal: true, flipVertical: false }
    draft.polaroid.mediaTransform = { flipHorizontal: false, flipVertical: true }
    draft.icons.branding = { kind: 'asset', asset: image.relativePath }
    draft.typography.importedFonts.push({ id: font.id, family: font.family, asset: font.relativePath, originalName: font.originalName, format: font.format })
    draft.typography.slots.brandTitle = { kind: 'imported', id: font.id }
    const packagePath = join(root, 'design.cdstheme')
    await store.exportSharePackage(draft, packagePath)
    expect((await stat(packagePath)).isFile()).toBe(true)
    const archive = unzipSync(await readFile(packagePath))
    expect(Object.keys(archive).sort()).toEqual([font.relativePath, image.relativePath, 'manifest.json', 'theme.json'].sort())
    const checked = validateShareContents(new Map(Object.entries(archive).map(([path, data]) => [path, Buffer.from(data)])))
    expect(checked.profile.copy.brandTitle).toBe('尚未保存的分享标题')
    expect(checked.profile.resetColors.accent).toBe(original.resetColors.accent)

    const imported = await store.importSharePackage(packagePath)
    expect(imported.id).not.toBe(original.id)
    expect(imported.name).toBe(draft.name)
    expect(imported.copy.brandTitle).toBe('尚未保存的分享标题')
    expect(imported.colors).toEqual(draft.colors)
    expect(imported.resetColors).toEqual(draft.colors)
    expect(imported.hero.mediaTransform).toEqual({ flipHorizontal: true, flipVertical: false })
    expect(imported.polaroid.mediaTransform).toEqual({ flipHorizontal: false, flipVertical: true })
    expect(Date.parse(imported.updatedAt)).toBeGreaterThanOrEqual(Date.parse(original.updatedAt))
    expect((await store.get(original.id)).copy.brandTitle).not.toBe(imported.copy.brandTitle)
    expect((await store.compile(imported.id)).assets[image.relativePath]).toBe(`data:image/png;base64,${png.toString('base64')}`)
    expect((await store.compile(imported.id)).assets[font.relativePath]).toBe(font.dataUrl)
    expect((await readdir(store.themesRoot)).filter((name) => name.startsWith('.cdstheme-import-'))).toHaveLength(0)
  })

  it('imports v11 share packages with neutral flip defaults', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-share-v11-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const original = await store.create('旧分享主题')
    const source = join(root, 'hero.png')
    await writeFile(source, png)
    const image = await store.importAsset(original.id, source, 'hero')
    const current = structuredClone(original)
    current.hero.sourceImage = image.relativePath
    current.colors.accent = '#2878B8'
    const { mediaTransform: _heroTransform, ...hero } = current.hero
    const { mediaTransform: _polaroidTransform, ...polaroid } = current.polaroid
    const { resetColors: _resetColors, ...currentWithoutResetColors } = current
    const legacy = { ...currentWithoutResetColors, version: 11, hero, polaroid }
    const packagePath = join(root, 'v11.cdstheme')
    await store.exportSharePackage(legacy, packagePath)
    const archive = unzipSync(await readFile(packagePath))
    const manifest = JSON.parse(Buffer.from(archive['manifest.json']!).toString('utf8')) as { profileVersion: number }
    manifest.profileVersion = 11
    archive['theme.json'] = Buffer.from(JSON.stringify(legacy))
    await writeFile(packagePath, zipSync({ ...archive, 'manifest.json': Buffer.from(JSON.stringify(manifest)) }))

    const imported = await store.importSharePackage(packagePath)
    expect(imported.version).toBe(14)
    expect(imported.resetColors).toEqual(imported.colors)
    expect(imported.resetColors.accent).toBe('#2878B8')
    expect(imported.hero.mediaTransform).toEqual({ flipHorizontal: false, flipVertical: false })
    expect(imported.polaroid.mediaTransform).toEqual({ flipHorizontal: false, flipVertical: false })
  })

  it('rejects altered manifests without creating a theme', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-share-invalid-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const original = await store.create('安全分享')
    const packagePath = join(root, 'design.cdstheme')
    await store.exportSharePackage(original, packagePath)
    const archive = unzipSync(await readFile(packagePath))
    const manifest = JSON.parse(Buffer.from(archive['manifest.json']!).toString('utf8')) as { format: string }
    manifest.format = 'unknown-theme-format'
    const alteredPath = join(root, 'altered.cdstheme')
    await writeFile(alteredPath, zipSync({ ...archive, 'manifest.json': Buffer.from(JSON.stringify(manifest)) }))
    const before = await readdir(store.themesRoot)
    await expect(store.importSharePackage(alteredPath)).rejects.toThrow()
    expect(await readdir(store.themesRoot)).toEqual(before)
  })

  it('rejects malformed archive paths before parsing theme content', () => {
    expect(() => decodeShareZip(new Uint8Array([1, 2, 3]))).toThrow()
    expect(() => decodeShareZip(zipSync({ '../outside.png': png }))).toThrow('路径无效')
    const tooManyEntries = Object.fromEntries(Array.from({ length: 129 }, (_, index) => [`assets/image-${index}.png`, new Uint8Array()]))
    expect(() => decodeShareZip(zipSync(tooManyEntries))).toThrow('条目数量')
  })

  it('rejects extra files, wrong hashes, and invalid images before committing an import', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-share-content-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const profile = await store.create('内容校验')
    const source = join(root, 'hero.png')
    await writeFile(source, png)
    const image = await store.importAsset(profile.id, source, 'hero')
    profile.hero.sourceImage = image.relativePath
    const packagePath = join(root, 'base.cdstheme')
    await store.exportSharePackage(profile, packagePath)
    const archive = unzipSync(await readFile(packagePath))
    const originalDirectories = await readdir(store.themesRoot)

    const extraPath = join(root, 'extra.cdstheme')
    await writeFile(extraPath, zipSync({ ...archive, 'assets/extra.png': png }))
    await expect(store.importSharePackage(extraPath)).rejects.toThrow('未列出的素材')

    const manifest = JSON.parse(Buffer.from(archive['manifest.json']!).toString('utf8')) as { assets: Array<{ path: string; size: number; sha256: string }> }
    const hashedPath = join(root, 'hash.cdstheme')
    const wrongHashManifest = structuredClone(manifest)
    wrongHashManifest.assets[0]!.sha256 = '0'.repeat(64)
    await writeFile(hashedPath, zipSync({ ...archive, 'manifest.json': Buffer.from(JSON.stringify(wrongHashManifest)) }))
    await expect(store.importSharePackage(hashedPath)).rejects.toThrow('素材校验失败')

    const invalidImagePath = join(root, 'invalid-image.cdstheme')
    const invalidImage = Buffer.from('not an image')
    const invalidManifest = structuredClone(manifest)
    invalidManifest.assets[0]!.size = invalidImage.byteLength
    invalidManifest.assets[0]!.sha256 = sha256(invalidImage)
    await writeFile(invalidImagePath, zipSync({ ...archive, [image.relativePath]: invalidImage, 'manifest.json': Buffer.from(JSON.stringify(invalidManifest)) }))
    await expect(store.importSharePackage(invalidImagePath)).rejects.toThrow()
    expect(await readdir(store.themesRoot)).toEqual(originalDirectories)
  })
})
