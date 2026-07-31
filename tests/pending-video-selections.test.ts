import { describe, expect, it } from 'vitest'
import { PendingVideoSelectionRegistry, VIDEO_SELECTION_TTL_MS } from '../src/main/pending-video-selections'

const preflight = {
  sourcePath: 'C:\\media\\video.mp4',
  size: 1024,
  mtimeMs: 123,
  inspection: {
    width: 1920,
    height: 1080,
    frameRate: 30,
    duration: 60,
    codec: 'AVC avc1',
    videoProfile: 'High',
    bitDepth: 8,
    chromaSubsampling: '4:2:0',
    audioCodec: null,
    audioProfile: null,
    bitRate: 4_000_000,
    hasAudio: false,
    portable: true,
    highLoad: false
  }
}

describe('PendingVideoSelectionRegistry', () => {
  it('blocks duplicate processing and restores a failed selection for retry', () => {
    let now = 1_000
    const registry = new PendingVideoSelectionRegistry(VIDEO_SELECTION_TTL_MS, () => now)
    registry.add('selection', {
      themeId: 'theme',
      purpose: 'hero',
      sourcePath: preflight.sourcePath,
      originalName: 'video.mp4',
      preflight
    })

    const processing = registry.begin('theme', 'selection')
    expect(() => registry.begin('theme', 'selection')).toThrow('正在处理中')
    now += VIDEO_SELECTION_TTL_MS + 1
    expect(() => registry.begin('theme', 'selection')).toThrow('正在处理中')

    registry.restore('selection', processing)
    const retry = registry.begin('theme', 'selection')
    expect(retry).toBe(processing)
    registry.cancel('selection', retry)
    expect(() => registry.begin('theme', 'selection')).toThrow('已失效')
  })

  it('expires idle selections and only discards ready selections owned by the theme', () => {
    let now = 1_000
    const registry = new PendingVideoSelectionRegistry(VIDEO_SELECTION_TTL_MS, () => now)
    const add = (selectionId: string): void => registry.add(selectionId, {
      themeId: 'theme',
      purpose: 'hero',
      sourcePath: preflight.sourcePath,
      originalName: 'video.mp4',
      preflight
    })

    add('expired')
    now += VIDEO_SELECTION_TTL_MS
    expect(() => registry.begin('theme', 'expired')).toThrow('已失效')

    add('discard')
    registry.discard('other-theme', 'discard')
    const processing = registry.begin('theme', 'discard')
    expect(() => registry.discard('theme', 'discard')).toThrow('正在处理中')
    registry.restore('discard', processing)
    registry.discard('theme', 'discard')
    expect(() => registry.begin('theme', 'discard')).toThrow('已失效')
  })
})
