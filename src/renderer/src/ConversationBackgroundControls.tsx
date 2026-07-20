import * as React from 'react'
import { Image, Trash2, Upload, Video } from 'lucide-react'
import type { MediaSelectionKind } from '../../shared/contracts'
import type { ThemeProfile } from '../../shared/theme'
import { Range, SolidColorControl } from './editor-controls'

interface ConversationBackgroundControlsProps {
  profile: ThemeProfile
  backgroundUrl?: string
  mediaBusy?: boolean
  onChange: (mutator: (profile: ThemeProfile) => void, historyGroup?: string) => void
  onInteractionEnd: () => void
  onSelectMedia: (kind: MediaSelectionKind) => void
}

const modes: Array<{ value: ThemeProfile['conversationBackground']['mode']; label: string }> = [
  { value: 'color', label: '颜色' },
  { value: 'image', label: '图片' },
  { value: 'gif', label: 'GIF' },
  { value: 'video', label: '视频' }
]

export function ConversationBackgroundControls({ profile, backgroundUrl, mediaBusy = false, onChange, onInteractionEnd, onSelectMedia }: ConversationBackgroundControlsProps): React.JSX.Element {
  const background = profile.conversationBackground
  const mediaMode = background.mode === 'image' || background.mode === 'gif' || background.mode === 'video'
  const chooseMode = (mode: ThemeProfile['conversationBackground']['mode']): void => {
    if (mode === 'color') {
      onChange((next) => {
        next.conversationBackground.visible = true
        next.conversationBackground.mode = 'color'
        next.conversationBackground.source = null
      })
      return
    }
    onSelectMedia(mode)
  }

  return <div className="conversation-background-controls">
    <label className="toggle-row"><span>显示对话区域背景</span><input type="checkbox" checked={background.visible} onChange={(event) => { const visible = event.currentTarget.checked; onChange((next) => { next.conversationBackground.visible = visible }) }} /></label>
    <div className="segmented-control conversation-background-modes" aria-label="对话区域背景类型">
      {modes.map((mode) => <button type="button" key={mode.value} className={background.mode === mode.value ? 'active' : ''} onClick={() => chooseMode(mode.value)}>{mode.label}</button>)}
    </div>
    <Range label="背景透明度" min={0} max={1} step={.01} value={background.opacity} onChange={(value) => onChange((next) => { next.conversationBackground.opacity = value }, 'conversation-background-opacity')} onChangeEnd={onInteractionEnd} />
    {background.mode === 'color' && <SolidColorControl label="背景颜色" value={background.color} onChange={(value) => onChange((next) => { next.conversationBackground.color = value }, 'conversation-background-color')} onChangeEnd={onInteractionEnd} />}
    {mediaMode && <>
      <button className="asset-picker conversation-background-asset-picker" type="button" disabled={mediaBusy} onClick={() => onSelectMedia(background.mode as MediaSelectionKind)}>
        {backgroundUrl && background.mode === 'video' ? <video src={backgroundUrl} muted autoPlay loop playsInline /> : backgroundUrl ? <img src={backgroundUrl} alt="对话区域背景预览" /> : background.mode === 'video' ? <Video size={20} /> : <Image size={20} />}
        <span><Upload size={13} />{backgroundUrl ? '更换背景素材' : '选择背景素材'}</span>
      </button>
      {background.source && <button className="secondary-command conversation-background-remove" type="button" onClick={() => onChange((next) => { next.conversationBackground.mode = 'color'; next.conversationBackground.source = null })}><Trash2 size={14} />移除背景素材</button>}
      <Range label="水平焦点" min={0} max={1} step={.01} value={background.focus.x} onChange={(value) => onChange((next) => { next.conversationBackground.focus.x = value }, 'conversation-background-focus-x')} onChangeEnd={onInteractionEnd} />
      <Range label="垂直焦点" min={0} max={1} step={.01} value={background.focus.y} onChange={(value) => onChange((next) => { next.conversationBackground.focus.y = value }, 'conversation-background-focus-y')} onChangeEnd={onInteractionEnd} />
      <Range label="缩放" min={1} max={3} step={.01} value={background.scale} onChange={(value) => onChange((next) => { next.conversationBackground.scale = value }, 'conversation-background-scale')} onChangeEnd={onInteractionEnd} />
    </>}
    <SolidColorControl label="遮罩颜色" value={background.overlayColor} onChange={(value) => onChange((next) => { next.conversationBackground.overlayColor = value }, 'conversation-background-overlay-color')} onChangeEnd={onInteractionEnd} />
    <Range label="遮罩透明度" min={0} max={1} step={.01} value={background.overlayOpacity} onChange={(value) => onChange((next) => { next.conversationBackground.overlayOpacity = value }, 'conversation-background-overlay-opacity')} onChangeEnd={onInteractionEnd} />
  </div>
}
