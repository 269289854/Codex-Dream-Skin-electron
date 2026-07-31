import { describe, expect, it } from 'vitest'
import {
  VIDEO_OPTIMIZATION_NO_CHANGE_MESSAGE,
  VIDEO_TRANSCODE_WORKLOAD_MESSAGE,
  assertVideoImportDecisionCompatible,
  areVideoFrameRatesEquivalent,
  createDefaultVideoTranscodeSettings,
  estimateVideoTranscodeStorageBytes,
  isMeaningfulVideoOptimization,
  parseVideoTranscodeSettings,
  resolveVideoOutputSize,
  videoImportDecisionSchema,
  videoResolutionBounds
} from '../src/shared/video-transcode'

describe('video transcode settings', () => {
  it('resolves landscape and portrait presets without upscaling', () => {
    expect(videoResolutionBounds('1080p', { width: 3840, height: 2160 })).toEqual({ maxWidth: 1920, maxHeight: 1080 })
    expect(videoResolutionBounds('1080p', { width: 2160, height: 3840 })).toEqual({ maxWidth: 1080, maxHeight: 1920 })
    expect(resolveVideoOutputSize({ width: 1280, height: 720 }, { maxWidth: 3840, maxHeight: 2160 })).toEqual({ width: 1280, height: 720 })
    expect(resolveVideoOutputSize({ width: 1919, height: 1079 }, { maxWidth: 1000, maxHeight: 1000 })).toEqual({ width: 1000, height: 562 })
  })

  it('keeps the previous 1080p and 30 FPS defaults while preserving smaller sources', () => {
    expect(createDefaultVideoTranscodeSettings({ width: 3840, height: 2160, frameRate: 60 })).toEqual({
      maxWidth: 1920,
      maxHeight: 1080,
      frameRate: 30,
      videoBitRate: null
    })
    expect(resolveVideoOutputSize(
      { width: 854, height: 480 },
      createDefaultVideoTranscodeSettings({ width: 854, height: 480, frameRate: 24 })
    )).toEqual({ width: 854, height: 480 })
  })

  it('accepts NTSC nominal frame rates while rejecting real frame-rate increases and excessive workloads', () => {
    const source = { width: 1920, height: 1080, frameRate: 29.97 }
    expect(areVideoFrameRatesEquivalent(23.976, 24)).toBe(true)
    expect(parseVideoTranscodeSettings({ maxWidth: 1920, maxHeight: 1080, frameRate: 30, videoBitRate: null }, source).frameRate).toBe(30)
    expect(() => parseVideoTranscodeSettings({ maxWidth: 1920, maxHeight: 1080, frameRate: 30.1, videoBitRate: null }, source)).toThrow('不能高于')
    expect(() => parseVideoTranscodeSettings({ maxWidth: 1920, maxHeight: 1080, frameRate: 24, videoBitRate: 499_999 }, source)).toThrow('参数无效')
    expect(() => parseVideoTranscodeSettings({
      maxWidth: 4096,
      maxHeight: 4096,
      frameRate: 60,
      videoBitRate: null
    }, { width: 4096, height: 4096, frameRate: 60 })).toThrow(VIDEO_TRANSCODE_WORKLOAD_MESSAGE)
    expect(parseVideoTranscodeSettings({ maxWidth: 1280, maxHeight: 720, frameRate: 24, videoBitRate: 8_000_000 }, source)).toEqual({
      maxWidth: 1280,
      maxHeight: 720,
      frameRate: 24,
      videoBitRate: 8_000_000
    })
  })

  it('strictly validates one-time video import decisions', () => {
    expect(videoImportDecisionSchema.parse({ mode: 'original' })).toEqual({ mode: 'original' })
    expect(() => videoImportDecisionSchema.parse({ mode: 'original', settings: {} })).toThrow()
    expect(videoImportDecisionSchema.parse({
      mode: 'transcode',
      settings: { maxWidth: 1280, maxHeight: 720, frameRate: 24, videoBitRate: null }
    })).toEqual({
      mode: 'transcode',
      settings: { maxWidth: 1280, maxHeight: 720, frameRate: 24, videoBitRate: null }
    })
    expect(() => assertVideoImportDecisionCompatible({ mode: 'original' }, { portable: false })).toThrow('必须转换')
    expect(() => assertVideoImportDecisionCompatible({ mode: 'original' }, { portable: true })).not.toThrow()
  })

  it('requires a real reduction when optimizing an already portable low-load video', () => {
    const source = { width: 640, height: 360, frameRate: 24, bitRate: 2_000_000, portable: true, highLoad: false }
    expect(isMeaningfulVideoOptimization(source, {
      maxWidth: 640,
      maxHeight: 360,
      frameRate: 24,
      videoBitRate: null
    })).toBe(false)
    expect(isMeaningfulVideoOptimization(source, {
      maxWidth: 640,
      maxHeight: 360,
      frameRate: 24,
      videoBitRate: 1_000_000
    })).toBe(true)
    expect(isMeaningfulVideoOptimization(source, {
      maxWidth: 320,
      maxHeight: 180,
      frameRate: 24,
      videoBitRate: null
    })).toBe(true)
    expect(VIDEO_OPTIMIZATION_NO_CHANGE_MESSAGE).toContain('降低')
  })

  it('reserves the estimated output plus a retained original before transcoding', () => {
    const source = {
      width: 3840,
      height: 2160,
      frameRate: 60,
      duration: 60 * 60,
      bitRate: 20_000_000,
      hasAudio: true
    }
    const sourceBytes = 9_000_000_000
    const settings = { maxWidth: 3840, maxHeight: 2160, frameRate: 60, videoBitRate: 100_000_000 }
    const outputOnly = estimateVideoTranscodeStorageBytes(sourceBytes, source, settings, false)
    const withOriginal = estimateVideoTranscodeStorageBytes(sourceBytes, source, settings, true)

    expect(outputOnly).toBeGreaterThan(45_000_000_000)
    expect(withOriginal - outputOnly).toBe(sourceBytes)
  })

  it('uses a conservative pixel-rate estimate for automatic CRF output', () => {
    const estimated = estimateVideoTranscodeStorageBytes(20_000_000, {
      width: 1920,
      height: 1080,
      frameRate: 30,
      duration: 60 * 60,
      bitRate: 2_000_000,
      hasAudio: false
    }, {
      maxWidth: 1920,
      maxHeight: 1080,
      frameRate: 30,
      videoBitRate: null
    }, false)

    expect(estimated).toBeGreaterThan(6_000_000_000)
    expect(() => estimateVideoTranscodeStorageBytes(20_000_000, {
      width: 1920,
      height: 1080,
      frameRate: 30,
      duration: 0,
      bitRate: 2_000_000,
      hasAudio: false
    }, {
      maxWidth: 1920,
      maxHeight: 1080,
      frameRate: 30,
      videoBitRate: null
    }, false)).toThrow('视频时长无效')
    expect(() => estimateVideoTranscodeStorageBytes(20_000_000, {
      width: 1920,
      height: 1080,
      frameRate: 30,
      duration: 1_000_000_000,
      bitRate: 2_000_000,
      hasAudio: true
    }, {
      maxWidth: 1920,
      maxHeight: 1080,
      frameRate: 30,
      videoBitRate: 100_000_000
    }, false)).toThrow('预计视频输出过大')
  })
})
