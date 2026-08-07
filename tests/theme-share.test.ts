import { execFile } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import ffmpegPath from 'ffmpeg-static'
import { unzipSync, zipSync } from 'fflate'
import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'
import { ProfileStore } from './test-profile-store'
import {
  MAX_SHARE_COMPRESSED_BYTES,
  MAX_SHARE_UNCOMPRESSED_BYTES,
  MAX_SHARE_VIDEO_BYTES,
  addShareUncompressedBytes,
  assertShareCompressedSize,
  assertShareEntrySize,
  assertSharePath,
  collectThemeAssets,
  createShareProfile,
  decodeShareZip,
  sha256,
  validateShareContents
} from '../src/main/theme-share'
import { ensureGifInfiniteLoop } from '../src/shared/gif'
import { iconGifPosterAssetKey } from '../src/shared/icon-assets'
import { activateVideoVariant } from '../src/shared/media'
import type { ImportedMediaAsset } from '../src/shared/contracts'
import { CONVERSATION_BUBBLE_CORNERS, CONVERSATION_BUBBLE_PRESETS, createDefaultConversationBubbleStyle, createDefaultTheme, DEFAULT_THEME_COLORS, type ConversationBubbleCorner, type ConversationBubbleCornerAsset } from '../src/shared/theme'

sharp.cache(false)

const roots: string[] = []
const execFileAsync = promisify(execFile)
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64')
const testFont = join(process.cwd(), 'resources', 'shared', 'fonts', 'dancing-script', 'dancing-script-latin-wght-normal.woff2')
const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64')
const CENTRAL_DIRECTORY_SIGNATURE = Buffer.from([0x50, 0x4b, 0x01, 0x02])

function bundledConversationBubbleAssets(resourcesRoot: string): Record<(typeof CONVERSATION_BUBBLE_PRESETS)[number]['id'], Record<ConversationBubbleCorner, string>> {
  return Object.fromEntries(CONVERSATION_BUBBLE_PRESETS.map((preset) => [
    preset.id,
    Object.fromEntries(CONVERSATION_BUBBLE_CORNERS.map((corner) => [corner, join(resourcesRoot, 'conversation-bubbles', preset.id, `${corner}.png`)]))
  ])) as Record<(typeof CONVERSATION_BUBBLE_PRESETS)[number]['id'], Record<ConversationBubbleCorner, string>>
}

async function writeTransparentCorner(path: string): Promise<void> {
  const width = 64
  const height = 64
  const pixels = Buffer.alloc(width * height * 4)
  for (let y = 8; y < height - 8; y += 1) {
    for (let x = 8; x < width - 8; x += 1) {
      const offset = (y * width + x) * 4
      pixels[offset] = 230
      pixels[offset + 1] = 130
      pixels[offset + 2] = 180
      pixels[offset + 3] = 255
    }
  }
  await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toFile(path)
}

function importedCorners(imported: Record<ConversationBubbleCorner, ImportedMediaAsset>): Record<ConversationBubbleCorner, ConversationBubbleCornerAsset> {
  return Object.fromEntries(CONVERSATION_BUBBLE_CORNERS.map((corner) => [corner, {
    reference: imported[corner].reference,
    width: imported[corner].width,
    height: imported[corner].height
  }])) as Record<ConversationBubbleCorner, ConversationBubbleCornerAsset>
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })))
})

