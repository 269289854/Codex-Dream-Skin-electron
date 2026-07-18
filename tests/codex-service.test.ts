import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { runPowerShellMock } = vi.hoisted(() => ({ runPowerShellMock: vi.fn() }))

vi.mock('../src/main/powershell', () => ({ runPowerShell: runPowerShellMock }))

import { CodexService } from '../src/main/codex-service'
import { ProfileStore } from '../src/main/profile-store'
import { BUILTIN_ICON_GLYPHS } from '../src/shared/icon-glyphs'
import { HOME_ACTION_FALLBACK_BUILTINS } from '../src/shared/home-layout'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

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

  it('persists a runtime polaroid move and rebuilds the payload without changing other placement fields', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-runtime-placement-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const summary = (await store.list())[0]
    if (!summary) throw new Error('Default theme was not created.')
    const original = await store.get(summary.id)
    original.typography.slots.ui = { kind: 'builtin', id: 'jetbrains-mono' }
    original.appearance.paints.canvas = { kind: 'linear', angle: 90, stops: [{ color: 'red', position: 0 }, { color: 'blue', position: 1 }] }
    await store.update(original)
    const placementListener = vi.fn()
    const service = new CodexService(store, join(process.cwd(), 'resources', 'windows'), () => undefined, placementListener)
    const internal = service as unknown as {
      activeThemeId: string | null
      operationTail: Promise<void>
      queuePolaroidPlacement: (update: { themeId: string; x: number; y: number }) => void
    }
    internal.activeThemeId = summary.id

    internal.queuePolaroidPlacement({ themeId: summary.id, x: 0.27, y: 0.64 })
    await internal.operationTail

    const saved = await store.get(summary.id)
    expect(saved.polaroid.placement).toEqual({ ...original.polaroid.placement, x: 0.27, y: 0.64 })
    expect(placementListener).toHaveBeenCalledWith({ themeId: summary.id, x: 0.27, y: 0.64 })
    const payload = await readFile(join(root, 'runtime', 'payload.js'), 'utf8')
    expect(payload).toContain(JSON.stringify(summary.id))
    expect(payload).toContain(JSON.stringify(BUILTIN_ICON_GLYPHS))
    expect(payload).toContain(JSON.stringify(HOME_ACTION_FALLBACK_BUILTINS))
    expect(payload).toContain('Dream JetBrains Mono')
    expect(payload).toContain('@font-face')
    expect(payload).toContain('@keyframes dream-particle-twinkle')
    expect(payload).toContain('"sparkleIconSlot":"backgroundSparkle"')
    expect(payload).toContain('linear-gradient(90deg, red 0%, blue 100%)')

    internal.queuePolaroidPlacement({ themeId: '22222222-2222-4222-8222-222222222222', x: 0.4, y: 0.5 })
    await internal.operationTail
    expect(placementListener).toHaveBeenCalledTimes(1)
    expect((await store.get(summary.id)).polaroid.placement).toEqual(saved.polaroid.placement)
  })
})
