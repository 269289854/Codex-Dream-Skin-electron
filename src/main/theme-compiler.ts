import type { CompiledTheme } from '../shared/contracts'
import type { Fence } from '../shared/geometry'
import { HOME_ACTIONS } from '../shared/home-layout'
import { SIDEBAR_NAV_ITEMS } from '../shared/sidebar-layout'
import { mediaFlipCssTransform } from '../shared/media'
import { getPolaroidLayout, polaroidShadowFilter } from '../shared/polaroid'
import { buildThemeVariableDeclarations } from '../shared/runtime-theme'
import type { MediaReference, ThemeProfile } from '../shared/theme'

export async function compileTheme(
  profile: ThemeProfile,
  readAsset: (asset: string) => Promise<string>
): Promise<CompiledTheme> {
  const assetNames = new Set<string>()
  if (profile.hero.source?.kind === 'image') assetNames.add(profile.hero.source.asset)
  else if (!profile.hero.source && profile.hero.sourceImage) assetNames.add(profile.hero.sourceImage)
  if (profile.polaroid.source?.kind === 'image') assetNames.add(profile.polaroid.source.asset)
  else if (!profile.polaroid.source && profile.polaroid.sourceImage) assetNames.add(profile.polaroid.sourceImage)
  if (profile.conversationBackground.source?.kind === 'image') assetNames.add(profile.conversationBackground.source.asset)
  if (profile.windowBackground.source?.kind === 'image') assetNames.add(profile.windowBackground.source.asset)
  if (profile.decorations.composerMelody.source) assetNames.add(profile.decorations.composerMelody.source.asset)
  for (const icon of Object.values(profile.icons)) if (icon.kind === 'asset') assetNames.add(icon.asset)
  for (const font of profile.typography.importedFonts) assetNames.add(font.asset)

  const assets: Record<string, string> = {}
  for (const asset of assetNames) assets[asset] = await readAsset(asset)
  const hero = profile.hero.source
    ? profile.hero.source.kind === 'image' ? assets[profile.hero.source.asset] : null
    : profile.hero.sourceImage ? assets[profile.hero.sourceImage] : null
  const polaroid = profile.polaroid.source
    ? profile.polaroid.source.kind === 'image' ? assets[profile.polaroid.source.asset] : null
    : profile.polaroid.sourceImage ? assets[profile.polaroid.sourceImage] : null
  const conversationBackground = profile.conversationBackground.source?.kind === 'image'
    ? assets[profile.conversationBackground.source.asset]
    : null
  const windowBackground = profile.windowBackground.source?.kind === 'image'
    ? assets[profile.windowBackground.source.asset]
    : null
  const polaroidLayout = profile.polaroid.sourceSize ? getPolaroidLayout(profile.polaroid.mode, profile.polaroid.sourceSize, profile.polaroid.fence as Fence) : null
  const showPolaroid = profile.polaroid.visible && Boolean(polaroid && polaroidLayout)
  const polaroidStyle = profile.polaroid.style
  const runtimeProfile = createRuntimeProfile(profile)
  const css = `:root { ${buildThemeVariableDeclarations(profile)} }\n` +
    `html.codex-dream-skin body { position: relative; color: var(--dream-global-text); background: var(--dream-canvas);${hero ? ' background-image: none;' : ''} font-family: var(--dream-font-ui); }\n` +
    (hero ? `html.codex-dream-skin body::before { content: ""; position: absolute; z-index: 0; inset: 0; pointer-events: none; background-image: url("${escapeCssUrl(hero)}"); background-repeat: no-repeat; background-position: ${percent(profile.hero.position.x)} ${percent(profile.hero.position.y)}; background-size: ${Math.round(profile.hero.scale * 100)}% auto; transform: ${mediaFlipCssTransform(profile.hero.mediaTransform)}; transform-origin: center; }\n` : '') +
    `.dream-polaroid { position: fixed; right: auto; left: ${percent(profile.polaroid.placement.x)}; top: ${percent(profile.polaroid.placement.y)}; width: ${percent(profile.polaroid.placement.width)}; height: auto; opacity: ${polaroidStyle.opacity}; transform: rotate(${profile.polaroid.placement.rotation}deg);${polaroid && polaroidLayout ? ` aspect-ratio: ${polaroidLayout.aspectRatio};` : ''}${showPolaroid ? '' : ' display: none !important;'} }\n` +
    `.dream-polaroid-shadow { filter: ${polaroidShadowFilter(polaroidStyle)}; }\n` +
    `.dream-polaroid-surface {${polaroid && polaroidLayout ? ` background-image: none; background-size: ${polaroidLayout.backgroundSize}; background-position: ${polaroidLayout.backgroundPosition}; clip-path: ${polaroidLayout.clipPath ?? 'none'};` : ''} }\n` +
    (polaroid && polaroidLayout ? `.dream-polaroid-surface::before { content: ""; position: absolute; inset: 0; background-image: url("${escapeCssUrl(polaroid)}"); background-repeat: no-repeat; background-size: ${polaroidLayout.backgroundSize}; background-position: ${polaroidLayout.backgroundPosition}; transform: ${mediaFlipCssTransform(profile.polaroid.mediaTransform)}; transform-origin: center; }\n` : '') +
    `@media (max-width: ${profile.polaroid.placement.hideBelowWidth}px) { .dream-polaroid { display: none !important; } }\n`

  return {
    css,
    rendererPayload: JSON.stringify({ version: profile.version, profile: runtimeProfile, sidebarNavigation: SIDEBAR_NAV_ITEMS, home: { actions: HOME_ACTIONS }, assets, conversationBackground, windowBackground, conversationBubbles: { visible: profile.conversationBubbles.visible }, toolActivityBubbles: { visible: profile.toolActivityBubbles.visible } }).replace(/</g, '\\u003c'),
    assets
  }
}

function createRuntimeProfile(profile: ThemeProfile): ThemeProfile {
  const runtimeProfile = structuredClone(profile)
  const references: Array<MediaReference | null> = [
    runtimeProfile.hero.source,
    runtimeProfile.polaroid.source,
    runtimeProfile.conversationBackground.source,
    runtimeProfile.windowBackground.source,
    runtimeProfile.decorations.composerMelody.source
  ]
  for (const reference of references) {
    if (reference?.videoVariants) delete reference.videoVariants
  }
  return runtimeProfile
}

function percent(value: number): string { return `${(value * 100).toFixed(3).replace(/\.0+$|(?<=\.[0-9]*?)0+$/g, '')}%` }
function escapeCssUrl(value: string): string { return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n\f]/g, '') }
