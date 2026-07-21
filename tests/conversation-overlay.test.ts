import { describe, expect, it } from 'vitest'
import { buildConversationOverlayStyle } from '../src/shared/conversation-overlay'
import type { ConversationBackgroundOverlay } from '../src/shared/theme'

const baseOverlay: ConversationBackgroundOverlay = {
  paint: { kind: 'solid', color: '#FFFFFF' },
  opacity: .24,
  shape: 'full',
  position: { x: .5, y: .5 },
  size: { width: .72, height: .62 },
  softness: 18,
  cornerRadius: 28
}

describe('conversation overlay styles', () => {
  it('keeps full overlays pinned to every edge and ignores dormant geometry', () => {
    expect(buildConversationOverlayStyle(baseOverlay)).toEqual({
      background: '#FFFFFF',
      opacity: '0.24',
      inset: '0',
      left: '0',
      top: '0',
      width: 'auto',
      height: 'auto',
      transform: 'none',
      borderRadius: '0',
      filter: 'none'
    })
  })

  it('builds responsive ellipse and rounded rectangle gradient styles', () => {
    expect(buildConversationOverlayStyle({
      ...baseOverlay,
      paint: { kind: 'linear', angle: 210, stops: [{ color: '#FFFFFF', position: 0 }, { color: '#123456', position: 1 }] },
      opacity: .4,
      shape: 'ellipse',
      position: { x: .47, y: .55 },
      size: { width: .64, height: .52 },
      softness: 0
    })).toMatchObject({
      background: 'linear-gradient(210deg, #FFFFFF 0%, #123456 100%)',
      opacity: '0.4',
      inset: 'auto',
      left: '47%',
      top: '55%',
      width: '64%',
      height: '52%',
      borderRadius: '50%',
      filter: 'none'
    })

    expect(buildConversationOverlayStyle({
      ...baseOverlay,
      paint: { kind: 'radial', center: { x: .25, y: .75 }, stops: [{ color: 'white', position: 0 }, { color: 'transparent', position: 1 }] },
      shape: 'roundedRect',
      cornerRadius: 36,
      softness: 22
    })).toMatchObject({
      background: 'radial-gradient(circle at 25% 75%, white 0%, transparent 100%)',
      borderRadius: '36px',
      filter: 'blur(22px)'
    })
  })
})
