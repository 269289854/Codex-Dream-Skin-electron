import {
  CONVERSATION_BUBBLE_CORNERS,
  CONVERSATION_BUBBLE_CORNER_OFFSET_LIMIT,
  CONVERSATION_BUBBLE_PRESETS,
  CONVERSATION_BUBBLE_ROLES,
  type ConversationBubbleCorner,
  type ConversationBubbleCornerOffset,
  type ConversationBubblePresetId,
  type ConversationBubbleRole,
  type ConversationBubbles,
  type ConversationBubbleStyle,
  type MediaReference,
  type ThemeProfile
} from './theme'

export interface RuntimeConversationBubbleCorner {
  dataUrl: string
  width: number
  height: number
  offsetX: number
  offsetY: number
}

export interface RuntimeConversationBubbleContentInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface RuntimeConversationBubbleFrame {
  mode: 'none' | 'layered'
  corners: Record<ConversationBubbleCorner, RuntimeConversationBubbleCorner> | null
  bodyFill: string | null
  borderColor: string
  borderWidth: number
  borderRadius: number
  ornamentSize: number
  ornamentOutset: number
  contentPadding: number
  contentInsets: RuntimeConversationBubbleContentInsets
}

export interface RuntimeConversationBubbles {
  visible: boolean
  user: RuntimeConversationBubbleFrame
  codex: RuntimeConversationBubbleFrame
  plan: RuntimeConversationBubbleFrame
}

interface ConversationBubblePresetStyle {
  bodyFill: string
  borderColor: string
  borderWidth: number
  borderRadius: number
  ornamentSize: number
  ornamentOutset: number
}

export const CONVERSATION_BUBBLE_PRESET_STYLES = {
  'daisy-heart': { bodyFill: '#fffaf5', borderColor: '#b8834e', borderWidth: 2, borderRadius: 14, ornamentSize: 42, ornamentOutset: 2 },
  'calico-cat': { bodyFill: '#fff9ef', borderColor: '#98531f', borderWidth: 2, borderRadius: 14, ornamentSize: 42, ornamentOutset: 4 },
  'cloud-sprout': { bodyFill: '#f6fff9', borderColor: '#6c9f88', borderWidth: 2, borderRadius: 16, ornamentSize: 40, ornamentOutset: 3 },
  'sakura-ribbon': { bodyFill: '#fff7fa', borderColor: '#cf819f', borderWidth: 2, borderRadius: 16, ornamentSize: 42, ornamentOutset: 4 },
  'moon-stars': { bodyFill: '#fbf9ff', borderColor: '#8278b0', borderWidth: 2, borderRadius: 16, ornamentSize: 40, ornamentOutset: 4 },
  'strawberry-leaf': { bodyFill: '#fff8f8', borderColor: '#c56d76', borderWidth: 2, borderRadius: 15, ornamentSize: 42, ornamentOutset: 3 },
  'ocean-shell': { bodyFill: '#f5fcff', borderColor: '#6796a5', borderWidth: 2, borderRadius: 16, ornamentSize: 40, ornamentOutset: 3 },
  'rainbow-candy': { bodyFill: '#fffaf7', borderColor: '#c37c8c', borderWidth: 2, borderRadius: 16, ornamentSize: 42, ornamentOutset: 4 }
} as const satisfies Record<ConversationBubblePresetId, ConversationBubblePresetStyle>

export function conversationBubblePresetAssetKey(id: ConversationBubblePresetId, corner: ConversationBubbleCorner): string {
  return `builtin/conversation-bubbles/${id}/${corner}.png`
}

export function conversationBubblePresetById(id: ConversationBubblePresetId): (typeof CONVERSATION_BUBBLE_PRESETS)[number] {
  const preset = CONVERSATION_BUBBLE_PRESETS.find((candidate) => candidate.id === id)
  if (!preset) throw new Error(`未知聊天气泡预设: ${id}`)
  return preset
}

export function conversationBubbleMediaReferences(profile: ThemeProfile): MediaReference[] {
  return CONVERSATION_BUBBLE_ROLES.flatMap((role) => {
    const source = profile.conversationBubbles[role].source
    return source.kind === 'custom'
      ? CONVERSATION_BUBBLE_CORNERS.map((corner) => source.corners[corner].reference)
      : []
  })
}

function renderedCorner(dataUrl: string, sourceWidth: number, sourceHeight: number, maxSize: number, offset: ConversationBubbleCornerOffset): RuntimeConversationBubbleCorner {
  const scale = maxSize / Math.max(sourceWidth, sourceHeight)
  return {
    dataUrl,
    width: Math.max(1, Math.round(sourceWidth * scale * 100) / 100),
    height: Math.max(1, Math.round(sourceHeight * scale * 100) / 100),
    offsetX: offset.x,
    offsetY: offset.y
  }
}

