import { fenceBounds, fenceClipPath, isFenceValid, type Fence } from './geometry'
import type { PolaroidMode } from './theme'

export interface PolaroidSourceSize {
  width: number
  height: number
}

export interface PolaroidLayout {
  aspectRatio: number
  image: {
    width: string
    height: string
    left: string
    top: string
  }
  backgroundSize: string
  backgroundPosition: string
  clipPath: string | null
}

export function getPolaroidLayout(mode: PolaroidMode, sourceSize: PolaroidSourceSize, fence: Fence): PolaroidLayout | null {
  if (sourceSize.width <= 0 || sourceSize.height <= 0) return null
  if (mode === 'full') {
    return {
      aspectRatio: ratio(sourceSize.width / sourceSize.height),
      image: { width: '100%', height: '100%', left: '0%', top: '0%' },
      backgroundSize: '100% 100%',
      backgroundPosition: '0% 0%',
      clipPath: null
    }
  }
  if (!isFenceValid(fence)) return null
  const bounds = fenceBounds(fence)
  return {
    aspectRatio: ratio((bounds.width * sourceSize.width) / (bounds.height * sourceSize.height)),
    image: {
      width: percentage(1 / bounds.width),
      height: percentage(1 / bounds.height),
      left: percentage(-bounds.minX / bounds.width),
      top: percentage(-bounds.minY / bounds.height)
    },
    backgroundSize: `${percentage(1 / bounds.width)} ${percentage(1 / bounds.height)}`,
    backgroundPosition: `${percentage(bounds.width === 1 ? 0 : bounds.minX / (1 - bounds.width))} ${percentage(bounds.height === 1 ? 0 : bounds.minY / (1 - bounds.height))}`,
    clipPath: fenceClipPath(fence)
  }
}

function ratio(value: number): number {
  return Number(value.toFixed(6))
}

function percentage(value: number): string {
  return `${Number((value * 100).toFixed(3))}%`
}
