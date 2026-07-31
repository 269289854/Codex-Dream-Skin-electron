import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ProfileStore } from '../src/main/profile-store'

const roots: string[] = []
const MINIMUM_FREE_BYTES = 10 * 1024 ** 3

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('ProfileStore disk space checks', () => {
  it('rejects writes that would consume the required free-space reserve', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-disk-space-'))
    roots.push(root)
    const store = new ProfileStore(root, undefined, {
      readDiskSpace: async () => ({
        available: MINIMUM_FREE_BYTES,
        total: 40 * 1024 ** 3
      })
    })
    await store.initialize()
    const profile = await store.create('磁盘空间测试')

    await expect(store.exportSharePackage(profile, join(root, 'theme.cdstheme')))
      .rejects.toThrow('磁盘空间不足')
  })
})
