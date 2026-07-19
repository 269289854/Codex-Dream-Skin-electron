import * as React from 'react'
import type { Fence } from '../../shared/geometry'
import { getPolaroidLayout } from '../../shared/polaroid'
import type { PolaroidMode } from '../../shared/theme'

interface PolaroidPreviewProps {
  imageUrl: string
  mode: PolaroidMode
  fence: Fence
  sourceSize: { width: number; height: number } | null
  placement: { x: number; y: number; width: number; rotation: number }
  pin: React.ReactNode
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
}

export function PolaroidPreview({ imageUrl, mode, fence, sourceSize, placement, pin, onPointerDown }: PolaroidPreviewProps): React.JSX.Element | null {
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
        clipPath: layout.clipPath ?? 'none'
      }}
    >
      <img
        src={imageUrl}
        alt="拍立得"
        draggable={false}
        style={{
          ...layout.image
        }}
      />
      <span className="preview-polaroid-pin" data-preview-target="icon-polaroid-pin" onPointerDown={(event) => event.stopPropagation()}>{pin}</span>
    </div>
  )
}
