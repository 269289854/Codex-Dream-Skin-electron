import * as React from 'react'
import { RotateCcw } from 'lucide-react'
import { resolveAppearanceColor } from '../../shared/appearance'
import type { ThemeProfile } from '../../shared/theme'
import { AppearanceColorControl, FontControl, Range } from './editor-controls'

interface DecorationControlsProps {
  profile: ThemeProfile
  assets: Record<string, string>
  onChange: (mutator: (profile: ThemeProfile) => void, historyGroup?: string) => void
  onInteractionEnd: () => void
  onImportIcon: (slot: keyof ThemeProfile['icons']) => void
  onImportFont: (slot: keyof ThemeProfile['typography']['slots']) => void
}

const MELODY_PRESETS = [
  { id: 'melody', label: '旋律', text: '♫ · · · ♡ · · · ♪' },
  { id: 'simple', label: '简洁', text: '♫ · ♪' },
  { id: 'wish', label: '星愿', text: '✦ · ♡ · ✦' }
] as const

export function ComposerMelodyControls({ profile, onChange, onInteractionEnd, onImportFont }: DecorationControlsProps): React.JSX.Element {
  const config = profile.decorations.composerMelody
  const activePreset = MELODY_PRESETS.find((preset) => preset.text === config.text)?.id ?? 'custom'
  const melodyColor = resolveAppearanceColor(profile.appearance, profile.colors, 'wave')
  return <div className="decoration-controls" data-decoration-controls="composer-melody">
    <label className="toggle-row"><span>显示输入框旋律</span><input type="checkbox" checked={config.visible} onChange={(event) => { const visible = event.currentTarget.checked; onChange((next) => { next.decorations.composerMelody.visible = visible }) }} /></label>
    <div className="segmented-control melody-presets" aria-label="旋律预设">{MELODY_PRESETS.map((preset) => <button className={activePreset === preset.id ? 'active' : ''} type="button" key={preset.id} onClick={() => onChange((next) => { next.decorations.composerMelody.text = preset.text })}>{preset.label}</button>)}<button className={activePreset === 'custom' ? 'active' : ''} type="button">自定义</button></div>
    <label className="quick-copy-field">旋律文字<textarea value={config.text} maxLength={64} rows={2} onInput={(event) => { const text = event.currentTarget.value; onChange((next) => { next.decorations.composerMelody.text = text }, 'composer-melody-text') }} onBlur={onInteractionEnd} /></label>
    <div className="token-control"><AppearanceColorControl token="wave" value={melodyColor} onChange={(value) => onChange((next) => { next.appearance.colors.wave = value }, 'color-wave')} onChangeEnd={onInteractionEnd} />{profile.appearance.colors.wave && <button className="reset-token" type="button" title="恢复主题默认值" onClick={() => onChange((next) => { delete next.appearance.colors.wave })}><RotateCcw size={12} /></button>}</div>
    <FontControl slot="composerMelody" profile={profile} onChange={(selection) => onChange((next) => { next.typography.slots.composerMelody = selection })} onImport={() => onImportFont('composerMelody')} />
    <Range label="字号" min={10} max={32} step={1} suffix="px" value={config.fontSize} onChange={(fontSize) => onChange((next) => { next.decorations.composerMelody.fontSize = fontSize }, 'composer-melody-font-size')} onChangeEnd={onInteractionEnd} />
    <Range label="水平位置" min={.1} max={.9} step={.01} value={config.position.x} onChange={(x) => onChange((next) => { next.decorations.composerMelody.position.x = x }, 'composer-melody-x')} onChangeEnd={onInteractionEnd} />
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
