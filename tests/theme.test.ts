import { describe, expect, it } from 'vitest'
import { DEFAULT_HOME_COPY, HOME_ACTIONS, PROJECT_PLACEHOLDER, splitHeadingTemplate } from '../src/shared/home-layout'
import { createDefaultTheme, parseThemeProfile } from '../src/shared/theme'
import { compileTheme } from '../src/main/theme-compiler'
import { buildDynamicThemeCss } from '../src/main/codex-service'

const id = '11111111-1111-4111-8111-111111111111'

describe('theme schema and compiler', () => {
  it('validates current themes and migrates version zero, one, and two profiles', () => {
    const current = createDefaultTheme(id)
    expect(parseThemeProfile(current).version).toBe(3)

    const { visible: _visibleTwo, ...versionTwoPolaroid } = current.polaroid
    const versionTwo = { ...current, version: 2, polaroid: versionTwoPolaroid }
    const migratedTwo = parseThemeProfile(versionTwo)
    expect(migratedTwo.version).toBe(3)
    expect(migratedTwo.polaroid.visible).toBe(true)

    const { copy: _copy, ...versionOneFields } = current
    const { visible: _visibleOne, ...versionOnePolaroid } = versionOneFields.polaroid
    const versionOne = { ...versionOneFields, version: 1, name: '已有主题', polaroid: versionOnePolaroid }
    const migratedOne = parseThemeProfile(versionOne)
    expect(migratedOne.version).toBe(3)
    expect(migratedOne.name).toBe('已有主题')
    expect(migratedOne.copy).toEqual(DEFAULT_HOME_COPY)
    expect(migratedOne.hero).toEqual(current.hero)

    const migratedZero = parseThemeProfile({ id, name: '旧主题', version: 0, colors: { accent: '#123456' } })
    expect(migratedZero.version).toBe(3)
    expect(migratedZero.colors.accent).toBe('#123456')
    expect(migratedZero.colors.surface).toBe('#F7FFFF')
    expect(migratedZero.copy).toEqual(DEFAULT_HOME_COPY)
    expect(migratedZero.polaroid.visible).toBe(true)
    expect(() => parseThemeProfile({ ...migratedZero, colors: { ...migratedZero.colors, accent: 'red' } })).toThrow()
  })

  it('requires exactly one project placeholder and permits an empty subtitle', () => {
    const profile = createDefaultTheme(id)
    profile.copy.subtitle = ''
    expect(parseThemeProfile(profile).copy.subtitle).toBe('')
    expect(splitHeadingTemplate(`在 ${PROJECT_PLACEHOLDER} 中继续`)).toEqual({ before: '在 ', after: ' 中继续' })

    expect(() => parseThemeProfile({ ...profile, copy: { ...profile.copy, headingTemplate: '今天构建什么？' } })).toThrow()
    expect(() => parseThemeProfile({ ...profile, copy: { ...profile.copy, headingTemplate: `${PROJECT_PLACEHOLDER} ${PROJECT_PLACEHOLDER}` } })).toThrow()
    expect(() => parseThemeProfile({ ...profile, copy: { ...profile.copy, headingTemplate: `${PROJECT_PLACEHOLDER}${'字'.repeat(121)}` } })).toThrow()
  })

  it('compiles deterministic CSS and escapes payload markup', async () => {
    const profile = createDefaultTheme(id)
    profile.hero.sourceImage = 'assets/hero.png'
    profile.copy.headingTemplate = '<b>{project}</b>'
    const compiled = await compileTheme(profile, async () => 'data:image/png;base64,PHNjcmlwdD4=')
    expect(compiled.css).toContain('--dream-accent: #20BCC3')
    expect(compiled.css).toContain('background-image: url("data:image/png;base64,PHNjcmlwdD4=")')
    expect(compiled.rendererPayload).not.toContain('<')
    expect(compiled.rendererPayload).toContain('headingTemplate')
    expect(compiled.rendererPayload).toContain('\\u003cb>')
    expect(compiled.rendererPayload).toContain(JSON.stringify(HOME_ACTIONS[0].label).slice(1, -1))
    expect(await compileTheme(profile, async () => 'data:image/png;base64,PHNjcmlwdD4=')).toEqual(compiled)
  })

  it('hides the polaroid in compiled and runtime CSS without clearing its source', async () => {
    const profile = createDefaultTheme(id)
    profile.polaroid.visible = false
    profile.polaroid.sourceImage = 'assets/polaroid.png'
    profile.polaroid.sourceSize = { width: 800, height: 1000 }
    const dataUrl = 'data:image/png;base64,AAECAwQ='

    const compiled = await compileTheme(profile, async () => dataUrl)
    expect(compiled.css).toMatch(/\.dream-polaroid[^}]+display: none !important/)
    expect(compiled.assets['assets/polaroid.png']).toBe(dataUrl)
    expect(buildDynamicThemeCss(profile, compiled.assets)).toContain('#codex-dream-skin-chrome .dream-polaroid { display: none !important; }')
  })
})
