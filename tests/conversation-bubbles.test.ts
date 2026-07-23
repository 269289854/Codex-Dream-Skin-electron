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
const presetRoot = join(process.cwd(), 'resources', 'windows', 'conversation-bubbles')

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

  it('resolves user and Codex frames independently', () => {
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
    const resolved = resolveConversationBubbles(profile.conversationBubbles, {
      [conversationBubblePresetAssetKey('moon-stars')]: 'data:image/png;base64,USER',
      'assets/codex-bubble.gif': 'data:image/gif;base64,CODEX'
    })

    expect(resolved).toEqual({
      visible: true,
      user: {
        mode: 'nineSlice',
        dataUrl: 'data:image/png;base64,USER',
        slice: 25,
        frameWidth: 24,
        contentPadding: 20
      },
      codex: {
        mode: 'stretch',
        dataUrl: 'data:image/gif;base64,CODEX',
        slice: 31,
        frameWidth: 18,
        contentPadding: 28
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
      }
    }

    expect(Object.keys(compiled.assets).filter((asset) => asset.startsWith('builtin/conversation-bubbles/'))).toHaveLength(8)
    expect(payload.assets).not.toHaveProperty('assets/codex-bubble.gif')
    expect(Object.keys(payload.assets).some((asset) => asset.startsWith('builtin/conversation-bubbles/'))).toBe(false)
    expect(payload.conversationBubbles.user.dataUrl).toBe('data:image/png;base64,daisy-heart')
    expect(payload.conversationBubbles.codex.dataUrl).toBe('data:image/gif;base64,assets/codex-bubble.gif')
  })

  it('keeps Studio and runtime CSS on the same nine-slice and stretch primitives', async () => {
    const [runtimeCss, studioCss] = await Promise.all([
      readFile(join(process.cwd(), 'resources', 'windows', 'dream-skin.css'), 'utf8'),
      readFile(join(process.cwd(), 'src', 'renderer', 'src', 'styles.css'), 'utf8')
    ])

    for (const declaration of [
      'border-image-slice:',
      'border-image-width:',
      'border-image-repeat: stretch',
      'background-size: 100% 100%'
    ]) {
      expect(runtimeCss).toContain(declaration)
      expect(studioCss).toContain(declaration)
    }
  })
})
