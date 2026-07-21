import { describe, expect, it } from 'vitest'
import { DEFAULT_BRAND_COPY, DEFAULT_HOME_COPY, HOME_ACTIONS, PROJECT_PLACEHOLDER, splitHeadingTemplate } from '../src/shared/home-layout'
import { createDefaultTheme, createThemeInputSchema, DEFAULT_THEME_COLORS, parseThemeProfile, THEME_COLOR_PRESETS } from '../src/shared/theme'
import { compileTheme } from '../src/main/theme-compiler'
import { buildDynamicThemeCss } from '../src/main/codex-service'
import { buildThemeStyleVariables } from '../src/shared/runtime-theme'
import { DEFAULT_SIDEBAR_COPY, DEFAULT_SIDEBAR_NAV_COPY, SIDEBAR_NAV_ITEMS } from '../src/shared/sidebar-layout'
import { APPEARANCE_COLOR_TOKENS } from '../src/shared/appearance'

const id = '11111111-1111-4111-8111-111111111111'

describe('theme schema and compiler', () => {
  it('provides validated creation palettes and clones default colors per theme', () => {
    for (const preset of THEME_COLOR_PRESETS) {
      expect(createThemeInputSchema.parse({ name: ` ${preset.name} `, colors: preset.colors })).toMatchObject({ name: preset.name, colors: preset.colors })
    }
    expect(() => createThemeInputSchema.parse({ name: ' ', colors: DEFAULT_THEME_COLORS })).toThrow()
    expect(() => createThemeInputSchema.parse({ name: '主题', colors: { ...DEFAULT_THEME_COLORS, accent: 'not-a-color' } })).toThrow()
    expect(() => createThemeInputSchema.parse({ name: '主题', colors: { ...DEFAULT_THEME_COLORS, danger: undefined } })).toThrow()

    const first = createDefaultTheme(id, '第一个')
    const second = createDefaultTheme('22222222-2222-4222-8222-222222222222', '第二个')
    first.colors.accent = '#000000'
    expect(second.colors).toEqual(DEFAULT_THEME_COLORS)
    expect(first.colors).not.toBe(DEFAULT_THEME_COLORS)
  })

  it('migrates version twelve sidebar defaults and validates independent navigation settings', () => {
    const current = createDefaultTheme(id)
    expect(current.version).toBe(13)
    expect(current.copy).toMatchObject({ ...DEFAULT_SIDEBAR_COPY, ...DEFAULT_SIDEBAR_NAV_COPY })
    for (const item of SIDEBAR_NAV_ITEMS) {
      expect(current.icons[item.iconSlot]).toEqual({ kind: 'builtin', name: item.iconName })
      expect(current.typography.slots[item.fontSlot]).toEqual({ kind: 'inherit' })
    }

    const {
      sidebarModeTitle: _sidebarModeTitle,
      sidebarProjectsTitle: _sidebarProjectsTitle,
      sidebarTasksTitle: _sidebarTasksTitle,
      sidebarNavNewTask: _sidebarNavNewTask,
      sidebarNavPullRequests: _sidebarNavPullRequests,
      sidebarNavSites: _sidebarNavSites,
      sidebarNavScheduled: _sidebarNavScheduled,
      sidebarNavPlugins: _sidebarNavPlugins,
      ...versionTwelveCopy
    } = current.copy
    const {
      sidebarNavNewTask: _sidebarNavNewTaskIcon,
      sidebarNavPullRequests: _sidebarNavPullRequestsIcon,
      sidebarNavSites: _sidebarNavSitesIcon,
      sidebarNavScheduled: _sidebarNavScheduledIcon,
      sidebarNavPlugins: _sidebarNavPluginsIcon,
      ...versionTwelveIcons
    } = current.icons
    const {
      sidebarNavNewTask: _sidebarNavNewTaskFont,
      sidebarNavPullRequests: _sidebarNavPullRequestsFont,
      sidebarNavSites: _sidebarNavSitesFont,
      sidebarNavScheduled: _sidebarNavScheduledFont,
      sidebarNavPlugins: _sidebarNavPluginsFont,
      ...versionTwelveSlots
    } = current.typography.slots
    const migrated = parseThemeProfile({
      ...current,
      version: 12,
      copy: versionTwelveCopy,
      icons: versionTwelveIcons,
      typography: { ...current.typography, slots: versionTwelveSlots }
    })
    expect(migrated.version).toBe(13)
    expect(migrated.copy).toMatchObject({ ...DEFAULT_SIDEBAR_COPY, ...DEFAULT_SIDEBAR_NAV_COPY })

    const navigationColorTokens = Object.keys(APPEARANCE_COLOR_TOKENS).filter((token) => /^sidebarNav(NewTask|PullRequests|Sites|Scheduled|Plugins)/.test(token))
    expect(navigationColorTokens).toHaveLength(15)
    expect(() => parseThemeProfile({ ...current, copy: { ...current.copy, sidebarNavSites: ' ' } })).toThrow()
    expect(() => parseThemeProfile({ ...current, copy: { ...current.copy, sidebarNavSites: '字'.repeat(81) } })).toThrow()
    expect(() => parseThemeProfile({ ...current, appearance: { ...current.appearance, colors: { ...current.appearance.colors, sidebarNavSitesText: 'not-a-color' } } })).toThrow()

    const second = createDefaultTheme('22222222-2222-4222-8222-222222222222')
    current.copy.sidebarNavSites = '自定义站点'
    current.icons.sidebarNavSites = { kind: 'builtin', name: 'star' }
    current.typography.slots.sidebarNavSites = { kind: 'builtin', id: 'jetbrains-mono' }
    expect(second.copy.sidebarNavSites).toBe(DEFAULT_SIDEBAR_NAV_COPY.sidebarNavSites)
    expect(second.icons.sidebarNavSites).toEqual({ kind: 'builtin', name: 'grid-2x2' })
    expect(second.typography.slots.sidebarNavSites).toEqual({ kind: 'inherit' })
  })

  it('validates current themes and migrates version zero through nine profiles', () => {
    const current = createDefaultTheme(id)
    const expectedCopy = { ...DEFAULT_HOME_COPY, ...DEFAULT_BRAND_COPY, ...DEFAULT_SIDEBAR_COPY, ...DEFAULT_SIDEBAR_NAV_COPY }
    expect(parseThemeProfile(current).version).toBe(13)
    expect(current.hero.playback).toEqual({ autoplay: true, loop: true, sound: false, volume: 0.7 })
    expect(current.polaroid.playback).toEqual({ autoplay: true, loop: true, sound: false, volume: 0.7 })
    expect(current.hero.mediaTransform).toEqual({ flipHorizontal: false, flipVertical: false })
    expect(current.polaroid.mediaTransform).toEqual({ flipHorizontal: false, flipVertical: false })
    expect(() => parseThemeProfile({ ...current, hero: { ...current.hero, mediaTransform: { flipHorizontal: 'yes', flipVertical: false } } })).toThrow()
    expect(current.polaroid.mode).toBe('full')
    expect(current.polaroid.style).toMatchObject({ opacity: 1, shadow: { visible: true, offsetX: 0, offsetY: 8, blur: 10, color: 'rgba(24, 48, 54, 0.24)' } })
    expect(buildThemeStyleVariables(parseThemeProfile({ ...current, appearance: { colors: {}, paints: {} } }))['--dream-sidebar-task-row-selected']).toContain('linear-gradient(90deg')
    const { homeHeading: _homeHeadingCurrent, ...decorationsWithoutHomeHeading } = current.decorations
    const { homeHeading: _homeHeadingFontCurrent, homeSubtitle: _homeSubtitleFontCurrent, homeHeadingDecoration: _homeHeadingDecorationFontCurrent, ...typographySlotsWithoutHomeHeading } = current.typography.slots
    const parsedWithoutNewFields = parseThemeProfile({ ...current, decorations: decorationsWithoutHomeHeading, typography: { ...current.typography, slots: typographySlotsWithoutHomeHeading } })
    expect(parsedWithoutNewFields.decorations.homeHeading).toEqual(current.decorations.homeHeading)
    expect(parsedWithoutNewFields.typography.slots.homeHeading).toEqual({ kind: 'inherit' })
    expect(parsedWithoutNewFields.typography.slots.homeSubtitle).toEqual({ kind: 'inherit' })
    expect(parsedWithoutNewFields.typography.slots.homeHeadingDecoration).toEqual({ kind: 'inherit' })
    expect(() => parseThemeProfile({ ...current, decorations: { ...current.decorations, homeHeading: { ...current.decorations.homeHeading, text: 'x'.repeat(65) } } })).toThrow()
    expect(() => parseThemeProfile({ ...current, decorations: { ...current.decorations, homeHeading: { ...current.decorations.homeHeading, fontSize: 33 } } })).toThrow()

    expect(current.conversationBackground).toEqual({ visible: false, mode: 'color', color: '#F7FFFF', source: null, opacity: 1, overlayColor: '#FFFFFF', overlayOpacity: .24, focus: { x: .5, y: .5 }, scale: 1 })
    const { conversationBackground: _conversationBackground, ...withoutConversationBackground } = current
    expect(parseThemeProfile(withoutConversationBackground).conversationBackground).toEqual(current.conversationBackground)
    expect(() => parseThemeProfile({ ...current, conversationBackground: { ...current.conversationBackground, mode: 'gif', source: { asset: 'assets/photo.png', kind: 'image', mimeType: 'image/png' } } })).toThrow()
    expect(() => parseThemeProfile({ ...current, conversationBackground: { ...current.conversationBackground, opacity: 1.1 } })).toThrow()
    expect(() => parseThemeProfile({ ...current, conversationBackground: { ...current.conversationBackground, scale: 3.1 } })).toThrow()

    const { mode: _versionEightMode, style: _versionEightStyle, ...versionEightPolaroid } = current.polaroid
    const migratedEight = parseThemeProfile({ ...current, version: 8, polaroid: versionEightPolaroid })
    expect(migratedEight.version).toBe(13)
    expect(migratedEight.polaroid.mode).toBe('fence')

    const { backgroundFloat: _backgroundFloat, backgroundRain: _backgroundRain, backgroundMeteor: _backgroundMeteor, backgroundSnow: _backgroundSnow, ...versionSevenIcons } = current.icons
    const { homeHeading: _homeHeadingSeven, ...versionSevenDecorations } = current.decorations
    const versionSeven = {
      ...current,
      version: 7,
      polaroid: versionEightPolaroid,
      icons: versionSevenIcons,
      decorations: { ...versionSevenDecorations, sparkles: Object.fromEntries(Object.entries(current.decorations.sparkles).filter(([key]) => key !== 'effect' && key !== 'speed')) }
    }
    const migratedSeven = parseThemeProfile(versionSeven)
    expect(migratedSeven.version).toBe(13)
    expect(migratedSeven.polaroid.mode).toBe('fence')
    expect(migratedSeven.decorations.sparkles).toMatchObject({ effect: 'twinkle', speed: 1 })
    expect(migratedSeven.icons.backgroundSparkle).toEqual(current.icons.backgroundSparkle)
    expect(migratedSeven.icons.backgroundRain).toEqual({ kind: 'builtin', name: 'droplet' })
    expect(migratedSeven.decorations.homeHeading).toEqual(current.decorations.homeHeading)

    const { decorations: _decorations, ...currentWithoutDecorations } = current
    const { backgroundSparkle: _backgroundSparkle, backgroundFloat: _backgroundFloatSix, backgroundRain: _backgroundRainSix, backgroundMeteor: _backgroundMeteorSix, backgroundSnow: _backgroundSnowSix, ...currentWithoutBackgroundSparkle } = currentWithoutDecorations.icons
    const { composerMelody: _composerMelody, homeHeading: _homeHeadingFontSix, homeSubtitle: _homeSubtitleFontSix, homeHeadingDecoration: _homeHeadingDecoration, ...versionSixTypographySlots } = current.typography.slots
    const versionSixTypography = { ...current.typography, slots: versionSixTypographySlots }
    const { style: _styleSix, ...versionSixPolaroid } = current.polaroid
    const versionSix = { ...currentWithoutDecorations, version: 6, polaroid: versionSixPolaroid, icons: currentWithoutBackgroundSparkle, composerBadge: current.composerBadge, typography: versionSixTypography }
    const migratedSix = parseThemeProfile(versionSix)
    expect(migratedSix.version).toBe(13)
    expect(migratedSix.decorations.sparkles.count).toBe(6)
    expect(migratedSix.decorations.composerMelody.text).toBe('♫ · · · ♡ · · · ♪')
    expect(migratedSix.decorations.homeHeading).toEqual(current.decorations.homeHeading)

    const { composerBadge: _composerBadgeWithoutDecorations, ...currentWithoutBadge } = currentWithoutDecorations
    const { appearance: _appearance, typography: _typography, ...versionFiveFields } = currentWithoutBadge
    const { style: _styleFour, ...versionFourPolaroid } = current.polaroid
    const { composerBadge: _composerBadgeIcon, ...versionFiveIcons } = currentWithoutBackgroundSparkle
    const versionFour = { ...versionFiveFields, version: 4, polaroid: versionFourPolaroid, icons: versionFiveIcons }
    const migratedFour = parseThemeProfile(versionFour)
    expect(migratedFour.version).toBe(13)
    expect(migratedFour.appearance).toEqual({ colors: {}, paints: {} })
    expect(migratedFour.typography.slots.brandSignature).toEqual({ kind: 'builtin', id: 'segoe-script' })

    const versionFive = {
      ...currentWithoutBadge,
      version: 5,
      polaroid: versionFourPolaroid,
      icons: versionFiveIcons,
      appearance: { colors: { composerSendIcon: '#123456' }, paints: { composerSendButton: { kind: 'solid' as const, color: '#654321' } } },
      typography: versionSixTypography
    }
    const migratedFive = parseThemeProfile(versionFive)
    expect(migratedFive.version).toBe(13)
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
    expect(migratedThree.version).toBe(13)
    expect(migratedThree.copy).toEqual(expectedCopy)
    expect(migratedThree.icons.sidebarMode).toEqual({ kind: 'builtin', name: 'music' })

    const { visible: _visibleTwo, mode: _modeTwo, style: _styleTwo, ...versionTwoPolaroid } = current.polaroid
    const versionTwo = { ...versionThree, version: 2, polaroid: versionTwoPolaroid }
    const migratedTwo = parseThemeProfile(versionTwo)
    expect(migratedTwo.version).toBe(13)
    expect(migratedTwo.polaroid.visible).toBe(true)
    expect(migratedTwo.polaroid.mode).toBe('fence')

    const { copy: _copy, ...versionOneFields } = versionTwo
    const versionOne = { ...versionOneFields, version: 1, name: '已有主题' }
    const migratedOne = parseThemeProfile(versionOne)
    expect(migratedOne.version).toBe(13)
    expect(migratedOne.name).toBe('已有主题')
    expect(migratedOne.copy).toEqual(expectedCopy)
    expect(migratedOne.hero).toEqual(current.hero)

    const migratedZero = parseThemeProfile({ id, name: '旧主题', version: 0, colors: { accent: '#123456' } })
    expect(migratedZero.version).toBe(13)
    expect(migratedZero.colors.accent).toBe('#123456')
    expect(migratedZero.colors.surface).toBe('#F7FFFF')
    expect(migratedZero.copy).toEqual(expectedCopy)
    expect(migratedZero.icons.sidebarMode).toEqual({ kind: 'builtin', name: 'music' })
    expect(migratedZero.polaroid.visible).toBe(true)
    expect(migratedZero.polaroid.mode).toBe('fence')
    for (const migrated of [migratedFive, migratedFour, migratedThree, migratedTwo, migratedOne, migratedZero]) {
      expect(buildThemeStyleVariables(migrated)['--dream-canvas']).toContain('linear-gradient(135deg')
    }
    expect(buildThemeStyleVariables(migratedZero)['--dream-action-card-icon-badge']).toContain('#123456')
    expect(parseThemeProfile({ ...migratedZero, colors: { ...migratedZero.colors, accent: 'red' } }).colors.accent).toBe('red')
    expect(() => parseThemeProfile({ ...migratedZero, colors: { ...migratedZero.colors, accent: 'red; background: black' } })).toThrow()
  })

  it('migrates v11 media profiles with neutral flip defaults', () => {
    const current = createDefaultTheme(id)
    const { mediaTransform: _heroTransform, ...versionElevenHero } = current.hero
    const { mediaTransform: _polaroidTransform, ...versionElevenPolaroid } = current.polaroid
    const migrated = parseThemeProfile({ ...current, version: 11, hero: versionElevenHero, polaroid: versionElevenPolaroid })
    expect(migrated.version).toBe(13)
    expect(migrated.hero.mediaTransform).toEqual({ flipHorizontal: false, flipVertical: false })
    expect(migrated.polaroid.mediaTransform).toEqual({ flipHorizontal: false, flipVertical: false })
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

  it('rejects sound enabled in both media positions', () => {
    const profile = createDefaultTheme(id)
    profile.hero.source = { asset: 'assets/hero.mp4', kind: 'video', mimeType: 'video/mp4' }
    profile.polaroid.source = { asset: 'assets/photo.webm', kind: 'video', mimeType: 'video/webm' }
    profile.hero.playback.sound = true
    profile.polaroid.playback.sound = true
    expect(() => parseThemeProfile(profile)).toThrow('Only one media source may have sound enabled')
  })

  it('validates polaroid modes and emits matching full-image and fence CSS', async () => {
    const profile = createDefaultTheme(id)
    profile.polaroid.sourceImage = 'assets/polaroid.png'
    profile.polaroid.sourceSize = { width: 1200, height: 800 }
    profile.polaroid.fence = [{ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.2 }, { x: 0.9, y: 0.8 }, { x: 0.1, y: 0.8 }]
    const dataUrl = 'data:image/png;base64,AAECAwQ='

    expect(parseThemeProfile(profile).polaroid.mode).toBe('full')
    expect(() => parseThemeProfile({ ...profile, polaroid: { ...profile.polaroid, mode: 'crop' } })).toThrow()
    const fullCss = buildDynamicThemeCss(profile, { 'assets/polaroid.png': dataUrl })
    expect(fullCss).toContain('aspect-ratio: 1.5')
    expect(fullCss).toContain('opacity: 1')
    expect(fullCss).toContain('drop-shadow(0px 8px 10px rgba(24, 48, 54, 0.24))')
    expect(fullCss).toContain('background-size: 100% 100% !important')
    expect(fullCss).toContain('clip-path: none !important')
    expect((await compileTheme(profile, async () => dataUrl)).css).toContain('clip-path: none')

    profile.polaroid.mode = 'fence'
    const fenceCss = buildDynamicThemeCss(profile, { 'assets/polaroid.png': dataUrl })
    expect(fenceCss).toContain('aspect-ratio: 2')
    expect(fenceCss).toMatch(/background-size: 125% 166\.6+[^ ]*% !important/)
    expect(fenceCss).toContain('clip-path: polygon(')
    expect((await compileTheme(profile, async () => dataUrl)).css).toContain('clip-path: polygon(')
  })

  it('migrates version nine polaroids without changing their mode and validates appearance ranges', () => {
    const profile = createDefaultTheme(id)
    profile.polaroid.mode = 'fence'
    const { style: _style, ...versionNinePolaroid } = profile.polaroid
    const migrated = parseThemeProfile({ ...profile, version: 9, polaroid: versionNinePolaroid })
    expect(migrated.version).toBe(13)
    expect(migrated.polaroid.mode).toBe('fence')
    expect(migrated.polaroid.style.shadow.blur).toBe(10)
    expect(() => parseThemeProfile({ ...profile, polaroid: { ...profile.polaroid, style: { ...profile.polaroid.style, opacity: 1.1 } } })).toThrow()
    expect(() => parseThemeProfile({ ...profile, polaroid: { ...profile.polaroid, style: { ...profile.polaroid.style, shadow: { ...profile.polaroid.style.shadow, offsetX: 41 } } } })).toThrow()
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
    expect(JSON.parse(compiled.rendererPayload).version).toBe(13)
    expect(compiled.rendererPayload).toContain('\\u003cb>')
    expect(compiled.rendererPayload).toContain(JSON.stringify(HOME_ACTIONS[0].label).slice(1, -1))
    expect(await compileTheme(profile, async () => 'data:image/png;base64,PHNjcmlwdD4=')).toEqual(compiled)
  })

  it('does not read video media into the base64 image payload', async () => {
    const profile = createDefaultTheme(id)
    profile.hero.source = { asset: 'assets/hero.mp4', kind: 'video', mimeType: 'video/mp4' }
    profile.hero.sourceImage = 'assets/hero.mp4'
    profile.polaroid.source = { asset: 'assets/photo.webm', kind: 'video', mimeType: 'video/webm' }
    profile.polaroid.sourceImage = 'assets/photo.webm'

    const compiled = await compileTheme(profile, async () => {
      throw new Error('video assets must not be loaded as data URLs')
    })
    expect(compiled.assets).toEqual({})
    expect(compiled.css).not.toContain('background-image: url')
  })

  it('keeps media flips on the media layers instead of the layout containers', () => {
    const profile = createDefaultTheme(id)
    profile.hero.sourceImage = 'assets/hero.png'
    profile.hero.mediaTransform = { flipHorizontal: true, flipVertical: false }
    profile.polaroid.sourceImage = 'assets/polaroid.png'
    profile.polaroid.sourceSize = { width: 800, height: 1000 }
    profile.polaroid.mediaTransform = { flipHorizontal: false, flipVertical: true }
    const css = buildDynamicThemeCss(profile, {
      'assets/hero.png': 'data:image/png;base64,AAECAwQ=',
      'assets/polaroid.png': 'data:image/png;base64,AAECAwQ='
    })
    expect(css).toContain('.dream-polaroid {')
    expect(css).toContain('.dream-polaroid-surface::before')
    expect(css).toContain('transform: scaleX(1) scaleY(-1)')
    expect(css).not.toContain('.dream-polaroid { transform: scaleX')
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
