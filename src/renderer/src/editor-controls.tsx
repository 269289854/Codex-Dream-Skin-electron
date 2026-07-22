import * as React from 'react'
import { ChevronDown, Plus, Sparkles, Trash2, Upload } from 'lucide-react'
import { converter, formatHex, formatHex8, formatRgb, parse } from 'culori'
import {
  APPEARANCE_COLOR_TOKENS,
  APPEARANCE_PAINT_TOKENS,
  parseCssColor,
  type AppearanceColorToken,
  type AppearancePaintToken,
  type ThemePaint,
  type ThemePaintStop
} from '../../shared/appearance'
import { HOME_ACTION_FALLBACK_BUILTINS } from '../../shared/home-layout'
import { resolveBuiltinIconGlyph } from '../../shared/icon-glyphs'
import type { IconSlot, ThemeColors, ThemeProfile } from '../../shared/theme'
import { BUILTIN_FONTS, type FontSelection } from '../../shared/typography'
import type { TypographySlot } from './preview-editing'
import { builtinIconLabels, builtinIconOptions, builtinIcons } from './icons'

export const colorLabels: Record<keyof ThemeColors, string> = {
  surface: '背景', ink: '正文', accent: '强调', pink: '粉色', lavender: '淡紫', border: '边框', success: '成功', danger: '危险'
}

export const iconLabels: Record<IconSlot, string> = {
  sidebarMode: '侧边栏模式', branding: '品牌', cardPrimary: '主卡片', cardSecondary: '副卡片', composer: '输入框发送按钮', composerBadge: '输入框装饰', backgroundSparkle: '呼吸闪烁', backgroundFloat: '轻盈漂浮', backgroundRain: '垂直雨落', backgroundMeteor: '斜向流星', backgroundSnow: '摇曳飘雪', project: '项目', decoration: '装饰', polaroidPin: '图钉', sidebarNavNewTask: '新建任务图标', sidebarNavPullRequests: '拉取请求图标', sidebarNavSites: '站点图标', sidebarNavScheduled: '已安排图标', sidebarNavPlugins: '插件图标'
}

export const typographyLabels: Record<TypographySlot, string> = {
  ui: '全局界面', homeHeading: '首页标题', homeSubtitle: '首页副标题', brandTitle: '品牌主标题', brandSubtitle: '品牌副标题', brandSignature: '品牌签名', homeHeadingDecoration: '首页标题装饰', composerMelody: '输入框装饰', sidebarProjectsTitle: '项目标题字体', sidebarTasksTitle: '任务标题字体', sidebarNavNewTask: '新建任务字体', sidebarNavPullRequests: '拉取请求字体', sidebarNavSites: '站点字体', sidebarNavScheduled: '已安排字体', sidebarNavPlugins: '插件字体'
}

interface RangeProps {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step: number
  suffix?: string
  displayScale?: number
  disabled?: boolean
  onChangeEnd?: () => void
}

export function Range({ label, value, onChange, min, max, step, suffix = '', displayScale = 1, disabled = false, onChangeEnd }: RangeProps): React.JSX.Element {
  const displayValue = value * displayScale
  const formattedValue = Number.isInteger(step * displayScale) ? displayValue.toFixed(0) : displayValue.toFixed(2)
  return <label className={disabled ? 'range-row is-disabled' : 'range-row'}><span>{label}</span><input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onInput={(event) => onChange(Number(event.currentTarget.value))} onPointerUp={onChangeEnd} onPointerCancel={onChangeEnd} onKeyUp={onChangeEnd} onBlur={onChangeEnd} /><output>{formattedValue}{suffix}</output></label>
}

export interface SolidColorControlProps {
  label: string
  value: string
  onChange: (value: string) => void
  onChangeEnd?: () => void
  token?: string
  disabled?: boolean
}

