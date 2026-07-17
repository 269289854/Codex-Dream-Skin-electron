import { fenceBounds, fenceClipPath, isFenceValid, type Fence } from '../../shared/geometry'

interface PolaroidPreviewProps {
  imageUrl: string
  fence: Fence
  sourceSize: { width: number; height: number } | null
  placement: { x: number; y: number; width: number; rotation: number }
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
}

export function PolaroidPreview({ imageUrl, fence, sourceSize, placement, onPointerDown }: PolaroidPreviewProps): React.JSX.Element | null {
  if (!sourceSize || !isFenceValid(fence)) return null
  const bounds = fenceBounds(fence)
  const aspectRatio = (bounds.width * sourceSize.width) / (bounds.height * sourceSize.height)
  return (
    <div
      className="preview-polaroid dream-layout-polaroid"
      onPointerDown={onPointerDown}
      style={{
        left: `${placement.x * 100}%`,
        top: `${placement.y * 100}%`,
        width: `${placement.width * 100}%`,
        aspectRatio: `${aspectRatio}`,
        transform: `rotate(${placement.rotation}deg)`,
        clipPath: fenceClipPath(fence)
      }}
    >
      <img
        src={imageUrl}
        alt="拍立得"
        draggable={false}
        style={{
          width: `${100 / bounds.width}%`,
          height: `${100 / bounds.height}%`,
          left: `${-bounds.minX / bounds.width * 100}%`,
          top: `${-bounds.minY / bounds.height * 100}%`
        }}
      />
    </div>
  )
}
