import { mkdtemp, readFile, rm, truncate, writeFile } from 'node:fs/promises'
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
    const duplicate = await store.duplicate(profile.id, '字体主题副本')
    expect((await store.compile(duplicate.id)).assets[imported.relativePath]).toBe(imported.dataUrl)
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