export function SolidColorControl({ label, value, onChange, onChangeEnd, token, disabled = false }: SolidColorControlProps): React.JSX.Element {
  const [input, setInput] = React.useState(value)
  React.useEffect(() => setInput(value), [value])
  const parsed = parse(value)
  const rgb = parsed ? converter('rgb')(parsed) : undefined
  const alpha = typeof rgb?.alpha === 'number' ? rgb.alpha : 1
  const pickerValue = parsed ? formatHex(parsed) ?? '#000000' : '#000000'

  const updateText = (nextInput: string): void => {
    setInput(nextInput)
    const next = parseCssColor(nextInput)
    if (next !== null) onChange(next)
  }
  const updatePicker = (hex: string): void => {
    const next = parse(hex)
    if (!next) return
    const withAlpha = { ...next, alpha }
    const formatted = alpha < 1 ? formatHex8(withAlpha) : formatHex(withAlpha)
    if (formatted) { setInput(formatted); onChange(formatted) }
  }
  const updateAlpha = (nextAlpha: number): void => {
    if (!rgb) return
    const formatted = formatRgb({ ...rgb, alpha: nextAlpha })
    if (formatted) { setInput(formatted); onChange(formatted) }
  }

  return (
    <div className={disabled ? 'solid-color-control is-disabled' : 'solid-color-control'} data-color-token={token}>
      <div className="solid-color-heading"><span>{label}</span><code>{Math.round(alpha * 100)}%</code></div>
      <div className="solid-color-row">
        <span className="color-swatch" style={{ background: value }}><input aria-label={`${label}色板`} type="color" value={pickerValue} disabled={disabled} onInput={(event) => updatePicker(event.currentTarget.value)} onPointerUp={onChangeEnd} onPointerCancel={onChangeEnd} onBlur={onChangeEnd} /></span>
        <input className="color-text-input" aria-label={`${label}颜色值`} value={input} disabled={disabled} aria-invalid={parseCssColor(input) === null} onInput={(event) => updateText(event.currentTarget.value)} onBlur={onChangeEnd} onKeyDown={(event) => { if (event.key === 'Enter') onChangeEnd?.() }} />
      </div>
      <input className="alpha-slider" aria-label={`${label}透明度`} type="range" min={0} max={1} step={.01} value={alpha} disabled={disabled} onInput={(event) => updateAlpha(Number(event.currentTarget.value))} onPointerUp={onChangeEnd} onPointerCancel={onChangeEnd} onKeyUp={onChangeEnd} onBlur={onChangeEnd} />
    </div>
  )
}

interface ThemeColorControlProps { colorKey: keyof ThemeColors; value: string; onChange: (value: string) => void; onChangeEnd?: () => void }

export function ThemeColorControl({ colorKey, value, onChange, onChangeEnd }: ThemeColorControlProps): React.JSX.Element {
  return <div data-color-key={colorKey}><SolidColorControl label={colorLabels[colorKey]} value={value} onChange={onChange} onChangeEnd={onChangeEnd} /></div>
}

interface AppearanceColorControlProps {
  token: AppearanceColorToken
  value: string
  onChange: (value: string) => void
  onChangeEnd?: () => void
}

export function AppearanceColorControl({ token, value, onChange, onChangeEnd }: AppearanceColorControlProps): React.JSX.Element {
  return <SolidColorControl token={token} label={APPEARANCE_COLOR_TOKENS[token].label} value={value} onChange={onChange} onChangeEnd={onChangeEnd} />
}

interface PaintControlProps {
  token?: AppearancePaintToken
  label?: string
  value: ThemePaint
  onChange: (paint: ThemePaint, continuous?: boolean) => void
  onChangeEnd?: () => void
}

