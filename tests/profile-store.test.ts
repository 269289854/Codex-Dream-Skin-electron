import { mkdtemp, readFile, readdir, rm, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ProfileStore } from '../src/main/profile-store'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('ProfileStore', () => {
  it('persists named profiles atomically and confines assets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-store-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    expect(await store.list()).toHaveLength(1)

    const created = await store.create('中文主题')
    const activated = await store.activate(created.id)
    expect(activated.name).toBe('中文主题')
    expect((await store.list()).find((item) => item.id === created.id)?.active).toBe(true)
    const originalPlacement = activated.polaroid.placement
    const moved = await store.updatePolaroidPlacement(created.id, { x: 0.24, y: 0.68 })
    expect(moved.polaroid.placement).toEqual({ ...originalPlacement, x: 0.24, y: 0.68 })
    expect(moved.name).toBe('中文主题')
    expect(() => store.resolveAsset(created.id, '../outside.png')).toThrow('escapes')
    expect(() => store.resolveAsset(created.id, 'theme.json')).toThrow('escapes')

    const profileFile = await readFile(join(root, 'themes', created.id, 'theme.json'), 'utf8')
    expect(profileFile).toContain('中文主题')
    expect(profileFile.endsWith('\n')).toBe(true)
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

  it('duplicates the current draft and every referenced asset without changing the source profile', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-draft-duplicate-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const profile = await store.create('原主题')
    const imageSource = join(root, 'art.png')
    const fontSource = join(root, 'title.woff2')
    await writeFile(imageSource, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/69R9WQAAAABJRU5ErkJggg==', 'base64'))
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
