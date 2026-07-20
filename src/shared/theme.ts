import { z } from 'zod'
import { createEmptyAppearance, cssColorSchema, themeAppearanceSchema } from './appearance'
import { DEFAULT_BRAND_COPY, DEFAULT_HOME_COPY, DEFAULT_HOME_HEADING_DECORATION, splitHeadingTemplate } from './home-layout'
import { PARTICLE_EFFECT_IDS } from './particle-effects'
import { createDefaultTypography, legacyThemeTypographySchema, themeTypographySchema } from './typography'

const normalized = z.number().finite().min(0).max(1)

export const polaroidModeSchema = z.enum(['full', 'fence'])
export type PolaroidMode = z.infer<typeof polaroidModeSchema>

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

const versionSevenIconsSchema = currentIconsSchema.extend({
  backgroundSparkle: iconSourceSchema
}).strict()

const currentParticleIconsSchema = versionSevenIconsSchema.extend({
  backgroundFloat: iconSourceSchema,
  backgroundRain: iconSourceSchema,
  backgroundMeteor: iconSourceSchema,
  backgroundSnow: iconSourceSchema
}).strict()

const composerBadgeSchema = z.object({ visible: z.boolean() }).strict()

const sparkleFields = {
  visible: z.boolean(),
  count: z.number().int().min(1).max(24),
  minSize: z.number().int().min(8).max(32),
  maxSize: z.number().int().min(8).max(32),
  opacity: z.number().finite().min(0).max(1),
  glow: z.number().int().min(0).max(24),
  seed: z.number().int().min(0).max(4294967295),
  extraColors: z.array(cssColorSchema).max(3)
}

const versionSevenSparklesSchema = z.object(sparkleFields).strict().superRefine((sparkles, context) => {
  if (sparkles.minSize > sparkles.maxSize) context.addIssue({ code: 'custom', path: ['maxSize'], message: 'Sparkle maxSize must be greater than or equal to minSize.' })
})

const sparklesSchema = z.object({
  ...sparkleFields,
  effect: z.enum(PARTICLE_EFFECT_IDS),
  speed: z.number().finite().min(0.5).max(2)
}).strict().superRefine((sparkles, context) => {
  if (sparkles.minSize > sparkles.maxSize) context.addIssue({ code: 'custom', path: ['maxSize'], message: 'Sparkle maxSize must be greater than or equal to minSize.' })
})

const composerMelodySchema = z.object({
  visible: z.boolean(),
  text: z.string().max(64),
  fontSize: z.number().int().min(10).max(32),
  position: z.object({
    x: z.number().finite().min(0.1).max(0.9),
    y: z.number().finite().min(0.1).max(0.65)
  }).strict(),
  hideWhenTyping: z.boolean()
}).strict()

const homeHeadingDecorationSchema = z.object({
  visible: z.boolean(),
  text: z.string().max(64),
  fontSize: z.number().int().min(10).max(32)
}).strict()

const decorationsSchema = z.object({
  sparkles: sparklesSchema,
  homeHeading: homeHeadingDecorationSchema.default({
    visible: true,
    text: DEFAULT_HOME_HEADING_DECORATION,
    fontSize: 17
  }),
  composerMelody: composerMelodySchema
}).strict()

const versionSevenDecorationsSchema = z.object({
  sparkles: versionSevenSparklesSchema,
  composerMelody: composerMelodySchema
}).strict()

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

const polaroidStyleSchema = z.object({
  opacity: normalized,
  shadow: z.object({
    visible: z.boolean(),
    offsetX: z.number().finite().min(-40).max(40),
    offsetY: z.number().finite().min(-40).max(40),
    blur: z.number().finite().min(0).max(48),
    color: cssColorSchema
  }).strict()
}).strict()

export const mediaKindSchema = z.enum(['image', 'video'])
export type MediaKind = z.infer<typeof mediaKindSchema>

export const mediaMimeTypeSchema = z.enum(['image/png', 'image/webp', 'image/jpeg', 'image/gif', 'video/mp4', 'video/webm'])
export type MediaMimeType = z.infer<typeof mediaMimeTypeSchema>

