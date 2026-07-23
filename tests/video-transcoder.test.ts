import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VideoAssetInspection } from '../src/shared/contracts'

const spawnMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({ spawn: spawnMock }))

import { assertOptimizedVideoInspection, buildVideoTranscodeArgs, resolveFfmpegPath, transcodeVideo } from '../src/main/video-transcoder'

const inspection = (overrides: Partial<VideoAssetInspection> = {}): VideoAssetInspection => ({
  width: 3840,
  height: 2160,
  frameRate: 59.94,
  duration: 10,
  codec: 'avc',
  bitRate: 18_000_000,
  hasAudio: true,
  highLoad: true,
  ...overrides
})

describe('video transcoder', () => {
  beforeEach(() => spawnMock.mockReset())

  it('caps landscape and portrait video without upscaling or changing low frame rates', () => {
    const landscape = buildVideoTranscodeArgs({ inputPath: 'D:\\input.mp4', outputPath: 'D:\\output.mp4', inspection: inspection() })
    expect(landscape).toContain('scale=w=1920:h=1080:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30')
    expect(landscape).toEqual(expect.arrayContaining(['-c:v', 'libx264', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '128k']))

    const portrait = buildVideoTranscodeArgs({ inputPath: 'portrait.webm', outputPath: 'portrait.mp4', inspection: inspection({ width: 1440, height: 2560, frameRate: 30 }) })
    expect(portrait).toContain('scale=w=1080:h=1920:force_original_aspect_ratio=decrease:force_divisible_by=2')
    expect(portrait).not.toContain('fps=30')

    const native = buildVideoTranscodeArgs({ inputPath: 'native.mp4', outputPath: 'native-output.mp4', inspection: inspection({ width: 1280, height: 720, frameRate: 29.97 }) })
    expect(native).not.toContain('-vf')
    const threshold = buildVideoTranscodeArgs({ inputPath: 'threshold.mp4', outputPath: 'threshold-output.mp4', inspection: inspection({ width: 1920, height: 1080, frameRate: 30.5 }) })
    expect(threshold).not.toContain('-vf')
  })

  it('rejects optimized output that violates the promised media contract', () => {
    const source = inspection({ width: 3840, height: 2160, frameRate: 60, hasAudio: true })
    expect(() => assertOptimizedVideoInspection(source, inspection({ width: 1920, height: 1080, frameRate: 30, codec: 'AVC avc1', hasAudio: true }))).not.toThrow()
    expect(() => assertOptimizedVideoInspection(source, inspection({ width: 2560, height: 1440, frameRate: 30, codec: 'AVC', hasAudio: true }))).toThrow('尺寸')
    expect(() => assertOptimizedVideoInspection(source, inspection({ width: 1920, height: 1080, frameRate: 60, codec: 'AVC', hasAudio: true }))).toThrow('帧率')
    expect(() => assertOptimizedVideoInspection(source, inspection({ width: 1920, height: 1080, frameRate: 30, codec: 'HEVC', hasAudio: true }))).toThrow('编码')
    expect(() => assertOptimizedVideoInspection(source, inspection({ width: 1920, height: 1080, frameRate: 30, codec: 'AVC', hasAudio: false }))).toThrow('音轨')
  })

  it('uses the unpacked executable path and spawns without a shell', async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const promise = transcodeVideo({ inputPath: 'input.mp4', outputPath: 'output.mp4', inspection: inspection() })
    child.emit('exit', 0)
    await promise

    expect(resolveFfmpegPath('C:\\app\\resources\\app.asar\\node_modules\\ffmpeg-static\\ffmpeg.exe')).toBe('C:\\app\\resources\\app.asar.unpacked\\node_modules\\ffmpeg-static\\ffmpeg.exe')
    expect(() => resolveFfmpegPath(null)).toThrow('内置视频优化器不可用')
    expect(spawnMock).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining(['-nostdin', '-i', 'input.mp4']), {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe']
    })
  })

  it('kills an in-flight conversion on cancellation and reports bounded failures', async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const controller = new AbortController()
    const cancelled = transcodeVideo({ inputPath: 'input.mp4', outputPath: 'output.mp4', inspection: inspection(), signal: controller.signal })
    controller.abort()
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
    child.emit('exit', null)
    await expect(cancelled).rejects.toThrow('视频优化已取消')

    const failedChild = fakeChild()
    spawnMock.mockReturnValue(failedChild)
    const failed = transcodeVideo({ inputPath: 'input.mp4', outputPath: 'output.mp4', inspection: inspection() })
    failedChild.stderr.emit('data', Buffer.from('encoder failed\ninvalid output'))
    failedChild.emit('exit', 1)
    await expect(failed).rejects.toThrow('encoder failed invalid output')
  })
})

function fakeChild(): EventEmitter & { stderr: EventEmitter; kill: ReturnType<typeof vi.fn> } {
  const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter; kill: ReturnType<typeof vi.fn> }
  child.stderr = new EventEmitter()
  child.kill = vi.fn()
  return child
}
