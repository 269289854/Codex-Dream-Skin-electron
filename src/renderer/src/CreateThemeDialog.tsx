import * as React from 'react'
import { useLayoutEffect, useRef, useState } from 'react'
import { Check, Palette, Plus, X } from 'lucide-react'
import { DEFAULT_THEME_COLORS, THEME_COLOR_PRESETS, type CreateThemeInput, type ThemeColors } from '../../shared/theme'
import { ThemeColorControl } from './editor-controls'

const THEME_COLOR_KEYS = ['surface', 'ink', 'accent', 'pink', 'lavender', 'border', 'success', 'danger'] as const satisfies ReadonlyArray<keyof ThemeColors>

interface CreateThemeDialogProps {
  onClose: () => void
  onCreate: (input: CreateThemeInput) => Promise<void>
}

export function themeNameError(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return '主题名称不能为空。'
  if (trimmed.length > 80) return '主题名称不能超过 80 个字符。'
  return null
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

export function CreateThemeDialog({ onClose, onCreate }: CreateThemeDialogProps): React.JSX.Element {
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [paletteId, setPaletteId] = useState<string>(THEME_COLOR_PRESETS[0].id)
  const [colors, setColors] = useState<ThemeColors>({ ...DEFAULT_THEME_COLORS })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const submittingRef = useRef(false)
  const nameValidationError = themeNameError(name)
  const visibleError = (nameTouched && nameValidationError) || error

  const updateName = (value: string): void => {
    setName(value)
    setNameTouched(true)
    setError(null)
  }

  useLayoutEffect(() => {
    nameInputRef.current?.focus()
  }, [])

  const close = (): void => {
    if (!busy) onClose()
  }

  const selectPreset = (preset: (typeof THEME_COLOR_PRESETS)[number]): void => {
    if (busy) return
    setPaletteId(preset.id)
    setColors({ ...preset.colors })
    setError(null)
  }

  const submit = async (): Promise<void> => {
    if (busy || submittingRef.current) return
    setNameTouched(true)
    if (nameValidationError) return
    submittingRef.current = true
    setBusy(true)
    setError(null)
    try {
      await onCreate({ name: name.trim(), colors: { ...colors } })
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      submittingRef.current = false
      setBusy(false)
    }
  }

  return (
    <div className="theme-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
      <section className="theme-dialog create-theme-dialog" role="dialog" aria-modal="true" aria-labelledby="create-theme-title">
        <header><span><Palette size={16} /></span><h2 id="create-theme-title">新建主题</h2><button type="button" title="关闭" disabled={busy} onClick={close}><X size={16} /></button></header>
        <form onSubmit={(event) => { event.preventDefault(); void submit() }} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); close() } }}>
          <label className="theme-dialog-field"><span>主题名称</span><input ref={nameInputRef} type="text" autoFocus value={name} placeholder="新主题" maxLength={80} disabled={busy} aria-invalid={nameTouched && Boolean(nameValidationError)} aria-describedby={visibleError ? 'create-theme-error' : undefined} onInput={(event) => updateName(event.currentTarget.value)} onChange={(event) => updateName(event.currentTarget.value)} /></label>
          <fieldset className="create-theme-palettes" disabled={busy}>
            <legend>主题配色</legend>
            <div className="create-theme-palette-grid" role="radiogroup" aria-label="主题配色">
              {THEME_COLOR_PRESETS.map((preset) => <button className={paletteId === preset.id ? 'create-theme-palette active' : 'create-theme-palette'} type="button" role="radio" aria-checked={paletteId === preset.id} key={preset.id} onClick={() => selectPreset(preset)}>
                <span className="create-theme-palette-name">{preset.name}</span>
                <span className="create-theme-palette-swatches" aria-hidden="true">{THEME_COLOR_KEYS.map((key) => <span key={key} style={{ background: preset.colors[key] }} />)}</span>
                {paletteId === preset.id && <Check className="create-theme-palette-check" size={13} aria-hidden="true" />}
              </button>)}
              <button className={paletteId === 'custom' ? 'create-theme-palette active' : 'create-theme-palette'} type="button" role="radio" aria-checked={paletteId === 'custom'} onClick={() => { setPaletteId('custom'); setError(null) }}>
                <span className="create-theme-palette-name"><Palette size={13} />自定义</span>
                <span className="create-theme-palette-swatches" aria-hidden="true">{THEME_COLOR_KEYS.map((key) => <span key={key} style={{ background: colors[key] }} />)}</span>
                {paletteId === 'custom' && <Check className="create-theme-palette-check" size={13} aria-hidden="true" />}
              </button>
            </div>
          </fieldset>
          {paletteId === 'custom' && <section className="create-theme-custom-colors" aria-label="自定义颜色">
            {THEME_COLOR_KEYS.map((key) => <div className="create-theme-color" key={key}><ThemeColorControl colorKey={key} value={colors[key]} onChange={(value) => setColors((current) => ({ ...current, [key]: value }))} /></div>)}
          </section>}
          {visibleError && <p className="theme-dialog-error" id="create-theme-error" role="alert">{visibleError}</p>}
          <footer><button className="secondary-command" type="button" disabled={busy} onClick={close}>取消</button><button className="primary-button" type="submit" disabled={Boolean(nameValidationError) || busy} onClick={(event) => { event.preventDefault(); void submit() }}><Plus size={14} />{busy ? '创建中' : '创建主题'}</button></footer>
        </form>
      </section>
    </div>
  )
}
