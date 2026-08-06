import * as React from 'react'
import { Check, Image as ImageIcon, Trash2, Upload, X } from 'lucide-react'
import {
  CONVERSATION_BUBBLE_CORNERS,
  CONVERSATION_BUBBLE_PRESETS,
  createDefaultConversationBubbleStyle,
  type ConversationBubbleCorner,
  type ConversationBubbleCornerAsset,
  type ConversationBubbleRole,
  type ThemeProfile
} from '../../shared/theme'
import { conversationBubblePresetAssetKey } from '../../shared/conversation-bubbles'
import type { ImportedMediaAsset } from '../../shared/contracts'
import { t } from '../../shared/i18n'
import { Range, SolidColorControl } from './editor-controls'

const conversationBubbleRoleLabels: Record<ConversationBubbleRole, string> = {
  user: '我的消息',
  codex: 'Codex 回复',
  plan: '生成计划'
}

const cornerLabels: Record<ConversationBubbleCorner, string> = {
  topLeft: '左上角',
  topRight: '右上角',
  bottomRight: '右下角',
  bottomLeft: '左下角'
}

interface StagedCorner extends ConversationBubbleCornerAsset {
  previewUrl: string
  pending: boolean
}

interface StagedCustomBubble {
  corners: Record<ConversationBubbleCorner, StagedCorner | null>
  borderColor: string
  borderWidth: number
  borderRadius: number
  ornamentSize: number
  ornamentOutset: number
  contentPadding: number
}

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
  onSelectCorner: (corner: ConversationBubbleCorner) => Promise<ImportedMediaAsset | null>
  onDiscardPending: (assets: string[]) => Promise<void>
}

function emptyCorners(): Record<ConversationBubbleCorner, StagedCorner | null> {
  return { topLeft: null, topRight: null, bottomRight: null, bottomLeft: null }
}

