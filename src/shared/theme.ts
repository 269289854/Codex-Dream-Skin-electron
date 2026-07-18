import { z } from 'zod'
import { createEmptyAppearance, cssColorSchema, themeAppearanceSchema } from './appearance'
import { DEFAULT_BRAND_COPY, DEFAULT_HOME_COPY, splitHeadingTemplate } from './home-layout'
import { createDefaultTypography, themeTypographySchema } from './typography'

const normalized = z.number().finite().min(0).max(1)

export const pointSchema = z.object({ x: normalized, y: normalized }).strict()

const iconSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('builtin'), name: z.string().min(1).max(64) }).strict(),
  z.object({ kind: z.literal('asset'), asset: z.string().min(1).max(260) }).strict()
])

const legacyHomeCopySchema = z.object({
  headingTemplate: z.string().trim().min(1).max(120).refine((value) => splitHeadingTemplate(value) !== null, {
    message: 'Heading template must contain exactly one {project} placeholder.'
  }),
  subtitle: z.string().trim().max(160)
}).strict()

const themeCopySchema = legacyHomeCopySchema.extend({
  brandTitle: z.string().trim().min(1).max(80),
  brandSubtitle: z.string().trim().max(120),
  brandSignature: z.string().trim().max(32)
}).strict()

const legacyIconsSchema = z.object({
  branding: iconSourceSchema,
  cardPrimary: iconSourceSchema,
  cardSecondary: iconSourceSchema,
  composer: iconSourceSchema,
  project: iconSourceSchema,
  decoration: iconSourceSchema,
  polaroidPin: iconSourceSchema
}).strict()

const versionFiveIconsSchema = legacyIconsSchema.extend({
  sidebarMode: iconSourceSchema
}).strict()

const currentIconsSchema = versionFiveIconsSchema.extend({
  composerBadge: iconSourceSchema
}).strict()

const composerBadgeSchema = z.object({ visible: z.boolean() }).strict()

const legacyColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/)
const legacyColorsSchema = z.object({
  surface: legacyColor,
  ink: legacyColor,
  accent: legacyColor,
  pink: legacyColor,
  lavender: legacyColor,
  border: legacyColor,
  success: legacyColor,
  danger: legacyColor
}).strict()

const colorsSchema = z.object({
  surface: cssColorSchema,
  ink: cssColorSchema,
  accent: cssColorSchema,
  pink: cssColorSchema,
  lavender: cssColorSchema,
  border: cssColorSchema,
  success: cssColorSchema,
  danger: cssColorSchema
}).strict()

const commonProfileFields = {
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  updatedAt: z.string().datetime(),
  hero: z.object({
    sourceImage: z.string().max(260).nullable(),
    focus: pointSchema,
    scale: z.number().finite().min(0.5).max(3),
    position: pointSchema
  }).strict(),
  polaroid: z.object({
    visible: z.boolean().default(true),
    sourceImage: z.string().max(260).nullable(),
    sourceSize: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).strict().nullable().default(null),
    fence: z.tuple([pointSchema, pointSchema, pointSchema, pointSchema]),
    placement: z.object({
      x: normalized,
      y: normalized,
      width: normalized,
      rotation: z.number().finite().min(-180).max(180),
      hideBelowWidth: z.number().int().min(320).max(3840)
    }).strict()
  }).strict()
}

export const themeProfileSchema = z.object({
  ...commonProfileFields,
  version: z.literal(6),
  colors: colorsSchema,
  copy: themeCopySchema,
  icons: currentIconsSchema,
  composerBadge: composerBadgeSchema,
  appearance: themeAppearanceSchema,
  typography: themeTypographySchema
}).strict()

const versionFiveThemeSchema = z.object({
  ...commonProfileFields,
  version: z.literal(5),
  colors: colorsSchema,
  copy: themeCopySchema,
  icons: versionFiveIconsSchema,
  appearance: themeAppearanceSchema,
  typography: themeTypographySchema
}).strict()

const versionFourThemeSchema = z.object({
  ...commonProfileFields,
  version: z.literal(4),
  colors: legacyColorsSchema,
  copy: themeCopySchema,
  icons: versionFiveIconsSchema
}).strict()

const versionThreeThemeSchema = z.object({
  ...commonProfileFields,
  version: z.literal(3),
  colors: legacyColorsSchema,
  copy: legacyHomeCopySchema,
  icons: legacyIconsSchema
}).strict()

const versionTwoThemeSchema = z.object({
  ...commonProfileFields,
  version: z.literal(2),
  colors: legacyColorsSchema,
  copy: legacyHomeCopySchema,
  icons: legacyIconsSchema
}).strict()

const versionOneThemeSchema = z.object({
  ...commonProfileFields,
  version: z.literal(1),
  colors: legacyColorsSchema,
  icons: legacyIconsSchema
}).strict()

const legacyThemeSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  version: z.literal(0),
  colors: legacyColorsSchema.partial().optional()
}).passthrough()

export type Point = z.infer<typeof pointSchema>
export type ThemeProfile = z.infer<typeof themeProfileSchema>
export type ThemeColors = ThemeProfile['colors']
export type IconSlotMap = ThemeProfile['icons']
export type IconSlot = keyof IconSlotMap

export interface ThemeSummary {
  id: string
  name: string
  updatedAt: string
  active: boolean
}

