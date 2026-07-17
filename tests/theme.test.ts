import { describe, expect, it } from 'vitest'
import { DEFAULT_HOME_COPY, HOME_ACTIONS, PROJECT_PLACEHOLDER, splitHeadingTemplate } from '../src/shared/home-layout'
import { createDefaultTheme, parseThemeProfile } from '../src/shared/theme'
import { compileTheme } from '../src/main/theme-compiler'

const id = '11111111-1111-4111-8111-111111111111'

describe('theme schema and compiler', () => {
  it('validates current themes and migrates version zero and one profiles', () => {
    const current = createDefaultTheme(id)
    expect(parseThemeProfile(current).version).toBe(2)

    const { copy: _copy, ...versionOneFields } = current
    const versionOne = { ...versionOneFields, version: 1, name: '已有主题' }
    const migratedOne = parseThemeProfile(versionOne)
    expect(migratedOne.version).toBe(2)
    expect(migratedOne.name).toBe('已有主题')
    expect(migratedOne.copy).toEqual(DEFAULT_HOME_COPY)
    expect(migratedOne.hero).toEqual(current.hero)

    const migratedZero = parseThemeProfile({ id, name: '旧主题', version: 0, colors: { accent: '#123456' } })
    expect(migratedZero.version).toBe(2)
    expect(migratedZero.colors.accent).toBe('#123456')
    expect(migratedZero.colors.surface).toBe('#F7FFFF')
    expect(migratedZero.copy).toEqual(DEFAULT_HOME_COPY)
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
})
