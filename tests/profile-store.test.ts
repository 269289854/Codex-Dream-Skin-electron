import { execFile } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import ffmpegPath from 'ffmpeg-static'
import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'
import { ProfileStore } from '../src/main/profile-store'
import { resolveAppearanceColor } from '../src/shared/appearance'
import { conversationBubblePresetAssetKey } from '../src/shared/conversation-bubbles'
import { CONVERSATION_BUBBLE_PRESETS, DEFAULT_THEME_COLORS } from '../src/shared/theme'

const roots: string[] = []
const execFileAsync = promisify(execFile)
const TEST_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/69R9WQAAAABJRU5ErkJggg==', 'base64')
const TEST_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64')
const ANIMATED_GIF_FRAME = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64')

async function writeBundledSystemAssets(root: string): Promise<{ hero: string; polaroid: string }> {
  const assets = { hero: join(root, 'bundled-hero.png'), polaroid: join(root, 'bundled-polaroid.png') }
  await Promise.all([writeFile(assets.hero, TEST_PNG), writeFile(assets.polaroid, TEST_PNG)])
  return assets
}

function animatedGif(frameCount: number): Buffer {
  const frameStart = ANIMATED_GIF_FRAME.indexOf(Buffer.from([0x21, 0xf9]))
  const header = ANIMATED_GIF_FRAME.subarray(0, frameStart)
  const frame = ANIMATED_GIF_FRAME.subarray(frameStart, ANIMATED_GIF_FRAME.length - 1)
  return Buffer.concat([header, ...Array.from({ length: frameCount }, () => frame), Buffer.from([0x3b])])
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('ProfileStore', () => {
  it('creates a clean theme with validated custom colors', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-create-input-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const colors = { ...DEFAULT_THEME_COLORS, ink: '#183B56', accent: '#2878B8', danger: '#CF4A5B' }
    const created = await store.create({ name: '  海盐主题  ', colors })
    expect(created.name).toBe('海盐主题')
    expect(created.colors).toEqual(colors)
    expect(created.resetColors).toEqual(colors)
    expect(created.resetColors).not.toBe(created.colors)
    expect(created.toolActivityBubbles).toEqual({ visible: true })
    expect(created.appearance.colors.sidebarProjectsTitleText).toBeUndefined()
    expect(created.appearance.colors.sidebarTasksTitleHoverText).toBeUndefined()
    expect(resolveAppearanceColor(created.appearance, created.colors, 'sidebarProjectsTitleText')).toBe('#183B56')
    expect(resolveAppearanceColor(created.appearance, created.colors, 'sidebarTasksTitleHoverText')).toBe('#2878B8')
    expect(created.hero.source).toBeNull()
    expect(created.polaroid.source).toBeNull()
    expect(await store.get(created.id)).toMatchObject({ name: '海盐主题', colors, resetColors: colors })

    created.colors.accent = '#123456'
    created.colors.ink = '#345678'
    created.copy.sidebarNavSites = '自定义站点'
    created.toolActivityBubbles.visible = false
    await store.update(created)
    const reset = await store.getDefault(created.id)
    expect(reset).toMatchObject({ id: created.id, name: '海盐主题', colors, resetColors: colors, copy: { sidebarNavSites: '站点' } })
    expect(reset.colors).not.toBe(reset.resetColors)
    const edited = await store.get(created.id)
    expect(resolveAppearanceColor(edited.appearance, edited.colors, 'sidebarProjectsTitleText')).toBe('#345678')
    expect(resolveAppearanceColor(reset.appearance, reset.colors, 'sidebarProjectsTitleText')).toBe('#183B56')
    expect(resolveAppearanceColor(reset.appearance, reset.colors, 'sidebarProjectsTitleHoverText')).toBe('#2878B8')
    expect(reset.appearance.colors.sidebarProjectsTitleText).toBeUndefined()
    expect(reset.toolActivityBubbles).toEqual({ visible: true })
    expect(edited.toolActivityBubbles).toEqual({ visible: false })
    expect((await store.get(created.id)).colors.accent).toBe('#123456')
    await expect(store.create({ name: '非法主题', colors: { ...colors, accent: 'invalid' } })).rejects.toThrow()
    expect((await readdir(join(root, 'themes'))).filter((entry) => !entry.startsWith('.'))).toHaveLength(2)
  })

  it('uses a version thirteen theme current colors as its reset baseline', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-reset-colors-migration-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const colors = { ...DEFAULT_THEME_COLORS, accent: '#B94F7B', pink: '#E478A4' }
    const created = await store.create({ name: '旧版主题', colors })
    const { resetColors: _resetColors, videoPlayback: _videoPlayback, ...legacy } = created
    const { overlay, ...legacyConversationBackground } = created.conversationBackground
    await writeFile(join(store.themesRoot, created.id, 'theme.json'), `${JSON.stringify({
      ...legacy,
      version: 13,
      conversationBackground: {
        ...legacyConversationBackground,
        overlayColor: overlay.paint.kind === 'solid' ? overlay.paint.color : '#FFFFFF',
        overlayOpacity: overlay.opacity
      }
    }, null, 2)}\n`, 'utf8')

    const migrated = await store.get(created.id)
    expect(migrated).toMatchObject({ version: 24, videoPlayback: { pausePolicy: 'hidden' }, colors, resetColors: colors })
    migrated.colors.accent = '#123456'
    await store.update(migrated)
    expect((await store.getDefault(created.id)).colors).toEqual(colors)
  })

  it('persists named profiles atomically and confines assets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-store-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const [systemTheme] = await store.list()
    expect(systemTheme).toMatchObject({ active: true, system: true })

    const created = await store.create('中文主题')
    expect((await store.list()).find((item) => item.id === created.id)?.system).toBe(false)
    const activated = await store.activate(created.id)
    expect(activated.name).toBe('中文主题')
    expect((await store.list()).find((item) => item.id === created.id)?.active).toBe(true)
    const originalPlacement = activated.polaroid.placement
    activated.polaroid.placement = { ...originalPlacement, x: 0.24, y: 0.68 }
    activated.copy.sidebarProjectsTitle = '作品集'
    activated.typography.slots.sidebarProjectsTitle = { kind: 'builtin', id: 'jetbrains-mono' }
    activated.appearance.colors.sidebarProjectsTitleText = '#123456'
    activated.appearance.colors.sidebarProjectsTitleHoverText = '#654321'
    activated.appearance.paints.sidebarProjectsTitleBackground = { kind: 'solid', color: 'transparent' }
    activated.appearance.paints.sidebarProjectsTitleHoverBackground = { kind: 'solid', color: '#abcdef' }
    const moved = await store.update(activated)
    expect(moved.polaroid.placement).toEqual({ ...originalPlacement, x: 0.24, y: 0.68 })
    expect(moved.name).toBe('中文主题')
    expect(await store.get(created.id)).toMatchObject({
      copy: { sidebarProjectsTitle: '作品集', sidebarTasksTitle: '任务' },
      typography: { slots: { sidebarProjectsTitle: { kind: 'builtin', id: 'jetbrains-mono' }, sidebarTasksTitle: { kind: 'inherit' } } },
      appearance: {
        colors: { sidebarProjectsTitleText: '#123456', sidebarProjectsTitleHoverText: '#654321' },
        paints: { sidebarProjectsTitleBackground: { kind: 'solid', color: 'transparent' }, sidebarProjectsTitleHoverBackground: { kind: 'solid', color: '#abcdef' } }
      }
    })
    expect(() => store.resolveAsset(created.id, '../outside.png')).toThrow('escapes')
    expect(() => store.resolveAsset(created.id, 'theme.json')).toThrow('escapes')

    const profileFile = await readFile(join(root, 'themes', created.id, 'theme.json'), 'utf8')
    expect(profileFile).toContain('中文主题')
    expect(profileFile.endsWith('\n')).toBe(true)
    if (!systemTheme) throw new Error('System theme was not initialized.')
    await expect(store.delete(systemTheme.id)).rejects.toThrow('系统默认主题不能删除')
    await store.delete(created.id)
    expect(await store.list()).toEqual([expect.objectContaining({ id: systemTheme.id, active: true, system: true })])
  })

  it('migrates legacy settings and keeps the original bundled theme editable but undeletable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-system-theme-'))
    roots.push(root)
    const bundledAssets = await writeBundledSystemAssets(root)
    const store = new ProfileStore(root, bundledAssets)
    await store.initialize()
    const systemTheme = (await store.list()).find((theme) => theme.system)
    if (!systemTheme) throw new Error('System theme was not initialized.')
    const systemProfile = await store.get(systemTheme.id)
    expect(systemProfile).toMatchObject({
      version: 24,
      videoPlayback: { pausePolicy: 'hidden' },
      hero: {
        source: { asset: 'assets/dream-reference.png', kind: 'image', mimeType: 'image/png' },
        playback: { autoplay: true, loop: true, sound: false, volume: 0.7 },
        mediaTransform: { flipHorizontal: false, flipVertical: false }
      },
      polaroid: {
        source: { asset: 'assets/dream-polaroid.png', kind: 'image', mimeType: 'image/png' },
        sourceSize: { width: 1, height: 1 },
        placement: { x: 0.8278561014524648, y: 0.7127831468304384, width: 0.15, rotation: -15, hideBelowWidth: 920 },
        playback: { autoplay: true, loop: true, sound: false, volume: 0.7 },
        mediaTransform: { flipHorizontal: false, flipVertical: false }
      },
      icons: { backgroundRain: { kind: 'builtin', name: 'wand-sparkles' } },
      decorations: {
        sparkles: { visible: true, effect: 'rain', speed: 1, performanceMode: 'balanced', count: 20, minSize: 20, maxSize: 32, opacity: 0.72, glow: 10, seed: 0, extraColors: [] }
      }
    })
    await expect(readFile(join(root, 'themes', systemTheme.id, 'assets', 'dream-reference.png'))).resolves.toEqual(TEST_PNG)
    await expect(readFile(join(root, 'themes', systemTheme.id, 'assets', 'dream-polaroid.png'))).resolves.toEqual(TEST_PNG)
    const customTheme = await store.create('自定义主题')
    expect(customTheme.hero.source).toBeNull()
    expect(customTheme.polaroid.source).toBeNull()
    await store.activate(customTheme.id)
    await writeFile(join(root, 'settings.json'), `${JSON.stringify({ version: 1, activeThemeId: customTheme.id }, null, 2)}\n`, 'utf8')

    const reopened = new ProfileStore(root, bundledAssets)
    await reopened.initialize()
    const migrated = await reopened.list()
    expect(migrated.find((theme) => theme.id === systemTheme.id)).toMatchObject({ system: true, active: false })
    expect(migrated.find((theme) => theme.id === customTheme.id)).toMatchObject({ system: false, active: true })
    expect(JSON.parse(await readFile(join(root, 'settings.json'), 'utf8'))).toEqual({ version: 2, activeThemeId: customTheme.id, systemThemeId: systemTheme.id })

    const editableSystem = await reopened.get(systemTheme.id)
    editableSystem.name = '修改后的系统主题'
    await reopened.update(editableSystem)
    const preserved = new ProfileStore(root, bundledAssets)
    await preserved.initialize()
    expect((await preserved.list()).find((theme) => theme.id === systemTheme.id)).toMatchObject({ name: '修改后的系统主题', system: true })
    await expect(reopened.delete(systemTheme.id)).rejects.toThrow('系统默认主题不能删除')
    await reopened.delete(customTheme.id)
    expect((await reopened.list()).map((theme) => theme.id)).toEqual([systemTheme.id])
  })

  it.each([1, 2] as const)('recreates a missing system theme from v%s settings without replacing the active custom theme', async (settingsVersion) => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-missing-system-'))
    roots.push(root)
    const bundledAssets = await writeBundledSystemAssets(root)
    const store = new ProfileStore(root, bundledAssets)
    await store.initialize()
    const originalSystem = (await store.list()).find((theme) => theme.system)
    if (!originalSystem) throw new Error('System theme was not initialized.')
    const customTheme = await store.create('保留的自定义主题')
    await rm(join(store.themesRoot, originalSystem.id), { recursive: true, force: true })
    const settings = settingsVersion === 1
      ? { version: 1, activeThemeId: customTheme.id }
      : { version: 2, activeThemeId: customTheme.id, systemThemeId: originalSystem.id }
    await writeFile(join(root, 'settings.json'), `${JSON.stringify(settings, null, 2)}\n`, 'utf8')

    const reopened = new ProfileStore(root, bundledAssets)
    await reopened.initialize()
    const themes = await reopened.list()
    expect(themes).toHaveLength(2)
    expect(themes.find((theme) => theme.system)?.id).not.toBe(customTheme.id)
    expect(themes.find((theme) => theme.id === customTheme.id)).toMatchObject({ active: true, system: false })
  })

  it.each(['missing', 'corrupt'] as const)('cleans up an incomplete system theme when a bundled asset is %s', async (failure) => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-invalid-system-'))
    roots.push(root)
    const hero = join(root, 'bundled-hero.png')
    const polaroid = join(root, 'bundled-polaroid.png')
    await writeFile(hero, TEST_PNG)
    if (failure === 'corrupt') await writeFile(polaroid, 'not-an-image')

    await expect(new ProfileStore(root, { hero, polaroid }).initialize()).rejects.toThrow()
    expect(await readdir(join(root, 'themes'))).toEqual([])
  })

  it('creates the production system preset from the bundled hero and polaroid images', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-production-system-'))
    roots.push(root)
    const resources = join(process.cwd(), 'resources', 'windows')
    const store = new ProfileStore(root, {
      hero: join(resources, 'dream-reference.png'),
      polaroid: join(resources, 'dream-polaroid.png')
    })

    await store.initialize()
    const systemTheme = (await store.list()).find((theme) => theme.system)
    if (!systemTheme) throw new Error('System theme was not initialized.')
    const profile = await store.get(systemTheme.id)
    expect(profile.hero.source?.asset).toBe('assets/dream-reference.png')
    expect(profile.polaroid.source?.asset).toBe('assets/dream-polaroid.png')
    expect(profile.polaroid.sourceSize).toEqual({ width: 1122, height: 1402 })
  })

  it('restores the complete bundled preset for the system theme without saving the draft', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-reset-system-'))
    roots.push(root)
    const bundledAssets = await writeBundledSystemAssets(root)
    const store = new ProfileStore(root, bundledAssets)
    await store.initialize()
    const systemTheme = (await store.list()).find((theme) => theme.system)
    if (!systemTheme) throw new Error('System theme was not initialized.')

    const edited = await store.get(systemTheme.id)
    edited.hero.source = null
    edited.polaroid.source = null
    edited.decorations.sparkles.effect = 'twinkle'
    edited.decorations.sparkles.count = 6
    await store.update(edited)
    const heroPath = join(root, 'themes', systemTheme.id, 'assets', 'dream-reference.png')
    const polaroidPath = join(root, 'themes', systemTheme.id, 'assets', 'dream-polaroid.png')
    await Promise.all([writeFile(heroPath, 'stale'), writeFile(polaroidPath, 'stale')])

    const reset = await store.getDefault(systemTheme.id)
    expect(reset).toMatchObject({
      id: systemTheme.id,
      hero: { source: { asset: 'assets/dream-reference.png', kind: 'image', mimeType: 'image/png' } },
      polaroid: {
        source: { asset: 'assets/dream-polaroid.png', kind: 'image', mimeType: 'image/png' },
        sourceSize: { width: 1, height: 1 },
        placement: { x: 0.8278561014524648, y: 0.7127831468304384, width: 0.15, rotation: -15, hideBelowWidth: 920 }
      },
      icons: { backgroundRain: { kind: 'builtin', name: 'wand-sparkles' } },
      decorations: { sparkles: { effect: 'rain', count: 20, minSize: 20, maxSize: 32 } }
    })
    expect((await store.get(systemTheme.id)).hero.source).toBeNull()
    await expect(readFile(heroPath)).resolves.toEqual(TEST_PNG)
    await expect(readFile(polaroidPath)).resolves.toEqual(TEST_PNG)
    await expect(store.getMediaPreviewUrl(systemTheme.id, 'assets/dream-reference.png')).resolves.toContain('studio-media://')
    await expect(store.resolveReferencedMedia(systemTheme.id, 'assets/dream-polaroid.png')).resolves.toMatchObject({ mimeType: 'image/png', size: TEST_PNG.length })

    const custom = await store.create('自定义主题')
    const customReset = await store.getDefault(custom.id)
    expect(customReset.colors).toEqual(custom.resetColors)
    expect(customReset.resetColors).toEqual(custom.resetColors)
    expect(customReset.hero.source).toBeNull()
    expect(customReset.polaroid.source).toBeNull()
    expect(customReset.decorations.sparkles).toMatchObject({ effect: 'twinkle', count: 6 })
    await expect(store.getMediaPreviewUrl(custom.id, 'assets/dream-reference.png')).rejects.toThrow('未被当前主题引用')
  })

  it('imports, persists, compiles, and duplicates validated font assets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-font-store-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const profile = await store.create('字体主题')
    const source = join(root, 'my-font.woff2')
    await writeFile(source, Buffer.from('wOF2'))

    const imported = await store.importFontAsset(profile.id, source)
    expect(imported).toMatchObject({ family: 'my-font', format: 'woff2', mediaType: 'font/woff2', originalName: 'my-font.woff2' })
    expect(imported.dataUrl).toBe('data:font/woff2;base64,d09GMg==')
    profile.typography.importedFonts.push({
      id: imported.id,
      family: imported.family,
      asset: imported.relativePath,
      originalName: imported.originalName,
      format: imported.format
    })
    profile.typography.slots.brandTitle = { kind: 'imported', id: imported.id }
    await store.update(profile)

    const compiled = await store.compile(profile.id)
    expect(compiled.assets[imported.relativePath]).toBe(imported.dataUrl)
    const duplicate = await store.duplicate(profile, '字体主题副本')
    expect((await store.compile(duplicate.id)).assets[imported.relativePath]).toBe(imported.dataUrl)
  })

  it('imports media atomically without leaving a temporary file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-media-store-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const profile = await store.create('媒体主题')
    const source = join(root, 'hero.png')
    await writeFile(source, TEST_PNG)

    const imported = await store.importMediaAsset(profile.id, source, 'hero')
    const assetDirectory = join(store.themesRoot, profile.id, 'assets')
    expect(await readFile(join(store.themesRoot, profile.id, imported.relativePath))).toEqual(TEST_PNG)
    expect((await readdir(assetDirectory)).some((entry) => entry.endsWith('.tmp'))).toBe(false)
  })

  it('exposes every bundled bubble preset to Studio compilation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-bubble-presets-'))
    roots.push(root)
    const bundled = await writeBundledSystemAssets(root)
    const conversationBubbles = Object.fromEntries(CONVERSATION_BUBBLE_PRESETS.map((preset) => [
      preset.id,
      join(process.cwd(), 'resources', 'windows', 'conversation-bubbles', preset.fileName)
    ])) as Record<(typeof CONVERSATION_BUBBLE_PRESETS)[number]['id'], string>
    const store = new ProfileStore(root, { ...bundled, conversationBubbles })
    await store.initialize()
    const profile = await store.create('气泡预设主题')
    const compiled = await store.compile(profile.id)

    for (const preset of CONVERSATION_BUBBLE_PRESETS) {
      expect(compiled.assets[conversationBubblePresetAssetKey(preset.id)]).toMatch(/^data:image\/png;base64,/)
    }
  })

  it('imports, compiles, duplicates, and prunes independent custom bubble assets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-custom-bubbles-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const profile = await store.create('自定义气泡主题')
    const svgSource = join(root, 'user-bubble.svg')
    const gifSource = join(root, 'codex-bubble.gif')
    await Promise.all([
      writeFile(svgSource, '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" rx="24" fill="#ffffff"/></svg>'),
      writeFile(gifSource, TEST_GIF)
    ])

    const user = await store.importMediaAsset(profile.id, svgSource, 'conversationUserBubble', 'image')
    const codex = await store.importMediaAsset(profile.id, gifSource, 'conversationCodexBubble', 'gif')
    expect(user.reference).toMatchObject({ kind: 'image', mimeType: 'image/png' })
    expect(user.relativePath).toMatch(/\.png$/)
    expect(codex.reference).toMatchObject({ kind: 'image', mimeType: 'image/gif' })
    profile.conversationBubbles.user.source = { kind: 'custom', reference: user.reference }
    profile.conversationBubbles.codex = {
      source: { kind: 'custom', reference: codex.reference },
      fit: 'stretch',
      slice: 25,
      frameWidth: 24,
      contentPadding: 28
    }
    await store.update(profile)

    const compiled = await store.compile(profile.id)
    const payload = JSON.parse(compiled.rendererPayload) as {
      assets: Record<string, string>
      conversationBubbles: { user: { dataUrl: string }; codex: { dataUrl: string } }
    }
    expect(payload.assets).not.toHaveProperty(user.relativePath)
    expect(payload.assets).not.toHaveProperty(codex.relativePath)
    expect(payload.conversationBubbles.user.dataUrl).toMatch(/^data:image\/png;base64,/)
    expect(payload.conversationBubbles.codex.dataUrl).toBe(`data:image/gif;base64,${TEST_GIF.toString('base64')}`)

    const duplicate = await store.duplicate(profile, '自定义气泡副本')
    expect(duplicate.conversationBubbles).toEqual(profile.conversationBubbles)
    expect((await store.compile(duplicate.id)).assets[user.relativePath]).toMatch(/^data:image\/png;base64,/)
    expect((await store.compile(duplicate.id)).assets[codex.relativePath]).toBe(`data:image/gif;base64,${TEST_GIF.toString('base64')}`)

    profile.conversationBubbles.user.source = { kind: 'none' }
    await store.update(profile)
    await expect(readFile(join(store.themesRoot, profile.id, user.relativePath))).rejects.toThrow()
    await expect(readFile(join(store.themesRoot, profile.id, codex.relativePath))).resolves.toEqual(TEST_GIF)
  })

  it('rejects oversized, over-dimensioned, over-frame, video, and cancelled bubble imports without artifacts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-bubble-limits-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const profile = await store.create('气泡限制主题')
    const oversized = join(root, 'oversized.png')
    const overDimension = join(root, 'over-dimension.png')
    const overFrames = join(root, 'over-frames.gif')
    const video = join(root, 'bubble.mp4')
    const valid = join(root, 'valid.png')
    await Promise.all([
      writeFile(oversized, Buffer.alloc(10 * 1024 * 1024 + 1)),
      sharp({ create: { width: 2049, height: 1, channels: 4, background: '#ffffff' } }).png().toFile(overDimension),
      writeFile(overFrames, animatedGif(181)),
      writeFile(video, Buffer.from('video')),
      writeFile(valid, TEST_PNG)
    ])

    await expect(store.importMediaAsset(profile.id, oversized, 'conversationUserBubble', 'image')).rejects.toThrow('10 MB')
    await expect(store.importMediaAsset(profile.id, overDimension, 'conversationUserBubble', 'image')).rejects.toThrow('2048px')
    await expect(store.importMediaAsset(profile.id, overFrames, 'conversationCodexBubble', 'gif')).rejects.toThrow('180')
    await expect(store.importMediaAsset(profile.id, video, 'conversationCodexBubble', 'video')).rejects.toThrow('图片或 GIF')
    const controller = new AbortController()
    controller.abort()
    await expect(store.importMediaAsset(profile.id, valid, 'conversationUserBubble', 'image', controller.signal)).rejects.toThrow('取消')
    expect((await readdir(join(store.themesRoot, profile.id, 'assets'))).filter((entry) => entry.startsWith('conversation'))).toHaveLength(0)
  })

  it('inspects and optimizes real MP4 and WebM videos while pruning both variants after save', async () => {
    if (!ffmpegPath) throw new Error('Bundled FFmpeg is unavailable.')
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-video-store-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const profile = await store.create('视频主题')
    const mp4Source = join(root, 'source-60fps.mp4')
    const webmSource = join(root, 'source-29.97fps.webm')
    await execFileAsync(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=60',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
      '-t', '0.5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', mp4Source
    ])
    await execFileAsync(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30000/1001',
      '-t', '0.5', '-an', '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', webmSource
    ])

    const mp4Inspection = await store.inspectVideoSource(mp4Source)
    expect(mp4Inspection).toMatchObject({ width: 640, height: 360, hasAudio: true, highLoad: true })
    expect(mp4Inspection.frameRate).toBeGreaterThan(59)
    const webmInspection = await store.inspectVideoSource(webmSource)
    expect(webmInspection).toMatchObject({ width: 320, height: 180, hasAudio: false, highLoad: false })
    expect(webmInspection.frameRate).toBeCloseTo(29.97, 1)

    const imported = await store.importMediaAsset(profile.id, mp4Source, 'hero', 'video', undefined, true)
    expect(imported.reference.videoVariants?.active).toBe('optimized')
    const originalAsset = imported.reference.videoVariants?.original.asset
    const optimizedAsset = imported.reference.videoVariants?.optimized.asset
    if (!originalAsset || !optimizedAsset) throw new Error('Optimized video variants are missing.')
    const optimizedInspection = await store.inspectReferencedVideo(profile.id, optimizedAsset)
    expect(optimizedInspection).toMatchObject({ width: 640, height: 360, hasAudio: true, highLoad: false })
    expect(optimizedInspection.frameRate).toBeLessThanOrEqual(30.5)

    profile.hero.source = imported.reference
    const saved = await store.update(profile)
    await expect(readFile(join(store.themesRoot, profile.id, originalAsset))).resolves.toBeInstanceOf(Buffer)
    await expect(readFile(join(store.themesRoot, profile.id, optimizedAsset))).resolves.toBeInstanceOf(Buffer)
    saved.hero.source = null
    await store.update(saved)
    await expect(readFile(join(store.themesRoot, profile.id, originalAsset))).rejects.toThrow()
    await expect(readFile(join(store.themesRoot, profile.id, optimizedAsset))).rejects.toThrow()
  })

  it('persists, compiles, previews, and duplicates a window GIF background', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-window-background-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const profile = await store.create('窗口背景主题')
    const source = join(root, 'window.gif')
    await writeFile(source, TEST_GIF)

    const imported = await store.importMediaAsset(profile.id, source, 'windowBackground', 'gif')
    profile.windowBackground.visible = true
    profile.windowBackground.mode = 'gif'
    profile.windowBackground.source = imported.reference
    await store.update(profile)

    expect((await store.get(profile.id)).windowBackground.source).toEqual(imported.reference)
    await expect(store.getMediaPreviewUrl(profile.id, imported.relativePath)).resolves.toContain('studio-media://')
    expect((await store.compile(profile.id)).assets[imported.relativePath]).toBe(`data:image/gif;base64,${TEST_GIF.toString('base64')}`)
    const duplicate = await store.duplicate(profile, '窗口背景副本')
    expect(duplicate.windowBackground.source).toEqual(imported.reference)
    expect((await store.compile(duplicate.id)).assets[imported.relativePath]).toBe(`data:image/gif;base64,${TEST_GIF.toString('base64')}`)
  })

  it('repairs persisted version sixteen generated section title colors', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-v16-title-colors-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const created = await store.create({ name: '版本十六主题', colors: { ...DEFAULT_THEME_COLORS, ink: '#214537' } })
    const generatedColor = '#556677'
    const { videoPlayback: _videoPlayback, ...versionSixteen } = created
    await writeFile(join(store.themesRoot, created.id, 'theme.json'), `${JSON.stringify({
      ...versionSixteen,
      version: 16,
      appearance: {
        ...created.appearance,
        colors: {
          sidebarProjectsTitleText: generatedColor,
          sidebarProjectsTitleHoverText: generatedColor,
          sidebarTasksTitleText: generatedColor,
          sidebarTasksTitleHoverText: generatedColor
        }
      }
    }, null, 2)}\n`, 'utf8')

    const migrated = await store.get(created.id)
    expect(migrated.version).toBe(24)
    expect(migrated.appearance.colors).toEqual({})
    expect(resolveAppearanceColor(migrated.appearance, migrated.colors, 'sidebarProjectsTitleText')).toBe('#214537')
    migrated.colors.ink = '#123456'
    migrated.colors.accent = '#abcdef'
    await store.update(migrated)
    const reloaded = await store.get(created.id)
    expect(resolveAppearanceColor(reloaded.appearance, reloaded.colors, 'sidebarProjectsTitleText')).toBe('#123456')
    expect(resolveAppearanceColor(reloaded.appearance, reloaded.colors, 'sidebarTasksTitleHoverText')).toBe('#abcdef')
  })

  it('imports, validates, compiles, and duplicates composer image and GIF references', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-composer-gif-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const profile = await store.create('GIF 装饰主题')
    const gifSource = join(root, 'composer.gif')
    const fakeGif = join(root, 'fake.gif')
    const pngSource = join(root, 'composer.png')
    const videoSource = join(root, 'composer.mp4')
    await Promise.all([writeFile(gifSource, TEST_GIF), writeFile(fakeGif, TEST_PNG), writeFile(pngSource, TEST_PNG), writeFile(videoSource, Buffer.from('video'))])

    const importedImage = await store.importMediaAsset(profile.id, pngSource, 'composerMelody', 'image')
    expect(importedImage.reference).toEqual({ asset: importedImage.relativePath, kind: 'image', mimeType: 'image/png' })
    profile.decorations.composerMelody.source = importedImage.reference
    profile.decorations.composerMelody.mode = 'image'
    await store.update(profile)
    expect((await store.compile(profile.id)).assets[importedImage.relativePath]).toBe(`data:image/png;base64,${TEST_PNG.toString('base64')}`)
    const imageDuplicate = await store.duplicate(profile, '图片装饰副本')
    expect(imageDuplicate.decorations.composerMelody.source).toEqual(importedImage.reference)
    expect((await store.compile(imageDuplicate.id)).assets[importedImage.relativePath]).toBe(`data:image/png;base64,${TEST_PNG.toString('base64')}`)

    const imported = await store.importMediaAsset(profile.id, gifSource, 'composerMelody', 'gif')
    expect(imported.reference).toEqual({ asset: imported.relativePath, kind: 'image', mimeType: 'image/gif' })
    profile.decorations.composerMelody.source = imported.reference
    profile.decorations.composerMelody.mode = 'gif'
    await store.update(profile)

    await expect(store.getMediaPreviewUrl(profile.id, imported.relativePath)).resolves.toContain('studio-media://')
    expect((await store.compile(profile.id)).assets[imported.relativePath]).toBe(`data:image/gif;base64,${TEST_GIF.toString('base64')}`)
    const duplicate = await store.duplicate(profile, 'GIF 装饰副本')
    expect(duplicate.decorations.composerMelody.source).toEqual(imported.reference)
    expect((await store.compile(duplicate.id)).assets[imported.relativePath]).toBe(`data:image/gif;base64,${TEST_GIF.toString('base64')}`)
    await expect(store.importMediaAsset(profile.id, pngSource, 'composerMelody', 'gif')).rejects.toThrow('GIF')
    await expect(store.importMediaAsset(profile.id, gifSource, 'composerMelody', 'image')).rejects.toThrow('图片')
    await expect(store.importMediaAsset(profile.id, videoSource, 'composerMelody', 'video')).rejects.toThrow('图片或 GIF')
    await expect(store.importMediaAsset(profile.id, fakeGif, 'composerMelody', 'gif')).rejects.toThrow('内容与扩展名不匹配')
  })

  it('duplicates the current draft and every referenced asset without changing the source profile', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-draft-duplicate-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const resetColors = { ...DEFAULT_THEME_COLORS, accent: '#2878B8', danger: '#CF4A5B' }
    const profile = await store.create({ name: '原主题', colors: resetColors })
    const imageSource = join(root, 'art.png')
    const fontSource = join(root, 'title.woff2')
    await writeFile(imageSource, TEST_PNG)
    await writeFile(fontSource, Buffer.from('wOF2'))
    const image = await store.importAsset(profile.id, imageSource, 'hero')
    const font = await store.importFontAsset(profile.id, fontSource)

    profile.copy.brandTitle = '尚未保存的标题'
    profile.decorations.sparkles.performanceMode = 'performance'
    profile.colors.accent = '#123456'
    profile.hero.sourceImage = image.relativePath
    profile.polaroid.sourceImage = image.relativePath
    profile.icons.cardPrimary = { kind: 'asset', asset: image.relativePath }
    profile.typography.importedFonts.push({
      id: font.id,
      family: font.family,
      asset: font.relativePath,
      originalName: font.originalName,
      format: font.format
    })
    profile.typography.slots.brandTitle = { kind: 'imported', id: font.id }
    profile.toolActivityBubbles.visible = false

    const duplicate = await store.duplicate(profile, ' 当前设计副本 ')
    expect(duplicate).toMatchObject({ name: '当前设计副本', copy: { brandTitle: '尚未保存的标题' } })
    expect(duplicate.colors.accent).toBe('#123456')
    expect(duplicate.resetColors).toEqual(resetColors)
    expect(duplicate.toolActivityBubbles).toEqual({ visible: false })
    expect(duplicate.decorations.sparkles.performanceMode).toBe('performance')
    expect(duplicate.id).not.toBe(profile.id)
    expect(Date.parse(duplicate.updatedAt)).toBeGreaterThanOrEqual(Date.parse(profile.updatedAt))
    expect((await store.get(profile.id)).copy.brandTitle).not.toBe('尚未保存的标题')
    expect((await store.get(profile.id)).hero.sourceImage).toBeNull()
    const compiled = await store.compile(duplicate.id)
    expect(compiled.assets[image.relativePath]).toBe(image.dataUrl)
    expect(compiled.assets[font.relativePath]).toBe(font.dataUrl)
  })

  it('rejects untrusted duplicate input and removes incomplete destination directories', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-duplicate-validation-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const profile = await store.create('安全主题')
    const originalDirectories = (await readdir(store.themesRoot)).sort()

    await expect(store.duplicate({}, '非法主题')).rejects.toThrow()
    await expect(store.duplicate({ ...profile, id: '00000000-0000-4000-8000-000000000099' }, '未知主题')).rejects.toThrow()
    await expect(store.duplicate({ ...profile, hero: { ...profile.hero, sourceImage: '../outside.png' } }, '越界主题')).rejects.toThrow('escapes')
    await expect(store.duplicate({ ...profile, hero: { ...profile.hero, sourceImage: 'assets/missing.png' } }, '缺失素材')).rejects.toThrow()
    await expect(store.duplicate(profile, 123)).rejects.toThrow('1-80')
    await expect(store.duplicate(profile, 'x'.repeat(81))).rejects.toThrow('1-80')

    expect((await readdir(store.themesRoot)).sort()).toEqual(originalDirectories)
  })

  it('rejects unsupported, mismatched, collection, and oversized font files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-font-validation-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const profile = await store.create('字体校验')

    const mismatched = join(root, 'mismatch.woff2')
    await writeFile(mismatched, Buffer.from('OTTO'))
    await expect(store.importFontAsset(profile.id, mismatched)).rejects.toThrow('header')
    const collection = join(root, 'collection.ttf')
    await writeFile(collection, Buffer.from('ttcf'))
    await expect(store.importFontAsset(profile.id, collection)).rejects.toThrow('collection')
    const unsupported = join(root, 'collection.ttc')
    await writeFile(unsupported, Buffer.from('ttcf'))
    await expect(store.importFontAsset(profile.id, unsupported)).rejects.toThrow('Unsupported')
    const oversized = join(root, 'large.woff')
    await writeFile(oversized, Buffer.from('wOFF'))
    await truncate(oversized, 12 * 1024 * 1024 + 1)
    await expect(store.importFontAsset(profile.id, oversized)).rejects.toThrow('12 MB')
  })
})
