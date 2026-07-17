import * as React from 'react'
import { Box, Image, PanelRightOpen, RotateCcw, Type, Upload, X } from 'lucide-react'
import {
  APPEARANCE_COLOR_TOKENS,
  APPEARANCE_PAINT_TOKENS,
  resolveAppearanceColor,
  resolveAppearancePaint,
  type AppearanceState
} from '../../shared/appearance'
import { headingTemplateError } from '../../shared/home-layout'
import type { ThemeProfile } from '../../shared/theme'
import { AppearanceColorControl, FontControl, PaintControl, Range, ThemeIconControl } from './editor-controls'
import type { PopoverPosition, PreviewCopyField, PreviewTargetDefinition, TypographySlot } from './preview-editing'

const copyFieldConfig: Record<PreviewCopyField, { label: string; maxLength: number; rows?: number }> = {
  headingTemplate: { label: '首页标题', maxLength: 120 },
  subtitle: { label: '副标题', maxLength: 160, rows: 3 },
  brandTitle: { label: '品牌主标题', maxLength: 80 },
  brandSubtitle: { label: '品牌副标题', maxLength: 120, rows: 2 },
  brandSignature: { label: '品牌签名', maxLength: 32 }
}

interface PreviewQuickEditorProps {
  target: PreviewTargetDefinition
  profile: ThemeProfile
  assets: Record<string, string>
  heroUrl?: string
  polaroidUrl?: string
  position: PopoverPosition | null
  popoverRef: React.RefObject<HTMLDivElement | null>
  onChange: (mutator: (profile: ThemeProfile) => void, historyGroup?: string) => void
  onInteractionEnd: () => void
  onSelectImage: (purpose: 'hero' | 'polaroid') => void
  onImportIcon: (slot: keyof ThemeProfile['icons']) => void
  onImportFont: (slot: TypographySlot) => void
  onStateChange: (state: AppearanceState) => void
  onMore: (destination?: 'font' | 'icon') => void
  onClose: () => void
}

