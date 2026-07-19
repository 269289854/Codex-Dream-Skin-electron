import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createDefaultTheme } from '../src/shared/theme'

const { runPowerShellMock } = vi.hoisted(() => ({ runPowerShellMock: vi.fn() }))

vi.mock('../src/main/powershell', () => ({ runPowerShell: runPowerShellMock }))

import { CodexService } from '../src/main/codex-service'

const detection = {
  found: true,
  version: '26.715.2305.0',
  executable: 'C:\\WindowsApps\\Codex\\app\\ChatGPT.exe',
  packageFamilyName: 'OpenAI.Codex_test',
  running: false,
  backupAvailable: false
}

function createService(): CodexService {
  const root = join(tmpdir(), `codex-dream-skin-missing-${process.pid}-${Date.now()}`)
  const store = { root, themesRoot: join(root, 'themes') } as never
  return new CodexService(store, join(root, 'resources'), () => undefined)
}

describe('CodexService operation queue', () => {
  it('serializes startup recovery detection with a manual detection', async () => {
    let release!: (value: typeof detection) => void
    const firstOperation = new Promise<typeof detection>((resolve) => { release = resolve })
    runPowerShellMock
      .mockReturnValueOnce(firstOperation)
      .mockResolvedValueOnce(detection)

    const service = createService()
    const resume = service.resume()
    const detect = service.detect()
    await new Promise<void>((resolve) => setImmediate(resolve))

    expect(runPowerShellMock).toHaveBeenCalledTimes(1)
    release(detection)
    await Promise.all([resume, detect])
    expect(runPowerShellMock).toHaveBeenCalledTimes(2)
  })

  it('changes the renderer version for every rebuilt payload', async () => {
    const root = join(tmpdir(), `codex-dream-skin-payload-${process.pid}-${Date.now()}`)
    const profile = createDefaultTheme('11111111-1111-4111-8111-111111111111')
    profile.updatedAt = '2026-07-20T00:00:00.000Z'
    profile.polaroid.source = { asset: 'asset-polaroid', kind: 'video', mimeType: 'video/mp4' }
    const store = {
      root,
      themesRoot: join(root, 'themes'),
      get: vi.fn().mockResolvedValue(profile),
      compile: vi.fn().mockResolvedValue({ assets: {} })
    }
    const service = new CodexService(store as never, join(process.cwd(), 'resources', 'windows'), () => undefined)
    const builder = service as unknown as { buildPayload(themeId: string): Promise<string> }

    const first = await builder.buildPayload(profile.id)
    const second = await builder.buildPayload(profile.id)
    const versionPattern = /const VERSION = "([^"]+)"/
    const firstVersion = first.match(versionPattern)?.[1]
    const secondVersion = second.match(versionPattern)?.[1]

    expect(firstVersion).toMatch(/^studio-2026-07-20T00:00:00\.000Z-[0-9a-f-]{36}$/)
    expect(secondVersion).not.toBe(firstVersion)
    expect(first).toContain('"asset":"asset-polaroid"')
  })

})
