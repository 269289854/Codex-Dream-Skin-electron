import { describe, expect, it } from 'vitest'
import { createDefaultTheme, parseThemeProfile } from '../src/shared/theme'
import { compileTheme } from '../src/main/theme-compiler'

const id = '11111111-1111-4111-8111-111111111111'

describe('theme schema and compiler', () => {
  it('validates current themes and migrates version zero colors', () => {
    expect(parseThemeProfile(createDefaultTheme(id)).version).toBe(1)
    const migrated = parseThemeProfile({ id, name: '旧主题', version: 0, colors: { accent: '#123456' } })
    expect(migrated.version).toBe(1)
    expect(migrated.colors.accent).toBe('#123456')
    expect(migrated.colors.surface).toBe('#F7FFFF')
    expect(() => parseThemeProfile({ ...migrated, colors: { ...migrated.colors, accent: 'red' } })).toThrow()
  })

  it('compiles deterministic CSS and escapes payload markup', async () => {
    const profile = createDefaultTheme(id)
    profile.hero.sourceImage = 'assets/hero.png'
    const compiled = await compileTheme(profile, async () => 'data:image/png;base64,PHNjcmlwdD4=')
    expect(compiled.css).toContain('--dream-accent: #20BCC3')
    expect(compiled.css).toContain('background-image: url("data:image/png;base64,PHNjcmlwdD4=")')
    expect(compiled.rendererPayload).not.toContain('<')
    expect(await compileTheme(profile, async () => 'data:image/png;base64,PHNjcmlwdD4=')).toEqual(compiled)
  })
})
