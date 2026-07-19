import * as React from 'react'
import { Play } from 'lucide-react'
import type { Fence } from '../../shared/geometry'
import { mediaFlipCssTransform } from '../../shared/media'
import { getPolaroidLayout, polaroidShadowFilter } from '../../shared/polaroid'
import type { PolaroidMode, ThemeProfile } from '../../shared/theme'

interface PolaroidPreviewProps {
  mediaUrl: string
  mediaKind: 'image' | 'video'
  playback: ThemeProfile['polaroid']['playback']
  mediaTransform: ThemeProfile['polaroid']['mediaTransform']
  mode: PolaroidMode
  fence: Fence
  sourceSize: { width: number; height: number } | null
  placement: { x: number; y: number; width: number; rotation: number }
  style: ThemeProfile['polaroid']['style']
  pin: React.ReactNode
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
}

export function PolaroidPreview({ mediaUrl, mediaKind, playback, mediaTransform, mode, fence, sourceSize, placement, style, pin, onPointerDown }: PolaroidPreviewProps): React.JSX.Element | null {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const [playbackBlocked, setPlaybackBlocked] = React.useState(false)
  const layout = sourceSize ? getPolaroidLayout(mode, sourceSize, fence) : null

  const attemptPlay = React.useCallback((): void => {
    const video = videoRef.current
    if (mediaKind !== 'video' || !playback.autoplay || !video?.isConnected || document.hidden) return
    video.muted = !playback.sound
    video.volume = playback.volume
    try {
      void video.play().then(() => setPlaybackBlocked(false)).catch(() => setPlaybackBlocked(true))
    } catch {
      setPlaybackBlocked(true)
    }
  }, [mediaKind, playback.autoplay, playback.sound, playback.volume])

  React.useEffect(() => {
    const video = videoRef.current
    if (mediaKind !== 'video' || !video) return
    video.muted = !playback.sound
    video.volume = playback.volume
    video.loop = playback.loop
    video.autoplay = playback.autoplay
    if (!playback.autoplay) {
      setPlaybackBlocked(false)
      return
    }

    let retryTimer: number | null = null
    const schedulePlay = (): void => {
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      retryTimer = window.setTimeout(attemptPlay, 0)
    }
    const resumeVisibleVideo = (): void => {
      if (!document.hidden) attemptPlay()
    }
    const recoverPausedVideo = (): void => {
      if (!video.ended) schedulePlay()
    }
    video.addEventListener('loadedmetadata', attemptPlay)
    video.addEventListener('loadeddata', attemptPlay)
    video.addEventListener('canplay', attemptPlay)
    video.addEventListener('pause', recoverPausedVideo)
    document.addEventListener('visibilitychange', resumeVisibleVideo)
    window.addEventListener('focus', attemptPlay)
    let lastTime = video.currentTime
    let stalledSince = window.performance.now()
    const guardTimer = window.setInterval(() => {
      if (video.paused || video.ended || document.hidden || video.readyState < video.HAVE_CURRENT_DATA) return
      const now = window.performance.now()
      if (Math.abs(video.currentTime - lastTime) >= 0.01) {
        lastTime = video.currentTime
        stalledSince = now
        return
      }
      if (now - stalledSince < 1200) return
      video.pause()
      stalledSince = now
      schedulePlay()
    }, 750)
    setPlaybackBlocked(false)
    attemptPlay()
    return () => {
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      window.clearInterval(guardTimer)
      video.removeEventListener('loadedmetadata', attemptPlay)
      video.removeEventListener('loadeddata', attemptPlay)
      video.removeEventListener('canplay', attemptPlay)
      video.removeEventListener('pause', recoverPausedVideo)
      document.removeEventListener('visibilitychange', resumeVisibleVideo)
      window.removeEventListener('focus', attemptPlay)
    }
  }, [attemptPlay, mediaKind, mediaUrl, playback.autoplay, playback.loop, playback.sound, playback.volume])

  React.useEffect(() => {
    const video = videoRef.current
    if (mediaKind !== 'video' || !video) return
    const onPlay = (): void => setPlaybackBlocked(false)
    const onEnded = (): void => { if (!playback.loop) setPlaybackBlocked(true) }
    video.addEventListener('play', onPlay)
    video.addEventListener('ended', onEnded)
    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('ended', onEnded)
    }
  }, [mediaKind, playback.loop])

  const playBlockedVideo = (event: React.MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation()
    attemptPlay()
  }

  if (!layout) return null

  return (
    <div
      className="preview-polaroid dream-layout-polaroid"
      data-preview-target="polaroid"
      tabIndex={0}
      role="button"
      aria-label="编辑拍立得"
      onPointerDown={onPointerDown}
      style={{
        left: `${placement.x * 100}%`,
        top: `${placement.y * 100}%`,
        width: `${placement.width * 100}%`,
        aspectRatio: `${layout.aspectRatio}`,
        transform: `rotate(${placement.rotation}deg)`,
        opacity: style.opacity
      }}
    >
      <div className="preview-polaroid-shadow" style={{ filter: polaroidShadowFilter(style) }}>
        <div className="preview-polaroid-surface" style={{ clipPath: layout.clipPath ?? 'none' }}>
          {mediaKind === 'video' ? <video ref={videoRef} className="preview-polaroid-media" src={mediaUrl} muted={!playback.sound} autoPlay={playback.autoplay} loop={playback.loop} controls={!playback.autoplay} playsInline preload="auto" style={{ ...layout.image, transform: mediaFlipCssTransform(mediaTransform) }} /> : <img className="preview-polaroid-media" src={mediaUrl} alt="拍立得" draggable={false} style={{ ...layout.image, transform: mediaFlipCssTransform(mediaTransform) }} />}
          {mediaKind === 'video' && playback.autoplay && playbackBlocked && <button className="preview-media-play" type="button" title="播放媒体" aria-label="播放媒体" onPointerDown={(event) => event.stopPropagation()} onClick={playBlockedVideo}><Play size={16} fill="currentColor" /></button>}
        </div>
      </div>
      <span className="preview-polaroid-pin" data-preview-target="icon-polaroid-pin" onPointerDown={(event) => event.stopPropagation()}>{pin}</span>
    </div>
  )
}
