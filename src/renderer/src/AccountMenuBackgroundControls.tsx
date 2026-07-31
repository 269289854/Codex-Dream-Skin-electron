import * as React from 'react'
import { Image, Trash2, Upload } from 'lucide-react'
import type { MediaSelectionKind } from '../../shared/contracts'
import { resolveAppearancePaint } from '../../shared/appearance'
import type { ThemeProfile } from '../../shared/theme'
import { t } from '../../shared/i18n'
import { PaintControl, Range } from './editor-controls'

interface AccountMenuBackgroundControlsProps {
  profile: ThemeProfile
  backgroundUrl?: string
  mediaBusy?: boolean
  onChange: (mutator: (profile: ThemeProfile) => void, historyGroup?: string) => void
  onInteractionEnd: () => void
  onSelectMedia: (kind: MediaSelectionKind) => void
}

const modes: Array<{ value: ThemeProfile['accountMenuBackground']['mode']; label: string }> = [
  { value: 'color', label: '颜色' },
  { value: 'image', label: '图片' },
  { value: 'gif', label: 'GIF' }
]

export function AccountMenuBackgroundControls({ profile, backgroundUrl, mediaBusy = false, onChange, onInteractionEnd, onSelectMedia }: AccountMenuBackgroundControlsProps): React.JSX.Element {
  const background = profile.accountMenuBackground
  const mediaMode = background.mode === 'image' || background.mode === 'gif'
  const chooseMode = (mode: ThemeProfile['accountMenuBackground']['mode']): void => {
    if (mode === 'color') {
      onChange((next) => {
        next.accountMenuBackground.mode = 'color'
        next.accountMenuBackground.source = null
      })
      return
    }
    onSelectMedia(mode)
  }

  return <div className="account-menu-background-controls">
    <div className="segmented-control account-menu-background-modes" aria-label={t('账号菜单背景类型')}>
      {modes.map((mode) => <button type="button" key={mode.value} className={background.mode === mode.value ? 'active' : ''} onClick={() => chooseMode(mode.value)}>{t(mode.label)}</button>)}
    </div>
    {background.mode === 'color' && <PaintControl label="菜单底色" value={resolveAppearancePaint(profile.appearance, profile.colors, 'accountMenuSurface')} onChange={(paint, continuous) => onChange((next) => { next.appearance.paints.accountMenuSurface = paint }, continuous ? 'account-menu-background-paint' : undefined)} onChangeEnd={onInteractionEnd} />}
    {mediaMode && <>
      <button className="asset-picker account-menu-background-asset-picker" type="button" disabled={mediaBusy} onClick={() => onSelectMedia(background.mode === 'image' ? 'image' : 'gif')}>
        {backgroundUrl ? <img src={backgroundUrl} alt={t('账号菜单背景预览')} /> : <Image size={20} />}
        <span><Upload size={13} />{t(backgroundUrl ? '更换背景素材' : '选择背景素材')}</span>
      </button>
      {background.source && <button className="secondary-command account-menu-background-remove" type="button" onClick={() => onChange((next) => { next.accountMenuBackground.mode = 'color'; next.accountMenuBackground.source = null })}><Trash2 size={14} />{t('移除背景素材')}</button>}
      <Range label="水平焦点" min={0} max={1} step={.01} value={background.focus.x} displayScale={100} suffix="%" onChange={(value) => onChange((next) => { next.accountMenuBackground.focus.x = value }, 'account-menu-background-focus-x')} onChangeEnd={onInteractionEnd} />
      <Range label="垂直焦点" min={0} max={1} step={.01} value={background.focus.y} displayScale={100} suffix="%" onChange={(value) => onChange((next) => { next.accountMenuBackground.focus.y = value }, 'account-menu-background-focus-y')} onChangeEnd={onInteractionEnd} />
      <Range label="缩放" min={1} max={3} step={.01} value={background.scale} onChange={(value) => onChange((next) => { next.accountMenuBackground.scale = value }, 'account-menu-background-scale')} onChangeEnd={onInteractionEnd} />
      <Range label="背景透明度" min={0} max={1} step={.01} value={background.opacity} onChange={(value) => onChange((next) => { next.accountMenuBackground.opacity = value }, 'account-menu-background-opacity')} onChangeEnd={onInteractionEnd} />
    </>}
  </div>
}