export function PaintControl({ token, label: providedLabel, value, onChange, onChangeEnd }: PaintControlProps): React.JSX.Element {
  const label = providedLabel ?? (token ? APPEARANCE_PAINT_TOKENS[token].label : '颜色')
  const switchKind = (kind: ThemePaint['kind']): void => {
    if (kind === value.kind) return
    const color = value.kind === 'solid' ? value.color : value.stops[0]?.color ?? '#000000'
    if (kind === 'solid') onChange({ kind, color })
    else if (kind === 'linear') onChange({ kind, angle: 135, stops: [{ color, position: 0 }, { color, position: 1 }] })
    else onChange({ kind, center: { x: .5, y: .5 }, stops: [{ color, position: 0 }, { color, position: 1 }] })
  }
  const updateStop = (index: number, patch: Partial<ThemePaintStop>): void => {
    if (value.kind === 'solid') return
    const boundedPatch = patch.position === undefined ? patch : {
      ...patch,
      position: Math.min(value.stops[index + 1]?.position ?? 1, Math.max(value.stops[index - 1]?.position ?? 0, patch.position))
    }
    const stops = value.stops.map((stop, stopIndex) => stopIndex === index ? { ...stop, ...boundedPatch } : stop)
    onChange({ ...value, stops }, true)
  }
  const addStop = (): void => {
    if (value.kind === 'solid' || value.stops.length >= 8) return
    let insertion = { index: 1, gap: -1 }
    for (let index = 1; index < value.stops.length; index += 1) {
      const gap = value.stops[index]!.position - value.stops[index - 1]!.position
      if (gap > insertion.gap) insertion = { index, gap }
    }
    const before = value.stops[insertion.index - 1]!
    const after = value.stops[insertion.index]!
    const stops = [...value.stops]
    stops.splice(insertion.index, 0, { color: before.color, position: (before.position + after.position) / 2 })
    onChange({ ...value, stops })
  }
  const removeStop = (index: number): void => {
    if (value.kind === 'solid' || value.stops.length <= 2) return
    onChange({ ...value, stops: value.stops.filter((_, stopIndex) => stopIndex !== index) })
  }

  return (
    <section className="paint-control" data-paint-token={token}>
      <div className="paint-control-heading"><strong>{label}</strong><span className="paint-preview" style={{ background: paintPreview(value) }} /></div>
      <div className="segmented-control" aria-label={`${label}类型`}>
        {(['solid', 'linear', 'radial'] as const).map((kind) => <button type="button" className={value.kind === kind ? 'active' : ''} key={kind} onClick={() => switchKind(kind)}>{kind === 'solid' ? '纯色' : kind === 'linear' ? '线性' : '径向'}</button>)}
      </div>
      {value.kind === 'solid' && <SolidColorControl label="颜色" value={value.color} onChange={(color) => onChange({ kind: 'solid', color }, true)} onChangeEnd={onChangeEnd} />}
      {value.kind === 'linear' && <Range label="角度" min={0} max={360} step={1} suffix="°" value={value.angle} onChange={(angle) => onChange({ ...value, angle }, true)} onChangeEnd={onChangeEnd} />}
      {value.kind === 'radial' && <><Range label="中心 X" min={0} max={1} step={.01} value={value.center.x} onChange={(x) => onChange({ ...value, center: { ...value.center, x } }, true)} onChangeEnd={onChangeEnd} /><Range label="中心 Y" min={0} max={1} step={.01} value={value.center.y} onChange={(y) => onChange({ ...value, center: { ...value.center, y } }, true)} onChangeEnd={onChangeEnd} /></>}
      {value.kind !== 'solid' && <div className="gradient-stops">
        {value.stops.map((stop, index) => <div className="gradient-stop" key={index}>
          <SolidColorControl label={`色标 ${index + 1}`} value={stop.color} onChange={(color) => updateStop(index, { color })} onChangeEnd={onChangeEnd} />
          <Range label="位置" min={0} max={1} step={.01} value={stop.position} onChange={(position) => updateStop(index, { position })} onChangeEnd={onChangeEnd} />
          <button className="mini-icon-button" type="button" title="删除色标" disabled={value.stops.length <= 2} onClick={() => removeStop(index)}><Trash2 size={13} /></button>
        </div>)}
        <button className="add-stop-button" type="button" disabled={value.stops.length >= 8} onClick={addStop}><Plus size={13} />添加色标</button>
      </div>}
    </section>
  )
}

function paintPreview(paint: ThemePaint): string {
  if (paint.kind === 'solid') return paint.color
  const stops = paint.stops.map((stop) => `${stop.color} ${stop.position * 100}%`).join(',')
  return paint.kind === 'linear' ? `linear-gradient(${paint.angle}deg,${stops})` : `radial-gradient(circle at ${paint.center.x * 100}% ${paint.center.y * 100}%,${stops})`
}

interface FontControlProps {
  slot: TypographySlot
  profile: ThemeProfile
  onChange: (selection: FontSelection) => void
  onImport: () => void
}

export function FontControl({ slot, profile, onChange, onImport }: FontControlProps): React.JSX.Element {
  const selection = profile.typography.slots[slot]
  const value = selection.kind === 'inherit' ? 'inherit' : `${selection.kind}:${selection.id}`
  return <div className="font-control" data-font-slot={slot}><label><span>{typographyLabels[slot]}</span><select value={value} onChange={(event) => {
    const [kind, id] = event.currentTarget.value.split(':')
    if (kind === 'inherit') onChange({ kind: 'inherit' })
    else if (kind === 'builtin' && id && id in BUILTIN_FONTS) onChange({ kind: 'builtin', id: id as keyof typeof BUILTIN_FONTS })
    else if (kind === 'imported' && id) onChange({ kind: 'imported', id })
  }}>
    {slot !== 'ui' && <option value="inherit">继承全局界面字体</option>}
    <optgroup label="内置字体">{Object.entries(BUILTIN_FONTS).map(([id, font]) => <option key={id} value={`builtin:${id}`}>{font.label}</option>)}</optgroup>
    {profile.typography.importedFonts.length > 0 && <optgroup label="已导入字体">{profile.typography.importedFonts.map((font) => <option key={font.id} value={`imported:${font.id}`}>{font.family}</option>)}</optgroup>}
  </select></label><button className="tool-button" type="button" title={`为${typographyLabels[slot]}导入字体`} onClick={onImport}><Upload size={14} /></button></div>
}

