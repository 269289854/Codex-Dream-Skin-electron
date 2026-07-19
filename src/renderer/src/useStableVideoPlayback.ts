import * as React from 'react'
import type { ThemeProfile } from '../../shared/theme'

type VideoPlayback = ThemeProfile['hero']['playback']

interface StableVideoOptions {
  role: 'hero' | 'polaroid'
  mediaKey: string
  playback: VideoPlayback
}

interface StableVideoControls {
  playbackBlocked: boolean
  resumeIfPaused: () => void
  attemptPlay: () => void
}

interface GuardState {
  lastTime: number
  lastSignalAt: number
  stalledSince: number | null
  recovering: boolean
  nextRecoveryAt: number
  frameRequest: number | null
}

const currentDataReadyState = (video: HTMLVideoElement): number => Number(video.HAVE_CURRENT_DATA) || 2
const metadataReadyState = (video: HTMLVideoElement): number => Number(video.HAVE_METADATA) || 1
const previewPlaybackPositions = new Map<string, number>()

export function useStableVideoPlayback(videoRef: React.RefObject<HTMLVideoElement | null>, { role, mediaKey, playback }: StableVideoOptions): StableVideoControls {
  const [playbackBlocked, setPlaybackBlocked] = React.useState(false)
  const guardRef = React.useRef<GuardState | null>(null)

  const attemptPlay = React.useCallback((): void => {
    const video = videoRef.current
    if (!video || !playback.autoplay || !video.isConnected || document.hidden) return
    video.muted = !playback.sound
    video.volume = playback.volume
    try {
      void video.play().then(() => setPlaybackBlocked(false)).catch(() => setPlaybackBlocked(true))
    } catch {
      setPlaybackBlocked(true)
    }
  }, [playback.autoplay, playback.sound, playback.volume, videoRef])

  const resumeIfPaused = React.useCallback((): void => {
    const video = videoRef.current
    if (!video || !playback.autoplay || !video.paused || video.ended || document.hidden) return
    attemptPlay()
  }, [attemptPlay, playback.autoplay, videoRef])

  React.useEffect(() => {
    const video = videoRef.current
    if (!video) return

    video.id = `studio-preview-${role}-video`
    video.dataset.previewMediaKey = mediaKey
    video.muted = !playback.sound
    video.volume = playback.volume
    video.loop = playback.loop
    video.autoplay = playback.autoplay
    video.playsInline = true
    const positionKey = `${role}:${mediaKey}`
    const restorePlaybackPosition = (): void => {
      const position = previewPlaybackPositions.get(positionKey)
      if (!position || !Number.isFinite(position) || video.ended || video.readyState < metadataReadyState(video)) return
      if (Math.abs(video.currentTime - position) >= 0.01) video.currentTime = position
    }
    const rememberPlaybackPosition = (): void => {
      if (video.ended || !Number.isFinite(video.currentTime) || video.currentTime <= 0) return
      previewPlaybackPositions.delete(positionKey)
      previewPlaybackPositions.set(positionKey, video.currentTime)
      while (previewPlaybackPositions.size > 16) previewPlaybackPositions.delete(previewPlaybackPositions.keys().next().value as string)
    }
    restorePlaybackPosition()

    if (!playback.autoplay) {
      setPlaybackBlocked(false)
      video.addEventListener('loadedmetadata', restorePlaybackPosition)
      return () => {
        rememberPlaybackPosition()
        video.removeEventListener('loadedmetadata', restorePlaybackPosition)
      }
    }

    const state: GuardState = {
      lastTime: video.currentTime,
      lastSignalAt: window.performance.now(),
      stalledSince: null,
      recovering: false,
      nextRecoveryAt: 0,
      frameRequest: null
    }
    guardRef.current = state
    let retryTimer: number | null = null

    const noteProgress = (): void => {
      const current = video.currentTime
      if (!Number.isFinite(current) || Math.abs(current - state.lastTime) < 0.01) return
      state.lastTime = current
      state.lastSignalAt = window.performance.now()
      state.stalledSince = null
      state.recovering = false
    }
    const requestFrame = (): void => {
      if (typeof video.requestVideoFrameCallback !== 'function' || !video.isConnected) return
      state.frameRequest = video.requestVideoFrameCallback((_now, metadata) => {
        if (guardRef.current !== state) return
        const mediaTime = Number(metadata?.mediaTime)
        const nextTime = Number.isFinite(mediaTime) ? mediaTime : video.currentTime
        if (Math.abs(nextTime - state.lastTime) >= 0.01) {
          state.lastTime = nextTime
          state.lastSignalAt = window.performance.now()
          state.stalledSince = null
          state.recovering = false
        }
        requestFrame()
      })
    }
    const schedulePlay = (): void => {
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      retryTimer = window.setTimeout(attemptPlay, 0)
    }
    const recover = (): void => {
      const now = window.performance.now()
      if (state.recovering || now < state.nextRecoveryAt || !video.isConnected || video.paused || video.ended || document.hidden) return
      const resumeTime = video.currentTime
      state.recovering = true
      state.nextRecoveryAt = now + 1800
      try {
        video.pause()
        if (Number.isFinite(resumeTime) && video.readyState >= metadataReadyState(video)) video.currentTime = resumeTime
      } catch {
        // Chromium can reject currentTime while replacing the media pipeline.
      }
      Promise.resolve(video.play()).then(() => {
        state.recovering = false
        state.lastTime = video.currentTime
        state.lastSignalAt = window.performance.now()
        state.stalledSince = null
        setPlaybackBlocked(false)
        requestFrame()
      }).catch(() => {
        state.recovering = false
        state.stalledSince = window.performance.now()
        setPlaybackBlocked(true)
      })
    }
    const recoverPausedVideo = (): void => {
      if (!video.ended && !document.hidden && !state.recovering) schedulePlay()
    }
    const resumeVisibleVideo = (): void => {
      if (!document.hidden) schedulePlay()
      else video.pause()
    }
    const onWaiting = (): void => { state.stalledSince ??= window.performance.now() - 1200 }
    const onStalled = (): void => { state.stalledSince ??= window.performance.now() - 1200 }
    const guardTimer = window.setInterval(() => {
      const now = window.performance.now()
      if (!video.isConnected) return
      if (video.paused || video.ended || document.hidden || video.readyState < currentDataReadyState(video)) {
        state.stalledSince = null
        return
      }
      noteProgress()
      if (now - state.lastSignalAt < 1200) return
      state.stalledSince ??= now
      if (now - state.stalledSince >= 0) recover()
    }, 750)

    video.addEventListener('loadedmetadata', restorePlaybackPosition)
    video.addEventListener('loadedmetadata', schedulePlay)
    video.addEventListener('loadeddata', schedulePlay)
    video.addEventListener('canplay', schedulePlay)
    video.addEventListener('pause', recoverPausedVideo)
    video.addEventListener('timeupdate', noteProgress)
    video.addEventListener('playing', noteProgress)
    video.addEventListener('progress', noteProgress)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('stalled', onStalled)
    document.addEventListener('visibilitychange', resumeVisibleVideo)
    window.addEventListener('focus', attemptPlay)
    setPlaybackBlocked(false)
    requestFrame()
    attemptPlay()

    return () => {
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      rememberPlaybackPosition()
      window.clearInterval(guardTimer)
      if (state.frameRequest !== null && typeof video.cancelVideoFrameCallback === 'function') video.cancelVideoFrameCallback(state.frameRequest)
      video.removeEventListener('loadedmetadata', restorePlaybackPosition)
      video.removeEventListener('loadedmetadata', schedulePlay)
      video.removeEventListener('loadeddata', schedulePlay)
      video.removeEventListener('canplay', schedulePlay)
      video.removeEventListener('pause', recoverPausedVideo)
      video.removeEventListener('timeupdate', noteProgress)
      video.removeEventListener('playing', noteProgress)
      video.removeEventListener('progress', noteProgress)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('stalled', onStalled)
      document.removeEventListener('visibilitychange', resumeVisibleVideo)
      window.removeEventListener('focus', attemptPlay)
      if (guardRef.current === state) guardRef.current = null
    }
  }, [attemptPlay, mediaKey, playback.autoplay, playback.loop, playback.sound, playback.volume, role, videoRef])

  return { playbackBlocked, resumeIfPaused, attemptPlay }
}
