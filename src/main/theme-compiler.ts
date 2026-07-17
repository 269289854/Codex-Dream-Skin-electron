import type { CompiledTheme } from '../shared/contracts'
import { HOME_ACTIONS } from '../shared/home-layout'
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
  const c = profile.colors

  const css = `:root {\n` +
    `  --dream-surface: ${c.surface};\n  --dream-ink: ${c.ink};\n  --dream-accent: ${c.accent};\n` +
    `  --dream-pink: ${c.pink};\n  --dream-lavender: ${c.lavender};\n  --dream-border: ${c.border};\n` +
    `  --dream-success: ${c.success};\n  --dream-danger: ${c.danger};\n}\n` +
    `html.codex-dream-skin body { color: var(--dream-ink); background-color: var(--dream-surface);${hero ? ` background-image: url("${escapeCssUrl(hero)}");` : ''} background-position: ${percent(profile.hero.position.x)} ${percent(profile.hero.position.y)}; background-size: ${Math.round(profile.hero.scale * 100)}% auto; }\n` +
    `.dream-polaroid { position: fixed; left: ${percent(profile.polaroid.placement.x)}; top: ${percent(profile.polaroid.placement.y)}; width: ${percent(profile.polaroid.placement.width)}; transform: rotate(${profile.polaroid.placement.rotation}deg);${polaroid ? ` background-image: url("${escapeCssUrl(polaroid)}");` : ''}${profile.polaroid.visible ? '' : ' display: none !important;'} }\n` +
    `@media (max-width: ${profile.polaroid.placement.hideBelowWidth}px) { .dream-polaroid { display: none !important; } }\n`

  return {
    css,
    rendererPayload: JSON.stringify({ version: 5, profile, home: { actions: HOME_ACTIONS }, assets }).replace(/</g, '\\u003c'),
    assets
  }
}

function percent(value: number): string { return `${(value * 100).toFixed(3).replace(/\.0+$|(?<=\.[0-9]*?)0+$/g, '')}%` }
function escapeCssUrl(value: string): string { return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n\f]/g, '') }
