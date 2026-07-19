import * as React from 'react'
import { Image, Upload, Volume2, VolumeX } from 'lucide-react'
import type { ThemeProfile } from '../../shared/theme'
import { Range, SolidColorControl } from './editor-controls'

interface PolaroidControlsProps {
  profile: ThemeProfile
  polaroidUrl?: string
  mediaBusy?: boolean
  showAdvanced?: boolean
  onChange: (mutator: (profile: ThemeProfile) => void, historyGroup?: string) => void
  onInteractionEnd: () => void
  onSelectImage: () => void
}

export function PolaroidControls({ profile, polaroidUrl, mediaBusy = false, showAdvanced = false, onChange, onInteractionEnd, onSelectImage }: PolaroidControlsProps): React.JSX.Element {
  const polaroid = profile.polaroid
  const shadow = polaroid.style.shadow
  return <div className="polaroid-controls">
    <label className="toggle-row"><span>显示拍立得</span><input type="checkbox" checked={polaroid.visible} onChange={(event) => { const visible = event.currentTarget.checked; onChange((next) => { next.polaroid.visible = visible }) }} /></label>
    <button className="asset-picker polaroid-asset-picker" type="button" disabled={mediaBusy} onClick={onSelectImage}>{polaroidUrl ? (polaroid.source?.kind === 'video' ? <video src={polaroidUrl} muted playsInline /> : <img src={polaroidUrl} alt="拍立得原图" />) : <Image size={20} />}<span><Upload size={13} />{polaroidUrl ? '更换拍立得媒体' : '选择拍立得媒体'}</span></button>
    {polaroid.source?.kind === 'video' && <div className="media-playback-controls"><label className="toggle-row"><span>{polaroid.playback.autoplay ? '自动播放' : '点击播放'} </span><input type="checkbox" checked={polaroid.playback.autoplay} onChange={(event) => { const autoplay = event.currentTarget.checked; onChange((next) => { next.polaroid.playback.autoplay = autoplay }) }} /></label><label className="toggle-row"><span>循环播放</span><input type="checkbox" checked={polaroid.playback.loop} onChange={(event) => { const loop = event.currentTarget.checked; onChange((next) => { next.polaroid.playback.loop = loop }) }} /></label><label className="toggle-row"><span>{polaroid.playback.sound ? <Volume2 size={14} /> : <VolumeX size={14} />}声音</span><input type="checkbox" checked={polaroid.playback.sound} onChange={(event) => { const sound = event.currentTarget.checked; onChange((next) => { next.polaroid.playback.sound = sound; if (sound) next.hero.playback.sound = false }) }} /></label><Range label="音量" min={0} max={1} step={.01} value={polaroid.playback.volume} disabled={!polaroid.playback.sound} onChange={(value) => onChange((next) => { next.polaroid.playback.volume = value }, 'polaroid-volume')} onChangeEnd={onInteractionEnd} /></div>}
    <div className="segmented-control polaroid-mode-tabs" aria-label="拍立得显示模式">
      <button type="button" className={polaroid.mode === 'full' ? 'active' : ''} onClick={() => onChange((next) => { next.polaroid.mode = 'full' })}>整图</button>
      <button type="button" className={polaroid.mode === 'fence' ? 'active' : ''} onClick={() => onChange((next) => { next.polaroid.mode = 'fence' })}>四点围栏</button>
    </div>
    <Range label="水平位置" min={0} max={1} step={.01} value={polaroid.placement.x} suffix="" onChange={(value) => onChange((next) => { next.polaroid.placement.x = value }, 'polaroid-x')} onChangeEnd={onInteractionEnd} />
    <Range label="垂直位置" min={0} max={1} step={.01} value={polaroid.placement.y} suffix="" onChange={(value) => onChange((next) => { next.polaroid.placement.y = value }, 'polaroid-y')} onChangeEnd={onInteractionEnd} />
    <Range label="宽度" min={.08} max={.6} step={.01} value={polaroid.placement.width} onChange={(value) => onChange((next) => { next.polaroid.placement.width = value }, 'polaroid-width')} onChangeEnd={onInteractionEnd} />
    <Range label="旋转" min={-45} max={45} step={1} value={polaroid.placement.rotation} onChange={(value) => onChange((next) => { next.polaroid.placement.rotation = value }, 'polaroid-rotation')} onChangeEnd={onInteractionEnd} suffix="°" />
    <Range label="整体透明度" min={0} max={1} step={.01} value={polaroid.style.opacity} onChange={(value) => onChange((next) => { next.polaroid.style.opacity = value }, 'polaroid-opacity')} onChangeEnd={onInteractionEnd} />
    <div className={shadow.visible ? 'polaroid-shadow-controls' : 'polaroid-shadow-controls is-disabled'}>
      <label className="toggle-row"><span>显示阴影</span><input type="checkbox" checked={shadow.visible} onChange={(event) => { const visible = event.currentTarget.checked; onChange((next) => { next.polaroid.style.shadow.visible = visible }) }} /></label>
      <SolidColorControl label="阴影颜色" value={shadow.color} disabled={!shadow.visible} onChange={(value) => onChange((next) => { next.polaroid.style.shadow.color = value }, 'polaroid-shadow-color')} onChangeEnd={onInteractionEnd} />
      <Range label="阴影水平" min={-40} max={40} step={1} value={shadow.offsetX} suffix="px" disabled={!shadow.visible} onChange={(value) => onChange((next) => { next.polaroid.style.shadow.offsetX = value }, 'polaroid-shadow-x')} onChangeEnd={onInteractionEnd} />
      <Range label="阴影垂直" min={-40} max={40} step={1} value={shadow.offsetY} suffix="px" disabled={!shadow.visible} onChange={(value) => onChange((next) => { next.polaroid.style.shadow.offsetY = value }, 'polaroid-shadow-y')} onChangeEnd={onInteractionEnd} />
      <Range label="阴影模糊" min={0} max={48} step={1} value={shadow.blur} suffix="px" disabled={!shadow.visible} onChange={(value) => onChange((next) => { next.polaroid.style.shadow.blur = value }, 'polaroid-shadow-blur')} onChangeEnd={onInteractionEnd} />
    </div>
    {showAdvanced && <Range label="隐藏阈值" min={320} max={1600} step={10} value={polaroid.placement.hideBelowWidth} onChange={(value) => onChange((next) => { next.polaroid.placement.hideBelowWidth = value }, 'polaroid-hide-width')} onChangeEnd={onInteractionEnd} suffix="px" />}
  </div>
}
