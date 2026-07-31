import * as React from 'react'
import { t } from '../../shared/i18n'
import type { ThemeProfile } from '../../shared/theme'

interface MediaFlipControlsProps {
  value: ThemeProfile['hero']['mediaTransform']
  onChange: (field: 'flipHorizontal' | 'flipVertical', value: boolean) => void
}

export function MediaFlipControls({ value, onChange }: MediaFlipControlsProps): React.JSX.Element {
  return <div className="media-flip-controls">
    <label className="toggle-row"><span>{t('水平翻转')}</span><input type="checkbox" checked={value.flipHorizontal} onChange={(event) => onChange('flipHorizontal', event.currentTarget.checked)} /></label>
    <label className="toggle-row"><span>{t('垂直翻转')}</span><input type="checkbox" checked={value.flipVertical} onChange={(event) => onChange('flipVertical', event.currentTarget.checked)} /></label>
  </div>
}
