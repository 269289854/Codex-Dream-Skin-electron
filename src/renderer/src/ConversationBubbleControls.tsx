import * as React from 'react'
import { Image as ImageIcon, Trash2, Upload } from 'lucide-react'
import {
  CONVERSATION_BUBBLE_PRESETS,
  createDefaultConversationBubbleStyle,
  type ConversationBubbleRole,
  type ThemeProfile
} from '../../shared/theme'
import { conversationBubblePresetAssetKey } from '../../shared/conversation-bubbles'
import type { MediaSelectionKind } from '../../shared/contracts'
import { Range } from './editor-controls'

interface ConversationBubbleControlsProps {
  profile: ThemeProfile
  assets: Record<string, string>
  role: ConversationBubbleRole
  mediaBusy?: boolean
  showRoleTabs?: boolean
  showVisibility?: boolean
  onRoleChange?: (role: ConversationBubbleRole) => void
  onChange: (mutator: (profile: ThemeProfile) => void, historyGroup?: string) => void
  onInteractionEnd: () => void
  onSelectMedia: (kind: MediaSelectionKind) => void
}

export function ConversationBubbleControls({
  profile,
  assets,
  role,
  mediaBusy = false,
  showRoleTabs = true,
  showVisibility = true,
  onRoleChange,
  onChange,
  onInteractionEnd,
  onSelectMedia
}: ConversationBubbleControlsProps): React.JSX.Element {
  const style = profile.conversationBubbles[role]
  const customUrl = style.source.kind === 'custom' ? assets[style.source.reference.asset] : undefined
  const selectedPresetId = style.source.kind === 'preset' ? style.source.presetId : CONVERSATION_BUBBLE_PRESETS[0].id
  const selectNone = (): void => onChange((next) => {
    next.conversationBubbles[role].source = { kind: 'none' }
  })
  const selectPreset = (presetId: (typeof CONVERSATION_BUBBLE_PRESETS)[number]['id']): void => onChange((next) => {
    next.conversationBubbles.visible = true
    next.conversationBubbles[role] = {
      ...createDefaultConversationBubbleStyle(),
      source: { kind: 'preset', presetId }
    }
  })
  const openCustom = (): void => {
    if (style.source.kind !== 'custom') onSelectMedia('image')
  }
  const updateLayout = (field: 'slice' | 'frameWidth' | 'contentPadding', value: number, historyGroup: string): void => onChange((next) => {
    next.conversationBubbles[role][field] = value
  }, historyGroup)

  return <div className="conversation-bubble-controls" data-bubble-role-controls={role}>
    {showVisibility && <label className="toggle-row"><span>显示聊天气泡</span><input type="checkbox" checked={profile.conversationBubbles.visible} onChange={(event) => { const visible = event.currentTarget.checked; onChange((next) => { next.conversationBubbles.visible = visible }) }} /></label>}
    {showRoleTabs && <div className="conversation-bubble-role-tabs segmented-control" aria-label="聊天气泡角色">
      <button type="button" className={role === 'user' ? 'active' : ''} onClick={() => onRoleChange?.('user')}>我的消息</button>
      <button type="button" className={role === 'codex' ? 'active' : ''} onClick={() => onRoleChange?.('codex')}>Codex 回复</button>
    </div>}
    <div className="conversation-bubble-mode-tabs segmented-control" aria-label="聊天气泡模式">
      <button type="button" className={style.source.kind === 'none' ? 'active' : ''} onClick={selectNone}>无边框</button>
      <button type="button" className={style.source.kind === 'preset' ? 'active' : ''} onClick={() => selectPreset(selectedPresetId)}>预设</button>
      <button type="button" className={style.source.kind === 'custom' ? 'active' : ''} onClick={openCustom}>自定义</button>
    </div>

    {style.source.kind === 'preset' && <div className="conversation-bubble-preset-grid" role="radiogroup" aria-label={`${role === 'user' ? '我的消息' : 'Codex 回复'}气泡预设`}>
      {CONVERSATION_BUBBLE_PRESETS.map((preset) => {
        const source = assets[conversationBubblePresetAssetKey(preset.id)]
        const selected = style.source.kind === 'preset' && selectedPresetId === preset.id
        return <button type="button" role="radio" aria-checked={selected} className={selected ? 'active' : ''} key={preset.id} onClick={() => selectPreset(preset.id)}>
          {source ? <img src={source} alt="" /> : <ImageIcon size={18} />}
          <span>{preset.name}</span>
        </button>
      })}
    </div>}

    {style.source.kind === 'custom' && <div className="conversation-bubble-custom">
      <div className="conversation-bubble-custom-preview">{customUrl ? <img src={customUrl} alt={`${role === 'user' ? '我的消息' : 'Codex 回复'}自定义气泡`} /> : <ImageIcon size={20} />}</div>
      <div className="conversation-bubble-custom-actions">
        <button type="button" disabled={mediaBusy} onClick={() => onSelectMedia('image')}><Upload size={13} />选择图片</button>
        <button type="button" disabled={mediaBusy} onClick={() => onSelectMedia('gif')}><Upload size={13} />选择 GIF</button>
        <button className="mini-icon-button" type="button" title="移除自定义气泡" onClick={selectNone}><Trash2 size={13} /></button>
      </div>
      <div className="conversation-bubble-fit-tabs segmented-control" aria-label="自定义气泡适配">
        <button type="button" className={style.fit === 'nineSlice' ? 'active' : ''} onClick={() => onChange((next) => { next.conversationBubbles[role].fit = 'nineSlice' })}>九宫格</button>
        <button type="button" className={style.fit === 'stretch' ? 'active' : ''} onClick={() => onChange((next) => { next.conversationBubbles[role].fit = 'stretch' })}>整图拉伸</button>
      </div>
      {style.fit === 'nineSlice' && <>
        <Range label="切片" min={10} max={45} step={1} value={style.slice} onChange={(value) => updateLayout('slice', value, `bubble-${role}-slice`)} onChangeEnd={onInteractionEnd} />
        <Range label="边框宽度" min={8} max={40} step={1} value={style.frameWidth} onChange={(value) => updateLayout('frameWidth', value, `bubble-${role}-width`)} onChangeEnd={onInteractionEnd} />
      </>}
      <Range label="内容边距" min={12} max={40} step={1} value={style.contentPadding} onChange={(value) => updateLayout('contentPadding', value, `bubble-${role}-padding`)} onChangeEnd={onInteractionEnd} />
    </div>}
  </div>
}
