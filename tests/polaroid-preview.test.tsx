import { Window } from 'happy-dom'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PolaroidPreview } from '../src/renderer/src/PolaroidPreview'
import { createDefaultTheme, type ThemeProfile } from '../src/shared/theme'

const GLOBAL_KEYS = ['window', 'document', 'navigator', 'Element', 'HTMLElement', 'HTMLVideoElement', 'Node', 'Event', 'MouseEvent', 'PointerEvent'] as const

describe('PolaroidPreview video playback', () => {
  let browserWindow: Window
  let root: Root
  let container: HTMLElement
  let previous: Map<string, PropertyDescriptor | undefined>
  let profile: ThemeProfile

  beforeEach(() => {
    browserWindow = new Window({ url: 'app://-/index.html' })
    previous = new Map(GLOBAL_KEYS.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
    const values: Record<(typeof GLOBAL_KEYS)[number], unknown> = {
      window: browserWindow,
      document: browserWindow.document,
      navigator: browserWindow.navigator,
      Element: browserWindow.Element,
      HTMLElement: browserWindow.HTMLElement,
      HTMLVideoElement: browserWindow.HTMLVideoElement,
      Node: browserWindow.Node,
      Event: browserWindow.Event,
      MouseEvent: browserWindow.MouseEvent,
      PointerEvent: browserWindow.PointerEvent
    }
    for (const key of GLOBAL_KEYS) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: values[key] })
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, writable: true, value: true })
    profile = createDefaultTheme('00000000-0000-4000-8000-000000000000')
    profile.polaroid.sourceSize = { width: 1280, height: 720 }
    const element = browserWindow.document.createElement('div')
    browserWindow.document.body.appendChild(element)
    container = element as unknown as HTMLElement
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    browserWindow.close()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT')
    vi.restoreAllMocks()
  })

  const renderVideo = async (mediaUrl: string, quickEditorOpen = false): Promise<void> => {
    await act(async () => {
      root.render(<PolaroidPreview
        mediaUrl={mediaUrl}
        mediaKey={mediaUrl}
        mediaKind="video"
        playback={profile.polaroid.playback}
        mediaTransform={profile.polaroid.mediaTransform}
        mode={profile.polaroid.mode}
        fence={profile.polaroid.fence}
        sourceSize={profile.polaroid.sourceSize}
        placement={profile.polaroid.placement}
        style={profile.polaroid.style}
        pin={null}
        quickEditorOpen={quickEditorOpen}
        onPointerDown={() => undefined}
      />)
      await Promise.resolve()
    })
  }

  it('starts muted autoplay and resynchronizes playback after the source changes', async () => {
    const play = vi.fn(() => Promise.resolve())
    Object.defineProperty(browserWindow.HTMLMediaElement.prototype, 'play', { configurable: true, value: play })
    profile.polaroid.playback = { autoplay: true, loop: true, sound: false, volume: 0.42 }

    await renderVideo('studio-media://theme/assets/first.mp4')
    const video = container.querySelector('video')
    expect(video).not.toBeNull()
    expect(play).toHaveBeenCalled()
    expect(video?.muted).toBe(true)
    expect(video?.loop).toBe(true)
    expect(video?.volume).toBe(0.42)

    play.mockClear()
    await renderVideo('studio-media://theme/assets/second.mp4')
    expect(play).toHaveBeenCalled()
  })

  it('recovers autoplay when the preview video is paused during placement changes', async () => {
    const play = vi.fn(() => Promise.resolve())
    Object.defineProperty(browserWindow.HTMLMediaElement.prototype, 'play', { configurable: true, value: play })
    profile.polaroid.playback.autoplay = true
    await renderVideo('studio-media://theme/assets/moving.mp4')

    play.mockClear()
    const video = container.querySelector('video')
    video?.dispatchEvent(new browserWindow.Event('pause'))
    await act(async () => { await new Promise((resolve) => browserWindow.setTimeout(resolve, 0)) })
    expect(play).toHaveBeenCalled()
  })

  it('recovers a retained video after the preview is re-rendered', async () => {
    const play = vi.fn(() => Promise.resolve())
    Object.defineProperty(browserWindow.HTMLMediaElement.prototype, 'play', { configurable: true, value: play })
    profile.polaroid.playback.autoplay = true
    await renderVideo('studio-media://theme/assets/re-render.mp4')

    const video = container.querySelector<HTMLVideoElement>('video')
    if (!video) throw new Error('Preview video is missing.')
    Object.defineProperty(video, 'paused', { configurable: true, value: true })
    play.mockClear()
    await renderVideo('studio-media://theme/assets/re-render.mp4')
    await act(async () => { await new Promise((resolve) => browserWindow.setTimeout(resolve, 20)) })
    expect(play).toHaveBeenCalled()
  })

  it('keeps a stable media id and recovers a stalled timeline at the same time', async () => {
    const play = vi.fn(() => Promise.resolve())
    const pause = vi.fn()
    const guardCallbacks: Array<() => void> = []
    const nativeSetInterval = browserWindow.setInterval.bind(browserWindow)
    browserWindow.setInterval = ((handler: (...args: unknown[]) => void, timeout?: number, ...args: unknown[]) => {
      if (timeout === 750 && typeof handler === 'function') {
        guardCallbacks.push(handler as () => void)
        return 750
      }
      return nativeSetInterval(handler, timeout, ...args)
    }) as typeof browserWindow.setInterval
    let now = 0
    Object.defineProperty(browserWindow.performance, 'now', { configurable: true, value: () => now })
    Object.defineProperty(browserWindow.HTMLMediaElement.prototype, 'play', { configurable: true, value: play })
    Object.defineProperty(browserWindow.HTMLMediaElement.prototype, 'pause', { configurable: true, value: pause })
    profile.polaroid.playback.autoplay = true
    await renderVideo('studio-media://theme/assets/stable.mp4')

    const video = container.querySelector<HTMLVideoElement>('video')
    if (!video) throw new Error('Preview video is missing.')
    Object.defineProperties(video, {
      paused: { configurable: true, value: false },
      ended: { configurable: true, value: false },
      readyState: { configurable: true, value: 2 },
      currentTime: { configurable: true, writable: true, value: 14 }
    })
    expect(video.id).toBe('studio-preview-polaroid-video')
    expect(video.dataset.previewMediaKey).toBe('studio-media://theme/assets/stable.mp4')
    play.mockClear()
    pause.mockClear()
    now = 100
    guardCallbacks[0]?.()
    now = 1700
    guardCallbacks[0]?.()
    await Promise.resolve()

    expect(pause).toHaveBeenCalledOnce()
    expect(play).toHaveBeenCalledOnce()
    expect(video.currentTime).toBe(14)
  })

  it('does not subscribe to per-frame video callbacks', async () => {
    const requestFrame = vi.fn(() => 1)
    const cancelFrame = vi.fn()
    Object.defineProperty(browserWindow.HTMLMediaElement.prototype, 'play', { configurable: true, value: vi.fn(() => Promise.resolve()) })
    Object.defineProperty(browserWindow.HTMLVideoElement.prototype, 'requestVideoFrameCallback', {
      configurable: true,
      value: requestFrame
    })
    Object.defineProperty(browserWindow.HTMLVideoElement.prototype, 'cancelVideoFrameCallback', { configurable: true, value: cancelFrame })
    profile.polaroid.playback.autoplay = true
    await renderVideo('studio-media://theme/assets/frame-guard.mp4')
    expect(requestFrame).not.toHaveBeenCalled()
    await act(async () => { root.render(<div />); await Promise.resolve() })
    expect(cancelFrame).not.toHaveBeenCalled()
  })

  it('restores the playback position when a preview page unmounts and returns', async () => {
    Object.defineProperty(browserWindow.HTMLMediaElement.prototype, 'play', { configurable: true, value: vi.fn(() => Promise.resolve()) })
    profile.polaroid.playback.autoplay = true
    const mediaUrl = 'studio-media://theme/assets/page-switch.mp4'
    await renderVideo(mediaUrl)
    const firstVideo = container.querySelector<HTMLVideoElement>('video')
    if (!firstVideo) throw new Error('Preview video is missing.')
    Object.defineProperties(firstVideo, {
      currentTime: { configurable: true, writable: true, value: 11 },
      ended: { configurable: true, value: false }
    })
    await act(async () => {
      root.render(<div />)
      await Promise.resolve()
    })

    await renderVideo(mediaUrl)
    const restoredVideo = container.querySelector<HTMLVideoElement>('video')
    if (!restoredVideo) throw new Error('Restored preview video is missing.')
    Object.defineProperties(restoredVideo, {
      currentTime: { configurable: true, writable: true, value: 0 },
      readyState: { configurable: true, value: 1 }
    })
    restoredVideo.dispatchEvent(new browserWindow.Event('loadedmetadata'))

    expect(restoredVideo).not.toBe(firstVideo)
    expect(restoredVideo.currentTime).toBe(11)
  })

  it('restarts playback after a placement pointer interaction', async () => {
    const play = vi.fn(() => Promise.resolve())
    const pause = vi.fn()
    Object.defineProperty(browserWindow.HTMLMediaElement.prototype, 'play', { configurable: true, value: play })
    Object.defineProperty(browserWindow.HTMLMediaElement.prototype, 'pause', { configurable: true, value: pause })
    profile.polaroid.playback.autoplay = true
    await renderVideo('studio-media://theme/assets/drag.mp4')

    const polaroid = container.querySelector<HTMLElement>('[data-preview-target="polaroid"]')
    if (!polaroid) throw new Error('Polaroid preview is missing.')
    const video = container.querySelector<HTMLVideoElement>('video')
    if (!video) throw new Error('Preview video is missing.')
    Object.defineProperty(video, 'paused', { configurable: true, value: true })
    play.mockClear()
    polaroid.dispatchEvent(new browserWindow.PointerEvent('pointerup', { bubbles: true }) as unknown as PointerEvent)
    expect(pause).not.toHaveBeenCalled()
    expect(play).toHaveBeenCalled()
  })

  it('restarts playback after the quick editor finishes opening', async () => {
    const play = vi.fn(() => Promise.resolve())
    const pause = vi.fn()
    Object.defineProperty(browserWindow.HTMLMediaElement.prototype, 'play', { configurable: true, value: play })
    Object.defineProperty(browserWindow.HTMLMediaElement.prototype, 'pause', { configurable: true, value: pause })
    profile.polaroid.playback.autoplay = true
    await renderVideo('studio-media://theme/assets/settings.mp4')

    const video = container.querySelector<HTMLVideoElement>('video')
    if (!video) throw new Error('Preview video is missing.')
    Object.defineProperty(video, 'paused', { configurable: true, value: true })
    play.mockClear()
    pause.mockClear()
    await renderVideo('studio-media://theme/assets/settings.mp4', true)
    await act(async () => { await new Promise((resolve) => browserWindow.setTimeout(resolve, 40)) })
    expect(pause).not.toHaveBeenCalled()
    expect(play).toHaveBeenCalled()
  })

  it('shows a usable play button when autoplay is rejected', async () => {
    let rejectPlayback = true
    const play = vi.fn(() => rejectPlayback ? Promise.reject(new Error('blocked')) : Promise.resolve())
    Object.defineProperty(browserWindow.HTMLMediaElement.prototype, 'play', { configurable: true, value: play })
    profile.polaroid.playback.autoplay = true

    await renderVideo('studio-media://theme/assets/polaroid.webm')
    await act(async () => { await Promise.resolve() })
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="播放媒体"]')
    expect(button).not.toBeNull()

    rejectPlayback = false
    await act(async () => {
      button?.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    expect(container.querySelector('button[aria-label="播放媒体"]')).toBeNull()
  })
})