function roundedInset(value: number): number {
  return Math.round(value * 100) / 100
}

export function conversationBubbleContentInsets(style: ConversationBubbleStyle, ornamentSize: number): RuntimeConversationBubbleContentInsets {
  const offsets = style.cornerOffsets
  return {
    top: roundedInset(Math.max(style.contentPadding, ornamentSize * .65 + Math.max(0, offsets.topLeft.y, offsets.topRight.y))),
    right: roundedInset(Math.max(style.contentPadding, ornamentSize * .9 + Math.max(0, -offsets.topRight.x, -offsets.bottomRight.x))),
    bottom: roundedInset(Math.max(style.contentPadding, ornamentSize * .65 + Math.max(0, -offsets.bottomLeft.y, -offsets.bottomRight.y))),
    left: roundedInset(Math.max(style.contentPadding, ornamentSize * .9 + Math.max(0, offsets.topLeft.x, offsets.bottomLeft.x)))
  }
}

export function conversationBubbleCornerPositions(corners: Record<ConversationBubbleCorner, RuntimeConversationBubbleCorner>): string {
  const reserve = CONVERSATION_BUBBLE_CORNER_OFFSET_LIMIT
  const topLeft = corners.topLeft
  const topRight = corners.topRight
  const bottomRight = corners.bottomRight
  const bottomLeft = corners.bottomLeft
  return [
    `calc(0% + ${reserve + topLeft.offsetX}px) calc(0% + ${reserve + topLeft.offsetY}px)`,
    `calc(100% - ${reserve - topRight.offsetX}px) calc(0% + ${reserve + topRight.offsetY}px)`,
    `calc(100% - ${reserve - bottomRight.offsetX}px) calc(100% - ${reserve - bottomRight.offsetY}px)`,
    `calc(0% + ${reserve + bottomLeft.offsetX}px) calc(100% - ${reserve - bottomLeft.offsetY}px)`
  ].join(', ')
}

export function resolveConversationBubbleFrame(style: ConversationBubbleStyle, assets: Record<string, string>): RuntimeConversationBubbleFrame {
  if (style.source.kind === 'none') {
    return {
      mode: 'none',
      corners: null,
      bodyFill: null,
      borderColor: 'transparent',
      borderWidth: 0,
      borderRadius: 14,
      ornamentSize: 0,
      ornamentOutset: 0,
      contentPadding: style.contentPadding,
      contentInsets: { top: style.contentPadding, right: style.contentPadding, bottom: style.contentPadding, left: style.contentPadding }
    }
  }

  if (style.source.kind === 'preset') {
    const presetId = style.source.presetId
    const presetStyle = CONVERSATION_BUBBLE_PRESET_STYLES[presetId]
    const corners = Object.fromEntries(CONVERSATION_BUBBLE_CORNERS.map((corner) => {
      const asset = conversationBubblePresetAssetKey(presetId, corner)
      const dataUrl = assets[asset]
      if (!dataUrl) throw new Error(`聊天气泡素材不存在: ${asset}`)
      return [corner, renderedCorner(dataUrl, 256, 256, presetStyle.ornamentSize, style.cornerOffsets[corner])]
    })) as Record<ConversationBubbleCorner, RuntimeConversationBubbleCorner>
    return {
      mode: 'layered',
      corners,
      ...presetStyle,
      contentPadding: style.contentPadding,
      contentInsets: conversationBubbleContentInsets(style, presetStyle.ornamentSize)
    }
  }

  const customSource = style.source
  const corners = Object.fromEntries(CONVERSATION_BUBBLE_CORNERS.map((corner) => {
    const source = customSource.corners[corner]
    const dataUrl = assets[source.reference.asset]
    if (!dataUrl) throw new Error(`聊天气泡素材不存在: ${source.reference.asset}`)
    return [corner, renderedCorner(dataUrl, source.width, source.height, customSource.ornamentSize, style.cornerOffsets[corner])]
  })) as Record<ConversationBubbleCorner, RuntimeConversationBubbleCorner>
  return {
    mode: 'layered',
    corners,
    bodyFill: null,
    borderColor: customSource.borderColor,
    borderWidth: customSource.borderWidth,
    borderRadius: customSource.borderRadius,
    ornamentSize: customSource.ornamentSize,
    ornamentOutset: customSource.ornamentOutset,
    contentPadding: style.contentPadding,
    contentInsets: conversationBubbleContentInsets(style, customSource.ornamentSize)
  }
}

export function resolveConversationBubbles(conversationBubbles: ConversationBubbles, assets: Record<string, string>): RuntimeConversationBubbles {
  return {
    visible: conversationBubbles.visible,
    user: resolveConversationBubbleFrame(conversationBubbles.user, assets),
    codex: resolveConversationBubbleFrame(conversationBubbles.codex, assets),
    plan: resolveConversationBubbleFrame(conversationBubbles.plan, assets)
  }
}
