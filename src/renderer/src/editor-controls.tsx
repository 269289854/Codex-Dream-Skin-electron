import * as React from 'react'
import { Sparkles, Upload } from 'lucide-react'
import { HOME_ACTION_FALLBACK_BUILTINS } from '../../shared/home-layout'
import { resolveBuiltinIconGlyph } from '../../shared/icon-glyphs'
import type { IconSlot, ThemeColors, ThemeProfile } from '../../shared/theme'
import { builtinIconOptions, builtinIcons } from './icons'

export const colorLabels: Record<keyof ThemeColors, string> = {
  surface: '背景',
  ink: '正文',
  accent: '强调',
  pink: '粉色',
  lavender: '淡紫',
  border: '边框',
  success: '成功',
  danger: '危险'
}

export const iconLabels: Record<IconSlot, string> = {
  sidebarMode: '侧边栏模式',
  branding: '品牌',
  cardPrimary: '主卡片',
  cardSecondary: '副卡片',
  composer: '输入框',
  project: '项目',
  decoration: '装饰',
  polaroidPin: '图钉'
}

interface RangeProps {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step: number
  suffix?: string
}

export function Range({ label, value, onChange, min, max, step, suffix = '' }: RangeProps): React.JSX.Element {
  return <label className="range-row"><span>{label}</span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /><output>{Number.isInteger(step) ? value : value.toFixed(2)}{suffix}</output></label>
}

interface ThemeColorControlProps {
  colorKey: keyof ThemeColors
  value: string
  onChange: (value: string) => void
}

export function ThemeColorControl({ colorKey, value, onChange }: ThemeColorControlProps): React.JSX.Element {
  return <label data-color-key={colorKey}><input aria-label={colorLabels[colorKey]} type="color" value={value} onChange={(event) => onChange(event.target.value.toUpperCase())} /><span>{colorLabels[colorKey]}</span><code>{value}</code></label>
}

interface ThemeIconControlProps {
  slot: IconSlot
  profile: ThemeProfile
  assets: Record<string, string>
  onChange: (name: string) => void
  onImport: () => void
  highlighted?: boolean
}

export function ThemeIconControl({ slot, profile, assets, onChange, onImport, highlighted = false }: ThemeIconControlProps): React.JSX.Element {
  const source = profile.icons[slot]
  return (
    <div className={highlighted ? 'icon-slot inspector-highlight' : 'icon-slot'} data-icon-slot={slot} data-inspector-anchor={`icon-${slot}`}>
      <span className="icon-preview"><RenderIcon slot={slot} profile={profile} assets={assets} /></span>
      <label>{iconLabels[slot]}
        <select value={source.kind === 'builtin' ? source.name : '__asset'} onChange={(event) => { if (event.target.value !== '__asset') onChange(event.target.value) }}>
          <option value="__asset">自定义图片</option>
          {builtinIconOptions.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      <button className="tool-button" title={`导入${iconLabels[slot]}图标`} onClick={onImport}><Upload size={14} /></button>
    </div>
  )
}

interface RenderIconProps {
  slot: IconSlot
  profile: ThemeProfile
  assets: Record<string, string>
  injected?: boolean
  fallbackGlyph?: string
}

export function RenderIcon({ slot, profile, assets, injected = false, fallbackGlyph }: RenderIconProps): React.JSX.Element {
  const source = profile.icons[slot]
  if (source.kind === 'asset') return <img className="custom-icon" src={assets[source.asset]} alt="" />
  const fallbackBuiltin = HOME_ACTION_FALLBACK_BUILTINS[slot as keyof typeof HOME_ACTION_FALLBACK_BUILTINS]
  if (fallbackGlyph && source.name === fallbackBuiltin) return <span className="builtin-icon-glyph" aria-hidden="true">{fallbackGlyph}</span>
  if (injected) return <span className="builtin-icon-glyph" aria-hidden="true">{resolveBuiltinIconGlyph(source.name)}</span>
  const Icon = builtinIcons[source.name] ?? Sparkles
  return <Icon size={18} />
}
