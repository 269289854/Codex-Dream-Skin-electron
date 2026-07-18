import { describe, expect, it } from 'vitest'
import { DEFAULT_BRAND_COPY, DEFAULT_HOME_COPY, HOME_ACTIONS, PROJECT_PLACEHOLDER, splitHeadingTemplate } from '../src/shared/home-layout'
import { createDefaultTheme, parseThemeProfile } from '../src/shared/theme'
import { compileTheme } from '../src/main/theme-compiler'
import { buildDynamicThemeCss } from '../src/main/codex-service'
import { buildThemeStyleVariables } from '../src/shared/runtime-theme'

const id = '11111111-1111-4111-8111-111111111111'

describe('theme schema and compiler', () => {
  it('validates current themes and migrates version zero through four profiles', () => {
    const current = createDefaultTheme(id)
    const expectedCopy = { ...DEFAULT_HOME_COPY, ...DEFAULT_BRAND_COPY }
    expect(parseThemeProfile(current).version).toBe(8)
    expect(buildThemeStyleVariables(parseThemeProfile({ ...current, appearance: { colors: {}, paints: {} } }))['--dream-sidebar-task-row-selected']).toContain('linear-gradient(90deg')

    const { backgroundFloat: _backgroundFloat, backgroundRain: _backgroundRain, backgroundMeteor: _backgroundMeteor, backgroundSnow: _backgroundSnow, ...versionSevenIcons } = current.icons
    const versionSeven = {
      ...current,
      version: 7,
      icons: versionSevenIcons,
      decorations: { ...current.decorations, sparkles: Object.fromEntries(Object.entries(current.decorations.sparkles).filter(([key]) => key !== 'effect' && key !== 'speed')) }
    }
    const migratedSeven = parseThemeProfile(versionSeven)
    expect(migratedSeven.version).toBe(8)
    expect(migratedSeven.decorations.sparkles).toMatchObject({ effect: 'twinkle', speed: 1 })
    expect(migratedSeven.icons.backgroundSparkle).toEqual(current.icons.backgroundSparkle)
    expect(migratedSeven.icons.backgroundRain).toEqual({ kind: 'builtin', name: 'droplet' })

    const { decorations: _decorations, ...currentWithoutDecorations } = current
    const { backgroundSparkle: _backgroundSparkle, backgroundFloat: _backgroundFloatSix, backgroundRain: _backgroundRainSix, backgroundMeteor: _backgroundMeteorSix, backgroundSnow: _backgroundSnowSix, ...currentWithoutBackgroundSparkle } = currentWithoutDecorations.icons
    const { composerMelody: _composerMelody, ...versionSixTypographySlots } = current.typography.slots
    const versionSixTypography = { ...current.typography, slots: versionSixTypographySlots }
    const versionSix = { ...currentWithoutDecorations, version: 6, icons: currentWithoutBackgroundSparkle, composerBadge: current.composerBadge, typography: versionSixTypography }
    const migratedSix = parseThemeProfile(versionSix)
    expect(migratedSix.version).toBe(8)
    expect(migratedSix.decorations.sparkles.count).toBe(6)
    expect(migratedSix.decorations.composerMelody.text).toBe('♫ · · · ♡ · · · ♪')

    const { composerBadge: _composerBadgeWithoutDecorations, ...currentWithoutBadge } = currentWithoutDecorations
    const { appearance: _appearance, typography: _typography, ...versionFiveFields } = currentWithoutBadge
    const { composerBadge: _composerBadgeIcon, ...versionFiveIcons } = currentWithoutBackgroundSparkle
    const versionFour = { ...versionFiveFields, version: 4, icons: versionFiveIcons }
    const migratedFour = parseThemeProfile(versionFour)
    expect(migratedFour.version).toBe(8)
    expect(migratedFour.appearance).toEqual({ colors: {}, paints: {} })
    expect(migratedFour.typography.slots.brandSignature).toEqual({ kind: 'builtin', id: 'segoe-script' })

    const versionFive = {
      ...currentWithoutBadge,
      version: 5,
      icons: versionFiveIcons,
      appearance: { colors: { composerSendIcon: '#123456' }, paints: { composerSendButton: { kind: 'solid' as const, color: '#654321' } } },
      typography: versionSixTypography
    }
    const migratedFive = parseThemeProfile(versionFive)
    expect(migratedFive.version).toBe(8)
    expect(migratedFive.icons.composerBadge).toEqual({ kind: 'builtin', name: 'music' })
    expect(migratedFive.composerBadge.visible).toBe(true)
    expect(migratedFive.appearance.colors.composerBadgeIcon).toBe('#123456')
    expect(migratedFive.appearance.paints.composerBadgeBackground).toEqual({ kind: 'solid', color: '#654321' })

    const {
      brandTitle: _brandTitle,
      brandSubtitle: _brandSubtitle,
      brandSignature: _brandSignature,
      ...legacyCopy
    } = current.copy
    const { sidebarMode: _sidebarMode, composerBadge: _composerBadgeLegacy, backgroundSparkle: _backgroundSparkleLegacy, backgroundFloat: _backgroundFloatLegacy, backgroundRain: _backgroundRainLegacy, backgroundMeteor: _backgroundMeteorLegacy, backgroundSnow: _backgroundSnowLegacy, ...legacyIcons } = current.icons
    const versionThree = { ...versionFour, version: 3, copy: legacyCopy, icons: legacyIcons }
    const migratedThree = parseThemeProfile(versionThree)
    expect(migratedThree.version).toBe(8)
    expect(migratedThree.copy).toEqual(expectedCopy)
    expect(migratedThree.icons.sidebarMode).toEqual({ kind: 'builtin', name: 'music' })

    const { visible: _visibleTwo, ...versionTwoPolaroid } = current.polaroid
    const versionTwo = { ...versionThree, version: 2, polaroid: versionTwoPolaroid }
    const migratedTwo = parseThemeProfile(versionTwo)
    expect(migratedTwo.version).toBe(8)
    expect(migratedTwo.polaroid.visible).toBe(true)

    const { copy: _copy, ...versionOneFields } = versionTwo
    const versionOne = { ...versionOneFields, version: 1, name: '已有主题' }
    const migratedOne = parseThemeProfile(versionOne)
    expect(migratedOne.version).toBe(8)
    expect(migratedOne.name).toBe('已有主题')
    expect(migratedOne.copy).toEqual(expectedCopy)
    expect(migratedOne.hero).toEqual(current.hero)

    const migratedZero = parseThemeProfile({ id, name: '旧主题', version: 0, colors: { accent: '#123456' } })
    expect(migratedZero.version).toBe(8)
    expect(migratedZero.colors.accent).toBe('#123456')
    expect(migratedZero.colors.surface).toBe('#F7FFFF')
    expect(migratedZero.copy).toEqual(expectedCopy)
    expect(migratedZero.icons.sidebarMode).toEqual({ kind: 'builtin', name: 'music' })
    expect(migratedZero.polaroid.visible).toBe(true)
    for (const migrated of [migratedFive, migratedFour, migratedThree, migratedTwo, migratedOne, migratedZero]) {
      expect(buildThemeStyleVariables(migrated)['--dream-canvas']).toContain('linear-gradient(135deg')
    }
    expect(buildThemeStyleVariables(migratedZero)['--dream-action-card-icon-badge']).toContain('#123456')
    expect(parseThemeProfile({ ...migratedZero, colors: { ...migratedZero.colors, accent: 'red' } }).colors.accent).toBe('red')
    expect(() => parseThemeProfile({ ...migratedZero, colors: { ...migratedZero.colors, accent: 'red; background: black' } })).toThrow()
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

  it('validates brand copy limits while permitting optional empty values', () => {
    const profile = createDefaultTheme(id)
    profile.copy.brandSubtitle = ''
    profile.copy.brandSignature = ''
    expect(parseThemeProfile(profile).copy).toEqual(profile.copy)

    expect(() => parseThemeProfile({ ...profile, copy: { ...profile.copy, brandTitle: ' ' } })).toThrow()
    expect(() => parseThemeProfile({ ...profile, copy: { ...profile.copy, brandTitle: '字'.repeat(81) } })).toThrow()
    expect(() => parseThemeProfile({ ...profile, copy: { ...profile.copy, brandSubtitle: '字'.repeat(121) } })).toThrow()
    expect(() => parseThemeProfile({ ...profile, copy: { ...profile.copy, brandSignature: '字'.repeat(33) } })).toThrow()
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
    expect(JSON.parse(compiled.rendererPayload).version).toBe(8)
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
