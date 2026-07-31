import { mkdtemp, rm, stat, truncate, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VideoAssetInspection } from '../src/shared/contracts'

const mediaInfo = vi.hoisted(() => ({
  analyzeData: vi.fn(),
  close: vi.fn(),
  factory: vi.fn()
}))

vi.mock('mediainfo.js', () => ({
  default: mediaInfo.factory,
  isTrackType: (track: { '@type'?: string }, type: string) => track['@type'] === type
}))

import { finalizeShareArchive, hashFile, ProfileStore, type ShareArchiveWriter } from '../src/main/profile-store'

const roots: string[] = []

afterEach(async () => {
  mediaInfo.analyzeData.mockReset()
  mediaInfo.close.mockReset()
  mediaInfo.factory.mockReset()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('ProfileStore cancellation', () => {
  it.each([
    {
      name: 'cancellation',
      fail: (controller: AbortController, output: PassThrough) => controller.abort(),
      message: '主题导出已取消'
    },
    {
      name: 'output failure',
      fail: (_controller: AbortController, output: PassThrough) => output.destroy(new Error('disk write failed')),
      message: 'disk write failed'
    }
  ])('terminates a stalled archive immediately after $name', async ({ fail, message }) => {
    const events = new EventEmitter()
    const archive = {
      pipe: vi.fn(),
      append: vi.fn(),
      on: events.on.bind(events),
      off: events.off.bind(events),
      finalize: vi.fn(() => new Promise<void>(() => undefined)),
      abort: vi.fn()
    } as unknown as ShareArchiveWriter
    const output = new PassThrough()
    const controller = new AbortController()
    const writing = finalizeShareArchive(archive, output, () => undefined, controller.signal)
    await new Promise<void>((resolve) => setImmediate(resolve))

    fail(controller, output)

    await expect(Promise.race([
      writing,
      new Promise<void>((_resolve, reject) => setTimeout(() => reject(new Error('archive coordination timed out')), 250))
    ])).rejects.toThrow(message)
    expect(archive.abort).toHaveBeenCalledOnce()
    expect(output.destroyed).toBe(true)
  })

  it('cancels SHA-256 reads and releases the input stream', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-hash-cancel-'))
    roots.push(root)
    const source = join(root, 'large.bin')
    await writeFile(source, Buffer.alloc(1))
    await truncate(source, 256 * 1024 * 1024)
    const controller = new AbortController()

    const hashing = hashFile(source, controller.signal, '主题导入已取消。')
    setTimeout(() => controller.abort(), 0)

    await expect(hashing).rejects.toThrow('主题导入已取消')
    await expect(rm(source)).resolves.toBeUndefined()
  })

  it('cancels between MediaInfo chunk reads and closes both analyzers and file handles', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-mediainfo-cancel-'))
    roots.push(root)
    const source = join(root, 'probe.mp4')
    const bytes = Buffer.alloc(256)
    bytes.write('ftyp', 4, 'latin1')
    await writeFile(source, bytes)

    let releaseAnalysis: (() => void) | undefined
    let analysisStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => { analysisStarted = resolve })
    const release = new Promise<void>((resolve) => { releaseAnalysis = resolve })
    mediaInfo.analyzeData.mockImplementation(async (_size: number, readChunk: (size: number, offset: number) => Promise<Uint8Array>) => {
      await readChunk(16, 0)
      analysisStarted?.()
      await release
      await readChunk(16, 16)
      throw new Error('The second read should have observed cancellation.')
    })
    mediaInfo.factory.mockResolvedValue({ analyzeData: mediaInfo.analyzeData, close: mediaInfo.close })

    const controller = new AbortController()
    const fileSize = (await stat(source)).size
    const store = new ProfileStore(root)
    const inspectVideo = (store as unknown as {
      inspectVideo: (path: string, extension: string, size: number, signal: AbortSignal, message: string) => Promise<VideoAssetInspection>
    }).inspectVideo.bind(store)
    const inspecting = inspectVideo(source, '.mp4', fileSize, controller.signal, '主题导入已取消。')
    await started
    controller.abort()
    releaseAnalysis?.()

    await expect(inspecting).rejects.toThrow('主题导入已取消')
    expect(mediaInfo.close).toHaveBeenCalledOnce()
    await expect(rm(source)).resolves.toBeUndefined()
  })

  it('reuses a source preflight once and re-inspects after the file identity changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-video-preflight-'))
    roots.push(root)
    const source = join(root, 'probe.mp4')
    const bytes = Buffer.alloc(256)
    bytes.write('ftyp', 4, 'latin1')
    await writeFile(source, bytes)
    mediaInfo.analyzeData.mockResolvedValue({
      media: {
        track: [
          { '@type': 'General', Duration: 1000 },
          {
            '@type': 'Video',
            Width: 640,
            Height: 360,
            FrameRate: 30,
            Duration: 1000,
            Format: 'AVC',
            Format_Profile: 'Main',
            CodecID: 'avc1',
            BitDepth: 8,
            ChromaSubsampling: '4:2:0'
          }
        ]
      }
    })
    mediaInfo.factory.mockResolvedValue({ analyzeData: mediaInfo.analyzeData, close: mediaInfo.close })

    const store = new ProfileStore(root)
    await store.initialize()
    const profile = await store.create('预检主题')
    const preflight = await store.preflightVideoSource(source)
    await store.importMediaAsset(profile.id, source, 'hero', 'video', undefined, false, preflight)
    expect(mediaInfo.analyzeData).toHaveBeenCalledTimes(1)

    const future = new Date(Date.now() + 60_000)
    await utimes(source, future, future)
    await store.importMediaAsset(profile.id, source, 'polaroid', 'video', undefined, false, preflight)
    expect(mediaInfo.analyzeData).toHaveBeenCalledTimes(2)
    expect(mediaInfo.close).toHaveBeenCalledTimes(2)
  })
})
