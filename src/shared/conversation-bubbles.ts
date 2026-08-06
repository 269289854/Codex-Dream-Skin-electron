import {
  CONVERSATION_BUBBLE_CORNERS,
  CONVERSATION_BUBBLE_PRESETS,
  CONVERSATION_BUBBLE_ROLES,
  type ConversationBubbleCorner,
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

function renderedCorner(dataUrl: string, sourceWidth: number, sourceHeight: number, maxSize: number): RuntimeConversationBubbleCorner {
  const scale = maxSize / Math.max(sourceWidth, sourceHeight)
  return {
    dataUrl,
    width: Math.max(1, Math.round(sourceWidth * scale * 100) / 100),
    height: Math.max(1, Math.round(sourceHeight * scale * 100) / 100)
  }
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
      contentPadding: style.contentPadding
    }
  }

  if (style.source.kind === 'preset') {
    const presetId = style.source.presetId
    const presetStyle = CONVERSATION_BUBBLE_PRESET_STYLES[presetId]
    const corners = Object.fromEntries(CONVERSATION_BUBBLE_CORNERS.map((corner) => {
      const asset = conversationBubblePresetAssetKey(presetId, corner)
      const dataUrl = assets[asset]
      if (!dataUrl) throw new Error(`聊天气泡素材不存在: ${asset}`)
      return [corner, renderedCorner(dataUrl, 256, 256, presetStyle.ornamentSize)]
    })) as Record<ConversationBubbleCorner, RuntimeConversationBubbleCorner>
    return {
      mode: 'layered',
      corners,
      ...presetStyle,
      contentPadding: style.contentPadding
    }
  }

  const customSource = style.source
  const corners = Object.fromEntries(CONVERSATION_BUBBLE_CORNERS.map((corner) => {
    const source = customSource.corners[corner]
    const dataUrl = assets[source.reference.asset]
    if (!dataUrl) throw new Error(`聊天气泡素材不存在: ${source.reference.asset}`)
    return [corner, renderedCorner(dataUrl, source.width, source.height, customSource.ornamentSize)]
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
    contentPadding: style.contentPadding
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
