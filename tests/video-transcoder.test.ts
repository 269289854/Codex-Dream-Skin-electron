import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VideoAssetInspection } from '../src/shared/contracts'
import type { VideoTranscodeSettings } from '../src/shared/video-transcode'

const spawnMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({ spawn: spawnMock }))

import { assertOptimizedVideoInspection, buildVideoTranscodeArgs, resolveFfmpegPath, transcodeVideo } from '../src/main/video-transcoder'
import { isPortableVideo } from '../src/main/video-compatibility'

const inspection = (overrides: Partial<VideoAssetInspection> = {}): VideoAssetInspection => ({
  width: 3840,
  height: 2160,
  frameRate: 59.94,
  duration: 10,
  codec: 'avc',
  videoProfile: 'High',
  bitDepth: 8,
  chromaSubsampling: '4:2:0',
  audioCodec: 'AAC mp4a-40-2',
  audioProfile: 'LC',
  bitRate: 18_000_000,
  hasAudio: true,
  portable: true,
  highLoad: true,
  ...overrides
})

const settings = (overrides: Partial<VideoTranscodeSettings> = {}): VideoTranscodeSettings => ({
  maxWidth: 1920,
  maxHeight: 1080,
  frameRate: 30,
  videoBitRate: null,
  ...overrides
})

