import * as React from 'react'
import { Play } from 'lucide-react'
import type { Fence } from '../../shared/geometry'
import { mediaFlipCssTransform } from '../../shared/media'
import { getPolaroidLayout, polaroidShadowFilter } from '../../shared/polaroid'
import type { PolaroidMode, ThemeProfile } from '../../shared/theme'
import { useStableVideoPlayback } from './useStableVideoPlayback'

interface PolaroidPreviewProps {
  mediaUrl: string
  mediaKey: string
  mediaKind: 'image' | 'video'
  playback: ThemeProfile['polaroid']['playback']
  mediaTransform: ThemeProfile['polaroid']['mediaTransform']
  mode: PolaroidMode
  fence: Fence
  sourceSize: { width: number; height: number } | null
  placement: { x: number; y: number; width: number; rotation: number }
  style: ThemeProfile['polaroid']['style']
  pin: React.ReactNode
  quickEditorOpen: boolean
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
}

export function PolaroidPreview({ mediaUrl, mediaKey, mediaKind, playback, mediaTransform, mode, fence, sourceSize, placement, style, pin, quickEditorOpen, onPointerDown }: PolaroidPreviewProps): React.JSX.Element | null {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const layout = sourceSize ? getPolaroidLayout(mode, sourceSize, fence) : null
  const { playbackBlocked, resumeIfPaused, attemptPlay } = useStableVideoPlayback(videoRef, {
    role: 'polaroid',
    mediaKey: mediaKind === 'video' ? mediaKey : '',
    playback
  })

  React.useEffect(() => {
    if (mediaKind !== 'video' || !playback.autoplay) return
    const frame = window.requestAnimationFrame(resumeIfPaused)
    return () => window.cancelAnimationFrame(frame)
  })

  React.useEffect(() => {
    if (!quickEditorOpen || mediaKind !== 'video' || !playback.autoplay) return
    const frame = window.requestAnimationFrame(resumeIfPaused)
    return () => window.cancelAnimationFrame(frame)
  }, [quickEditorOpen, mediaKind, playback.autoplay, resumeIfPaused])

  if (!layout) return null

  return (
    <div
      className="preview-polaroid dream-layout-polaroid"
      data-preview-target="polaroid"
      tabIndex={0}
      role="button"
      aria-label="编辑拍立得"
      onPointerDown={onPointerDown}
      onPointerUp={resumeIfPaused}
      onPointerCancel={resumeIfPaused}
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
          {mediaKind === 'video' && playback.autoplay && playbackBlocked && <button className="preview-media-play" type="button" title="播放媒体" aria-label="播放媒体" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); attemptPlay() }}><Play size={16} fill="currentColor" /></button>}
        </div>
      </div>
      <span className="preview-polaroid-pin" data-preview-target="icon-polaroid-pin" onPointerDown={(event) => event.stopPropagation()}>{pin}</span>
    </div>
  )
}
