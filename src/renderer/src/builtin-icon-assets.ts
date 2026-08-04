import { SYSTEM_ICON_ASSET_FILES } from '../../shared/builtin-icon-assets'

const importedAssets = import.meta.glob('../../../icon/*.svg', {
  eager: true,
  import: 'default',
  query: '?url'
}) as Record<string, string>

const builtinIconAssetUrls: Readonly<Record<string, string>> = Object.freeze(Object.fromEntries(
  Object.entries(SYSTEM_ICON_ASSET_FILES).flatMap(([name, fileName]) => {
    const url = importedAssets[`../../../icon/${fileName}`]
    return url ? [[name, url] as const] : []
  })
))

export function builtinIconAssetUrl(name: string): string | null {
  return builtinIconAssetUrls[name] ?? null
}
