import * as React from 'react'
import type { Fence } from '../../shared/geometry'
import { getPolaroidLayout, polaroidShadowFilter } from '../../shared/polaroid'
import type { PolaroidMode, ThemeProfile } from '../../shared/theme'

interface PolaroidPreviewProps {
  mediaUrl: string
  mediaKind: 'image' | 'video'
  playback: ThemeProfile['polaroid']['playback']
  mode: PolaroidMode
  fence: Fence
  sourceSize: { width: number; height: number } | null
  placement: { x: number; y: number; width: number; rotation: number }
  style: ThemeProfile['polaroid']['style']
  pin: React.ReactNode
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
}

export function PolaroidPreview({ mediaUrl, mediaKind, playback, mode, fence, sourceSize, placement, style, pin, onPointerDown }: PolaroidPreviewProps): React.JSX.Element | null {
  if (!sourceSize) return null
  const layout = getPolaroidLayout(mode, sourceSize, fence)
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
          {mediaKind === 'video' ? <video ref={(element) => { if (element) element.volume = playback.volume }} src={mediaUrl} muted={!playback.sound} autoPlay={playback.autoplay} loop={playback.loop} controls={!playback.autoplay} playsInline style={{ ...layout.image }} /> : <img src={mediaUrl} alt="拍立得" draggable={false} style={{ ...layout.image }} />}
        </div>
      </div>
      <span className="preview-polaroid-pin" data-preview-target="icon-polaroid-pin" onPointerDown={(event) => event.stopPropagation()}>{pin}</span>
    </div>
  )
}
