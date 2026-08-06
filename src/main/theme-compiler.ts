import type { CompiledTheme } from '../shared/contracts'
import { conversationBubbleMediaReferences, conversationBubblePresetAssetKey } from '../shared/conversation-bubbles'
import { gifPosterAssetKey } from '../shared/gif'
import { CONVERSATION_BUBBLE_CORNERS, CONVERSATION_BUBBLE_ROLES, type ConversationBubbleCorner, type ConversationBubblePresetId, type ThemeProfile } from '../shared/theme'
import { selectedImportedFonts } from '../shared/typography'
import { budgetDataUrls } from './embedded-assets'
import { prepareGifDataUrl } from './gif-assets'
import { prepareIconGifDataUrl } from './icon-assets'

export async function compileTheme(
  profile: ThemeProfile,
  readAsset: (asset: string) => Promise<string>,
  readConversationBubblePreset?: (presetId: ConversationBubblePresetId, corner: ConversationBubbleCorner) => Promise<string>
): Promise<CompiledTheme> {
  const assetNames = compiledAssetNames(profile)
  const assets: Record<string, string> = {}
  for (const asset of assetNames) assets[asset] = await readAsset(asset)

  const gifIconAssets = new Set(Object.values(profile.icons)
    .filter((icon) => icon.kind === 'asset' && icon.asset.toLowerCase().endsWith('.gif'))
    .map((icon) => icon.kind === 'asset' ? icon.asset : ''))
  for (const asset of [...assetNames].filter((candidate) => candidate.toLowerCase().endsWith('.gif'))) {
    const prepared = gifIconAssets.has(asset)
      ? await prepareIconGifDataUrl(assets[asset] ?? '')
      : await prepareGifDataUrl(assets[asset] ?? '')
    assets[asset] = prepared.dataUrl
    assets[gifPosterAssetKey(asset)] = prepared.posterDataUrl
  }

  if (readConversationBubblePreset) {
    const selectedPresets = new Set(CONVERSATION_BUBBLE_ROLES.flatMap((role) => {
      const source = profile.conversationBubbles[role].source
      return source.kind === 'preset' ? [source.presetId] : []
    }))
    for (const presetId of selectedPresets) {
      for (const corner of CONVERSATION_BUBBLE_CORNERS) {
        assets[conversationBubblePresetAssetKey(presetId, corner)] = await readConversationBubblePreset(presetId, corner)
      }
    }
  }

  budgetDataUrls(assets)
  return { assets }
}

export function compiledAssetNames(profile: ThemeProfile): Set<string> {
  const assetNames = new Set<string>()
  if (profile.hero.source?.kind === 'image') assetNames.add(profile.hero.source.asset)
  else if (!profile.hero.source && profile.hero.sourceImage) assetNames.add(profile.hero.sourceImage)
  if (profile.polaroid.source?.kind === 'image') assetNames.add(profile.polaroid.source.asset)
  else if (!profile.polaroid.source && profile.polaroid.sourceImage) assetNames.add(profile.polaroid.sourceImage)
  if (profile.conversationBackground.source?.kind === 'image') assetNames.add(profile.conversationBackground.source.asset)
  if (profile.windowBackground.source?.kind === 'image') assetNames.add(profile.windowBackground.source.asset)
  if (profile.accountMenuBackground.source?.kind === 'image') assetNames.add(profile.accountMenuBackground.source.asset)
  if (profile.brandSignature.source) assetNames.add(profile.brandSignature.source.asset)
  if (profile.decorations.composerMelody.source) assetNames.add(profile.decorations.composerMelody.source.asset)
  for (const reference of conversationBubbleMediaReferences(profile)) assetNames.add(reference.asset)
  for (const icon of Object.values(profile.icons)) if (icon.kind === 'asset') assetNames.add(icon.asset)
  for (const font of selectedImportedFonts(profile.typography)) assetNames.add(font.asset)
  return assetNames
}
