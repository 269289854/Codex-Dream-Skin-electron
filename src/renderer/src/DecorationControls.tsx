import * as React from 'react'
import { ArrowLeft, ArrowRight, Image, RotateCcw, Trash2, Upload } from 'lucide-react'
import { resolveAppearanceColor } from '../../shared/appearance'
import { COMPOSER_DECORATION_EFFECT_IDS, type ComposerDecorationEffect, type ThemeProfile } from '../../shared/theme'
import { AppearanceColorControl, FontControl, Range } from './editor-controls'

interface DecorationControlsProps {
  profile: ThemeProfile
  assets: Record<string, string>
  onChange: (mutator: (profile: ThemeProfile) => void, historyGroup?: string) => void
  onInteractionEnd: () => void
  onImportIcon: (slot: keyof ThemeProfile['icons']) => void
  onImportFont: (slot: keyof ThemeProfile['typography']['slots']) => void
  mediaBusy?: boolean
  onSelectMedia?: (mode: 'image' | 'gif') => void
}

const MELODY_PRESETS = [
  { id: 'melody', label: '旋律', text: '♫ · · · ♡ · · · ♪' },
  { id: 'simple', label: '简洁', text: '♫ · ♪' },
  { id: 'wish', label: '星愿', text: '✦ · ♡ · ✦' }
] as const

const EFFECT_LABELS: Record<ComposerDecorationEffect, string> = {
  none: '静止',
  wave: '波浪',
  barrage: '弹幕',
  scroll: '横向滚动',
  float: '上下浮动',
  pulse: '呼吸闪烁'
}

export function ComposerMelodyControls({ profile, assets, onChange, onInteractionEnd, onImportFont, mediaBusy = false, onSelectMedia }: DecorationControlsProps): React.JSX.Element {
  const config = profile.decorations.composerMelody
  const activePreset = MELODY_PRESETS.find((preset) => preset.text === config.text)?.id
  const melodyColor = resolveAppearanceColor(profile.appearance, profile.colors, 'wave')
  const mediaUrl = config.source ? assets[config.source.asset] : undefined
  const sourceMode = config.source?.mimeType === 'image/gif' ? 'gif' : config.source?.kind === 'image' ? 'image' : null
  const trackEffect = config.mode === 'text' && (config.effect === 'barrage' || config.effect === 'scroll')
  const selectMedia = (mode: 'image' | 'gif'): void => {
    if (sourceMode === mode) onChange((next) => { next.decorations.composerMelody.mode = mode })
    else onSelectMedia?.(mode)
  }
  const activeMediaMode = config.mode === 'image' ? 'image' : 'gif'
  const mediaLabel = activeMediaMode === 'image' ? '图片' : 'GIF'
  const mediaWidthLabel = activeMediaMode === 'image' ? '图片宽度' : 'GIF 宽度'
  const selectMediaLabel = activeMediaMode === 'image' ? '选择图片' : '选择 GIF'
  const replaceMediaLabel = activeMediaMode === 'image' ? '更换图片' : '更换 GIF'
  const removeMediaLabel = activeMediaMode === 'image' ? '移除图片' : '移除 GIF'
  return <div className="decoration-controls" data-decoration-controls="composer-melody">
    <label className="toggle-row"><span>显示输入框装饰</span><input type="checkbox" checked={config.visible} onChange={(event) => { const visible = event.currentTarget.checked; onChange((next) => { next.decorations.composerMelody.visible = visible }) }} /></label>
    <div className="segmented-control composer-decoration-modes" aria-label="输入框装饰内容"><button className={config.mode === 'text' ? 'active' : ''} type="button" onClick={() => onChange((next) => { next.decorations.composerMelody.mode = 'text' })}>文字</button><button className={config.mode === 'image' ? 'active' : ''} type="button" disabled={mediaBusy} onClick={() => selectMedia('image')}>图片</button><button className={config.mode === 'gif' ? 'active' : ''} type="button" disabled={mediaBusy} onClick={() => selectMedia('gif')}>GIF</button></div>
    {config.mode === 'text' ? <>
      <div className="segmented-control melody-presets" aria-label="文字预设">{MELODY_PRESETS.map((preset) => <button className={activePreset === preset.id ? 'active' : ''} type="button" key={preset.id} onClick={() => onChange((next) => { next.decorations.composerMelody.text = preset.text })}>{preset.label}</button>)}</div>
      <label className="quick-copy-field">装饰文字<textarea value={config.text} maxLength={64} rows={2} onInput={(event) => { const text = event.currentTarget.value; onChange((next) => { next.decorations.composerMelody.text = text }, 'composer-melody-text') }} onBlur={onInteractionEnd} /></label>
      <label className="quick-copy-field">文字动效<select value={config.effect} onChange={(event) => { const effect = event.currentTarget.value as ComposerDecorationEffect; onChange((next) => { next.decorations.composerMelody.effect = effect }) }}>{COMPOSER_DECORATION_EFFECT_IDS.map((effect) => <option value={effect} key={effect}>{EFFECT_LABELS[effect]}</option>)}</select></label>
      {config.effect !== 'none' && <Range label="动效速度" min={.5} max={2} step={.1} suffix="x" value={config.speed} onChange={(speed) => onChange((next) => { next.decorations.composerMelody.speed = speed }, 'composer-melody-speed')} onChangeEnd={onInteractionEnd} />}
      {trackEffect && <div className="segmented-control composer-decoration-directions" aria-label="移动方向"><button className={config.direction === 'left' ? 'active' : ''} type="button" onClick={() => onChange((next) => { next.decorations.composerMelody.direction = 'left' })}><ArrowLeft size={14} />向左</button><button className={config.direction === 'right' ? 'active' : ''} type="button" onClick={() => onChange((next) => { next.decorations.composerMelody.direction = 'right' })}><ArrowRight size={14} />向右</button></div>}
      <div className="token-control"><AppearanceColorControl token="wave" value={melodyColor} onChange={(value) => onChange((next) => { next.appearance.colors.wave = value }, 'color-wave')} onChangeEnd={onInteractionEnd} />{profile.appearance.colors.wave && <button className="reset-token" type="button" title="恢复主题默认值" onClick={() => onChange((next) => { delete next.appearance.colors.wave })}><RotateCcw size={12} /></button>}</div>
      <FontControl slot="composerMelody" profile={profile} onChange={(selection) => onChange((next) => { next.typography.slots.composerMelody = selection })} onImport={() => onImportFont('composerMelody')} />
      <Range label="字号" min={10} max={32} step={1} suffix="px" value={config.fontSize} onChange={(fontSize) => onChange((next) => { next.decorations.composerMelody.fontSize = fontSize }, 'composer-melody-font-size')} onChangeEnd={onInteractionEnd} />
    </> : <>
      <button className="asset-picker composer-decoration-asset-picker" type="button" disabled={mediaBusy} onClick={() => onSelectMedia?.(activeMediaMode)}>{mediaUrl ? <img src={mediaUrl} alt={`输入框${mediaLabel}装饰`} /> : <Image size={20} />}<span><Upload size={13} />{mediaUrl ? replaceMediaLabel : selectMediaLabel}</span></button>
      <Range label={mediaWidthLabel} min={32} max={240} step={1} suffix="px" value={config.mediaWidth} onChange={(mediaWidth) => onChange((next) => { next.decorations.composerMelody.mediaWidth = mediaWidth }, 'composer-melody-media-width')} onChangeEnd={onInteractionEnd} />
      {config.source && <button className="secondary-command composer-decoration-remove" type="button" onClick={() => onChange((next) => { next.decorations.composerMelody.source = null; next.decorations.composerMelody.mode = 'text' })}><Trash2 size={14} />{removeMediaLabel}</button>}
    </>}
    {!trackEffect && <Range label="水平位置" min={.1} max={.9} step={.01} value={config.position.x} onChange={(x) => onChange((next) => { next.decorations.composerMelody.position.x = x }, 'composer-melody-x')} onChangeEnd={onInteractionEnd} />}
    <Range label="垂直位置" min={.1} max={.65} step={.01} value={config.position.y} onChange={(y) => onChange((next) => { next.decorations.composerMelody.position.y = y }, 'composer-melody-y')} onChangeEnd={onInteractionEnd} />
    <label className="toggle-row"><span>输入内容时隐藏</span><input type="checkbox" checked={config.hideWhenTyping} onChange={(event) => { const hideWhenTyping = event.currentTarget.checked; onChange((next) => { next.decorations.composerMelody.hideWhenTyping = hideWhenTyping }) }} /></label>
  </div>
}