export const mediaReferenceSchema = z.object({
  asset: z.string().min(1).max(260),
  kind: mediaKindSchema,
  mimeType: mediaMimeTypeSchema
}).strict().superRefine((media, context) => {
  const isVideo = media.mimeType.startsWith('video/')
  if (isVideo !== (media.kind === 'video')) context.addIssue({ code: 'custom', path: ['kind'], message: 'Media kind does not match its MIME type.' })
  if (!isVideo && media.mimeType === 'image/gif' && media.kind !== 'image') context.addIssue({ code: 'custom', path: ['kind'], message: 'GIF media must be an image.' })
})

const videoPlaybackSchema = z.object({
  autoplay: z.boolean(),
  loop: z.boolean(),
  sound: z.boolean(),
  volume: normalized
}).strict()

const mediaTransformSchema = z.object({
  flipHorizontal: z.boolean(),
  flipVertical: z.boolean()
}).strict()

export type MediaReference = z.infer<typeof mediaReferenceSchema>
export type VideoPlayback = z.infer<typeof videoPlaybackSchema>

const legacyCommonProfileFields = {
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
    mode: polaroidModeSchema.default('fence'),
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

const versionNineThemeSchema = z.object({
  ...legacyCommonProfileFields,
  version: z.literal(9),
  colors: colorsSchema,
  copy: themeCopySchema,
  icons: currentParticleIconsSchema,
  composerBadge: composerBadgeSchema,
  decorations: decorationsSchema,
  appearance: themeAppearanceSchema,
  typography: themeTypographySchema
}).strict()

const currentPolaroidSchema = legacyCommonProfileFields.polaroid.extend({ style: polaroidStyleSchema }).strict()

const versionTenThemeSchema = z.object({
  ...legacyCommonProfileFields,
  polaroid: currentPolaroidSchema,
  version: z.literal(10),
  colors: colorsSchema,
  copy: themeCopySchema,
  icons: currentParticleIconsSchema,
  composerBadge: composerBadgeSchema,
  decorations: decorationsSchema,
  appearance: themeAppearanceSchema,
  typography: themeTypographySchema
}).strict()

const versionElevenHeroSchema = z.object({
  source: mediaReferenceSchema.nullable(),
  focus: pointSchema,
  scale: z.number().finite().min(0.5).max(3),
  position: pointSchema,
  playback: videoPlaybackSchema
}).strict()

const versionElevenPolaroidMediaSchema = z.object({
  mode: polaroidModeSchema.default('fence'),
  visible: z.boolean().default(true),
  source: mediaReferenceSchema.nullable(),
  sourceSize: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).strict().nullable().default(null),
  fence: z.tuple([pointSchema, pointSchema, pointSchema, pointSchema]),
  placement: z.object({
    x: normalized,
    y: normalized,
    width: normalized,
    rotation: z.number().finite().min(-180).max(180),
    hideBelowWidth: z.number().int().min(320).max(3840)
  }).strict(),
  style: polaroidStyleSchema,
  playback: videoPlaybackSchema
}).strict()

const versionElevenThemeSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  version: z.literal(11),
  updatedAt: z.string().datetime(),
  hero: versionElevenHeroSchema,
  polaroid: versionElevenPolaroidMediaSchema,
  colors: colorsSchema,
  copy: themeCopySchema,
  icons: currentParticleIconsSchema,
  composerBadge: composerBadgeSchema,
  decorations: decorationsSchema,
  appearance: themeAppearanceSchema,
  typography: themeTypographySchema
}).strict().superRefine((profile, context) => {
  if (profile.hero.playback.sound && profile.polaroid.playback.sound) {
    context.addIssue({ code: 'custom', path: ['polaroid', 'playback', 'sound'], message: 'Only one media source may have sound enabled.' })
  }
})

const currentHeroSchema = versionElevenHeroSchema.extend({ mediaTransform: mediaTransformSchema }).strict()
const currentPolaroidMediaSchema = versionElevenPolaroidMediaSchema.extend({ mediaTransform: mediaTransformSchema }).strict()

export const themeProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  version: z.literal(12),
  updatedAt: z.string().datetime(),
  hero: currentHeroSchema,
  polaroid: currentPolaroidMediaSchema,
  colors: colorsSchema,
  copy: themeCopySchema,
  icons: currentParticleIconsSchema,
  composerBadge: composerBadgeSchema,
  decorations: decorationsSchema,
  appearance: themeAppearanceSchema,
  typography: themeTypographySchema
}).strict().superRefine((profile, context) => {
  if (profile.hero.playback.sound && profile.polaroid.playback.sound) {
    context.addIssue({ code: 'custom', path: ['polaroid', 'playback', 'sound'], message: 'Only one media source may have sound enabled.' })
  }
})

