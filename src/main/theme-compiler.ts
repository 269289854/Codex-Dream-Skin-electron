import { Buffer } from 'node:buffer'
import type { CompiledTheme } from '../shared/contracts'
import { conversationBubbleMediaReferences, conversationBubblePresetAssetKey } from '../shared/conversation-bubbles'
import { ensureGifInfiniteLoop } from '../shared/gif'
import { iconGifPosterAssetKey } from '../shared/icon-assets'
import { CONVERSATION_BUBBLE_PRESETS, type ConversationBubblePresetId, type ThemeProfile } from '../shared/theme'
import { selectedImportedFonts } from '../shared/typography'
import { budgetDataUrls } from './embedded-assets'
import { prepareIconGifDataUrl } from './icon-assets'

export async function compileTheme(
  profile: ThemeProfile,
  readAsset: (asset: string) => Promise<string>,
  readConversationBubblePreset?: (presetId: ConversationBubblePresetId) => Promise<string>
): Promise<CompiledTheme> {
  const assetNames = compiledAssetNames(profile)
  const assets: Record<string, string> = {}
  for (const asset of assetNames) assets[asset] = await readAsset(asset)

  const gifIconAssets = new Set(Object.values(profile.icons)
    .filter((icon) => icon.kind === 'asset' && icon.asset.toLowerCase().endsWith('.gif'))
    .map((icon) => icon.kind === 'asset' ? icon.asset : ''))
  for (const asset of gifIconAssets) {
    const prepared = await prepareIconGifDataUrl(assets[asset] ?? '')
    assets[asset] = prepared.dataUrl
    assets[iconGifPosterAssetKey(asset)] = prepared.posterDataUrl
  }

  const brandSignatureGifAsset = profile.brandSignature.source?.mimeType === 'image/gif'
    ? profile.brandSignature.source.asset
    : null
  if (brandSignatureGifAsset && assets[brandSignatureGifAsset]) {
    assets[brandSignatureGifAsset] = ensureInfiniteLoopingGifDataUrl(assets[brandSignatureGifAsset])
  }
  if (readConversationBubblePreset) {
    for (const preset of CONVERSATION_BUBBLE_PRESETS) {
      assets[conversationBubblePresetAssetKey(preset.id)] = await readConversationBubblePreset(preset.id)
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

function ensureInfiniteLoopingGifDataUrl(dataUrl: string): string {
  const prefix = 'data:image/gif;base64,'
  if (!dataUrl.startsWith(prefix)) return dataUrl
  const source = Buffer.from(dataUrl.slice(prefix.length), 'base64')
  const normalized = ensureGifInfiniteLoop(source)
  return normalized === source
    ? dataUrl
    : `${prefix}${Buffer.from(normalized).toString('base64')}`
}
