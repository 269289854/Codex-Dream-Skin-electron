import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'
import { compileTheme } from '../src/main/theme-compiler'
import {
  CONVERSATION_BUBBLE_PRESET_STYLES,
  conversationBubblePresetAssetKey,
  resolveConversationBubbles
} from '../src/shared/conversation-bubbles'
import {
  CONVERSATION_BUBBLE_CORNERS,
  CONVERSATION_BUBBLE_PRESETS,
  createDefaultTheme,
  type ConversationBubbleCorner,
  type ConversationBubbleCornerAsset
} from '../src/shared/theme'

const themeId = '11111111-1111-4111-8111-111111111111'
const presetRoot = join(process.cwd(), 'resources', 'shared', 'conversation-bubbles')

function customCorners(): Record<ConversationBubbleCorner, ConversationBubbleCornerAsset> {
  return Object.fromEntries(CONVERSATION_BUBBLE_CORNERS.map((corner, index) => [corner, {
    reference: { asset: `assets/${corner}.png`, kind: 'image', mimeType: 'image/png' },
    width: index % 2 === 0 ? 320 : 160,
    height: index % 2 === 0 ? 160 : 320
  }])) as Record<ConversationBubbleCorner, ConversationBubbleCornerAsset>
}

describe('conversation bubble frames', () => {
  it('ships eight unique four-corner PNG sets with transparent safety margins under 200 KB each', async () => {
    expect(CONVERSATION_BUBBLE_PRESETS).toHaveLength(8)
    expect(new Set(CONVERSATION_BUBBLE_PRESETS.map((preset) => preset.id)).size).toBe(8)
    const rootEntries = await readdir(presetRoot, { withFileTypes: true })
    expect(rootEntries.filter((entry) => entry.isFile() && entry.name.endsWith('.png'))).toHaveLength(0)
    expect(rootEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()).toEqual(CONVERSATION_BUBBLE_PRESETS.map((preset) => preset.id).sort())

    const hashes = new Set<string>()
    for (const preset of CONVERSATION_BUBBLE_PRESETS) {
      let totalBytes = 0
      for (const corner of CONVERSATION_BUBBLE_CORNERS) {
        const path = join(presetRoot, preset.id, `${corner}.png`)
        const bytes = await readFile(path)
        totalBytes += (await stat(path)).size
        const hash = createHash('sha256').update(bytes).digest('hex')
        expect(hashes.has(hash)).toBe(false)
        hashes.add(hash)

        const image = sharp(bytes)
        const metadata = await image.metadata()
        expect(metadata).toMatchObject({ format: 'png', width: 256, height: 256, hasAlpha: true })
        const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
        let minX = info.width
        let minY = info.height
        let maxX = -1
        let maxY = -1
        for (let y = 0; y < info.height; y += 1) {
          for (let x = 0; x < info.width; x += 1) {
            const alpha = data[(y * info.width + x) * info.channels + 3] ?? 0
            if (alpha === 0) continue
            minX = Math.min(minX, x)
            minY = Math.min(minY, y)
            maxX = Math.max(maxX, x)
            maxY = Math.max(maxY, y)
          }
        }
        expect({ minX, minY, maxX, maxY }).toMatchObject({
          minX: expect.any(Number),
          minY: expect.any(Number),
          maxX: expect.any(Number),
          maxY: expect.any(Number)
        })
        expect(minX).toBeGreaterThanOrEqual(4)
        expect(minY).toBeGreaterThanOrEqual(4)
        expect(maxX).toBeLessThanOrEqual(251)
        expect(maxY).toBeLessThanOrEqual(251)
      }
      expect(totalBytes).toBeLessThanOrEqual(200 * 1024)
    }
    expect(hashes.size).toBe(32)
  })

  it('resolves none, preset, and custom frames without changing corner aspect ratios', () => {
    const profile = createDefaultTheme(themeId)
    profile.conversationBubbles.user = {
      source: { kind: 'preset', presetId: 'calico-cat' },
      contentPadding: 18
    }
    profile.conversationBubbles.codex = {
      source: {
        kind: 'custom',
        corners: customCorners(),
        borderColor: '#123456',
        borderWidth: 3,
        borderRadius: 22,
        ornamentSize: 72,
        ornamentOutset: 9
      },
      contentPadding: 26
    }
    const assets = Object.fromEntries([
      ...CONVERSATION_BUBBLE_CORNERS.map((corner) => [conversationBubblePresetAssetKey('calico-cat', corner), `data:image/png;base64,${corner}`]),
      ...CONVERSATION_BUBBLE_CORNERS.map((corner) => [`assets/${corner}.png`, `data:image/png;base64,custom-${corner}`])
    ])

    const frames = resolveConversationBubbles(profile.conversationBubbles, assets)
    expect(frames.user).toMatchObject({
      mode: 'layered',
      bodyFill: CONVERSATION_BUBBLE_PRESET_STYLES['calico-cat'].bodyFill,
      borderColor: CONVERSATION_BUBBLE_PRESET_STYLES['calico-cat'].borderColor,
      contentPadding: 18
    })
    expect(frames.user.corners?.topLeft).toMatchObject({ width: 42, height: 42 })
    expect(frames.codex).toMatchObject({
      mode: 'layered',
      bodyFill: null,
      borderColor: '#123456',
      borderWidth: 3,
      borderRadius: 22,
      ornamentSize: 72,
      ornamentOutset: 9,
      contentPadding: 26
    })
    expect(frames.codex.corners?.topLeft).toMatchObject({ width: 72, height: 36 })
    expect(frames.codex.corners?.topRight).toMatchObject({ width: 36, height: 72 })
    expect(frames.plan).toMatchObject({ mode: 'none', corners: null, bodyFill: null })
  })

  it('compiles only the corner sets referenced by the three active roles', async () => {
    const profile = createDefaultTheme(themeId)
    profile.conversationBubbles.user.source = { kind: 'preset', presetId: 'daisy-heart' }
    profile.conversationBubbles.codex.source = { kind: 'preset', presetId: 'daisy-heart' }
    profile.conversationBubbles.plan.source = { kind: 'preset', presetId: 'rainbow-candy' }
    const readPreset = vi.fn(async (presetId: string, corner: string) => `data:image/png;base64,${Buffer.from(`${presetId}-${corner}`).toString('base64')}`)

    const compiled = await compileTheme(profile, async () => { throw new Error('Unexpected custom asset read') }, readPreset)

    expect(readPreset).toHaveBeenCalledTimes(8)
    expect(Object.keys(compiled.assets).filter((asset) => asset.startsWith('builtin/conversation-bubbles/'))).toHaveLength(8)
    for (const presetId of ['daisy-heart', 'rainbow-candy'] as const) {
      for (const corner of CONVERSATION_BUBBLE_CORNERS) {
        expect(compiled.assets[conversationBubblePresetAssetKey(presetId, corner)]).toBe(`data:image/png;base64,${Buffer.from(`${presetId}-${corner}`).toString('base64')}`)
      }
    }
    expect(compiled.assets[conversationBubblePresetAssetKey('calico-cat', 'topLeft')]).toBeUndefined()
  })

  it('keeps Studio and runtime CSS on the same body, ornament, and text layers', async () => {
    const [runtimeCss, studioCss] = await Promise.all([
      readFile(join(process.cwd(), 'resources', 'shared', 'dream-skin.css'), 'utf8'),
      readFile(join(process.cwd(), 'src', 'renderer', 'src', 'styles.css'), 'utf8')
    ])

    expect(runtimeCss).not.toContain('border-image')
    expect(studioCss).not.toContain('border-image')
    expect(runtimeCss).toContain('[data-dream-user-bubble-frame="layered"] .dream-conversation-user-bubble::before')
    expect(runtimeCss).toContain('background-image: var(--dream-user-bubble-corners)')
    expect(runtimeCss).toContain('background-size: var(--dream-user-bubble-corner-sizes)')
    expect(runtimeCss).toContain('background-position: left top, right top, right bottom, left bottom')
    expect(runtimeCss).toContain('padding-inline: max(var(--dream-user-bubble-content-padding), calc(var(--dream-user-bubble-ornament-size) * .9)) !important')
    expect(runtimeCss).toContain('.dream-conversation-plan-bubble > :is(.relative.flex.h-10, .relative.overflow-hidden)')
    expect(runtimeCss).toMatch(/\.dream-conversation-plan-bubble > :is\([^}]+\) \{\s*z-index: 3;/)

    expect(studioCss).toContain('.preview-message.bubble[data-dream-bubble-frame="layered"]::before')
    expect(studioCss).toContain('background-image: var(--dream-preview-bubble-corners)')
    expect(studioCss).toContain('background-size: var(--dream-preview-bubble-corner-sizes)')
    expect(studioCss).toContain('padding-inline: max(var(--dream-preview-bubble-content-padding),calc(var(--dream-preview-bubble-ornament-size) * .9))')
    expect(studioCss).toMatch(/\.preview-message\.bubble\[data-dream-bubble-frame\]:not\([^}]+> \* \{ position: relative; z-index: 3; \}/)
  })
})
