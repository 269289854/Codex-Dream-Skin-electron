import * as React from 'react'
import { Plus, RotateCcw, Trash2 } from 'lucide-react'
import { resolveAppearanceColor } from '../../shared/appearance'
import { PARTICLE_EFFECT_IDS, PARTICLE_EFFECTS, PARTICLE_PERFORMANCE_MODES, particleEffectIconSlot, type ParticlePerformanceMode } from '../../shared/particle-effects'
import type { ThemeProfile } from '../../shared/theme'
import { AppearanceColorControl, Range, SolidColorControl, ThemeIconControl } from './editor-controls'

interface ParticleEffectControlsProps {
  profile: ThemeProfile
  assets: Record<string, string>
  onChange: (mutator: (profile: ThemeProfile) => void, historyGroup?: string) => void
  onInteractionEnd: () => void
  onImportIcon: (slot: keyof ThemeProfile['icons']) => void
}

const EXTRA_COLOR_DEFAULTS = ['#20bcc3', '#b9a7e8', '#f06ea9'] as const
const performanceLabels: Readonly<Record<ParticlePerformanceMode, string>> = {
  quality: '精细',
  balanced: '平衡',
  performance: '省电'
}

export function ParticleEffectControls({ profile, assets, onChange, onInteractionEnd, onImportIcon }: ParticleEffectControlsProps): React.JSX.Element {
  const config = profile.decorations.sparkles
  const activeSlot = particleEffectIconSlot(config.effect)
  const mainColor = resolveAppearanceColor(profile.appearance, profile.colors, 'sparkle')
  return <div className="decoration-controls particle-effect-controls" data-decoration-controls="sparkles">
    <label className="toggle-row"><span>显示背景粒子</span><input type="checkbox" checked={config.visible} onChange={(event) => { const visible = event.currentTarget.checked; onChange((next) => { next.decorations.sparkles.visible = visible }) }} /></label>
    <fieldset className="particle-effect-settings" disabled={!config.visible} aria-label="粒子动效设置">
      <div className="segmented-control particle-effect-modes" aria-label="粒子动效">{PARTICLE_EFFECT_IDS.map((effect) => <button type="button" className={config.effect === effect ? 'active' : ''} aria-pressed={config.effect === effect} key={effect} onClick={() => onChange((next) => { next.decorations.sparkles.effect = effect })}>{PARTICLE_EFFECTS[effect].label}</button>)}</div>
      <div className="segmented-control particle-performance-modes" aria-label="粒子渲染性能">{PARTICLE_PERFORMANCE_MODES.map((mode) => <button type="button" className={config.performanceMode === mode ? 'active' : ''} aria-pressed={config.performanceMode === mode} key={mode} onClick={() => onChange((next) => { next.decorations.sparkles.performanceMode = mode })}>{performanceLabels[mode]}</button>)}</div>
      <div className="icon-editor"><ThemeIconControl slot={activeSlot} profile={profile} assets={assets} onChange={(name) => onChange((next) => { next.icons[activeSlot] = { kind: 'builtin', name } })} onImport={() => onImportIcon(activeSlot)} /></div>
      <Range label="速度" min={0.5} max={2} step={0.05} value={config.speed} onChange={(speed) => onChange((next) => { next.decorations.sparkles.speed = speed }, 'sparkle-speed')} onChangeEnd={onInteractionEnd} suffix="×" />
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
    </fieldset>
  </div>
}
