import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StudioMediaProtocol, toThemeDeleteError, type ResolvedStudioMedia } from '../src/main/studio-media-protocol'

const THEME_ID = '11111111-1111-4111-8111-111111111111'

describe('StudioMediaProtocol', () => {
  const roots: string[] = []

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  })

  async function fixture(bytes = Buffer.from('0123456789')): Promise<{ protocol: StudioMediaProtocol; root: string; themeRoot: string; path: string }> {
    const root = await mkdtemp(join(tmpdir(), 'studio-media-protocol-'))
    roots.push(root)
    const themeRoot = join(root, THEME_ID)
    const path = join(themeRoot, 'assets', 'video.mp4')
    await mkdir(join(themeRoot, 'assets'), { recursive: true })
    await writeFile(path, bytes)
    const resolveMedia = vi.fn(async (): Promise<ResolvedStudioMedia> => ({ path, mimeType: 'video/mp4', size: bytes.length }))
    return { protocol: new StudioMediaProtocol(resolveMedia), root, themeRoot, path }
  }

  it('serves full, HEAD, explicit range, and suffix range requests', async () => {
    const { protocol } = await fixture()

    const full = await protocol.handleRequest(new Request(`studio-media://${THEME_ID}/assets/video.mp4`))
    expect(full.status).toBe(200)
    expect(full.headers.get('content-type')).toBe('video/mp4')
    expect(full.headers.get('accept-ranges')).toBe('bytes')
    expect(full.headers.get('cache-control')).toBe('no-store')
    expect(full.headers.get('content-length')).toBe('10')
    expect(Buffer.from(await full.arrayBuffer()).toString()).toBe('0123456789')

    const head = await protocol.handleRequest(new Request(`studio-media://${THEME_ID}/assets/video.mp4`, { method: 'HEAD' }))
    expect(head.status).toBe(200)
    expect(head.headers.get('content-length')).toBe('10')
    expect(await head.text()).toBe('')

    const range = await protocol.handleRequest(new Request(`studio-media://${THEME_ID}/assets/video.mp4`, { headers: { Range: 'bytes=2-5' } }))
    expect(range.status).toBe(206)
    expect(range.headers.get('content-range')).toBe('bytes 2-5/10')
    expect(range.headers.get('content-length')).toBe('4')
    expect(Buffer.from(await range.arrayBuffer()).toString()).toBe('2345')

    const suffix = await protocol.handleRequest(new Request(`studio-media://${THEME_ID}/assets/video.mp4?range=bytes%3D-3`))
    expect(suffix.status).toBe(206)
    expect(suffix.headers.get('content-range')).toBe('bytes 7-9/10')
    expect(Buffer.from(await suffix.arrayBuffer()).toString()).toBe('789')
  })

  it('rejects unsupported methods, invalid ranges, and resolver failures', async () => {
    const { protocol } = await fixture()

    await expect(protocol.handleRequest(new Request(`studio-media://${THEME_ID}/assets/video.mp4`, { method: 'POST' }))).resolves.toMatchObject({ status: 405 })
    await expect(protocol.handleRequest(new Request(`studio-media://${THEME_ID}/assets/video.mp4`, { headers: { Range: 'items=1-2' } }))).resolves.toMatchObject({ status: 416 })
    await expect(protocol.handleRequest(new Request(`studio-media://${THEME_ID}/assets/video.mp4`, { headers: { Range: 'bytes=20-30' } }))).resolves.toMatchObject({ status: 416 })

    const missing = new StudioMediaProtocol(async () => { throw new Error('missing') })
    await expect(missing.handleRequest(new Request(`studio-media://${THEME_ID}/assets/missing.mp4`))).resolves.toMatchObject({ status: 404 })
  })

  it('closes active streams before renaming a theme directory', async () => {
    const bytes = Buffer.alloc(8 * 1024 * 1024, 1)
    const { protocol, root, themeRoot } = await fixture(bytes)
    const response = await protocol.handleRequest(new Request(`studio-media://${THEME_ID}/assets/video.mp4`))
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Response body is missing.')
    const first = await reader.read()
    expect(first.done).toBe(false)

    const tombstone = join(root, `.theme-delete-${THEME_ID}`)
    await protocol.withThemeSuspended(THEME_ID, async () => rename(themeRoot, tombstone))

    await expect(readFile(join(tombstone, 'assets', 'video.mp4'))).resolves.toHaveLength(bytes.length)
    await reader.cancel().catch(() => undefined)
  })

  it('blocks new requests during suspension and restores access after a failed operation', async () => {
    const { protocol } = await fixture()
    let rejectOperation: (reason: Error) => void = () => undefined
    const operation = protocol.withThemeSuspended(THEME_ID, () => new Promise<never>((_resolve, reject) => { rejectOperation = reject }))
    await Promise.resolve()

    await expect(protocol.handleRequest(new Request(`studio-media://${THEME_ID}/assets/video.mp4`))).resolves.toMatchObject({ status: 404 })
    await expect(protocol.withThemeSuspended(THEME_ID, async () => undefined)).rejects.toThrow('主题正在删除')

    rejectOperation(new Error('delete failed'))
    await expect(operation).rejects.toThrow('delete failed')
    await expect(protocol.handleRequest(new Request(`studio-media://${THEME_ID}/assets/video.mp4`, { method: 'HEAD' }))).resolves.toMatchObject({ status: 200 })
  })

  it('maps file occupation errors without exposing local paths', () => {
    const busy = Object.assign(new Error("EPERM: rename 'C:\\Users\\example\\theme'"), { code: 'EPERM' })
    expect(toThemeDeleteError(busy).message).toBe('主题素材仍被其他程序占用，请关闭相关程序后重试。')
    const domain = new Error('系统默认主题不能删除。')
    expect(toThemeDeleteError(domain)).toBe(domain)
  })
})
