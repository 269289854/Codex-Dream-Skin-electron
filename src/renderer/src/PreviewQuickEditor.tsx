import * as React from 'react'
import { Image, PanelRightOpen, Upload, X } from 'lucide-react'
import { headingTemplateError } from '../../shared/home-layout'
import type { ThemeProfile } from '../../shared/theme'
import { Range, ThemeColorControl, ThemeIconControl } from './editor-controls'
import type { PopoverPosition, PreviewTargetDefinition } from './preview-editing'

interface PreviewQuickEditorProps {
  target: PreviewTargetDefinition
  profile: ThemeProfile
  assets: Record<string, string>
  heroUrl?: string
  polaroidUrl?: string
  position: PopoverPosition | null
  popoverRef: React.RefObject<HTMLDivElement | null>
  onChange: (mutator: (profile: ThemeProfile) => void) => void
  onSelectImage: (purpose: 'hero' | 'polaroid') => void
  onImportIcon: (slot: keyof ThemeProfile['icons']) => void
  onMore: () => void
  onClose: () => void
}

export function PreviewQuickEditor({
  target,
  profile,
  assets,
  heroUrl,
  polaroidUrl,
  position,
  popoverRef,
  onChange,
  onSelectImage,
  onImportIcon,
  onMore,
  onClose
}: PreviewQuickEditorProps): React.JSX.Element {
  const editor = target.editor
  return (
    <section
      ref={popoverRef}
      className={position ? 'preview-edit-popover' : 'preview-edit-popover measuring'}
      data-placement={position?.placement ?? 'right'}
      role="dialog"
      aria-label={`${target.label}快捷配置`}
      style={{ left: position?.left ?? 0, top: position?.top ?? 0 }}
    >
      <header className="preview-edit-popover-header">
        <div><span>QUICK EDIT</span><strong>{target.label}</strong></div>
        <button className="preview-edit-close" type="button" title="关闭快捷配置" onClick={onClose}><X size={16} /></button>
      </header>
      <div className="preview-edit-popover-body">
        {editor.kind === 'copy' && editor.field === 'headingTemplate' && (
          <label className="quick-copy-field">首页标题
            <input
              value={profile.copy.headingTemplate}
              maxLength={120}
              aria-invalid={Boolean(headingTemplateError(profile.copy.headingTemplate))}
              onChange={(event) => onChange((next) => { next.copy.headingTemplate = event.target.value })}
            />
          </label>
        )}
        {editor.kind === 'copy' && editor.field === 'subtitle' && (
          <label className="quick-copy-field">副标题
            <textarea value={profile.copy.subtitle} maxLength={160} rows={3} onChange={(event) => onChange((next) => { next.copy.subtitle = event.target.value })} />
          </label>
        )}
        {editor.kind === 'hero' && <>
          <button className="quick-asset-command" type="button" onClick={() => onSelectImage('hero')}>
            {heroUrl ? <img src={heroUrl} alt="主视觉" /> : <Image size={20} />}
            <span><Upload size={13} />{heroUrl ? '更换图片' : '选择图片'}</span>
          </button>
          <Range label="缩放" min={.5} max={3} step={.01} value={profile.hero.scale} onChange={(value) => onChange((next) => { next.hero.scale = value })} />
        </>}
        {editor.kind === 'polaroid' && <>
          <label className="toggle-row"><span>显示拍立得</span><input type="checkbox" checked={profile.polaroid.visible} onChange={(event) => onChange((next) => { next.polaroid.visible = event.target.checked })} /></label>
          <button className="secondary-command" type="button" onClick={() => onSelectImage('polaroid')}><Image size={15} />{polaroidUrl ? '更换拍立得原图' : '选择拍立得原图'}</button>
          <Range label="宽度" min={.08} max={.6} step={.01} value={profile.polaroid.placement.width} onChange={(value) => onChange((next) => { next.polaroid.placement.width = value })} />
          <Range label="旋转" min={-45} max={45} step={1} value={profile.polaroid.placement.rotation} onChange={(value) => onChange((next) => { next.polaroid.placement.rotation = value })} suffix="°" />
        </>}
        {editor.kind === 'palette' && (
          <div className="color-grid quick-color-grid">
            {editor.colors.map((colorKey) => <ThemeColorControl key={colorKey} colorKey={colorKey} value={profile.colors[colorKey]} onChange={(value) => onChange((next) => { next.colors[colorKey] = value })} />)}
          </div>
        )}
        {editor.kind === 'icon' && (
          <div className="icon-editor quick-icon-editor">
            <ThemeIconControl
              slot={editor.slot}
              profile={profile}
              assets={assets}
              onChange={(name) => onChange((next) => { next.icons[editor.slot] = { kind: 'builtin', name } })}
              onImport={() => onImportIcon(editor.slot)}
            />
          </div>
        )}
      </div>
      <footer className="preview-edit-popover-footer">
        <button type="button" onClick={onMore}><PanelRightOpen size={15} />更多设置</button>
      </footer>
    </section>
  )
}
