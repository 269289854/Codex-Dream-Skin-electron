import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { compileTheme } from '../src/main/theme-compiler'
import {
  conversationBubblePresetAssetKey,
  resolveConversationBubbles
} from '../src/shared/conversation-bubbles'
import {
  CONVERSATION_BUBBLE_PRESETS,
  createDefaultTheme
} from '../src/shared/theme'

const themeId = '11111111-1111-4111-8111-111111111111'
const presetRoot = join(process.cwd(), 'resources', 'shared', 'conversation-bubbles')
const expectedPresetSlices = {
  'daisy-heart': [65, 25, 28, 25],
  'calico-cat': [58, 25, 27, 25],
  'cloud-sprout': [35, 25, 30, 25],
  'sakura-ribbon': [56, 25, 37, 25],
  'moon-stars': [35, 25, 40, 25],
  'strawberry-leaf': [40, 25, 38, 25],
  'ocean-shell': [46, 25, 48, 25],
  'rainbow-candy': [60, 25, 35, 25]
} as const

describe('conversation bubble frames', () => {
  it('ships eight unique 768x384 transparent PNG presets below 200 KB', async () => {
    expect(CONVERSATION_BUBBLE_PRESETS).toHaveLength(8)
    expect(new Set(CONVERSATION_BUBBLE_PRESETS.map((preset) => preset.id)).size).toBe(8)

    for (const preset of CONVERSATION_BUBBLE_PRESETS) {
      const path = join(presetRoot, preset.fileName)
      expect((await stat(path)).size).toBeLessThanOrEqual(200 * 1024)
      const metadata = await sharp(path).metadata()
      expect(metadata).toMatchObject({ format: 'png', width: 768, height: 384, hasAlpha: true, channels: 4 })

      const { data, info } = await sharp(await readFile(path)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      const alphaAt = (x: number, y: number): number => data[(y * info.width + x) * info.channels + 3] ?? 255
      expect([
        alphaAt(0, 0),
        alphaAt(info.width - 1, 0),
        alphaAt(0, info.height - 1),
        alphaAt(info.width - 1, info.height - 1),
        alphaAt(Math.floor(info.width / 2), Math.floor(info.height / 2))
      ]).toEqual([0, 0, 0, 0, 0])
    }
  })

  it('keeps every preset decoration inside an undistorted asymmetric corner region', () => {
    for (const preset of CONVERSATION_BUBBLE_PRESETS) {
      const profile = createDefaultTheme(themeId)
      profile.conversationBubbles.user = {
        source: { kind: 'preset', presetId: preset.id },
        fit: 'nineSlice',
        slice: 25,
        frameWidth: 24,
        contentPadding: 20
      }
      const frame = resolveConversationBubbles(profile.conversationBubbles, {
        [conversationBubblePresetAssetKey(preset.id)]: `data:image/png;base64,${preset.id}`
      }).user
      const sliceInsets = expectedPresetSlices[preset.id]
      const expectedWidths = [
        Math.round(384 * sliceInsets[0] / 100 * 25) / 100,
        Math.round(768 * sliceInsets[1] / 100 * 25) / 100,
        Math.round(384 * sliceInsets[2] / 100 * 25) / 100,
        Math.round(768 * sliceInsets[3] / 100 * 25) / 100
      ]

      expect(frame.sliceInsets).toEqual(sliceInsets)
      expect(frame.borderWidths).toEqual(expectedWidths)
      expect(frame.sliceInsets[0] + frame.sliceInsets[2]).toBeLessThan(100)
      expect(frame.sliceInsets[1] + frame.sliceInsets[3]).toBeLessThan(100)
    }
  })

  it('resolves user, Codex, and plan frames independently', () => {
    const profile = createDefaultTheme(themeId)
    profile.conversationBubbles.user = {
      source: { kind: 'preset', presetId: 'moon-stars' },
      fit: 'nineSlice',
      slice: 25,
      frameWidth: 24,
      contentPadding: 20
    }
    profile.conversationBubbles.codex = {
      source: {
        kind: 'custom',
        reference: { asset: 'assets/codex-bubble.gif', kind: 'image', mimeType: 'image/gif' }
      },
      fit: 'stretch',
      slice: 31,
      frameWidth: 18,
      contentPadding: 28
    }
    profile.conversationBubbles.plan = {
      source: { kind: 'preset', presetId: 'ocean-shell' },
      fit: 'nineSlice',
      slice: 25,
      frameWidth: 24,
      contentPadding: 20
    }
    const resolved = resolveConversationBubbles(profile.conversationBubbles, {
      [conversationBubblePresetAssetKey('moon-stars')]: 'data:image/png;base64,USER',
      [conversationBubblePresetAssetKey('ocean-shell')]: 'data:image/png;base64,PLAN',
      'assets/codex-bubble.gif': 'data:image/gif;base64,CODEX'
    })

    expect(resolved).toEqual({
      visible: true,
      user: {
        mode: 'nineSlice',
        dataUrl: 'data:image/png;base64,USER',
        slice: 25,
        sliceInsets: [35, 25, 40, 25],
        frameWidth: 24,
        borderWidths: [33.6, 48, 38.4, 48],
        contentPadding: 20
      },
      codex: {
        mode: 'stretch',
        dataUrl: 'data:image/gif;base64,CODEX',
        slice: 31,
        sliceInsets: [31, 31, 31, 31],
        frameWidth: 18,
        borderWidths: [18, 36, 18, 36],
        contentPadding: 28
      },
      plan: {
        mode: 'nineSlice',
        dataUrl: 'data:image/png;base64,PLAN',
        slice: 25,
        sliceInsets: [46, 25, 48, 25],
        frameWidth: 24,
        borderWidths: [44.16, 48, 46.08, 48],
        contentPadding: 20
      }
    })
  })

  it('exposes all presets to Studio while runtime data contains only selected bubble frames', async () => {
    const profile = createDefaultTheme(themeId)
    profile.conversationBubbles.user = {
      source: { kind: 'preset', presetId: 'daisy-heart' },
      fit: 'nineSlice',
      slice: 25,
      frameWidth: 24,
      contentPadding: 20
    }
    profile.conversationBubbles.codex = {
      source: {
        kind: 'custom',
        reference: { asset: 'assets/codex-bubble.gif', kind: 'image', mimeType: 'image/gif' }
      },
      fit: 'stretch',
      slice: 25,
      frameWidth: 24,
      contentPadding: 30
    }
    profile.conversationBubbles.plan = {
      source: { kind: 'preset', presetId: 'rainbow-candy' },
      fit: 'nineSlice',
      slice: 25,
      frameWidth: 24,
      contentPadding: 20
    }

    const compiled = await compileTheme(
      profile,
      async (asset) => `data:image/gif;base64,${asset}`,
      async (presetId) => `data:image/png;base64,${presetId}`
    )
    const payload = JSON.parse(compiled.rendererPayload) as {
      assets: Record<string, string>
      conversationBubbles: {
        user: { dataUrl: string }
        codex: { dataUrl: string }
        plan: { dataUrl: string }
      }
    }

    expect(Object.keys(compiled.assets).filter((asset) => asset.startsWith('builtin/conversation-bubbles/'))).toHaveLength(8)
    expect(payload.assets).not.toHaveProperty('assets/codex-bubble.gif')
    expect(Object.keys(payload.assets).some((asset) => asset.startsWith('builtin/conversation-bubbles/'))).toBe(false)
    expect(payload.conversationBubbles.user.dataUrl).toBe('data:image/png;base64,daisy-heart')
    expect(payload.conversationBubbles.codex.dataUrl).toBe('data:image/gif;base64,assets/codex-bubble.gif')
    expect(payload.conversationBubbles.plan.dataUrl).toBe('data:image/png;base64,rainbow-candy')
  })

  it('keeps Studio and runtime CSS on the same undistorted frame and inner-fill primitives', async () => {
    const [runtimeCss, studioCss] = await Promise.all([
      readFile(join(process.cwd(), 'resources', 'shared', 'dream-skin.css'), 'utf8'),
      readFile(join(process.cwd(), 'src', 'renderer', 'src', 'styles.css'), 'utf8')
    ])

    for (const declaration of [
      'background: transparent !important',
      '::after',
      'border-image-slice:',
      'border-image-width:',
      'frame-border-widths',
      'border-image-repeat: stretch',
      'background-size: 100% 100%'
    ]) {
      expect(runtimeCss).toContain(declaration)
      expect(studioCss).toContain(declaration)
    }
    expect(runtimeCss).toContain('padding-block: max(var(--dream-user-bubble-content-padding), var(--dream-user-bubble-frame-width)) !important')
    expect(runtimeCss).toContain('padding-inline: max(var(--dream-user-bubble-content-padding), calc(var(--dream-user-bubble-frame-width) * 2)) !important')
    expect(runtimeCss).toContain('padding-block: max(var(--dream-codex-bubble-content-padding), var(--dream-codex-bubble-frame-width)) !important')
    expect(runtimeCss).toContain('padding-inline: max(var(--dream-codex-bubble-content-padding), calc(var(--dream-codex-bubble-frame-width) * 2)) !important')
    expect(studioCss).toContain('padding-block: max(var(--dream-preview-bubble-content-padding), var(--dream-preview-bubble-frame-width)) !important')
    expect(studioCss).toContain('padding-inline: max(var(--dream-preview-bubble-content-padding), calc(var(--dream-preview-bubble-frame-width) * 2)) !important')
    expect(runtimeCss).not.toContain('min-block-size: var(--dream-user-bubble-frame-min-block-size)')
    expect(runtimeCss).not.toContain('min-block-size: var(--dream-codex-bubble-frame-min-block-size)')
    expect(studioCss).not.toContain('min-block-size: var(--dream-preview-bubble-frame-min-block-size)')
    expect(runtimeCss).toContain('inset: calc(var(--dream-user-bubble-frame-width) * .6667) calc(var(--dream-user-bubble-frame-width) * .5) !important')
    expect(runtimeCss).toContain('inset: calc(var(--dream-codex-bubble-frame-width) * .6667) calc(var(--dream-codex-bubble-frame-width) * .5) !important')
    expect(runtimeCss).toContain('inset: calc(var(--dream-plan-bubble-frame-width) * .6667) calc(var(--dream-plan-bubble-frame-width) * .5) !important')
    expect(studioCss).toContain('inset: calc(var(--dream-preview-bubble-frame-width) * .6667) calc(var(--dream-preview-bubble-frame-width) * .5) !important')
    expect(runtimeCss).toMatch(/\.dream-conversation-plan-bubble::before \{\s*z-index: -1;\s*inset: 0;\s*border-width: 0;/)
    expect(runtimeCss).not.toContain('border-width: var(--dream-user-bubble-frame-border-widths)')
    expect(runtimeCss).not.toContain('border-width: var(--dream-codex-bubble-frame-border-widths)')
    expect(runtimeCss).not.toContain('border-width: var(--dream-plan-bubble-frame-border-widths)')
    expect(studioCss).toContain('border-width: 0; border-image-source: var(--dream-preview-bubble-frame-source)')
    expect(runtimeCss).not.toContain('border-image-repeat: round')
    expect(studioCss).not.toContain('border-image-repeat: round')
  })
})