interface ThemeIconControlProps { slot: IconSlot; profile: ThemeProfile; assets: Record<string, string>; onChange: (name: string) => void; onImport: () => void; highlighted?: boolean }

export function ThemeIconControl({ slot, profile, assets, onChange, onImport, highlighted = false }: ThemeIconControlProps): React.JSX.Element {
  const source = profile.icons[slot]
  const [open, setOpen] = React.useState(false)
  const pickerRef = React.useRef<HTMLDivElement>(null)
  const listId = `icon-picker-options-${slot}`

  React.useEffect(() => {
    if (!open) return undefined
    const closeOnOutsidePointer = (event: PointerEvent): void => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const currentName = source.kind === 'builtin' ? source.name : null
  const currentLabel = source.kind === 'asset' ? '自定义图片' : builtinIconLabels[source.name] ?? source.name
  const togglePicker = (): void => setOpen((value) => !value)
  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setOpen(true)
    }
  }

  return <div className={highlighted ? 'icon-slot inspector-highlight' : 'icon-slot'} data-icon-slot={slot} data-inspector-anchor={`icon-${slot}`} ref={pickerRef}>
    <span className="icon-preview"><RenderIcon slot={slot} profile={profile} assets={assets} /></span>
    <div className="icon-picker-field">
      <span>{iconLabels[slot]}</span>
      <div className="icon-picker">
        <button className="icon-picker-trigger" type="button" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} onClick={togglePicker} onKeyDown={handleTriggerKeyDown}>
          <span className="icon-picker-trigger-icon"><RenderIcon slot={slot} profile={profile} assets={assets} /></span>
          <span className="icon-picker-trigger-label">{currentLabel}</span>
          <ChevronDown size={13} aria-hidden="true" />
        </button>
        {open && <div className="icon-picker-menu" id={listId} role="listbox" aria-label={`${iconLabels[slot]}图标`}>
          <button className={source.kind === 'asset' ? 'icon-picker-option active' : 'icon-picker-option'} type="button" role="option" aria-selected={source.kind === 'asset'} data-icon-name="__asset" onClick={() => { onImport(); setOpen(false) }}>
            <span className="icon-picker-option-icon"><RenderIcon slot={slot} profile={{ ...profile, icons: { ...profile.icons, [slot]: { kind: 'builtin', name: 'image' } } }} assets={assets} /></span>
            <span>自定义图片</span>
          </button>
          {builtinIconOptions.map((name) => {
            const Icon = builtinIcons[name] ?? Sparkles
            return <button className={currentName === name ? 'icon-picker-option active' : 'icon-picker-option'} type="button" role="option" aria-selected={currentName === name} data-icon-name={name} key={name} onClick={() => { onChange(name); setOpen(false) }}>
              <span className="icon-picker-option-icon"><Icon size={16} aria-hidden="true" /></span>
              <span>{builtinIconLabels[name] ?? name}</span>
            </button>
          })}
        </div>}
      </div>
    </div>
    <button className="tool-button" type="button" title={source.kind === 'asset' ? `更换${iconLabels[slot]}图标` : `选择自定义${iconLabels[slot]}图标`} onClick={onImport}><Upload size={14} /></button>
  </div>
}

interface RenderIconProps { slot: IconSlot; profile: ThemeProfile; assets: Record<string, string>; injected?: boolean; fallbackGlyph?: string }

export function RenderIcon({ slot, profile, assets, injected = false, fallbackGlyph }: RenderIconProps): React.JSX.Element {
  const source = profile.icons[slot]
  if (source.kind === 'asset') return <img className="custom-icon" src={assets[source.asset]} alt="" />
  const fallbackBuiltin = HOME_ACTION_FALLBACK_BUILTINS[slot as keyof typeof HOME_ACTION_FALLBACK_BUILTINS]
  if (fallbackGlyph && source.name === fallbackBuiltin) return <span className="builtin-icon-glyph" aria-hidden="true">{fallbackGlyph}</span>
  if (injected) return <span className="builtin-icon-glyph" aria-hidden="true">{resolveBuiltinIconGlyph(source.name)}</span>
  const Icon = builtinIcons[source.name] ?? Sparkles
  return <Icon size={18} />
}
