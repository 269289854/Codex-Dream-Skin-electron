import * as React from 'react'
import { Image, Trash2, Upload, Video } from 'lucide-react'
import type { MediaSelectionKind } from '../../shared/contracts'
import type { ThemeProfile } from '../../shared/theme'
import { PaintControl, Range, SolidColorControl } from './editor-controls'

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

const overlayShapes: Array<{ value: ThemeProfile['conversationBackground']['overlay']['shape']; label: string }> = [
  { value: 'full', label: '全屏' },
  { value: 'ellipse', label: '椭圆' },
  { value: 'roundedRect', label: '圆角矩形' }
]

export function ConversationBackgroundControls({ profile, backgroundUrl, mediaBusy = false, onChange, onInteractionEnd, onSelectMedia }: ConversationBackgroundControlsProps): React.JSX.Element {
  const background = profile.conversationBackground
  const overlay = background.overlay
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
    <section className="conversation-overlay-controls" aria-label="对话背景遮罩">
      <PaintControl label="遮罩颜色" value={overlay.paint} onChange={(paint, continuous) => onChange((next) => { next.conversationBackground.overlay.paint = paint }, continuous ? 'conversation-background-overlay-paint' : undefined)} onChangeEnd={onInteractionEnd} />
      <Range label="遮罩透明度" min={0} max={1} step={.01} value={overlay.opacity} onChange={(value) => onChange((next) => { next.conversationBackground.overlay.opacity = value }, 'conversation-background-overlay-opacity')} onChangeEnd={onInteractionEnd} />
      <div className="segmented-control conversation-overlay-shapes" aria-label="遮罩形状">
        {overlayShapes.map((shape) => <button type="button" key={shape.value} className={overlay.shape === shape.value ? 'active' : ''} onClick={() => onChange((next) => { next.conversationBackground.overlay.shape = shape.value })}>{shape.label}</button>)}
      </div>
      {overlay.shape !== 'full' && <div className="conversation-overlay-geometry">
        <Range label="水平位置" min={0} max={1} step={.01} value={overlay.position.x} displayScale={100} suffix="%" onChange={(value) => onChange((next) => { next.conversationBackground.overlay.position.x = value }, 'conversation-background-overlay-position-x')} onChangeEnd={onInteractionEnd} />
        <Range label="垂直位置" min={0} max={1} step={.01} value={overlay.position.y} displayScale={100} suffix="%" onChange={(value) => onChange((next) => { next.conversationBackground.overlay.position.y = value }, 'conversation-background-overlay-position-y')} onChangeEnd={onInteractionEnd} />
        <Range label="遮罩宽度" min={.1} max={1} step={.01} value={overlay.size.width} displayScale={100} suffix="%" onChange={(value) => onChange((next) => { next.conversationBackground.overlay.size.width = value }, 'conversation-background-overlay-width')} onChangeEnd={onInteractionEnd} />
        <Range label="遮罩高度" min={.1} max={1} step={.01} value={overlay.size.height} displayScale={100} suffix="%" onChange={(value) => onChange((next) => { next.conversationBackground.overlay.size.height = value }, 'conversation-background-overlay-height')} onChangeEnd={onInteractionEnd} />
        <Range label="边缘柔化" min={0} max={80} step={1} suffix="px" value={overlay.softness} onChange={(value) => onChange((next) => { next.conversationBackground.overlay.softness = value }, 'conversation-background-overlay-softness')} onChangeEnd={onInteractionEnd} />
        {overlay.shape === 'roundedRect' && <Range label="圆角" min={0} max={160} step={1} suffix="px" value={overlay.cornerRadius} onChange={(value) => onChange((next) => { next.conversationBackground.overlay.cornerRadius = value }, 'conversation-background-overlay-corner-radius')} onChangeEnd={onInteractionEnd} />}
      </div>}
    </section>
  </div>
}
