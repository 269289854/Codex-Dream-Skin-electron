import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { commitVideoOutputs } from '../src/main/video-output-commit'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('video output commit', () => {
  it('preserves an existing original destination when publishing the original fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-video-commit-'))
    roots.push(root)
    const originalTemporary = join(root, 'original.tmp')
    const originalPath = join(root, 'original.mp4')
    const optimizedTemporary = join(root, 'optimized.tmp.mp4')
    const optimizedPath = join(root, 'optimized.mp4')
    const sentinel = join(originalPath, 'existing-original')

    await Promise.all([
      writeFile(originalTemporary, 'new-original'),
      writeFile(optimizedTemporary, 'optimized'),
      mkdir(originalPath)
    ])
    await writeFile(sentinel, 'keep')

    await expect(commitVideoOutputs({
      originalTemporary,
      originalPath,
      optimizedTemporary,
      optimizedPath
    })).rejects.toThrow()

    await expect(readFile(sentinel, 'utf8')).resolves.toBe('keep')
    await expect(stat(originalTemporary)).rejects.toThrow()
    await expect(stat(optimizedTemporary)).rejects.toThrow()
    await expect(stat(optimizedPath)).rejects.toThrow()
  })

  it('preserves an existing optimized destination when publishing the optimized file fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-video-commit-'))
    roots.push(root)
    const optimizedTemporary = join(root, 'optimized.tmp.mp4')
    const optimizedPath = join(root, 'optimized.mp4')
    const sentinel = join(optimizedPath, 'existing-optimized')

    await Promise.all([
      writeFile(optimizedTemporary, 'new-optimized'),
      mkdir(optimizedPath)
    ])
    await writeFile(sentinel, 'keep')

    await expect(commitVideoOutputs({ optimizedTemporary, optimizedPath })).rejects.toThrow()

    await expect(readFile(sentinel, 'utf8')).resolves.toBe('keep')
    await expect(stat(optimizedTemporary)).rejects.toThrow()
  })
})
