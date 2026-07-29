import { describe, expect, it } from 'vitest'
import { studioPlatformLabel } from '../src/renderer/src/platform-ui'

describe('Studio platform presentation', () => {
  it('uses platform-specific editor labels without changing runtime contracts', () => {
    expect(studioPlatformLabel('win32')).toBe('Windows Theme Editor')
    expect(studioPlatformLabel('darwin')).toBe('macOS Theme Editor')
    expect(studioPlatformLabel('linux')).toBe('Theme Editor')
    expect(studioPlatformLabel(null)).toBe('Theme Editor')
  })
})