export function PreviewQuickEditor({ target, profile, assets, heroUrl, polaroidUrl, position, popoverRef, onChange, onInteractionEnd, onSelectImage, onImportIcon, onImportFont, onStateChange, onMore, onClose }: PreviewQuickEditorProps): React.JSX.Element {
  const editor = target.editor
  const [state, setState] = React.useState<AppearanceState>('normal')
  React.useEffect(() => { setState('normal'); onStateChange('normal') }, [target, onStateChange])
  const copyField = editor.kind === 'style' ? editor.copyField : undefined
  const copyConfig = copyField ? copyFieldConfig[copyField] : null
  const copyInvalid = copyField && copyConfig ? (
    profile.copy[copyField].length > copyConfig.maxLength ||
    (copyField === 'headingTemplate' && Boolean(headingTemplateError(profile.copy.headingTemplate))) ||
    (copyField === 'brandTitle' && !profile.copy.brandTitle.trim())
  ) : false
  const states = editor.kind === 'style' ? availableStates(editor.colors, editor.paints) : ['normal'] as AppearanceState[]
  const updateCopy = (field: PreviewCopyField, value: string): void => onChange((next) => { next.copy[field] = value }, `copy-${field}`)

  return <section ref={popoverRef} className={position ? 'preview-edit-popover' : 'preview-edit-popover measuring'} data-placement={position?.placement ?? 'right'} role="dialog" aria-label={`${target.label}快捷配置`} style={{ left: position?.left ?? 0, top: position?.top ?? 0 }}>
    <header className="preview-edit-popover-header"><div><span>QUICK EDIT</span><strong>{target.label}</strong></div><button className="preview-edit-close" type="button" title="关闭快捷配置" onClick={onClose}><X size={16} /></button></header>
    {states.length > 1 && <div className="state-tabs segmented-control" aria-label="组件状态">{states.map((item) => <button type="button" className={state === item ? 'active' : ''} key={item} onClick={() => { setState(item); onStateChange(item) }}>{item === 'normal' ? '普通' : item === 'hover' ? '悬停' : '选中'}</button>)}</div>}
    <div className="preview-edit-popover-body">
      {copyField && copyConfig && <label className="quick-copy-field">{copyConfig.label}{copyConfig.rows
        ? <textarea value={profile.copy[copyField]} maxLength={copyConfig.maxLength} rows={copyConfig.rows} aria-invalid={copyInvalid} onInput={(event) => updateCopy(copyField, event.currentTarget.value)} onBlur={onInteractionEnd} />
        : <input value={profile.copy[copyField]} maxLength={copyConfig.maxLength} aria-invalid={copyInvalid} onInput={(event) => updateCopy(copyField, event.currentTarget.value)} onBlur={onInteractionEnd} />}</label>}
      {copyField === 'brandTitle' && copyInvalid && <p className="field-error">品牌主标题不能为空。</p>}

      {editor.kind === 'hero' && <><button className="quick-asset-command" type="button" onClick={() => onSelectImage('hero')}>{heroUrl ? <img src={heroUrl} alt="主视觉" /> : <Image size={20} />}<span><Upload size={13} />{heroUrl ? '更换图片' : '选择图片'}</span></button><Range label="缩放" min={.5} max={3} step={.01} value={profile.hero.scale} onChange={(value) => onChange((next) => { next.hero.scale = value }, 'hero-scale')} onChangeEnd={onInteractionEnd} /></>}
      {editor.kind === 'polaroid' && <><label className="toggle-row"><span>显示拍立得</span><input type="checkbox" checked={profile.polaroid.visible} onChange={(event) => { const visible = event.currentTarget.checked; onChange((next) => { next.polaroid.visible = visible }) }} /></label><button className="secondary-command" type="button" onClick={() => onSelectImage('polaroid')}><Image size={15} />{polaroidUrl ? '更换拍立得原图' : '选择拍立得原图'}</button><Range label="宽度" min={.08} max={.6} step={.01} value={profile.polaroid.placement.width} onChange={(value) => onChange((next) => { next.polaroid.placement.width = value }, 'polaroid-width')} onChangeEnd={onInteractionEnd} /><Range label="旋转" min={-45} max={45} step={1} value={profile.polaroid.placement.rotation} onChange={(value) => onChange((next) => { next.polaroid.placement.rotation = value }, 'polaroid-rotation')} onChangeEnd={onInteractionEnd} suffix="°" /></>}

      {editor.kind === 'style' && editor.colors.filter((token) => tokenState(APPEARANCE_COLOR_TOKENS[token].state) === state).map((token) => <div className="token-control" key={token}><AppearanceColorControl token={token} value={resolveAppearanceColor(profile.appearance, profile.colors, token)} onChange={(value) => onChange((next) => { next.appearance.colors[token] = value }, `color-${token}`)} onChangeEnd={onInteractionEnd} />{profile.appearance.colors[token] && <button className="reset-token" type="button" title="恢复主题默认值" onClick={() => onChange((next) => { delete next.appearance.colors[token] })}><RotateCcw size={12} /></button>}</div>)}
      {editor.kind === 'style' && editor.paints.filter((token) => tokenState(APPEARANCE_PAINT_TOKENS[token].state) === state).map((token) => <div className="token-control" key={token}><PaintControl token={token} value={resolveAppearancePaint(profile.appearance, profile.colors, token)} onChange={(paint, continuous) => onChange((next) => { next.appearance.paints[token] = paint }, continuous ? `paint-${token}` : undefined)} onChangeEnd={onInteractionEnd} />{profile.appearance.paints[token] && <button className="reset-token" type="button" title="恢复主题默认值" onClick={() => onChange((next) => { delete next.appearance.paints[token] })}><RotateCcw size={12} /></button>}</div>)}
      {editor.kind === 'style' && editor.fontSlot && <FontControl slot={editor.fontSlot} profile={profile} onChange={(selection) => onChange((next) => { assignFontSlot(next, editor.fontSlot!, selection) })} onImport={() => onImportFont(editor.fontSlot!)} />}
      {editor.kind === 'style' && editor.iconSlot && <div className="icon-editor quick-icon-editor"><ThemeIconControl slot={editor.iconSlot} profile={profile} assets={assets} onChange={(name) => onChange((next) => { next.icons[editor.iconSlot!] = { kind: 'builtin', name } })} onImport={() => onImportIcon(editor.iconSlot!)} /></div>}
    </div>
    <footer className="preview-edit-popover-footer">
      <button type="button" onClick={() => onMore()}><PanelRightOpen size={15} />更多设置</button>
      {editor.kind === 'style' && editor.fontSlot && <button type="button" onClick={() => onMore('font')}><Type size={15} />字体管理</button>}
      {editor.kind === 'style' && editor.iconSlot && <button type="button" onClick={() => onMore('icon')}><Box size={15} />图标设置</button>}
    </footer>
  </section>
}

function tokenState(state: AppearanceState | undefined): AppearanceState { return state ?? 'normal' }

function availableStates(colors: readonly (keyof typeof APPEARANCE_COLOR_TOKENS)[], paints: readonly (keyof typeof APPEARANCE_PAINT_TOKENS)[]): AppearanceState[] {
  const found = new Set<AppearanceState>(['normal'])
  for (const token of colors) found.add(tokenState(APPEARANCE_COLOR_TOKENS[token].state))
  for (const token of paints) found.add(tokenState(APPEARANCE_PAINT_TOKENS[token].state))
  return (['normal', 'hover', 'selected'] as const).filter((state) => found.has(state))
}

function assignFontSlot(profile: ThemeProfile, slot: TypographySlot, selection: ThemeProfile['typography']['slots'][TypographySlot]): void {
  if (slot === 'ui' && selection.kind === 'inherit') return
  if (slot === 'ui') profile.typography.slots.ui = selection as ThemeProfile['typography']['slots']['ui']
  else profile.typography.slots[slot] = selection
}