const versionEightThemeSchema = z.object({
  ...legacyCommonProfileFields,
  version: z.literal(8),
  colors: colorsSchema,
  copy: themeCopySchema,
  icons: currentParticleIconsSchema,
  composerBadge: composerBadgeSchema,
  decorations: decorationsSchema,
  appearance: themeAppearanceSchema,
  typography: themeTypographySchema
}).strict()

const versionSevenThemeSchema = z.object({
  ...legacyCommonProfileFields,
  version: z.literal(7),
  colors: colorsSchema,
  copy: themeCopySchema,
  icons: versionSevenIconsSchema,
  composerBadge: composerBadgeSchema,
  decorations: versionSevenDecorationsSchema,
  appearance: themeAppearanceSchema,
  typography: themeTypographySchema
}).strict()

const versionSixThemeSchema = z.object({
  ...legacyCommonProfileFields,
  version: z.literal(6),
  colors: colorsSchema,
  copy: themeCopySchema,
  icons: currentIconsSchema,
  composerBadge: composerBadgeSchema,
  appearance: themeAppearanceSchema,
  typography: legacyThemeTypographySchema
}).strict()

const versionFiveThemeSchema = z.object({
  ...legacyCommonProfileFields,
  version: z.literal(5),
  colors: colorsSchema,
  copy: themeCopySchema,
  icons: versionFiveIconsSchema,
  appearance: themeAppearanceSchema,
  typography: legacyThemeTypographySchema
}).strict()

const versionFourThemeSchema = z.object({
  ...legacyCommonProfileFields,
  version: z.literal(4),
  colors: legacyColorsSchema,
  copy: themeCopySchema,
  icons: versionFiveIconsSchema
}).strict()

const versionThreeThemeSchema = z.object({
  ...legacyCommonProfileFields,
  version: z.literal(3),
  colors: legacyColorsSchema,
  copy: legacyHomeCopySchema,
  icons: legacyIconsSchema
}).strict()

const versionTwoThemeSchema = z.object({
  ...legacyCommonProfileFields,
  version: z.literal(2),
  colors: legacyColorsSchema,
  copy: legacyHomeCopySchema,
  icons: legacyIconsSchema
}).strict()

