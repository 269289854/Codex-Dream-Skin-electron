import { open, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ThemeProfile } from '../shared/theme'
import { BUILTIN_FONTS, safeImportedFontFamily, selectedImportedFonts, type BuiltinFontId, type FontSelection, type ImportedFontFormat } from '../shared/typography'
import { budgetDataUrls, EmbeddedAssetBudget } from './embedded-assets'

export async function buildRuntimeFontCss(
  profile: ThemeProfile,
  assets: Record<string, string>,
  resourcesRoot: string,
  budget: EmbeddedAssetBudget = budgetDataUrls(assets)
): Promise<string> {
  const selections = Object.values(profile.typography.slots).filter((selection): selection is Exclude<FontSelection, { kind: 'inherit' }> => selection.kind !== 'inherit')
  const builtinIds = new Set(selections.filter((selection) => selection.kind === 'builtin').map((selection) => selection.id))
  const rules: string[] = []

  for (const id of builtinIds) {
    const rule = await buildBuiltinFontFace(id, resourcesRoot, budget)
    if (rule) rules.push(rule)
  }
  for (const font of selectedImportedFonts(profile.typography)) {
    const dataUrl = assets[font.asset]
    if (!dataUrl) continue
    rules.push(`@font-face { font-family: "${safeImportedFontFamily(font.id)}"; src: url("${escapeCssUrl(dataUrl)}") format("${fontFormat(font.format)}"); font-style: normal; font-weight: 100 900; font-display: swap; }`)
  }
  return rules.join('\n')
}

export async function budgetSelectedBuiltinFonts(
  profile: ThemeProfile,
  resourcesRoot: string,
  budget: EmbeddedAssetBudget
): Promise<void> {
  for (const id of selectedBuiltinFontIds(profile)) {
    const resource = BUILTIN_FONTS[id].resource
    if (!resource) continue
    const absolute = join(resourcesRoot, resource)
    if (resource.endsWith('.css')) {
      const css = await readFile(absolute, 'utf8')
      for (const reference of referencedFontFiles(css)) {
        await readEmbeddedFile(join(dirname(absolute), reference), `builtin-font:${id}:${reference}`, budget)
      }
    } else {
      await readEmbeddedFile(absolute, `builtin-font:${id}`, budget)
    }
  }
}

async function buildBuiltinFontFace(id: BuiltinFontId, resourcesRoot: string, budget: EmbeddedAssetBudget): Promise<string> {
  const resource = BUILTIN_FONTS[id].resource
  if (!resource) return ''
  const absolute = join(resourcesRoot, resource)
  if (resource.endsWith('.css')) {
    let css = await readFile(absolute, 'utf8')
    const references = referencedFontFiles(css)
    for (const reference of references) {
      const data = await readEmbeddedFile(join(dirname(absolute), reference), `builtin-font:${id}:${reference}`, budget)
      css = css.replaceAll(`url(${reference})`, `url("data:font/woff2;base64,${data.toString('base64')}")`)
    }
    return css
  }

  const data = await readEmbeddedFile(absolute, `builtin-font:${id}`, budget)
  const family = id === 'lxgw-wenkai' ? 'Dream LXGW WenKai' : id === 'dancing-script' ? 'Dream Dancing Script' : 'Dream JetBrains Mono'
  const weight = id === 'jetbrains-mono' ? '100 800' : id === 'dancing-script' ? '400 700' : '500'
  return `@font-face { font-family: "${family}"; src: url("data:font/woff2;base64,${data.toString('base64')}") format("woff2"); font-style: normal; font-weight: ${weight}; font-display: swap; }`
}

function selectedBuiltinFontIds(profile: ThemeProfile): Set<BuiltinFontId> {
  const selections = Object.values(profile.typography.slots)
  return new Set(selections
    .filter((selection): selection is Extract<FontSelection, { kind: 'builtin' }> => selection.kind === 'builtin')
    .map((selection) => selection.id))
}

function referencedFontFiles(css: string): string[] {
  return [...new Set([...css.matchAll(/url\((\.\/files\/[A-Za-z0-9._-]+\.woff2)\)/g)].map((match) => match[1]!))]
}

function fontFormat(format: ImportedFontFormat): string {
  return format === 'ttf' ? 'truetype' : format === 'otf' ? 'opentype' : format
}

function escapeCssUrl(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n\f]/g, '')
}

async function readEmbeddedFile(path: string, key: string, budget: EmbeddedAssetBudget): Promise<Buffer> {
  const handle = await open(path, 'r')
  try {
    const before = await handle.stat()
    if (!before.isFile()) throw new Error('内置字体资源无效。')
    budget.set(key, before.size)
    const data = await handle.readFile()
    const after = await handle.stat()
    if (after.size !== before.size || data.byteLength !== before.size) throw new Error('内置字体资源在读取期间发生变化。')
    return data
  } finally {
    await handle.close()
  }
}