export function createDefaultTheme(id: string, name = '初音未来'): ThemeProfile {
  return {
    id,
    name,
    version: 6,
    updatedAt: new Date().toISOString(),
    copy: { ...DEFAULT_HOME_COPY, ...DEFAULT_BRAND_COPY },
    hero: {
      sourceImage: null,
      focus: { x: 0.62, y: 0.42 },
      scale: 1,
      position: { x: 0.5, y: 0.5 }
    },
    polaroid: {
      visible: true,
      sourceImage: null,
      sourceSize: null,
      fence: [
        { x: 0.12, y: 0.12 },
        { x: 0.88, y: 0.12 },
        { x: 0.88, y: 0.88 },
        { x: 0.12, y: 0.88 }
      ],
      placement: { x: 0.72, y: 0.2, width: 0.22, rotation: 3, hideBelowWidth: 920 }
    },
    colors: {
      surface: '#F7FFFF',
      ink: '#164B59',
      accent: '#20BCC3',
      pink: '#F06EA9',
      lavender: '#B9A7E8',
      border: '#BFDADD',
      success: '#169B68',
      danger: '#D84A5D'
    },
    icons: {
      sidebarMode: { kind: 'builtin', name: 'music' },
      branding: { kind: 'builtin', name: 'sparkles' },
      cardPrimary: { kind: 'builtin', name: 'wand-sparkles' },
      cardSecondary: { kind: 'builtin', name: 'image' },
      composer: { kind: 'builtin', name: 'send' },
      composerBadge: { kind: 'builtin', name: 'music' },
      project: { kind: 'builtin', name: 'folder-code' },
      decoration: { kind: 'builtin', name: 'heart' },
      polaroidPin: { kind: 'builtin', name: 'pin' }
    },
    composerBadge: { visible: true },
    appearance: createEmptyAppearance(),
    typography: createDefaultTypography()
  }
}

export function parseThemeProfile(input: unknown): ThemeProfile {
  if (input && typeof input === 'object' && 'version' in input && input.version === 6) {
    return themeProfileSchema.parse(input)
  }
  if (input && typeof input === 'object' && 'version' in input && input.version === 5) {
    return migrateVersionFive(versionFiveThemeSchema.parse(input))
  }
  if (input && typeof input === 'object' && 'version' in input && input.version === 4) {
    return migrateVersionFour(versionFourThemeSchema.parse(input))
  }
  if (input && typeof input === 'object' && 'version' in input && input.version === 3) {
    const legacy = versionThreeThemeSchema.parse(input)
    return migrateLegacyTheme(legacy, legacy.copy)
  }
  if (input && typeof input === 'object' && 'version' in input && input.version === 2) {
    const legacy = versionTwoThemeSchema.parse(input)
    return migrateLegacyTheme(legacy, legacy.copy)
  }
  if (input && typeof input === 'object' && 'version' in input && input.version === 1) {
    const legacy = versionOneThemeSchema.parse(input)
    return migrateLegacyTheme(legacy, DEFAULT_HOME_COPY)
  }
  if (input && typeof input === 'object' && 'version' in input && input.version === 0) {
    const legacy = legacyThemeSchema.parse(input)
    const migrated = createDefaultTheme(legacy.id, legacy.name)
    migrated.colors = { ...migrated.colors, ...legacy.colors }
    return themeProfileSchema.parse(migrated)
  }
  throw new Error('Unsupported theme profile version.')
}

function migrateLegacyTheme(
  legacy: z.infer<typeof versionThreeThemeSchema> | z.infer<typeof versionTwoThemeSchema> | z.infer<typeof versionOneThemeSchema>,
  copy: z.infer<typeof legacyHomeCopySchema>
): ThemeProfile {
  return themeProfileSchema.parse({
    ...legacy,
    version: 6,
    copy: { ...copy, ...DEFAULT_BRAND_COPY },
    icons: { ...legacy.icons, sidebarMode: { kind: 'builtin', name: 'music' }, composerBadge: { kind: 'builtin', name: 'music' } },
    composerBadge: { visible: true },
    appearance: createEmptyAppearance(),
    typography: createDefaultTypography()
  })
}

function migrateVersionFour(legacy: z.infer<typeof versionFourThemeSchema>): ThemeProfile {
  return themeProfileSchema.parse({
    ...legacy,
    version: 6,
    icons: { ...legacy.icons, composerBadge: { kind: 'builtin', name: 'music' } },
    composerBadge: { visible: true },
    appearance: createEmptyAppearance(),
    typography: createDefaultTypography()
  })
}

function migrateVersionFive(legacy: z.infer<typeof versionFiveThemeSchema>): ThemeProfile {
  return themeProfileSchema.parse({
    ...legacy,
    version: 6,
    icons: { ...legacy.icons, composerBadge: { kind: 'builtin', name: 'music' } },
    composerBadge: { visible: true },
    appearance: migrateComposerBadgeAppearance(legacy.appearance)
  })
}

function migrateComposerBadgeAppearance(appearance: z.infer<typeof themeAppearanceSchema>): z.infer<typeof themeAppearanceSchema> {
  return {
    ...appearance,
    colors: {
      ...appearance.colors,
      ...(appearance.colors.composerBadgeIcon ? {} : appearance.colors.composerSendIcon ? { composerBadgeIcon: appearance.colors.composerSendIcon } : {})
    },
    paints: {
      ...appearance.paints,
      ...(appearance.paints.composerBadgeBackground ? {} : appearance.paints.composerSendButton ? { composerBadgeBackground: appearance.paints.composerSendButton } : {})
    }
  }
}
