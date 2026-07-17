import * as React from 'react'
import { useRef, useState } from 'react'
import { Check, MousePointer2, RotateCcw } from 'lucide-react'
import { isFenceValid, type Fence } from '../../shared/geometry'
import { clampNormalized } from '../../shared/geometry'

interface FenceEditorProps {
  imageUrl: string
  fence: Fence
  onChange: (fence: Fence) => void
}

export function FenceEditor({ imageUrl, fence, onChange }: FenceEditorProps): React.JSX.Element {
  const overlayRef = useRef<SVGSVGElement>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const [selecting, setSelecting] = useState<number | null>(null)
  const valid = isFenceValid(fence)

  const eventPoint = (event: React.PointerEvent): { x: number; y: number } => {
    const bounds = overlayRef.current!.getBoundingClientRect()
    return {
      x: clampNormalized((event.clientX - bounds.left) / bounds.width),
      y: clampNormalized((event.clientY - bounds.top) / bounds.height)
    }
  }

  const replacePoint = (index: number, point: { x: number; y: number }): void => {
    const next = fence.map((current) => ({ ...current })) as Fence
    next[index] = point
    onChange(next)
  }

  const onPointerMove = (event: React.PointerEvent): void => {
    if (dragging === null) return
    replacePoint(dragging, eventPoint(event))
  }

  const onOverlayDown = (event: React.PointerEvent): void => {
    if (selecting === null) return
    replacePoint(selecting, eventPoint(event))
    setSelecting(selecting === 3 ? null : selecting + 1)
  }

  return (
    <section className="fence-editor">
      <div className="fence-toolbar">
        <strong>四点围栏</strong>
        <div>
          <button className={selecting !== null ? 'tool-button active' : 'tool-button'} onClick={() => setSelecting(0)} title="重新选点"><MousePointer2 size={15} /></button>
          <button className="tool-button" onClick={() => onChange([{ x: .12, y: .12 }, { x: .88, y: .12 }, { x: .88, y: .88 }, { x: .12, y: .88 }])} title="重置围栏"><RotateCcw size={15} /></button>
        </div>
      </div>
      <div className="fence-stage">
        <div className="fence-image-frame">
          <img src={imageUrl} alt="拍立得原图" draggable={false} />
          <svg
            ref={overlayRef}
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            onPointerDown={onOverlayDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => setDragging(null)}
            onPointerLeave={() => setDragging(null)}
          >
            <polygon points={fence.map((point) => `${point.x * 1000},${point.y * 1000}`).join(' ')} className={valid ? 'fence-polygon' : 'fence-polygon invalid'} />
            {fence.map((point, index) => (
              <g key={index} className="fence-handle" onPointerDown={(event) => { event.stopPropagation(); setDragging(index); event.currentTarget.setPointerCapture(event.pointerId) }}>
                <circle cx={point.x * 1000} cy={point.y * 1000} r="23" />
                <text x={point.x * 1000} y={point.y * 1000 + 7} textAnchor="middle">{index + 1}</text>
              </g>
            ))}
          </svg>
          {selecting !== null && <span className="point-badge">点 {selecting + 1}</span>}
        </div>
      </div>
      <div className={valid ? 'fence-state valid' : 'fence-state invalid'}><Check size={13} />{valid ? '围栏有效' : '围栏交叉或越界'}</div>
    </section>
  )
}
