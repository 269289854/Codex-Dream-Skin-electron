import { describe, expect, it } from 'vitest'
import { appUpdateDisabledMessage, studioPlatformLabel } from '../src/renderer/src/platform-ui'

describe('Studio platform presentation', () => {
  it('uses platform-specific editor labels without changing runtime contracts', () => {
    expect(studioPlatformLabel('win32')).toBe('Windows Theme Editor')
    expect(studioPlatformLabel('darwin')).toBe('macOS Theme Editor')
    expect(studioPlatformLabel('linux')).toBe('Theme Editor')
    expect(studioPlatformLabel(null)).toBe('Theme Editor')
  })

  it('explains that macOS automatic updates are unavailable', () => {
    expect(appUpdateDisabledMessage('darwin')).toBe('macOS 版暂不支持自动更新')
    expect(appUpdateDisabledMessage('win32')).toBe('仅安装版支持检查更新')
  })
})
