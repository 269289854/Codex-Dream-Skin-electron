import { z } from 'zod'

export const BUILTIN_FONTS = {
  'system-ui': { label: '系统界面字体', family: 'system-ui, -apple-system, "Segoe UI", sans-serif', resource: null },
  'segoe-script': { label: 'Segoe Script', family: '"Segoe Script", "Segoe Print", cursive', resource: null },
  'noto-sans-sc': { label: '思源黑体', family: '"Noto Sans SC Variable", sans-serif', resource: 'fonts/noto-sans-sc/wght.css' },
  'noto-serif-sc': { label: '思源宋体', family: '"Noto Serif SC Variable", serif', resource: 'fonts/noto-serif-sc/wght.css' },
  'lxgw-wenkai': { label: '霞鹜文楷', family: '"Dream LXGW WenKai", serif', resource: 'fonts/lxgw-wenkai/lxgw-wenkai-latin-500-normal.woff2' },
  'jetbrains-mono': { label: 'JetBrains Mono', family: '"Dream JetBrains Mono", monospace', resource: 'fonts/jetbrains-mono/jetbrains-mono-latin-wght-normal.woff2' }
} as const

export type BuiltinFontId = keyof typeof BUILTIN_FONTS
export type ImportedFontFormat = 'ttf' | 'otf' | 'woff' | 'woff2'

export interface ImportedFontRecord {
  id: string
  family: string
  asset: string
  originalName: string
  format: ImportedFontFormat
}

export type FontSelection =
  | { kind: 'builtin'; id: BuiltinFontId }
  | { kind: 'imported'; id: string }
  | { kind: 'inherit' }

export interface ThemeTypography {
  slots: {
    ui: Exclude<FontSelection, { kind: 'inherit' }>
    homeHeading: FontSelection
    homeSubtitle: FontSelection
    brandTitle: FontSelection
    brandSubtitle: FontSelection
    brandSignature: FontSelection
    homeHeadingDecoration: FontSelection
    composerMelody: FontSelection
    sidebarNavNewTask: FontSelection
    sidebarNavPullRequests: FontSelection
    sidebarNavSites: FontSelection
    sidebarNavScheduled: FontSelection
    sidebarNavPlugins: FontSelection
  }
  importedFonts: ImportedFontRecord[]
}

const fontIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
const assetPathSchema = z.string().min(1).max(260).regex(/^assets\/[A-Za-z0-9._/-]+$/)
const builtinFontIds = Object.keys(BUILTIN_FONTS) as [BuiltinFontId, ...BuiltinFontId[]]

const inheritedFontSchema = z.object({ kind: z.literal('inherit') }).strict()
const concreteFontSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('builtin'), id: z.enum(builtinFontIds) }).strict(),
  z.object({ kind: z.literal('imported'), id: fontIdSchema }).strict()
])
const fontSelectionSchema = z.union([concreteFontSchema, inheritedFontSchema])

export const importedFontRecordSchema = z.object({
  id: fontIdSchema,
  family: z.string().trim().min(1).max(80),
  asset: assetPathSchema,
  originalName: z.string().trim().min(1).max(180),
  format: z.enum(['ttf', 'otf', 'woff', 'woff2'])
}).strict()

const importedFontsSchema = z.array(importedFontRecordSchema).max(64)

const typographySlotsV6Schema = z.object({
    ui: concreteFontSchema,
    brandTitle: fontSelectionSchema,
    brandSubtitle: fontSelectionSchema,
    brandSignature: fontSelectionSchema
}).strict()

const typographySlotsV7Schema = typographySlotsV6Schema.extend({ composerMelody: fontSelectionSchema }).strict()
const currentTypographySlotsSchema = typographySlotsV7Schema.extend({
  homeHeading: fontSelectionSchema.default({ kind: 'inherit' }),
  homeSubtitle: fontSelectionSchema.default({ kind: 'inherit' }),
  homeHeadingDecoration: fontSelectionSchema.default({ kind: 'inherit' }),
  sidebarNavNewTask: fontSelectionSchema.default({ kind: 'inherit' }),
  sidebarNavPullRequests: fontSelectionSchema.default({ kind: 'inherit' }),
  sidebarNavSites: fontSelectionSchema.default({ kind: 'inherit' }),
  sidebarNavScheduled: fontSelectionSchema.default({ kind: 'inherit' }),
  sidebarNavPlugins: fontSelectionSchema.default({ kind: 'inherit' })
}).strict()

function validateTypography<T extends { slots: Record<string, FontSelection>; importedFonts: ImportedFontRecord[] }>(schema: z.ZodType<T>): z.ZodType<T> {
  return schema.superRefine((typography, context) => {
  const ids = new Set<string>()
  for (let index = 0; index < typography.importedFonts.length; index += 1) {
    const record = typography.importedFonts[index]!
    if (ids.has(record.id)) context.addIssue({ code: 'custom', path: ['importedFonts', index, 'id'], message: 'Imported font IDs must be unique.' })
    ids.add(record.id)
  }
  for (const [slot, selection] of Object.entries(typography.slots)) {
    if (selection.kind === 'imported' && !ids.has(selection.id)) {
      context.addIssue({ code: 'custom', path: ['slots', slot, 'id'], message: 'Imported font selection does not exist.' })
    }
  }
  })
}

export const legacyThemeTypographySchema = validateTypography(z.object({
  slots: typographySlotsV6Schema,
  importedFonts: importedFontsSchema
}).strict())

export const themeTypographySchema: z.ZodType<ThemeTypography> = validateTypography(z.object({
  slots: currentTypographySlotsSchema,
  importedFonts: importedFontsSchema
}).strict())

export function createDefaultTypography(): ThemeTypography {
  return {
    slots: {
      ui: { kind: 'builtin', id: 'system-ui' },
      homeHeading: { kind: 'inherit' },
      homeSubtitle: { kind: 'inherit' },
      brandTitle: { kind: 'inherit' },
      brandSubtitle: { kind: 'inherit' },
      brandSignature: { kind: 'builtin', id: 'segoe-script' },
      homeHeadingDecoration: { kind: 'inherit' },
      composerMelody: { kind: 'inherit' },
      sidebarNavNewTask: { kind: 'inherit' },
      sidebarNavPullRequests: { kind: 'inherit' },
      sidebarNavSites: { kind: 'inherit' },
      sidebarNavScheduled: { kind: 'inherit' },
      sidebarNavPlugins: { kind: 'inherit' }
    },
    importedFonts: []
  }
}

export function safeImportedFontFamily(id: string): string {
  return `Dream Imported ${id.replace(/[^a-z0-9-]/gi, '')}`
}
