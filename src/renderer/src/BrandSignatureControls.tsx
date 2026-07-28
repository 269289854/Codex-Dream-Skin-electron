import * as React from 'react'
import { Image, Trash2, Upload } from 'lucide-react'
import type { ThemeProfile } from '../../shared/theme'
import { Range } from './editor-controls'

interface BrandSignatureControlsProps {
  profile: ThemeProfile
  assets: Record<string, string>
  mediaBusy?: boolean
  onChange: (mutator: (profile: ThemeProfile) => void, historyGroup?: string) => void
  onInteractionEnd: () => void
  onSelectMedia: (mode: 'image' | 'gif') => void
}

export function BrandSignatureControls({ profile, assets, mediaBusy = false, onChange, onInteractionEnd, onSelectMedia }: BrandSignatureControlsProps): React.JSX.Element {
  const config = profile.brandSignature
  const mediaUrl = config.source ? assets[config.source.asset] : undefined
  const sourceMode = config.source?.mimeType === 'image/gif' ? 'gif' : config.source?.kind === 'image' ? 'image' : null
  const activeMediaMode = config.mode === 'gif' ? 'gif' : 'image'
  const mediaLabel = activeMediaMode === 'gif' ? 'GIF' : '图片'
  const selectMedia = (mode: 'image' | 'gif'): void => {
    if (sourceMode === mode) onChange((next) => { next.brandSignature.mode = mode })
    else onSelectMedia(mode)
  }

  return <div className="brand-signature-controls">
    <div className="segmented-control brand-signature-modes" aria-label="品牌签名内容">
      <button className={config.mode === 'text' ? 'active' : ''} type="button" onClick={() => onChange((next) => { next.brandSignature.mode = 'text' })}>文字</button>
      <button className={config.mode === 'image' ? 'active' : ''} type="button" disabled={mediaBusy} onClick={() => selectMedia('image')}>图片</button>
      <button className={config.mode === 'gif' ? 'active' : ''} type="button" disabled={mediaBusy} onClick={() => selectMedia('gif')}>GIF</button>
    </div>
    {config.mode !== 'text' && <>
      <button className="asset-picker brand-signature-asset-picker" type="button" disabled={mediaBusy} onClick={() => onSelectMedia(activeMediaMode)}>
        {mediaUrl ? <img src={mediaUrl} alt={`品牌签名${mediaLabel}`} /> : <Image size={20} />}
        <span><Upload size={13} />{mediaUrl ? `更换${mediaLabel}` : `选择${mediaLabel}`}</span>
      </button>
      <Range label={`${mediaLabel}宽度`} min={32} max={190} step={1} suffix="px" value={config.mediaWidth} onChange={(mediaWidth) => onChange((next) => { next.brandSignature.mediaWidth = mediaWidth }, 'brand-signature-media-width')} onChangeEnd={onInteractionEnd} />
      {config.source && <button className="secondary-command brand-signature-remove" type="button" onClick={() => onChange((next) => { next.brandSignature.source = null; next.brandSignature.mode = 'text' })}><Trash2 size={14} />移除{mediaLabel}</button>}
    </>}
  </div>
}