describe('video transcoder', () => {
  beforeEach(() => spawnMock.mockReset())

  it('caps landscape and portrait video without upscaling or changing low frame rates', () => {
    const landscape = buildVideoTranscodeArgs({ inputPath: 'D:\\input.mp4', outputPath: 'D:\\output.mp4', inspection: inspection(), settings: settings() })
    expect(landscape).toContain('scale=w=1920:h=1080:flags=lanczos,fps=30')
    expect(landscape).toEqual(expect.arrayContaining(['-c:v', 'libx264', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '128k']))

    const portrait = buildVideoTranscodeArgs({ inputPath: 'portrait.webm', outputPath: 'portrait.mp4', inspection: inspection({ width: 1440, height: 2560, frameRate: 30 }), settings: settings({ maxWidth: 1080, maxHeight: 1920 }) })
    expect(portrait).toContain('scale=w=1080:h=1920:flags=lanczos')
    expect(portrait).not.toContain('fps=30')

    const native = buildVideoTranscodeArgs({ inputPath: 'native.mp4', outputPath: 'native-output.mp4', inspection: inspection({ width: 1280, height: 720, frameRate: 29.97 }), settings: settings({ maxWidth: 1280, maxHeight: 720, frameRate: 29.97 }) })
    expect(native).not.toContain('-vf')
    const ntsc = buildVideoTranscodeArgs({ inputPath: 'ntsc.mp4', outputPath: 'ntsc-output.mp4', inspection: inspection({ width: 1280, height: 720, frameRate: 23.976 }), settings: settings({ maxWidth: 1280, maxHeight: 720, frameRate: 24 }) })
    expect(ntsc).toEqual(expect.arrayContaining(['-vf', 'fps=24']))
    const threshold = buildVideoTranscodeArgs({ inputPath: 'threshold.mp4', outputPath: 'threshold-output.mp4', inspection: inspection({ width: 1920, height: 1080, frameRate: 30.5 }), settings: settings({ frameRate: 30.5 }) })
    expect(threshold).not.toContain('-vf')
  })

  it('uses an explicit target bitrate with a matching peak cap and double buffer', () => {
    const args = buildVideoTranscodeArgs({
      inputPath: 'input.mp4',
      outputPath: 'output.mp4',
      inspection: inspection(),
      settings: settings({ videoBitRate: 8_000_000 })
    })
    expect(args).toEqual(expect.arrayContaining(['-b:v', '8000000', '-maxrate', '8000000', '-bufsize', '16000000']))
    expect(args).not.toContain('-crf')
  })

  it('rejects optimized output that violates the promised media contract', () => {
    const source = inspection({ width: 3840, height: 2160, frameRate: 60, hasAudio: true })
    expect(() => assertOptimizedVideoInspection(source, inspection({ width: 1920, height: 1080, frameRate: 30, codec: 'AVC avc1', hasAudio: true }), settings())).not.toThrow()
    expect(() => assertOptimizedVideoInspection(source, inspection({ width: 2560, height: 1440, frameRate: 30, codec: 'AVC', hasAudio: true }), settings())).toThrow('尺寸')
    expect(() => assertOptimizedVideoInspection(source, inspection({ width: 1920, height: 1080, frameRate: 60, codec: 'AVC', hasAudio: true }), settings())).toThrow('帧率')
    expect(() => assertOptimizedVideoInspection(source, inspection({ width: 1920, height: 1080, frameRate: 30, codec: 'HEVC', portable: false, hasAudio: true }), settings())).toThrow('编码')
    expect(() => assertOptimizedVideoInspection(source, inspection({ width: 1920, height: 1080, frameRate: 30, codec: 'AVC', audioCodec: null, hasAudio: false }), settings())).toThrow('音轨')
  })

  it('uses a conservative cross-platform video and audio codec matrix', () => {
    const portable = (overrides: Partial<Parameters<typeof isPortableVideo>[0]> = {}): boolean => isPortableVideo({
      extension: '.mp4',
      videoCodec: 'AVC avc1',
      videoProfile: 'High@L4.1',
      bitDepth: 8,
      chromaSubsampling: '4:2:0',
      audioCodec: 'AAC 2 / 40 / mp4a-40-2',
      audioProfile: 'LC',
      videoTrackCount: 1,
      audioTrackCount: 1,
      ...overrides
    })
    expect(portable()).toBe(true)
    expect(portable({ videoProfile: 'Constrained Baseline', audioCodec: null, audioProfile: null, audioTrackCount: 0 })).toBe(true)
    expect(portable({ extension: '.webm', videoCodec: 'VP8 V_VP8', videoProfile: null, audioCodec: 'Vorbis A_VORBIS', audioProfile: null })).toBe(true)
    expect(portable({ extension: '.webm', videoCodec: 'VP9 V_VP9', videoProfile: '0', audioCodec: 'Opus A_OPUS', audioProfile: null })).toBe(true)

    expect(portable({ videoProfile: 'High 10', bitDepth: 10 })).toBe(false)
    expect(portable({ chromaSubsampling: '4:2:2' })).toBe(false)
    expect(portable({ extension: '.webm', videoCodec: 'VP9 V_VP9', videoProfile: '2', bitDepth: 10, audioCodec: 'Opus A_OPUS', audioProfile: null })).toBe(false)
    expect(portable({ audioCodec: 'AAC mp4a-40-5', audioProfile: 'HE-AAC' })).toBe(false)
    expect(portable({ audioCodec: 'AAC mp4a-40-42', audioProfile: 'xHE-AAC' })).toBe(false)
    expect(portable({ videoProfile: null })).toBe(false)
    expect(portable({ bitDepth: null })).toBe(false)
    expect(portable({ chromaSubsampling: null })).toBe(false)
    expect(portable({ audioProfile: null })).toBe(false)
    expect(portable({ videoCodec: 'HEVC hvc1' })).toBe(false)
    expect(portable({ videoCodec: 'MPEG-4 Visual mp4v' })).toBe(false)
    expect(portable({ extension: '.webm', videoCodec: 'AV1 V_AV1', videoProfile: '0', audioCodec: 'Opus A_OPUS', audioProfile: null })).toBe(false)
    expect(portable({ audioCodec: 'AC-3 ac-3', audioProfile: 'LC' })).toBe(false)
    expect(portable({ videoCodec: 'unknown-avcodec-wrapper', audioCodec: null, audioProfile: null, audioTrackCount: 0 })).toBe(false)
    expect(portable({ audioCodec: null, audioProfile: null, audioTrackCount: 1 })).toBe(false)
    expect(portable({ extension: '.webm', videoCodec: 'VP9', videoProfile: '0', audioCodec: '', audioProfile: null })).toBe(false)
    expect(portable({ audioTrackCount: 2 })).toBe(false)
  })

  it('uses the unpacked executable path and spawns without a shell', async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const promise = transcodeVideo({ inputPath: 'input.mp4', outputPath: 'output.mp4', inspection: inspection(), settings: settings() })
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
    const cancelled = transcodeVideo({ inputPath: 'input.mp4', outputPath: 'output.mp4', inspection: inspection(), settings: settings(), signal: controller.signal })
    controller.abort()
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
    child.emit('exit', null)
    await expect(cancelled).rejects.toThrow('视频优化已取消')

    const failedChild = fakeChild()
    spawnMock.mockReturnValue(failedChild)
    const failed = transcodeVideo({ inputPath: 'input.mp4', outputPath: 'output.mp4', inspection: inspection(), settings: settings() })
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
