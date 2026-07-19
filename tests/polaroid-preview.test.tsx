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

  const renderVideo = async (mediaUrl: string): Promise<void> => {
    await act(async () => {
      root.render(<PolaroidPreview
        mediaUrl={mediaUrl}
        mediaKind="video"
        playback={profile.polaroid.playback}
        mediaTransform={profile.polaroid.mediaTransform}
        mode={profile.polaroid.mode}
        fence={profile.polaroid.fence}
        sourceSize={profile.polaroid.sourceSize}
        placement={profile.polaroid.placement}
        style={profile.polaroid.style}
        pin={null}
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

  it('restarts playback after a placement pointer interaction', async () => {
    const play = vi.fn(() => Promise.resolve())
    const pause = vi.fn()
    Object.defineProperty(browserWindow.HTMLMediaElement.prototype, 'play', { configurable: true, value: play })
    Object.defineProperty(browserWindow.HTMLMediaElement.prototype, 'pause', { configurable: true, value: pause })
    profile.polaroid.playback.autoplay = true
    await renderVideo('studio-media://theme/assets/drag.mp4')

    const polaroid = container.querySelector<HTMLElement>('[data-preview-target="polaroid"]')
    if (!polaroid) throw new Error('Polaroid preview is missing.')
    play.mockClear()
    polaroid.dispatchEvent(new browserWindow.PointerEvent('pointerup', { bubbles: true }) as unknown as PointerEvent)
    expect(pause).toHaveBeenCalled()
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
