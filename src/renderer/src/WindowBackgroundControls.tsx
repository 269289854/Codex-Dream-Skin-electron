import * as React from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Copy, Eye, EyeOff, Image, Plus, Trash2, Upload, Video } from 'lucide-react'
import type { MediaSelectionKind } from '../../shared/contracts'
import { createDefaultWindowBackgroundMask, type ThemeProfile, type WindowBackgroundMask } from '../../shared/theme'
import { PaintControl, Range } from './editor-controls'
import { MediaFlipControls } from './MediaFlipControls'
import { VideoThumbnail } from './VideoThumbnail'

interface WindowBackgroundControlsProps {
  profile: ThemeProfile
  backgroundUrl?: string
  mediaBusy?: boolean
  compact?: boolean
  onChange: (mutator: (profile: ThemeProfile) => void, historyGroup?: string) => void
  onInteractionEnd: () => void
  onSelectMedia: (kind: MediaSelectionKind) => void
}

const modes: Array<{ value: ThemeProfile['windowBackground']['mode']; label: string }> = [
  { value: 'color', label: '颜色' },
  { value: 'image', label: '图片' },
  { value: 'gif', label: 'GIF' },
  { value: 'video', label: '视频' }
]

const maskShapes: Array<{ value: WindowBackgroundMask['shape']; label: string }> = [
  { value: 'full', label: '全屏' },
  { value: 'ellipse', label: '椭圆' },
  { value: 'roundedRect', label: '圆角矩形' }
]

