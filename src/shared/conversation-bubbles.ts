import {
  CONVERSATION_BUBBLE_PRESETS,
  CONVERSATION_BUBBLE_ROLES,
  type ConversationBubblePresetId,
  type ConversationBubbleRole,
  type ConversationBubbles,
  type ConversationBubbleStyle,
  type MediaReference,
  type ThemeProfile
} from './theme'

export interface RuntimeConversationBubbleFrame {
  mode: 'none' | 'nineSlice' | 'stretch'
  dataUrl: string | null
  slice: number
  frameWidth: number
  contentPadding: number
}

export interface RuntimeConversationBubbles {
  visible: boolean
  user: RuntimeConversationBubbleFrame
  codex: RuntimeConversationBubbleFrame
}

export function conversationBubblePresetAssetKey(id: ConversationBubblePresetId): string {
  return `builtin/conversation-bubbles/${id}.png`
}

export function conversationBubblePresetById(id: ConversationBubblePresetId): (typeof CONVERSATION_BUBBLE_PRESETS)[number] {
  const preset = CONVERSATION_BUBBLE_PRESETS.find((candidate) => candidate.id === id)
  if (!preset) throw new Error(`未知聊天气泡预设: ${id}`)
  return preset
}

export function conversationBubbleMediaReferences(profile: ThemeProfile): MediaReference[] {
  return CONVERSATION_BUBBLE_ROLES.flatMap((role) => {
    const source = profile.conversationBubbles[role].source
    return source.kind === 'custom' ? [source.reference] : []
  })
}

export function resolveConversationBubbleFrame(style: ConversationBubbleStyle, assets: Record<string, string>): RuntimeConversationBubbleFrame {
  if (style.source.kind === 'none') {
    return {
      mode: 'none',
      dataUrl: null,
      slice: style.slice,
      frameWidth: style.frameWidth,
      contentPadding: style.contentPadding
    }
  }
  const asset = style.source.kind === 'preset'
    ? conversationBubblePresetAssetKey(style.source.presetId)
    : style.source.reference.asset
  const dataUrl = assets[asset]
  if (!dataUrl) throw new Error(`聊天气泡素材不存在: ${asset}`)
  return {
    mode: style.fit,
    dataUrl,
    slice: style.slice,
    frameWidth: style.frameWidth,
    contentPadding: style.contentPadding
  }
}

export function resolveConversationBubbles(conversationBubbles: ConversationBubbles, assets: Record<string, string>): RuntimeConversationBubbles {
  return {
    visible: conversationBubbles.visible,
    user: resolveConversationBubbleFrame(conversationBubbles.user, assets),
    codex: resolveConversationBubbleFrame(conversationBubbles.codex, assets)
  }
}

export function conversationBubbleRolePurpose(role: ConversationBubbleRole): 'conversationUserBubble' | 'conversationCodexBubble' {
  return role === 'user' ? 'conversationUserBubble' : 'conversationCodexBubble'
}
