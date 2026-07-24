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

export type ConversationBubbleFrameInsets = readonly [top: number, right: number, bottom: number, left: number]

export interface RuntimeConversationBubbleFrame {
  mode: 'none' | 'nineSlice' | 'stretch'
  dataUrl: string | null
  slice: number
  sliceInsets: ConversationBubbleFrameInsets
  frameWidth: number
  borderWidths: ConversationBubbleFrameInsets
  contentPadding: number
}

export interface RuntimeConversationBubbles {
  visible: boolean
  user: RuntimeConversationBubbleFrame
  codex: RuntimeConversationBubbleFrame
}

const PRESET_SOURCE_WIDTH = 768
const PRESET_SOURCE_HEIGHT = 384
const PRESET_RENDER_SCALE = 0.25

const PRESET_SLICE_INSETS = {
  'daisy-heart': [65, 25, 28, 25],
  'calico-cat': [58, 25, 27, 25],
  'cloud-sprout': [35, 25, 30, 25],
  'sakura-ribbon': [56, 25, 37, 25],
  'moon-stars': [35, 25, 40, 25],
  'strawberry-leaf': [40, 25, 38, 25],
  'ocean-shell': [46, 25, 48, 25],
  'rainbow-candy': [60, 25, 35, 25]
} as const satisfies Record<ConversationBubblePresetId, ConversationBubbleFrameInsets>

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

function roundFrameWidth(value: number): number {
  return Math.round(value * 100) / 100
}

function presetBorderWidths(sliceInsets: ConversationBubbleFrameInsets): ConversationBubbleFrameInsets {
  const [top, right, bottom, left] = sliceInsets
  return [
    roundFrameWidth(PRESET_SOURCE_HEIGHT * top / 100 * PRESET_RENDER_SCALE),
    roundFrameWidth(PRESET_SOURCE_WIDTH * right / 100 * PRESET_RENDER_SCALE),
    roundFrameWidth(PRESET_SOURCE_HEIGHT * bottom / 100 * PRESET_RENDER_SCALE),
    roundFrameWidth(PRESET_SOURCE_WIDTH * left / 100 * PRESET_RENDER_SCALE)
  ]
}

function symmetricFrameGeometry(style: ConversationBubbleStyle): Pick<RuntimeConversationBubbleFrame, 'sliceInsets' | 'borderWidths'> {
  return {
    sliceInsets: [style.slice, style.slice, style.slice, style.slice],
    borderWidths: [style.frameWidth, style.frameWidth * 2, style.frameWidth, style.frameWidth * 2]
  }
}

function resolveFrameGeometry(style: ConversationBubbleStyle): Pick<RuntimeConversationBubbleFrame, 'sliceInsets' | 'borderWidths'> {
  if (style.source.kind !== 'preset') return symmetricFrameGeometry(style)
  const sliceInsets = PRESET_SLICE_INSETS[style.source.presetId]
  return {
    sliceInsets,
    borderWidths: presetBorderWidths(sliceInsets)
  }
}

export function resolveConversationBubbleFrame(style: ConversationBubbleStyle, assets: Record<string, string>): RuntimeConversationBubbleFrame {
  const geometry = resolveFrameGeometry(style)
  if (style.source.kind === 'none') {
    return {
      mode: 'none',
      dataUrl: null,
      slice: style.slice,
      sliceInsets: geometry.sliceInsets,
      frameWidth: style.frameWidth,
      borderWidths: geometry.borderWidths,
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
    sliceInsets: geometry.sliceInsets,
    frameWidth: style.frameWidth,
    borderWidths: geometry.borderWidths,
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
