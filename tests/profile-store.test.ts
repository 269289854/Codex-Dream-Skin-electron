import { mkdtemp, readFile, rm } from 'node:fs/promises'
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
    expect(() => store.resolveAsset(created.id, '../outside.png')).toThrow('escapes')
    expect(() => store.resolveAsset(created.id, 'theme.json')).toThrow('escapes')

    const profileFile = await readFile(join(root, 'themes', created.id, 'theme.json'), 'utf8')
    expect(profileFile).toContain('中文主题')
    expect(profileFile.endsWith('\n')).toBe(true)
  })
})
