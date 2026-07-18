import * as React from 'react'
import { Plus, RotateCcw, Shuffle, Trash2 } from 'lucide-react'
import { resolveAppearanceColor } from '../../shared/appearance'
import type { ThemeProfile } from '../../shared/theme'
import { AppearanceColorControl, FontControl, Range, SolidColorControl, ThemeIconControl } from './editor-controls'

interface DecorationControlsProps {
  profile: ThemeProfile
  assets: Record<string, string>
  onChange: (mutator: (profile: ThemeProfile) => void, historyGroup?: string) => void
  onInteractionEnd: () => void
  onImportIcon: (slot: keyof ThemeProfile['icons']) => void
  onImportFont: (slot: keyof ThemeProfile['typography']['slots']) => void
}

const EXTRA_COLOR_DEFAULTS = ['#20bcc3', '#b9a7e8', '#f06ea9'] as const
const MELODY_PRESETS = [
  { id: 'melody', label: '旋律', text: '♫ · · · ♡ · · · ♪' },
  { id: 'simple', label: '简洁', text: '♫ · ♪' },
  { id: 'wish', label: '星愿', text: '✦ · ♡ · ✦' }
] as const

export function SparkleControls({ profile, assets, onChange, onInteractionEnd, onImportIcon }: DecorationControlsProps): React.JSX.Element {
  const config = profile.decorations.sparkles
  const mainColor = resolveAppearanceColor(profile.appearance, profile.colors, 'sparkle')
  return <div className="decoration-controls" data-decoration-controls="sparkles">
    <label className="toggle-row"><span>显示背景粒子</span><input type="checkbox" checked={config.visible} onChange={(event) => { const visible = event.currentTarget.checked; onChange((next) => { next.decorations.sparkles.visible = visible }) }} /></label>
    <div className="icon-editor"><ThemeIconControl slot="backgroundSparkle" profile={profile} assets={assets} onChange={(name) => onChange((next) => { next.icons.backgroundSparkle = { kind: 'builtin', name } })} onImport={() => onImportIcon('backgroundSparkle')} /></div>
    <div className="token-control"><AppearanceColorControl token="sparkle" value={mainColor} onChange={(value) => onChange((next) => { next.appearance.colors.sparkle = value }, 'color-sparkle')} onChangeEnd={onInteractionEnd} />{profile.appearance.colors.sparkle && <button className="reset-token" type="button" title="恢复主题默认值" onClick={() => onChange((next) => { delete next.appearance.colors.sparkle })}><RotateCcw size={12} /></button>}</div>
    <div className="sparkle-extra-colors">
      {config.extraColors.map((color, index) => <div className="sparkle-extra-color" key={index}><SolidColorControl label={`附加颜色 ${index + 1}`} value={color} onChange={(value) => onChange((next) => { next.decorations.sparkles.extraColors[index] = value }, `sparkle-extra-color-${index}`)} onChangeEnd={onInteractionEnd} /><button className="mini-icon-button" type="button" title={`删除附加颜色 ${index + 1}`} onClick={() => onChange((next) => { next.decorations.sparkles.extraColors.splice(index, 1) })}><Trash2 size={13} /></button></div>)}
      <button className="add-stop-button" type="button" disabled={config.extraColors.length >= 3} onClick={() => onChange((next) => { const colors = next.decorations.sparkles.extraColors; colors.push(EXTRA_COLOR_DEFAULTS[colors.length] ?? '#20bcc3') })}><Plus size={13} />添加颜色</button>
    </div>
    <Range label="数量" min={1} max={24} step={1} value={config.count} onChange={(count) => onChange((next) => { next.decorations.sparkles.count = count }, 'sparkle-count')} onChangeEnd={onInteractionEnd} />
    <Range label="最小尺寸" min={8} max={32} step={1} suffix="px" value={config.minSize} onChange={(minSize) => onChange((next) => { next.decorations.sparkles.minSize = minSize; if (next.decorations.sparkles.maxSize < minSize) next.decorations.sparkles.maxSize = minSize }, 'sparkle-min-size')} onChangeEnd={onInteractionEnd} />
    <Range label="最大尺寸" min={8} max={32} step={1} suffix="px" value={config.maxSize} onChange={(maxSize) => onChange((next) => { next.decorations.sparkles.maxSize = maxSize; if (next.decorations.sparkles.minSize > maxSize) next.decorations.sparkles.minSize = maxSize }, 'sparkle-max-size')} onChangeEnd={onInteractionEnd} />
    <Range label="透明度" min={0} max={1} step={.01} value={config.opacity} onChange={(opacity) => onChange((next) => { next.decorations.sparkles.opacity = opacity }, 'sparkle-opacity')} onChangeEnd={onInteractionEnd} />
    <Range label="光晕" min={0} max={24} step={1} suffix="px" value={config.glow} onChange={(glow) => onChange((next) => { next.decorations.sparkles.glow = glow }, 'sparkle-glow')} onChangeEnd={onInteractionEnd} />
    <button className="secondary-command" type="button" onClick={() => onChange((next) => { next.decorations.sparkles.seed = next.decorations.sparkles.seed >= 4294967295 ? 0 : next.decorations.sparkles.seed + 1 })}><Shuffle size={14} />重新排列</button>
  </div>
}

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
