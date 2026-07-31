import { rename, rm } from 'node:fs/promises'

interface VideoOutputCommit {
  optimizedTemporary: string
  optimizedPath: string
  originalTemporary?: string
  originalPath?: string
}

export async function commitVideoOutputs(input: VideoOutputCommit): Promise<void> {
  let optimizedPublished = false
  try {
    await rename(input.optimizedTemporary, input.optimizedPath)
    optimizedPublished = true
    if (input.originalTemporary && input.originalPath) {
      await rename(input.originalTemporary, input.originalPath)
    }
  } catch (error) {
    await Promise.all([
      ...(input.originalTemporary ? [rm(input.originalTemporary, { force: true }).catch(() => undefined)] : []),
      rm(input.optimizedTemporary, { force: true }).catch(() => undefined),
      ...(optimizedPublished ? [rm(input.optimizedPath, { force: true }).catch(() => undefined)] : [])
    ])
    throw error
  }
}