export function HomeHeadingDecorationControls({ profile, onChange, onInteractionEnd, onImportFont }: DecorationControlsProps): React.JSX.Element {
  const config = profile.decorations.homeHeading
  const decorationColor = resolveAppearanceColor(profile.appearance, profile.colors, 'homeHeadingDecoration')
  return <div className="decoration-controls" data-decoration-controls="home-heading">
    <label className="toggle-row"><span>显示首页标题装饰</span><input type="checkbox" checked={config.visible} onChange={(event) => { const visible = event.currentTarget.checked; onChange((next) => { next.decorations.homeHeading.visible = visible }) }} /></label>
    <label className="quick-copy-field">装饰文字<textarea value={config.text} maxLength={64} rows={2} onInput={(event) => { const text = event.currentTarget.value; onChange((next) => { next.decorations.homeHeading.text = text }, 'home-heading-decoration-text') }} onBlur={onInteractionEnd} /></label>
    <div className="token-control"><AppearanceColorControl token="homeHeadingDecoration" value={decorationColor} onChange={(value) => onChange((next) => { next.appearance.colors.homeHeadingDecoration = value }, 'color-home-heading-decoration')} onChangeEnd={onInteractionEnd} />{profile.appearance.colors.homeHeadingDecoration && <button className="reset-token" type="button" title="恢复主题默认值" onClick={() => onChange((next) => { delete next.appearance.colors.homeHeadingDecoration })}><RotateCcw size={12} /></button>}</div>
    <FontControl slot="homeHeadingDecoration" profile={profile} onChange={(selection) => onChange((next) => { next.typography.slots.homeHeadingDecoration = selection })} onImport={() => onImportFont('homeHeadingDecoration')} />
    <Range label="字号" min={10} max={32} step={1} suffix="px" value={config.fontSize} onChange={(fontSize) => onChange((next) => { next.decorations.homeHeading.fontSize = fontSize }, 'home-heading-decoration-font-size')} onChangeEnd={onInteractionEnd} />
  </div>
}