describe('theme share packages', () => {
  it('keeps both local video variants but always shares the portable optimized variant', () => {
    const profile = createDefaultTheme('11111111-1111-4111-8111-111111111111')
    profile.hero.source = {
      asset: 'assets/hero.webm',
      kind: 'video',
      mimeType: 'video/webm',
      videoVariants: {
        active: 'original',
        original: { asset: 'assets/hero.webm', mimeType: 'video/webm', width: 3840, height: 2160, frameRate: 59.94 },
        optimized: { asset: 'assets/hero-optimized.mp4', mimeType: 'video/mp4', width: 1920, height: 1080, frameRate: 30 }
      }
    }

    expect(collectThemeAssets(profile)).toEqual(expect.arrayContaining(['assets/hero.webm', 'assets/hero-optimized.mp4']))
    const shared = createShareProfile(profile)
    expect(shared.hero.source).toEqual({ asset: 'assets/hero-optimized.mp4', kind: 'video', mimeType: 'video/mp4' })
    expect(collectThemeAssets(shared)).toContain('assets/hero-optimized.mp4')
    expect(collectThemeAssets(shared)).not.toContain('assets/hero.webm')
  })

  it('enforces ZIP64-safe compressed, expanded, and per-video byte budgets', () => {
    expect(MAX_SHARE_COMPRESSED_BYTES).toBe(20 * 1024 ** 3)
    expect(MAX_SHARE_UNCOMPRESSED_BYTES).toBe(10 * 1024 ** 3)
    expect(MAX_SHARE_VIDEO_BYTES).toBe(2 * 1024 ** 3)
    expect(() => assertShareCompressedSize(MAX_SHARE_COMPRESSED_BYTES)).not.toThrow()
    expect(() => assertShareCompressedSize(MAX_SHARE_COMPRESSED_BYTES + 1)).toThrow('20 GiB')
    expect(() => assertShareEntrySize('assets/video.mp4', MAX_SHARE_VIDEO_BYTES)).not.toThrow()
    expect(() => assertShareEntrySize('assets/video.mp4', MAX_SHARE_VIDEO_BYTES + 1)).toThrow('单个条目')
    expect(addShareUncompressedBytes(4 * 1024 ** 3, 4 * 1024 ** 3)).toBe(8 * 1024 ** 3)
    expect(addShareUncompressedBytes(MAX_SHARE_UNCOMPRESSED_BYTES - 1, 1)).toBe(MAX_SHARE_UNCOMPRESSED_BYTES)
    expect(() => addShareUncompressedBytes(MAX_SHARE_UNCOMPRESSED_BYTES, 1)).toThrow('10 GiB')
    let syntheticZip64Total = 0
    for (let index = 0; index < 5; index += 1) syntheticZip64Total = addShareUncompressedBytes(syntheticZip64Total, MAX_SHARE_VIDEO_BYTES)
    expect(syntheticZip64Total).toBe(MAX_SHARE_UNCOMPRESSED_BYTES)
    expect(() => addShareUncompressedBytes(syntheticZip64Total, 1)).toThrow('10 GiB')
  })

  it('does not replace an existing share when export budget validation fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-share-export-budget-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const profile = await store.create('导出预算')
    const asset = 'assets/oversized.png'
    const assetPath = join(store.themesRoot, profile.id, asset)
    await mkdir(join(store.themesRoot, profile.id, 'assets'), { recursive: true })
    await writeFile(assetPath, png)
    await truncate(assetPath, 30 * 1024 * 1024 + 1)
    profile.hero.source = { asset, kind: 'image', mimeType: 'image/png' }
    const destination = join(root, 'existing.cdstheme')
    const original = Buffer.from('existing share')
    await writeFile(destination, original)

    await expect(store.exportSharePackage(profile, destination)).rejects.toThrow('30 MB')
    expect(await readFile(destination)).toEqual(original)
  })

  it('exports the current draft once per referenced asset, including WebP, and imports it as a new theme', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-share-'))
    roots.push(root)
    const resourcesRoot = join(process.cwd(), 'resources', 'shared')
    const store = new ProfileStore(root, {
      hero: join(resourcesRoot, 'dream-reference.png'),
      polaroid: join(resourcesRoot, 'dream-polaroid.png'),
      conversationBubbles: bundledConversationBubbleAssets(resourcesRoot)
    })
    await store.initialize()
    const original = await store.create('分享主题')
    const source = join(root, 'hero.png')
    const polaroidSource = join(root, 'polaroid.webp')
    const gifSource = join(root, 'composer.gif')
    const cornerSource = join(root, 'bubble-corner.png')
    const fontSource = join(root, 'title.woff2')
    await writeFile(source, png)
    await sharp({ create: { width: 2, height: 2, channels: 4, background: '#7651d6' } }).webp().toFile(polaroidSource)
    await writeFile(gifSource, gif)
    await writeTransparentCorner(cornerSource)
    await copyFile(testFont, fontSource)
    const image = await store.importAsset(original.id, source, 'hero')
    const polaroidImage = await store.importAsset(original.id, polaroidSource, 'polaroid')
    const windowReference = { asset: image.relativePath, kind: 'image' as const, mimeType: 'image/png' as const }
    const composerGif = await store.importMediaAsset(original.id, gifSource, 'composerMelody', 'gif')
    const importedCornerSet = Object.fromEntries(await Promise.all(CONVERSATION_BUBBLE_CORNERS.map(async (corner) => [corner, await store.importConversationBubbleCornerAsset(original.id, cornerSource, 'codex', corner)]))) as Record<ConversationBubbleCorner, ImportedMediaAsset>
    const cornerAssets = importedCorners(importedCornerSet)
    const font = await store.importFontAsset(original.id, fontSource)
    const draft = structuredClone(original)
    draft.copy['zh-CN'].brandTitle = '尚未保存的分享标题'
    draft.copy['en-US'].brandTitle = 'Unsaved shared title'
    draft.colors.accent = '#123456'
    draft.decorations.sparkles.performanceMode = 'quality'
    draft.hero.sourceImage = image.relativePath
    draft.polaroid.sourceImage = polaroidImage.relativePath
    draft.hero.mediaTransform = { flipHorizontal: true, flipVertical: false }
    draft.polaroid.mediaTransform = { flipHorizontal: false, flipVertical: true }
    draft.windowBackground.visible = true
    draft.windowBackground.mode = 'image'
    draft.windowBackground.source = windowReference
    draft.accountMenuBackground = {
      mode: 'gif',
      source: composerGif.reference,
      opacity: .72,
      focus: { x: .25, y: .75 },
      scale: 1.4
    }
    draft.windowBackground.masks = [{
      id: '22222222-2222-4222-8222-222222222222',
      visible: true,
      paint: { kind: 'solid', color: '#123456' },
      opacity: .4,
      shape: 'ellipse',
      position: { x: .5, y: .5 },
      size: { width: .6, height: .5 },
      softness: 18,
      cornerRadius: 28
    }]
    draft.icons.branding = { kind: 'asset', asset: image.relativePath }
    draft.icons.sidebarSearch = { kind: 'asset', asset: composerGif.relativePath }
    draft.icons.composerAdd = { kind: 'asset', asset: composerGif.relativePath }
    draft.icons.composerMicrophone = { kind: 'asset', asset: image.relativePath }
    draft.brandSignature = { mode: 'gif', source: composerGif.reference, mediaWidth: 136 }
    draft.decorations.composerMelody.source = composerGif.reference
    draft.typography.importedFonts.push({ id: font.id, family: font.family, asset: font.relativePath, originalName: font.originalName, format: font.format })
    draft.typography.slots.brandTitle = { kind: 'imported', id: font.id }
    draft.conversationBubbles.user = {
      source: { kind: 'preset', presetId: 'cloud-sprout' },
      contentPadding: 20,
      cornerOffsets: { ...createDefaultConversationBubbleStyle().cornerOffsets, topLeft: { x: 16, y: -8 } }
    }
    draft.conversationBubbles.codex = {
      source: { kind: 'custom', corners: cornerAssets, borderColor: '#78909c', borderWidth: 2, borderRadius: 18, ornamentSize: 58, ornamentOutset: 5 },
      contentPadding: 28,
      cornerOffsets: { ...createDefaultConversationBubbleStyle().cornerOffsets, topRight: { x: -12, y: 20 } }
    }
    draft.conversationBubbles.plan = {
      source: { kind: 'custom', corners: cornerAssets, borderColor: '#6a8f76', borderWidth: 1, borderRadius: 24, ornamentSize: 64, ornamentOutset: 7 },
      contentPadding: 24,
      cornerOffsets: { ...createDefaultConversationBubbleStyle().cornerOffsets, bottomLeft: { x: 32, y: -32 } }
    }
    draft.toolActivityBubbles.visible = false
    const packagePath = join(root, 'design.cdstheme')
    await store.exportSharePackage(draft, packagePath)
    expect((await stat(packagePath)).isFile()).toBe(true)
    const archive = unzipSync(await readFile(packagePath))
    expect(Object.keys(archive).every((path) => !path.includes('\\') && !path.startsWith('/'))).toBe(true)
    expect(Buffer.from(archive['theme.json']!).toString('utf8')).not.toContain(root)
    expect(Object.keys(archive).sort()).toEqual([font.relativePath, image.relativePath, polaroidImage.relativePath, composerGif.relativePath, ...Object.values(importedCornerSet).map((asset) => asset.relativePath), 'manifest.json', 'theme.json'].sort())
    expect(Buffer.from(archive['theme.json']!).toString('utf8')).not.toContain('icon-posters')
    expect(JSON.parse(Buffer.from(archive['manifest.json']!).toString('utf8'))).toMatchObject({ profileVersion: 32 })
    const rawProfile = JSON.parse(Buffer.from(archive['theme.json']!).toString('utf8')) as Record<string, unknown>
    expect(rawProfile).not.toHaveProperty('locale')
    expect(rawProfile).not.toHaveProperty('contentLocale')
    const checked = validateShareContents(new Map(Object.entries(archive).map(([path, data]) => [path, Buffer.from(data)])))
    expect(checked.profile.copy['zh-CN'].brandTitle).toBe('尚未保存的分享标题')
    expect(checked.profile.copy['en-US'].brandTitle).toBe('Unsaved shared title')
    expect(checked.profile.brandSignature).toEqual(draft.brandSignature)
    expect(checked.profile.decorations.composerMelody.source).toEqual(composerGif.reference)
    expect(checked.profile.windowBackground.source).toEqual(windowReference)
    expect(checked.profile.accountMenuBackground).toEqual(draft.accountMenuBackground)
    expect(checked.profile.conversationBubbles.user.source).toEqual({ kind: 'preset', presetId: 'cloud-sprout' })
    expect(checked.profile.conversationBubbles.codex).toEqual(draft.conversationBubbles.codex)
    expect(checked.profile.conversationBubbles.plan).toEqual(draft.conversationBubbles.plan)
    expect(checked.profile.icons.composerAdd).toEqual(draft.icons.composerAdd)
    expect(checked.profile.icons.composerMicrophone).toEqual(draft.icons.composerMicrophone)
    expect(checked.profile.resetColors.accent).toBe(original.resetColors.accent)
    expect(checked.profile.toolActivityBubbles).toEqual({ visible: false })

    const rawManifest = JSON.parse(Buffer.from(archive['manifest.json']!).toString('utf8')) as {
      assets: Array<{ path: string; size: number; sha256: string }>
    }
    const rawGifEntry = rawManifest.assets.find((asset) => asset.path === composerGif.relativePath)
    if (!rawGifEntry) throw new Error('Shared GIF manifest entry is missing.')
    rawGifEntry.size = gif.length
    rawGifEntry.sha256 = sha256(gif)
    archive[composerGif.relativePath] = gif
    archive['manifest.json'] = Buffer.from(`${JSON.stringify(rawManifest, null, 2)}\n`)
    await writeFile(packagePath, zipSync(archive))

    const imported = await store.importSharePackage(packagePath)
    expect(imported.id).not.toBe(original.id)
    expect(imported.name).toBe(draft.name)
    expect(imported.accountMenuBackground).toEqual(draft.accountMenuBackground)
    expect(imported.icons.sidebarSearch).toEqual(draft.icons.sidebarSearch)
    expect(imported.copy['zh-CN'].brandTitle).toBe('尚未保存的分享标题')
    expect(imported.copy['en-US'].brandTitle).toBe('Unsaved shared title')
    expect(imported.brandSignature).toEqual(draft.brandSignature)
    expect(imported.colors).toEqual(draft.colors)
    expect(imported.decorations.sparkles.performanceMode).toBe('quality')
    expect(imported.resetColors).toEqual(draft.colors)
    expect(imported.toolActivityBubbles).toEqual({ visible: false })
    expect(imported.conversationBubbles.user.source).toEqual({ kind: 'preset', presetId: 'cloud-sprout' })
    expect(imported.conversationBubbles.codex).toEqual(draft.conversationBubbles.codex)
    expect(imported.conversationBubbles.plan).toEqual(draft.conversationBubbles.plan)
    expect(imported.hero.mediaTransform).toEqual({ flipHorizontal: true, flipVertical: false })
    expect(imported.polaroid.mediaTransform).toEqual({ flipHorizontal: false, flipVertical: true })
    expect(imported.polaroid.sourceImage).toBe(polaroidImage.relativePath)
    expect(imported.windowBackground).toMatchObject({ visible: true, mode: 'image', source: windowReference, masks: [{ id: '22222222-2222-4222-8222-222222222222', shape: 'ellipse' }] })
    expect(Date.parse(imported.updatedAt)).toBeGreaterThanOrEqual(Date.parse(original.updatedAt))
    expect((await store.get(original.id)).copy['zh-CN'].brandTitle).not.toBe(imported.copy['zh-CN'].brandTitle)
    expect(await readFile(join(store.themesRoot, imported.id, composerGif.relativePath))).toEqual(Buffer.from(ensureGifInfiniteLoop(gif)))
    const compiled = await store.compile(imported.id)
    expect(compiled.assets[image.relativePath]).toBe(`data:image/png;base64,${png.toString('base64')}`)
    expect(compiled.assets[font.relativePath]).toBe(font.dataUrl)
    expect(compiled.assets[composerGif.relativePath]).toBe(`data:image/gif;base64,${Buffer.from(ensureGifInfiniteLoop(gif)).toString('base64')}`)
    expect(compiled.assets[iconGifPosterAssetKey(composerGif.relativePath)]).toMatch(/^data:image\/png;base64,/)
    expect(compiled.assets[polaroidImage.relativePath]).toMatch(/^data:image\/webp;base64,/)
    expect((await readdir(store.themesRoot)).filter((name) => name.startsWith('.cdstheme-import-'))).toHaveLength(0)
  })

  it('imports valid nonportable videos for later conversion but blocks export and runtime use', async () => {
    if (!ffmpegPath) throw new Error('Bundled FFmpeg is unavailable.')
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-share-nonportable-video-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const original = await store.create('待转换视频分享')
    const packagePath = join(root, 'nonportable.cdstheme')
    await store.exportSharePackage(original, packagePath)

    const sourcePath = join(root, 'nonportable.mp4')
    await execFileAsync(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24',
      '-t', '0.5', '-an', '-c:v', 'mpeg4', sourcePath
    ])
    const video = await readFile(sourcePath)
    const asset = 'assets/shared-window.mp4'
    const archive = unzipSync(await readFile(packagePath))
    const sharedProfile = JSON.parse(Buffer.from(archive['theme.json']!).toString('utf8')) as ReturnType<typeof createDefaultTheme>
    sharedProfile.windowBackground.visible = true
    sharedProfile.windowBackground.mode = 'video'
    sharedProfile.windowBackground.source = { asset, kind: 'video', mimeType: 'video/mp4' }
    const manifest = JSON.parse(Buffer.from(archive['manifest.json']!).toString('utf8')) as {
      assets: Array<{ path: string; kind: 'image' | 'video' | 'font'; size: number; sha256: string }>
    }
    manifest.assets.push({ path: asset, kind: 'video', size: video.byteLength, sha256: sha256(video) })
    archive[asset] = video
    archive['theme.json'] = Buffer.from(`${JSON.stringify(sharedProfile, null, 2)}\n`)
    archive['manifest.json'] = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)
    await writeFile(packagePath, zipSync(archive))

    const imported = await store.importSharePackage(packagePath)
    expect(imported.windowBackground.source).toEqual({ asset, kind: 'video', mimeType: 'video/mp4' })
    await expect(store.inspectReferencedVideo(imported.id, asset)).resolves.toMatchObject({ portable: false })
    await expect(store.update(imported)).resolves.toMatchObject({ id: imported.id })
    await expect(store.duplicate(imported, '待转换视频副本')).resolves.toMatchObject({ windowBackground: { source: { asset } } })
    await expect(store.exportSharePackage(imported, join(root, 'blocked-export.cdstheme'))).rejects.toThrow('请先转换视频')
    await expect(store.assertRuntimeVideoCompatibility(imported.id)).rejects.toThrow('1 个视频需要转换')

    const optimized = await store.optimizeReferencedVideo(imported.id, 'windowBackground', asset, {
      maxWidth: 320,
      maxHeight: 180,
      frameRate: 20,
      videoBitRate: 1_000_000
    })
    expect(optimized.reference.videoVariants).toMatchObject({ active: 'optimized', original: { asset } })
    const optimizedAsset = optimized.reference.videoVariants?.optimized.asset
    if (!optimizedAsset) throw new Error('Optimized shared video is missing.')
    imported.windowBackground.source = optimized.reference
    await store.update(imported)
    const optimizedPackage = join(root, 'optimized-export.cdstheme')
    await expect(store.exportSharePackage(imported, optimizedPackage)).resolves.toBeUndefined()
    await expect(store.assertRuntimeVideoCompatibility(imported.id)).resolves.toBeUndefined()
    const optimizedArchive = unzipSync(await readFile(optimizedPackage))
    expect(optimizedArchive[optimizedAsset]).toBeDefined()
    expect(optimizedArchive[asset]).toBeUndefined()

    imported.windowBackground.source = activateVideoVariant(optimized.reference, 'original')
    await store.update(imported)
    await expect(store.exportSharePackage(imported, join(root, 'original-active-export.cdstheme'))).rejects.toThrow('请先转换视频')
    await expect(store.assertRuntimeVideoCompatibility(imported.id)).rejects.toThrow('1 个视频需要转换')

    imported.windowBackground.source = activateVideoVariant(imported.windowBackground.source, 'optimized')
    await store.update(imported)
    await expect(store.exportSharePackage(imported, join(root, 'optimized-active-export.cdstheme'))).resolves.toBeUndefined()
    await expect(store.assertRuntimeVideoCompatibility(imported.id)).resolves.toBeUndefined()
    expect((await readdir(store.themesRoot)).filter((name) => name.startsWith('.cdstheme-import-'))).toHaveLength(0)
  })

  it('imports v11 share packages with neutral flip defaults', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-share-v11-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const original = await store.create('旧分享主题')
    const source = join(root, 'hero.png')
    await writeFile(source, png)
    const image = await store.importAsset(original.id, source, 'hero')
    const current = structuredClone(original)
    current.hero.sourceImage = image.relativePath
    current.colors.accent = '#2878B8'
    const { mediaTransform: _heroTransform, ...hero } = current.hero
    const { mediaTransform: _polaroidTransform, ...polaroid } = current.polaroid
    const { resetColors: _resetColors, videoPlayback: _videoPlayback, ...currentWithoutResetColors } = { ...current, copy: current.copy['zh-CN'] }
    const legacy = { ...currentWithoutResetColors, version: 11, hero, polaroid }
    const packagePath = join(root, 'v11.cdstheme')
    await store.exportSharePackage(legacy, packagePath)
    const archive = unzipSync(await readFile(packagePath))
    const manifest = JSON.parse(Buffer.from(archive['manifest.json']!).toString('utf8')) as { profileVersion: number }
    manifest.profileVersion = 11
    archive['theme.json'] = Buffer.from(JSON.stringify(legacy))
    await writeFile(packagePath, zipSync({ ...archive, 'manifest.json': Buffer.from(JSON.stringify(manifest)) }))

    const imported = await store.importSharePackage(packagePath)
    expect(imported.version).toBe(32)
    expect(imported.videoPlayback).toEqual({ pausePolicy: 'hidden' })
    expect(imported.conversationBubbles).toEqual({
      visible: true,
      user: createDefaultConversationBubbleStyle(),
      codex: createDefaultConversationBubbleStyle(),
      plan: createDefaultConversationBubbleStyle()
    })
    expect(imported.toolActivityBubbles).toEqual({ visible: true })
    expect(imported.resetColors).toEqual(imported.colors)
    expect(imported.resetColors.accent).toBe('#2878B8')
    expect(imported.hero.mediaTransform).toEqual({ flipHorizontal: false, flipVertical: false })
    expect(imported.polaroid.mediaTransform).toEqual({ flipHorizontal: false, flipVertical: false })
  })

  it('inherits tool activity visibility from version nineteen chat bubbles when importing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-share-v19-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const original = await store.create('版本十九分享主题')
    const packagePath = join(root, 'v19.cdstheme')
    await store.exportSharePackage(original, packagePath)
    const archive = unzipSync(await readFile(packagePath))
    const manifest = JSON.parse(Buffer.from(archive['manifest.json']!).toString('utf8')) as { profileVersion: number }
    const { videoPlayback: _videoPlayback, toolActivityBubbles: _toolActivityBubbles, ...legacy } = { ...original, copy: original.copy['zh-CN'] }
    manifest.profileVersion = 19
    archive['theme.json'] = Buffer.from(JSON.stringify({ ...legacy, version: 19, conversationBubbles: { visible: false } }))
    await writeFile(packagePath, zipSync({ ...archive, 'manifest.json': Buffer.from(JSON.stringify(manifest)) }))

    const imported = await store.importSharePackage(packagePath)
    expect(imported.version).toBe(32)
    expect(imported.conversationBubbles).toEqual({
      visible: false,
      user: createDefaultConversationBubbleStyle(),
      codex: createDefaultConversationBubbleStyle(),
      plan: createDefaultConversationBubbleStyle()
    })
    expect(imported.toolActivityBubbles).toEqual({ visible: false })
  })

  it('validates then removes unreferenced v29 custom bubble assets during import', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-share-v29-bubble-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const original = await store.create('版本二十九气泡分享')
    const source = join(root, 'legacy-bubble.png')
    await writeFile(source, png)
    const image = await store.importAsset(original.id, source, 'hero')
    const imageReference = { asset: image.relativePath, kind: 'image' as const, mimeType: 'image/png' as const }
    original.hero.source = imageReference
    const packagePath = join(root, 'v29-bubble.cdstheme')
    await store.exportSharePackage(original, packagePath)

    const archive = unzipSync(await readFile(packagePath))
    const manifest = JSON.parse(Buffer.from(archive['manifest.json']!).toString('utf8')) as { profileVersion: number }
    const legacyStyle = { fit: 'nineSlice', slice: 25, frameWidth: 24, contentPadding: 20 }
    const legacy = {
      ...original,
      version: 29,
      hero: { ...original.hero, source: null },
      conversationBubbles: {
        visible: true,
        user: { ...legacyStyle, source: { kind: 'preset', presetId: 'moon-stars' } },
        codex: { ...legacyStyle, source: { kind: 'custom', reference: imageReference } },
        plan: { ...legacyStyle, source: { kind: 'none' } }
      }
    }
    manifest.profileVersion = 29
    archive['theme.json'] = Buffer.from(JSON.stringify(legacy))
    archive['manifest.json'] = Buffer.from(JSON.stringify(manifest))
    await writeFile(packagePath, zipSync(archive))

    const imported = await store.importSharePackage(packagePath)
    expect(imported.version).toBe(32)
    expect(imported.conversationBubbles.user.source).toEqual({ kind: 'preset', presetId: 'moon-stars' })
    expect(imported.conversationBubbles.codex.source).toEqual({ kind: 'none' })
    await expect(readFile(join(store.themesRoot, imported.id, image.relativePath))).rejects.toThrow()

    const migratedPackage = join(root, 'migrated-v30.cdstheme')
    await store.exportSharePackage(imported, migratedPackage)
    expect(Object.keys(unzipSync(await readFile(migratedPackage)))).toEqual(expect.arrayContaining(['manifest.json', 'theme.json']))
    expect(unzipSync(await readFile(migratedPackage))[image.relativePath]).toBeUndefined()
  })

  it('imports v30 layered bubble packages with zeroed v31 corner offsets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-share-v30-bubble-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const original = await store.create('版本三十气泡分享')
    original.conversationBubbles.user.source = { kind: 'preset', presetId: 'sakura-ribbon' }
    const packagePath = join(root, 'v30-bubble.cdstheme')
    await store.exportSharePackage(original, packagePath)

    const archive = unzipSync(await readFile(packagePath))
    const manifest = JSON.parse(Buffer.from(archive['manifest.json']!).toString('utf8')) as { profileVersion: number }
    const legacy = JSON.parse(Buffer.from(archive['theme.json']!).toString('utf8')) as {
      version: number
      conversationBubbles: { user: Record<string, unknown>; codex: Record<string, unknown>; plan: Record<string, unknown> }
    }
    legacy.version = 30
    delete legacy.conversationBubbles.user.cornerOffsets
    delete legacy.conversationBubbles.codex.cornerOffsets
    delete legacy.conversationBubbles.plan.cornerOffsets
    manifest.profileVersion = 30
    archive['theme.json'] = Buffer.from(JSON.stringify(legacy))
    archive['manifest.json'] = Buffer.from(JSON.stringify(manifest))
    await writeFile(packagePath, zipSync(archive))

    const imported = await store.importSharePackage(packagePath)
    expect(imported.version).toBe(32)
    expect(imported.conversationBubbles.user.source).toEqual({ kind: 'preset', presetId: 'sakura-ribbon' })
    expect(imported.conversationBubbles.user.cornerOffsets).toEqual(createDefaultConversationBubbleStyle().cornerOffsets)
  })

  it('repairs generated version sixteen title colors while importing shares', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-share-v16-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const original = await store.create({ name: '版本十六分享主题', colors: { ...DEFAULT_THEME_COLORS, ink: '#214537' } })
    const packagePath = join(root, 'v16.cdstheme')
    await store.exportSharePackage(original, packagePath)
    const archive = unzipSync(await readFile(packagePath))
    const manifest = JSON.parse(Buffer.from(archive['manifest.json']!).toString('utf8')) as { profileVersion: number }
    const generatedColor = '#556677'
    const { videoPlayback: _videoPlayback, ...versionSixteen } = { ...original, copy: original.copy['zh-CN'] }
    const legacy = {
      ...versionSixteen,
      version: 16,
      appearance: {
        ...original.appearance,
        colors: {
          sidebarProjectsTitleText: generatedColor,
          sidebarProjectsTitleHoverText: generatedColor,
          sidebarTasksTitleText: generatedColor,
          sidebarTasksTitleHoverText: '#abcdef'
        }
      }
    }
    manifest.profileVersion = 16
    archive['theme.json'] = Buffer.from(JSON.stringify(legacy))
    await writeFile(packagePath, zipSync({ ...archive, 'manifest.json': Buffer.from(JSON.stringify(manifest)) }))

    const imported = await store.importSharePackage(packagePath)
    expect(imported.version).toBe(32)
    expect(imported.conversationBubbles).toEqual({
      visible: true,
      user: createDefaultConversationBubbleStyle(),
      codex: createDefaultConversationBubbleStyle(),
      plan: createDefaultConversationBubbleStyle()
    })
    expect(imported.toolActivityBubbles).toEqual({ visible: true })
    expect(imported.resetColors).toEqual(imported.colors)
    expect(imported.appearance.colors).toEqual({ sidebarTasksTitleHoverText: '#abcdef' })
  })

  it('rejects altered manifests without creating a theme', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-share-invalid-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const original = await store.create('安全分享')
    const packagePath = join(root, 'design.cdstheme')
    await store.exportSharePackage(original, packagePath)
    const archive = unzipSync(await readFile(packagePath))
    const manifest = JSON.parse(Buffer.from(archive['manifest.json']!).toString('utf8')) as { format: string }
    manifest.format = 'unknown-theme-format'
    const alteredPath = join(root, 'altered.cdstheme')
    await writeFile(alteredPath, zipSync({ ...archive, 'manifest.json': Buffer.from(JSON.stringify(manifest)) }))
    const before = await readdir(store.themesRoot)
    await expect(store.importSharePackage(alteredPath)).rejects.toThrow()
    expect(await readdir(store.themesRoot)).toEqual(before)
  })

  it('rejects declared and actual ZIP sizes that disagree and cleans temporary extraction', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-share-size-mismatch-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const archive = zipSync({
      'manifest.json': Buffer.from('{}'),
      'theme.json': Buffer.from('{}')
    })
    const packagePath = join(root, 'size-mismatch.cdstheme')
    await writeFile(packagePath, patchCentralUncompressedSize(archive, 'manifest.json', 3))

    await expect(store.importSharePackage(packagePath)).rejects.toThrow()
    expect((await readdir(store.themesRoot)).filter((name) => name.startsWith('.cdstheme-import-'))).toHaveLength(0)
  })

  it('rejects malformed archive paths before parsing theme content', () => {
    expect(() => decodeShareZip(new Uint8Array([1, 2, 3]))).toThrow()
    expect(() => decodeShareZip(zipSync({ '../outside.png': png }))).toThrow('路径无效')
    expect(() => decodeShareZip(zipSync({ 'assets\\windows-path.png': png }))).toThrow('路径无效')
    expect(() => decodeShareZip(zipSync({ 'C:/assets/absolute.png': png }))).toThrow('路径无效')
    for (const path of ['assets/CON.png', 'assets/nul.webp', 'assets/nested/Com1.mp4', 'assets/LPT9.font.woff2', 'assets/CLOCK$', 'assets/NUL .txt', 'assets/nested/con .png']) {
      expect(() => assertSharePath(path), path).toThrow('路径无效')
    }
    expect(() => assertSharePath('assets/console.png')).not.toThrow()
    expect(() => assertSharePath('assets/com10.png')).not.toThrow()
    const tooManyEntries = Object.fromEntries(Array.from({ length: 129 }, (_, index) => [`assets/image-${index}.png`, new Uint8Array()]))
    expect(() => decodeShareZip(zipSync(tooManyEntries))).toThrow('条目数量')
  })

  it('rejects extra files, wrong hashes, and invalid images before committing an import', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-share-content-'))
    roots.push(root)
    const store = new ProfileStore(root)
    await store.initialize()
    const profile = await store.create('内容校验')
    const source = join(root, 'hero.png')
    await writeFile(source, png)
    const image = await store.importAsset(profile.id, source, 'hero')
    profile.hero.sourceImage = image.relativePath
    const packagePath = join(root, 'base.cdstheme')
    await store.exportSharePackage(profile, packagePath)
    const archive = unzipSync(await readFile(packagePath))
    const originalDirectories = await readdir(store.themesRoot)

    const extraPath = join(root, 'extra.cdstheme')
    await writeFile(extraPath, zipSync({ ...archive, 'assets/extra.png': png }))
    await expect(store.importSharePackage(extraPath)).rejects.toThrow('未列出的素材')

    const manifest = JSON.parse(Buffer.from(archive['manifest.json']!).toString('utf8')) as { assets: Array<{ path: string; size: number; sha256: string }> }
    const hashedPath = join(root, 'hash.cdstheme')
    const wrongHashManifest = structuredClone(manifest)
    wrongHashManifest.assets[0]!.sha256 = '0'.repeat(64)
    await writeFile(hashedPath, zipSync({ ...archive, 'manifest.json': Buffer.from(JSON.stringify(wrongHashManifest)) }))
    await expect(store.importSharePackage(hashedPath)).rejects.toThrow('素材校验失败')

    const invalidImagePath = join(root, 'invalid-image.cdstheme')
    const invalidImage = Buffer.from('not an image')
    const invalidManifest = structuredClone(manifest)
    invalidManifest.assets[0]!.size = invalidImage.byteLength
    invalidManifest.assets[0]!.sha256 = sha256(invalidImage)
    await writeFile(invalidImagePath, zipSync({ ...archive, [image.relativePath]: invalidImage, 'manifest.json': Buffer.from(JSON.stringify(invalidManifest)) }))
    await expect(store.importSharePackage(invalidImagePath)).rejects.toThrow()
    expect(await readdir(store.themesRoot)).toEqual(originalDirectories)
  })
})

function patchCentralUncompressedSize(source: Uint8Array, entryName: string, size: number): Buffer {
  const archive = Buffer.from(source)
  let offset = 0
  while (offset < archive.length) {
    const entryOffset = archive.indexOf(CENTRAL_DIRECTORY_SIGNATURE, offset)
    if (entryOffset < 0) break
    const nameLength = archive.readUInt16LE(entryOffset + 28)
    const extraLength = archive.readUInt16LE(entryOffset + 30)
    const commentLength = archive.readUInt16LE(entryOffset + 32)
    const nameStart = entryOffset + 46
    const name = archive.toString('utf8', nameStart, nameStart + nameLength)
    if (name === entryName) {
      archive.writeUInt32LE(size, entryOffset + 24)
      return archive
    }
    offset = nameStart + nameLength + extraLength + commentLength
  }
  throw new Error(`ZIP central directory entry is missing: ${entryName}`)
}