const versionOneThemeSchema = z.object({
  ...legacyCommonProfileFields,
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
type CurrentThemeProfile = z.infer<typeof themeProfileSchema>
// sourceImage is retained as a non-persisted compatibility hint for older renderer
// integrations. parseThemeProfile normalizes it into source before validation.
export type ThemeProfile = CurrentThemeProfile & {
  hero: CurrentThemeProfile['hero'] & { sourceImage?: string | null }
  polaroid: CurrentThemeProfile['polaroid'] & { sourceImage?: string | null }
}
export type ThemeColors = ThemeProfile['colors']
export type IconSlotMap = ThemeProfile['icons']
export type IconSlot = keyof IconSlotMap

export interface ThemeSummary {
  id: string
  name: string
  updatedAt: string
  active: boolean
  system: boolean
}

export function createDefaultTheme(id: string, name = '初音未来'): ThemeProfile {
  return {
    id,
    name,
    version: 12,
    updatedAt: new Date().toISOString(),
    copy: { ...DEFAULT_HOME_COPY, ...DEFAULT_BRAND_COPY },
    hero: {
      source: null,
      focus: { x: 0.62, y: 0.42 },
      scale: 1,
      position: { x: 0.5, y: 0.5 },
      playback: createDefaultVideoPlayback(),
      mediaTransform: createDefaultMediaTransform()
    },
    polaroid: {
      mode: 'full',
      visible: true,
      source: null,
      sourceSize: null,
      fence: [
        { x: 0.12, y: 0.12 },
        { x: 0.88, y: 0.12 },
        { x: 0.88, y: 0.88 },
        { x: 0.12, y: 0.88 }
      ],
      placement: { x: 0.72, y: 0.2, width: 0.22, rotation: 3, hideBelowWidth: 920 },
      style: createDefaultPolaroidStyle(),
      playback: createDefaultVideoPlayback(),
      mediaTransform: createDefaultMediaTransform()
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
      backgroundSparkle: { kind: 'builtin', name: 'sparkles' },
      backgroundFloat: { kind: 'builtin', name: 'heart' },
      backgroundRain: { kind: 'builtin', name: 'droplet' },
      backgroundMeteor: { kind: 'builtin', name: 'star' },
      backgroundSnow: { kind: 'builtin', name: 'snowflake' },
      project: { kind: 'builtin', name: 'folder-code' },
      decoration: { kind: 'builtin', name: 'heart' },
      polaroidPin: { kind: 'builtin', name: 'pin' }
    },
    composerBadge: { visible: true },
    decorations: createDefaultDecorations(),
    appearance: createEmptyAppearance(),
    typography: createDefaultTypography()
  }
}

export function parseThemeProfile(input: unknown): ThemeProfile {
  if (input && typeof input === 'object' && 'version' in input && typeof input.version === 'number' && input.version >= 1 && input.version <= 10) {
    const legacy = structuredClone(input) as Record<string, unknown>
    const hero = legacy.hero && typeof legacy.hero === 'object' ? legacy.hero as Record<string, unknown> : null
    const polaroid = legacy.polaroid && typeof legacy.polaroid === 'object' ? legacy.polaroid as Record<string, unknown> : null
    if (hero && !('sourceImage' in hero)) hero.sourceImage = hero.source && typeof hero.source === 'object' && typeof (hero.source as Record<string, unknown>).asset === 'string' ? (hero.source as Record<string, unknown>).asset : null
    if (polaroid && !('sourceImage' in polaroid)) polaroid.sourceImage = polaroid.source && typeof polaroid.source === 'object' && typeof (polaroid.source as Record<string, unknown>).asset === 'string' ? (polaroid.source as Record<string, unknown>).asset : null
    if (hero) { delete hero.source; delete hero.playback; delete hero.mediaTransform; legacy.hero = hero }
    if (polaroid) { delete polaroid.source; delete polaroid.playback; delete polaroid.mediaTransform; legacy.polaroid = polaroid }
    input = legacy
  }
  if (input && typeof input === 'object' && 'version' in input && input.version === 12) {
    const candidate = normalizeCurrentMediaReferences(input)
    const parsed = themeProfileSchema.parse(candidate) as ThemeProfile
    Object.defineProperty(parsed.hero, 'sourceImage', { value: parsed.hero.source?.asset ?? null, enumerable: false, configurable: true, writable: true })
    Object.defineProperty(parsed.polaroid, 'sourceImage', { value: parsed.polaroid.source?.asset ?? null, enumerable: false, configurable: true, writable: true })
    return parsed
  }
  if (input && typeof input === 'object' && 'version' in input && input.version === 11) {
    return migrateVersionEleven(versionElevenThemeSchema.parse(normalizeCurrentMediaReferences(input)))
  }
  if (input && typeof input === 'object' && 'version' in input && input.version === 10) {
    return migrateVersionTen(versionTenThemeSchema.parse(input))
  }
  if (input && typeof input === 'object' && 'version' in input && input.version === 9) {
    return migrateVersionNine(versionNineThemeSchema.parse(input))
  }
  if (input && typeof input === 'object' && 'version' in input && input.version === 8) {
    return migrateVersionEight(versionEightThemeSchema.parse(input))
  }
  if (input && typeof input === 'object' && 'version' in input && input.version === 7) {
    return migrateVersionSeven(versionSevenThemeSchema.parse(input))
  }
  if (input && typeof input === 'object' && 'version' in input && input.version === 6) {
    return migrateVersionSix(versionSixThemeSchema.parse(input))
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
    migrated.polaroid.mode = 'fence'
    migrated.colors = { ...migrated.colors, ...legacy.colors }
    return themeProfileSchema.parse(migrated)
  }
  throw new Error('Unsupported theme profile version.')
}

function migrateVersionNine(legacy: z.infer<typeof versionNineThemeSchema>): ThemeProfile {
  return migrateVersionTen(versionTenThemeSchema.parse({
    ...legacy,
    version: 10,
    polaroid: { ...legacy.polaroid, style: createDefaultPolaroidStyle() }
  }))
}

function migrateLegacyTheme(
  legacy: z.infer<typeof versionThreeThemeSchema> | z.infer<typeof versionTwoThemeSchema> | z.infer<typeof versionOneThemeSchema>,
  copy: z.infer<typeof legacyHomeCopySchema>
): ThemeProfile {
  return migrateVersionTen(versionTenThemeSchema.parse({
    ...legacy,
    version: 10,
    polaroid: { ...legacy.polaroid, mode: 'fence', style: createDefaultPolaroidStyle() },
    copy: { ...copy, ...DEFAULT_BRAND_COPY },
    icons: { ...legacy.icons, sidebarMode: { kind: 'builtin', name: 'music' }, composerBadge: { kind: 'builtin', name: 'music' }, ...createDefaultParticleIcons() },
    composerBadge: { visible: true },
    decorations: createDefaultDecorations(),
    appearance: createEmptyAppearance(),
    typography: createDefaultTypography()
  }))
}

function migrateVersionFour(legacy: z.infer<typeof versionFourThemeSchema>): ThemeProfile {
  return migrateVersionTen(versionTenThemeSchema.parse({
    ...legacy,
    version: 10,
    polaroid: { ...legacy.polaroid, mode: 'fence', style: createDefaultPolaroidStyle() },
    icons: { ...legacy.icons, composerBadge: { kind: 'builtin', name: 'music' }, ...createDefaultParticleIcons() },
    composerBadge: { visible: true },
    decorations: createDefaultDecorations(),
    appearance: createEmptyAppearance(),
    typography: createDefaultTypography()
  }))
}

function migrateVersionFive(legacy: z.infer<typeof versionFiveThemeSchema>): ThemeProfile {
  return migrateVersionSix({
    ...legacy,
    version: 6,
    icons: { ...legacy.icons, composerBadge: { kind: 'builtin', name: 'music' } },
    composerBadge: { visible: true },
    appearance: migrateComposerBadgeAppearance(legacy.appearance),
    typography: legacy.typography
  })
}

function migrateVersionSix(legacy: z.infer<typeof versionSixThemeSchema>): ThemeProfile {
  return migrateVersionTen(versionTenThemeSchema.parse({
    ...legacy,
    version: 10,
    polaroid: { ...legacy.polaroid, mode: 'fence', style: createDefaultPolaroidStyle() },
    icons: { ...legacy.icons, ...createDefaultParticleIcons() },
    decorations: createDefaultDecorations(),
    typography: {
      ...legacy.typography,
      slots: { ...legacy.typography.slots, composerMelody: { kind: 'inherit' } }
    }
  }))
}

function migrateVersionSeven(legacy: z.infer<typeof versionSevenThemeSchema>): ThemeProfile {
  return migrateVersionTen(versionTenThemeSchema.parse({
    ...legacy,
    version: 10,
    polaroid: { ...legacy.polaroid, mode: 'fence', style: createDefaultPolaroidStyle() },
    icons: { ...legacy.icons, ...createAdditionalParticleIcons() },
    decorations: {
      ...legacy.decorations,
      sparkles: { ...legacy.decorations.sparkles, effect: 'twinkle', speed: 1 }
    }
  }))
}

function migrateVersionEight(legacy: z.infer<typeof versionEightThemeSchema>): ThemeProfile {
  return migrateVersionTen(versionTenThemeSchema.parse({
    ...legacy,
    version: 10,
    polaroid: { ...legacy.polaroid, mode: 'fence', style: createDefaultPolaroidStyle() }
  }))
}

function migrateVersionTen(legacy: z.infer<typeof versionTenThemeSchema>): ThemeProfile {
  const { sourceImage: polaroidSourceImage, ...polaroid } = legacy.polaroid
  return migrateVersionEleven(versionElevenThemeSchema.parse({
    ...legacy,
    version: 11,
    hero: {
      source: legacy.hero.sourceImage ? inferLegacyMediaReference(legacy.hero.sourceImage) : null,
      focus: legacy.hero.focus,
      scale: legacy.hero.scale,
      position: legacy.hero.position,
      playback: createDefaultVideoPlayback()
    },
    polaroid: {
      ...polaroid,
      source: polaroidSourceImage ? inferLegacyMediaReference(polaroidSourceImage) : null,
      playback: createDefaultVideoPlayback()
    }
  }))
}

function migrateVersionEleven(legacy: z.infer<typeof versionElevenThemeSchema>): ThemeProfile {
  return themeProfileSchema.parse({
    ...legacy,
    version: 12,
    hero: { ...legacy.hero, mediaTransform: createDefaultMediaTransform() },
    polaroid: { ...legacy.polaroid, mediaTransform: createDefaultMediaTransform() }
  })
}

function inferLegacyMediaReference(asset: string): MediaReference {
  const lower = asset.toLowerCase()
  const mimeType: MediaMimeType = lower.endsWith('.webp')
    ? 'image/webp'
    : lower.endsWith('.gif')
      ? 'image/gif'
      : lower.endsWith('.jpg') || lower.endsWith('.jpeg')
        ? 'image/jpeg'
        : 'image/png'
  return { asset, kind: 'image', mimeType }
}

function polaroidRecord(value: object): Record<string, unknown> {
  return value as Record<string, unknown>
}

function normalizeCurrentMediaReferences(input: object): Record<string, unknown> {
  const candidate = structuredClone(input) as Record<string, unknown>
  const hero = candidate.hero && typeof candidate.hero === 'object' ? candidate.hero as Record<string, unknown> : null
  const polaroid = candidate.polaroid && typeof candidate.polaroid === 'object' ? polaroidRecord(candidate.polaroid) : null
  if (hero && (!hero.source || !('source' in hero)) && typeof hero.sourceImage === 'string') hero.source = inferLegacyMediaReference(hero.sourceImage)
  if (hero) delete hero.sourceImage
  if (polaroid && (!polaroid.source || !('source' in polaroid)) && typeof polaroid.sourceImage === 'string') polaroid.source = inferLegacyMediaReference(polaroid.sourceImage)
  if (polaroid) delete polaroid.sourceImage
  if (hero) candidate.hero = hero
  if (polaroid) candidate.polaroid = polaroid
  return candidate
}

function createDefaultMediaTransform(): z.infer<typeof mediaTransformSchema> {
  return { flipHorizontal: false, flipVertical: false }
}

function createDefaultDecorations(): z.infer<typeof decorationsSchema> {
  return {
    sparkles: {
      visible: true,
      effect: 'twinkle',
      speed: 1,
      count: 6,
      minSize: 14,
      maxSize: 18,
      opacity: 0.72,
      glow: 10,
      seed: 0,
      extraColors: []
    },
    composerMelody: {
      visible: true,
      text: '♫ · · · ♡ · · · ♪',
      fontSize: 16,
      position: { x: 0.5, y: 0.35 },
      hideWhenTyping: true
    },
    homeHeading: {
      visible: true,
      text: DEFAULT_HOME_HEADING_DECORATION,
      fontSize: 17
    }
  }
}

function createDefaultPolaroidStyle(): z.infer<typeof polaroidStyleSchema> {
  return {
    opacity: 1,
    shadow: {
      visible: true,
      offsetX: 0,
      offsetY: 8,
      blur: 10,
      color: 'rgba(24, 48, 54, 0.24)'
    }
  }
}

function createDefaultVideoPlayback(): VideoPlayback {
  return { autoplay: true, loop: true, sound: false, volume: 0.7 }
}

function createDefaultParticleIcons(): Pick<z.infer<typeof currentParticleIconsSchema>, 'backgroundSparkle' | 'backgroundFloat' | 'backgroundRain' | 'backgroundMeteor' | 'backgroundSnow'> {
  return {
    backgroundSparkle: { kind: 'builtin', name: 'sparkles' },
    ...createAdditionalParticleIcons()
  }
}

function createAdditionalParticleIcons(): Pick<z.infer<typeof currentParticleIconsSchema>, 'backgroundFloat' | 'backgroundRain' | 'backgroundMeteor' | 'backgroundSnow'> {
  return {
    backgroundFloat: { kind: 'builtin', name: 'heart' },
    backgroundRain: { kind: 'builtin', name: 'droplet' },
    backgroundMeteor: { kind: 'builtin', name: 'star' },
    backgroundSnow: { kind: 'builtin', name: 'snowflake' }
  }
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
