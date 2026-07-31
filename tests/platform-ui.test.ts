import { describe, expect, it } from 'vitest'
import { appUpdateDisabledMessage, studioPlatformLabel } from '../src/renderer/src/platform-ui'
import { translate } from '../src/shared/i18n'

describe('Studio platform presentation', () => {
  it('uses platform-specific editor labels without changing runtime contracts', () => {
    expect(studioPlatformLabel('win32')).toBe('Windows 主题编辑器')
    expect(studioPlatformLabel('darwin')).toBe('macOS 主题编辑器')
    expect(studioPlatformLabel('linux')).toBe('主题编辑器')
    expect(studioPlatformLabel(null)).toBe('主题编辑器')
    expect(translate('en-US', studioPlatformLabel('win32'))).toBe('Windows Theme Editor')
    expect(translate('en-US', studioPlatformLabel('darwin'))).toBe('macOS Theme Editor')
  })

  it('explains that macOS automatic updates are unavailable', () => {
    expect(appUpdateDisabledMessage('darwin')).toBe('macOS 版暂不支持自动更新')
    expect(appUpdateDisabledMessage('win32')).toBe('仅安装版支持检查更新')
  })
})