function stageFromProfile(profile: ThemeProfile, assets: Record<string, string>, role: ConversationBubbleRole): StagedCustomBubble {
  const style = profile.conversationBubbles[role]
  if (style.source.kind !== 'custom') {
    return { corners: emptyCorners(), borderColor: '#9b7b6a', borderWidth: 2, borderRadius: 14, ornamentSize: 56, ornamentOutset: 4, contentPadding: style.contentPadding }
  }
  const customSource = style.source
  const corners = Object.fromEntries(CONVERSATION_BUBBLE_CORNERS.map((corner) => {
    const asset = customSource.corners[corner]
    return [corner, { ...asset, previewUrl: assets[asset.reference.asset] ?? '', pending: false }]
  })) as Record<ConversationBubbleCorner, StagedCorner>
  return {
    corners,
    borderColor: customSource.borderColor,
    borderWidth: customSource.borderWidth,
    borderRadius: customSource.borderRadius,
    ornamentSize: customSource.ornamentSize,
    ornamentOutset: customSource.ornamentOutset,
    contentPadding: style.contentPadding
  }
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
  onSelectCorner,
  onDiscardPending
}: ConversationBubbleControlsProps): React.JSX.Element {
  const [customPickerOpen, setCustomPickerOpen] = React.useState(false)
  const [staged, setStaged] = React.useState<StagedCustomBubble>(() => stageFromProfile(profile, assets, role))
  const pendingAssetsRef = React.useRef<string[]>([])
  const discardPendingRef = React.useRef(onDiscardPending)
  const style = profile.conversationBubbles[role]
  const roleLabel = t(conversationBubbleRoleLabels[role])
  const selectedPresetId = style.source.kind === 'preset' ? style.source.presetId : CONVERSATION_BUBBLE_PRESETS[0].id
  const editorVisible = style.source.kind === 'custom' || customPickerOpen
  const pendingAssets = CONVERSATION_BUBBLE_CORNERS.flatMap((corner) => staged.corners[corner]?.pending ? [staged.corners[corner]!.reference.asset] : [])

  pendingAssetsRef.current = pendingAssets
  discardPendingRef.current = onDiscardPending

  React.useEffect(() => {
    setCustomPickerOpen(false)
    setStaged(stageFromProfile(profile, assets, role))
    return () => {
      const abandoned = pendingAssetsRef.current
      pendingAssetsRef.current = []
      if (abandoned.length > 0) void discardPendingRef.current(abandoned)
    }
  }, [profile.id, role, style.source.kind])

  const discardStaged = async (): Promise<void> => {
    pendingAssetsRef.current = []
    if (pendingAssets.length > 0) await onDiscardPending(pendingAssets)
    setStaged(stageFromProfile(profile, assets, role))
  }
  const leaveCustomEditor = (): void => {
    void discardStaged().finally(() => setCustomPickerOpen(false))
  }
  const selectNone = (): void => {
    void discardStaged()
    setCustomPickerOpen(false)
    onChange((next) => {
      next.conversationBubbles[role] = createDefaultConversationBubbleStyle()
    })
  }
  const selectPreset = (presetId: (typeof CONVERSATION_BUBBLE_PRESETS)[number]['id']): void => {
    void discardStaged()
    setCustomPickerOpen(false)
    onChange((next) => {
      next.conversationBubbles.visible = true
      next.conversationBubbles[role] = { ...createDefaultConversationBubbleStyle(), source: { kind: 'preset', presetId } }
    })
  }
  const chooseCorner = async (corner: ConversationBubbleCorner): Promise<void> => {
    const imported = await onSelectCorner(corner)
    if (!imported) return
    const previous = staged.corners[corner]
    if (previous?.pending) await onDiscardPending([previous.reference.asset])
    setStaged((current) => ({
      ...current,
      corners: {
        ...current.corners,
        [corner]: { reference: imported.reference, width: imported.width, height: imported.height, previewUrl: imported.previewUrl, pending: true }
      }
    }))
  }
  const complete = CONVERSATION_BUBBLE_CORNERS.every((corner) => staged.corners[corner] !== null)
  const applyCustom = (): void => {
    if (!complete) return
    const corners = Object.fromEntries(CONVERSATION_BUBBLE_CORNERS.map((corner) => {
      const asset = staged.corners[corner]
      if (!asset) throw new Error('聊天气泡四角素材不完整。')
      return [corner, { reference: asset.reference, width: asset.width, height: asset.height }]
    })) as Record<ConversationBubbleCorner, ConversationBubbleCornerAsset>
    onChange((next) => {
      next.conversationBubbles.visible = true
      next.conversationBubbles[role] = {
        source: {
          kind: 'custom',
          corners,
          borderColor: staged.borderColor,
          borderWidth: staged.borderWidth,
          borderRadius: staged.borderRadius,
          ornamentSize: staged.ornamentSize,
          ornamentOutset: staged.ornamentOutset
        },
        contentPadding: staged.contentPadding
      }
    })
    pendingAssetsRef.current = []
    setCustomPickerOpen(false)
    setStaged((current) => ({
      ...current,
      corners: Object.fromEntries(CONVERSATION_BUBBLE_CORNERS.map((corner) => [corner, current.corners[corner] ? { ...current.corners[corner]!, pending: false } : null])) as Record<ConversationBubbleCorner, StagedCorner | null>
    }))
  }
  const updateNumber = (field: 'borderWidth' | 'borderRadius' | 'ornamentSize' | 'ornamentOutset' | 'contentPadding', value: number): void => {
    setStaged((current) => ({ ...current, [field]: value }))
  }

  return <div className="conversation-bubble-controls" data-bubble-role-controls={role}>
    {showVisibility && <label className="toggle-row"><span>{t('显示聊天气泡')}</span><input type="checkbox" checked={profile.conversationBubbles.visible} onChange={(event) => { const visible = event.currentTarget.checked; onChange((next) => { next.conversationBubbles.visible = visible }) }} /></label>}
    {showRoleTabs && <div className="conversation-bubble-role-tabs segmented-control" aria-label={t('聊天气泡角色')}>
      <button type="button" className={role === 'user' ? 'active' : ''} onClick={() => onRoleChange?.('user')}>{t('我的消息')}</button>
      <button type="button" className={role === 'codex' ? 'active' : ''} onClick={() => onRoleChange?.('codex')}>{t('Codex 回复')}</button>
      <button type="button" className={role === 'plan' ? 'active' : ''} onClick={() => onRoleChange?.('plan')}>{t('生成计划')}</button>
    </div>}
    <div className="conversation-bubble-mode-tabs segmented-control" aria-label={t('聊天气泡模式')}>
      <button type="button" className={style.source.kind === 'none' && !customPickerOpen ? 'active' : ''} onClick={selectNone}>{t('无边框')}</button>
      <button type="button" className={style.source.kind === 'preset' && !customPickerOpen ? 'active' : ''} onClick={() => selectPreset(selectedPresetId)}>{t('预设')}</button>
      <button type="button" className={editorVisible ? 'active' : ''} onClick={() => { setStaged(stageFromProfile(profile, assets, role)); setCustomPickerOpen(true) }}>{t('自定义')}</button>
    </div>

    {style.source.kind === 'preset' && !customPickerOpen && <div className="conversation-bubble-preset-grid" role="radiogroup" aria-label={t('{role}气泡预设', { role: roleLabel })}>
      {CONVERSATION_BUBBLE_PRESETS.map((preset) => {
        const selected = selectedPresetId === preset.id
        return <button type="button" role="radio" aria-checked={selected} className={selected ? 'active' : ''} key={preset.id} onClick={() => selectPreset(preset.id)}>
          <span className="conversation-bubble-preset-preview" aria-hidden="true">{CONVERSATION_BUBBLE_CORNERS.map((corner) => {
            const source = assets[conversationBubblePresetAssetKey(preset.id, corner)]
            return source ? <img key={corner} data-corner={corner} src={source} alt="" /> : null
          })}</span>
          <span>{t(preset.name)}</span>
        </button>
      })}
    </div>}

    {editorVisible && <div className="conversation-bubble-custom">
      <div className="conversation-bubble-corner-grid">
        {CONVERSATION_BUBBLE_CORNERS.map((corner) => {
          const asset = staged.corners[corner]
          return <button type="button" key={corner} disabled={mediaBusy} onClick={() => { void chooseCorner(corner) }}>
            {asset?.previewUrl ? <img src={asset.previewUrl} alt="" /> : <ImageIcon size={20} />}
            <span><Upload size={12} />{t(cornerLabels[corner])}</span>
          </button>
        })}
      </div>
      {!complete && <p className="conversation-bubble-corner-requirement">{t('请上传完整的四张角饰图片')}</p>}
      <SolidColorControl label="边框颜色" value={staged.borderColor} onChange={(borderColor) => setStaged((current) => ({ ...current, borderColor }))} onChangeEnd={onInteractionEnd} />
      <Range label="边框宽度" min={0} max={4} step={1} value={staged.borderWidth} onChange={(value) => updateNumber('borderWidth', value)} onChangeEnd={onInteractionEnd} />
      <Range label="圆角大小" min={8} max={32} step={1} value={staged.borderRadius} onChange={(value) => updateNumber('borderRadius', value)} onChangeEnd={onInteractionEnd} />
      <Range label="角饰大小" min={24} max={96} step={1} value={staged.ornamentSize} onChange={(value) => updateNumber('ornamentSize', value)} onChangeEnd={onInteractionEnd} />
      <Range label="角饰外移" min={0} max={24} step={1} value={staged.ornamentOutset} onChange={(value) => updateNumber('ornamentOutset', value)} onChangeEnd={onInteractionEnd} />
      <Range label="内容边距" min={12} max={40} step={1} value={staged.contentPadding} onChange={(value) => updateNumber('contentPadding', value)} onChangeEnd={onInteractionEnd} />
      <div className="conversation-bubble-custom-actions">
        <button type="button" disabled={!complete || mediaBusy} onClick={applyCustom}><Check size={13} />{t('应用四角装饰')}</button>
        <button type="button" disabled={mediaBusy} onClick={leaveCustomEditor}><X size={13} />{t('取消')}</button>
        {style.source.kind === 'custom' && <button className="mini-icon-button" type="button" title={t('移除自定义气泡')} onClick={selectNone}><Trash2 size={13} /></button>}
      </div>
    </div>}
  </div>
}
