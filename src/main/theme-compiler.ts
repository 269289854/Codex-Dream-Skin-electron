import type { CompiledTheme } from '../shared/contracts'
import type { Fence } from '../shared/geometry'
import { HOME_ACTIONS } from '../shared/home-layout'
import { getPolaroidLayout, polaroidShadowFilter } from '../shared/polaroid'
import { buildThemeVariableDeclarations } from '../shared/runtime-theme'
import type { ThemeProfile } from '../shared/theme'

export async function compileTheme(
  profile: ThemeProfile,
  readAsset: (asset: string) => Promise<string>
): Promise<CompiledTheme> {
  const assetNames = new Set<string>()
  if (profile.hero.sourceImage) assetNames.add(profile.hero.sourceImage)
  if (profile.polaroid.sourceImage) assetNames.add(profile.polaroid.sourceImage)
  for (const icon of Object.values(profile.icons)) if (icon.kind === 'asset') assetNames.add(icon.asset)
  for (const font of profile.typography.importedFonts) assetNames.add(font.asset)

  const assets: Record<string, string> = {}
  for (const asset of assetNames) assets[asset] = await readAsset(asset)
  const hero = profile.hero.sourceImage ? assets[profile.hero.sourceImage] : null
  const polaroid = profile.polaroid.sourceImage ? assets[profile.polaroid.sourceImage] : null
  const polaroidLayout = profile.polaroid.sourceSize ? getPolaroidLayout(profile.polaroid.mode, profile.polaroid.sourceSize, profile.polaroid.fence as Fence) : null
  const showPolaroid = profile.polaroid.visible && Boolean(polaroid && polaroidLayout)
  const polaroidStyle = profile.polaroid.style
  const css = `:root { ${buildThemeVariableDeclarations(profile)} }\n` +
    `html.codex-dream-skin body { color: var(--dream-global-text); background: var(--dream-canvas);${hero ? ` background-image: url("${escapeCssUrl(hero)}");` : ''} background-position: ${percent(profile.hero.position.x)} ${percent(profile.hero.position.y)}; background-size: ${Math.round(profile.hero.scale * 100)}% auto; font-family: var(--dream-font-ui); }\n` +
    `.dream-polaroid { position: fixed; right: auto; left: ${percent(profile.polaroid.placement.x)}; top: ${percent(profile.polaroid.placement.y)}; width: ${percent(profile.polaroid.placement.width)}; height: auto; opacity: ${polaroidStyle.opacity}; transform: rotate(${profile.polaroid.placement.rotation}deg);${polaroid && polaroidLayout ? ` aspect-ratio: ${polaroidLayout.aspectRatio};` : ''}${showPolaroid ? '' : ' display: none !important;'} }\n` +
    `.dream-polaroid-shadow { filter: ${polaroidShadowFilter(polaroidStyle)}; }\n` +
    `.dream-polaroid-surface {${polaroid && polaroidLayout ? ` background-image: url("${escapeCssUrl(polaroid)}"); background-size: ${polaroidLayout.backgroundSize}; background-position: ${polaroidLayout.backgroundPosition}; clip-path: ${polaroidLayout.clipPath ?? 'none'};` : ''} }\n` +
    `@media (max-width: ${profile.polaroid.placement.hideBelowWidth}px) { .dream-polaroid { display: none !important; } }\n`

  return {
    css,
    rendererPayload: JSON.stringify({ version: 10, profile, home: { actions: HOME_ACTIONS }, assets }).replace(/</g, '\\u003c'),
    assets
  }
}

function percent(value: number): string { return `${(value * 100).toFixed(3).replace(/\.0+$|(?<=\.[0-9]*?)0+$/g, '')}%` }
function escapeCssUrl(value: string): string { return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n\f]/g, '') }
