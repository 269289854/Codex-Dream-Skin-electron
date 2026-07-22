import { paintToCss } from './appearance'
import type { ConversationBackgroundOverlay, WindowBackgroundMask } from './theme'

export interface BackgroundOverlayStyle {
  background: string
  opacity: string
  inset: string
  left: string
  top: string
  width: string
  height: string
  transform: string
  borderRadius: string
  filter: string
}

export function buildBackgroundOverlayStyle(overlay: ConversationBackgroundOverlay | WindowBackgroundMask): BackgroundOverlayStyle {
  const common = {
    background: paintToCss(overlay.paint),
    opacity: formatNumber(overlay.opacity)
  }
  if (overlay.shape === 'full') {
    return {
      ...common,
      inset: '0',
      left: '0',
      top: '0',
      width: 'auto',
      height: 'auto',
      transform: 'none',
      borderRadius: '0',
      filter: 'none'
    }
  }
  return {
    ...common,
    inset: 'auto',
    left: percent(overlay.position.x),
    top: percent(overlay.position.y),
    width: percent(overlay.size.width),
    height: percent(overlay.size.height),
    transform: 'translate(-50%, -50%)',
    borderRadius: overlay.shape === 'ellipse' ? '50%' : `${formatNumber(overlay.cornerRadius)}px`,
    filter: overlay.softness > 0 ? `blur(${formatNumber(overlay.softness)}px)` : 'none'
  }
}

export type ConversationOverlayStyle = BackgroundOverlayStyle
export const buildConversationOverlayStyle = buildBackgroundOverlayStyle

function percent(value: number): string {
  return `${formatNumber(value * 100)}%`
}

function formatNumber(value: number): string {
  return Number(value.toFixed(3)).toString()
}