export function WindowBackgroundControls({ profile, backgroundUrl, mediaBusy = false, compact = false, onChange, onInteractionEnd, onSelectMedia }: WindowBackgroundControlsProps): React.JSX.Element {
  const background = profile.windowBackground
  const [expandedMaskId, setExpandedMaskId] = React.useState<string | null>(background.masks[0]?.id ?? null)
  const mediaMode = background.mode !== 'color'
  const chooseMode = (mode: ThemeProfile['windowBackground']['mode']): void => {
    if (mode === 'color') {
      onChange((next) => {
        next.windowBackground.visible = true
        next.windowBackground.mode = 'color'
        next.windowBackground.source = null
      })
    } else onSelectMedia(mode)
  }
  const addMask = (): void => {
    if (background.masks.length >= 8) return
    const mask = createDefaultWindowBackgroundMask(crypto.randomUUID())
    onChange((next) => { next.windowBackground.masks.unshift(mask) })
    setExpandedMaskId(mask.id)
  }
  const copyMask = (index: number): void => {
    if (background.masks.length >= 8) return
    const source = background.masks[index]
    if (!source) return
    const copy = { ...structuredClone(source), id: crypto.randomUUID() }
    onChange((next) => { next.windowBackground.masks.splice(index, 0, copy) })
    setExpandedMaskId(copy.id)
  }
  const moveMask = (index: number, offset: -1 | 1): void => {
    const target = index + offset
    if (target < 0 || target >= background.masks.length) return
    onChange((next) => {
      const [mask] = next.windowBackground.masks.splice(index, 1)
      if (mask) next.windowBackground.masks.splice(target, 0, mask)
    })
  }

  return <div className={compact ? 'window-background-controls compact' : 'window-background-controls'}>
    <label className="toggle-row"><span>显示整个窗口背景</span><input type="checkbox" checked={background.visible} onChange={(event) => { const visible = event.currentTarget.checked; onChange((next) => { next.windowBackground.visible = visible }) }} /></label>
    <div className="segmented-control window-background-modes" aria-label="整个窗口背景类型">
      {modes.map((mode) => <button type="button" key={mode.value} className={background.mode === mode.value ? 'active' : ''} onClick={() => chooseMode(mode.value)}>{mode.label}</button>)}
    </div>
    {background.mode === 'color' && <PaintControl label="背景颜色" value={background.paint} onChange={(paint, continuous) => onChange((next) => { next.windowBackground.paint = paint }, continuous ? 'window-background-paint' : undefined)} onChangeEnd={onInteractionEnd} />}
    {mediaMode && <>
      <button className="asset-picker window-background-asset-picker" type="button" disabled={mediaBusy} onClick={() => onSelectMedia(background.mode as MediaSelectionKind)}>
        {backgroundUrl && background.mode === 'video' ? <VideoThumbnail src={backgroundUrl} /> : backgroundUrl ? <img src={backgroundUrl} alt="整个窗口背景预览" /> : background.mode === 'video' ? <Video size={20} /> : <Image size={20} />}
        <span><Upload size={13} />{backgroundUrl ? '更换背景素材' : '选择背景素材'}</span>
      </button>
      {background.source && <button className="secondary-command window-background-remove" type="button" onClick={() => onChange((next) => { next.windowBackground.mode = 'color'; next.windowBackground.source = null })}><Trash2 size={14} />移除背景素材</button>}
      <Range label="水平焦点" min={0} max={1} step={.01} value={background.focus.x} displayScale={100} suffix="%" onChange={(value) => onChange((next) => { next.windowBackground.focus.x = value }, 'window-background-focus-x')} onChangeEnd={onInteractionEnd} />
      <Range label="垂直焦点" min={0} max={1} step={.01} value={background.focus.y} displayScale={100} suffix="%" onChange={(value) => onChange((next) => { next.windowBackground.focus.y = value }, 'window-background-focus-y')} onChangeEnd={onInteractionEnd} />
      <Range label="缩放" min={1} max={3} step={.01} value={background.scale} onChange={(value) => onChange((next) => { next.windowBackground.scale = value }, 'window-background-scale')} onChangeEnd={onInteractionEnd} />
      <MediaFlipControls value={background.mediaTransform} onChange={(field, value) => onChange((next) => { next.windowBackground.mediaTransform[field] = value })} />
    </>}
    <Range label="背景透明度" min={0} max={1} step={.01} value={background.opacity} onChange={(value) => onChange((next) => { next.windowBackground.opacity = value }, 'window-background-opacity')} onChangeEnd={onInteractionEnd} />

    <section className="window-mask-controls" aria-label="窗口背景遮罩图层">
      <header><div><strong>遮罩图层</strong><span>{background.masks.length}/8 · 前景到背景</span></div><button className="mini-icon-button" type="button" title="添加遮罩" disabled={background.masks.length >= 8} onClick={addMask}><Plus size={14} /></button></header>
      {background.masks.length === 0 && <p className="window-mask-empty">无遮罩</p>}
      <div className="window-mask-list">
        {background.masks.map((mask, index) => {
          const expanded = expandedMaskId === mask.id
          return <section className="window-mask-layer" key={mask.id}>
            <header className="window-mask-layer-header">
              <button className="window-mask-expand" type="button" title={expanded ? '收起遮罩设置' : '展开遮罩设置'} onClick={() => setExpandedMaskId(expanded ? null : mask.id)}>{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<span>遮罩 {index + 1}</span></button>
              <button className="mini-icon-button" type="button" title={mask.visible ? '隐藏遮罩' : '显示遮罩'} onClick={() => onChange((next) => { next.windowBackground.masks[index]!.visible = !mask.visible })}>{mask.visible ? <Eye size={13} /> : <EyeOff size={13} />}</button>
              <button className="mini-icon-button" type="button" title="复制遮罩" disabled={background.masks.length >= 8} onClick={() => copyMask(index)}><Copy size={13} /></button>
              <button className="mini-icon-button" type="button" title="上移遮罩" disabled={index === 0} onClick={() => moveMask(index, -1)}><ArrowUp size={13} /></button>
              <button className="mini-icon-button" type="button" title="下移遮罩" disabled={index === background.masks.length - 1} onClick={() => moveMask(index, 1)}><ArrowDown size={13} /></button>
              <button className="mini-icon-button" type="button" title="删除遮罩" onClick={() => onChange((next) => { next.windowBackground.masks.splice(index, 1) })}><Trash2 size={13} /></button>
            </header>
            {expanded && <div className="window-mask-layer-body">
              <PaintControl label="遮罩颜色" value={mask.paint} onChange={(paint, continuous) => onChange((next) => { next.windowBackground.masks[index]!.paint = paint }, continuous ? `window-mask-${mask.id}-paint` : undefined)} onChangeEnd={onInteractionEnd} />
              <Range label="遮罩透明度" min={0} max={1} step={.01} value={mask.opacity} onChange={(value) => onChange((next) => { next.windowBackground.masks[index]!.opacity = value }, `window-mask-${mask.id}-opacity`)} onChangeEnd={onInteractionEnd} />
              <div className="segmented-control window-mask-shapes" aria-label={`遮罩 ${index + 1} 形状`}>
                {maskShapes.map((shape) => <button type="button" key={shape.value} className={mask.shape === shape.value ? 'active' : ''} onClick={() => onChange((next) => { next.windowBackground.masks[index]!.shape = shape.value })}>{shape.label}</button>)}
              </div>
              {mask.shape !== 'full' && <div className="window-mask-geometry">
                <Range label="水平位置" min={0} max={1} step={.01} value={mask.position.x} displayScale={100} suffix="%" onChange={(value) => onChange((next) => { next.windowBackground.masks[index]!.position.x = value }, `window-mask-${mask.id}-position-x`)} onChangeEnd={onInteractionEnd} />
                <Range label="垂直位置" min={0} max={1} step={.01} value={mask.position.y} displayScale={100} suffix="%" onChange={(value) => onChange((next) => { next.windowBackground.masks[index]!.position.y = value }, `window-mask-${mask.id}-position-y`)} onChangeEnd={onInteractionEnd} />
                <Range label="遮罩宽度" min={.1} max={1} step={.01} value={mask.size.width} displayScale={100} suffix="%" onChange={(value) => onChange((next) => { next.windowBackground.masks[index]!.size.width = value }, `window-mask-${mask.id}-width`)} onChangeEnd={onInteractionEnd} />
                <Range label="遮罩高度" min={.1} max={1} step={.01} value={mask.size.height} displayScale={100} suffix="%" onChange={(value) => onChange((next) => { next.windowBackground.masks[index]!.size.height = value }, `window-mask-${mask.id}-height`)} onChangeEnd={onInteractionEnd} />
                <Range label="边缘柔化" min={0} max={80} step={1} suffix="px" value={mask.softness} onChange={(value) => onChange((next) => { next.windowBackground.masks[index]!.softness = value }, `window-mask-${mask.id}-softness`)} onChangeEnd={onInteractionEnd} />
                {mask.shape === 'roundedRect' && <Range label="圆角" min={0} max={160} step={1} suffix="px" value={mask.cornerRadius} onChange={(value) => onChange((next) => { next.windowBackground.masks[index]!.cornerRadius = value }, `window-mask-${mask.id}-corner-radius`)} onChangeEnd={onInteractionEnd} />}
              </div>}
            </div>}
          </section>
        })}
      </div>
    </section>
  </div>
}
