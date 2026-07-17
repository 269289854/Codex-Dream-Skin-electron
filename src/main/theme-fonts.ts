import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ThemeProfile } from '../shared/theme'
import { BUILTIN_FONTS, safeImportedFontFamily, type BuiltinFontId, type FontSelection, type ImportedFontFormat } from '../shared/typography'

export async function buildRuntimeFontCss(
  profile: ThemeProfile,
  assets: Record<string, string>,
  resourcesRoot: string
): Promise<string> {
  const selections = Object.values(profile.typography.slots).filter((selection): selection is Exclude<FontSelection, { kind: 'inherit' }> => selection.kind !== 'inherit')
  const builtinIds = new Set(selections.filter((selection) => selection.kind === 'builtin').map((selection) => selection.id))
  const importedIds = new Set(selections.filter((selection) => selection.kind === 'imported').map((selection) => selection.id))
  const rules: string[] = []

  for (const id of builtinIds) {
    const rule = await buildBuiltinFontFace(id, resourcesRoot)
    if (rule) rules.push(rule)
  }
  for (const font of profile.typography.importedFonts) {
    if (!importedIds.has(font.id)) continue
    const dataUrl = assets[font.asset]
    if (!dataUrl) continue
    rules.push(`@font-face { font-family: "${safeImportedFontFamily(font.id)}"; src: url("${escapeCssUrl(dataUrl)}") format("${fontFormat(font.format)}"); font-style: normal; font-weight: 100 900; font-display: swap; }`)
  }
  return rules.join('\n')
}

async function buildBuiltinFontFace(id: BuiltinFontId, resourcesRoot: string): Promise<string> {
  const resource = BUILTIN_FONTS[id].resource
  if (!resource) return ''
  const absolute = join(resourcesRoot, resource)
  if (resource.endsWith('.css')) {
    let css = await readFile(absolute, 'utf8')
    const sourceFamily = id === 'noto-sans-sc' ? 'Noto Sans SC Variable' : 'Noto Serif SC Variable'
    const targetFamily = id === 'noto-sans-sc' ? 'Dream Noto Sans SC' : 'Dream Noto Serif SC'
    css = css.replaceAll(sourceFamily, targetFamily)
    const references = [...new Set([...css.matchAll(/url\((\.\/files\/[A-Za-z0-9._-]+\.woff2)\)/g)].map((match) => match[1]!))]
    for (const reference of references) {
      const data = await readFile(join(dirname(absolute), reference))
      css = css.replaceAll(`url(${reference})`, `url("data:font/woff2;base64,${data.toString('base64')}")`)
    }
    return css
  }

  const data = await readFile(absolute)
  const family = id === 'lxgw-wenkai' ? 'Dream LXGW WenKai' : 'Dream JetBrains Mono'
  const weight = id === 'jetbrains-mono' ? '100 800' : '500'
  return `@font-face { font-family: "${family}"; src: url("data:font/woff2;base64,${data.toString('base64')}") format("woff2"); font-style: normal; font-weight: ${weight}; font-display: swap; }`
}

function fontFormat(format: ImportedFontFormat): string {
  return format === 'ttf' ? 'truetype' : format === 'otf' ? 'opentype' : format
}

function escapeCssUrl(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n\f]/g, '')
}
