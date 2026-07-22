import { z } from 'zod'
import { createEmptyAppearance, cssColorSchema, themeAppearanceSchema, themePaintSchema } from './appearance'
import { DEFAULT_BRAND_COPY, DEFAULT_HOME_COPY, DEFAULT_HOME_HEADING_DECORATION, splitHeadingTemplate } from './home-layout'
import { PARTICLE_EFFECT_IDS } from './particle-effects'
import { createDefaultTypography, legacyThemeTypographySchema, themeTypographySchema } from './typography'
import { DEFAULT_SIDEBAR_COPY, DEFAULT_SIDEBAR_NAV_COPY, SIDEBAR_NAV_ITEMS } from './sidebar-layout'

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

const currentSidebarIconsSchema = currentParticleIconsSchema.extend({
  sidebarNavNewTask: iconSourceSchema,
  sidebarNavPullRequests: iconSourceSchema,
  sidebarNavSites: iconSourceSchema,
  sidebarNavScheduled: iconSourceSchema,
  sidebarNavPlugins: iconSourceSchema
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

export const themeColorsSchema = z.object({
  surface: cssColorSchema,
  ink: cssColorSchema,
  accent: cssColorSchema,
  pink: cssColorSchema,
  lavender: cssColorSchema,
  border: cssColorSchema,
  success: cssColorSchema,
  danger: cssColorSchema
}).strict()

const sidebarCopyFields = {
  sidebarModeTitle: z.string().trim().min(1).max(80),
  sidebarProjectsTitle: z.string().trim().min(1).max(80),
  sidebarTasksTitle: z.string().trim().min(1).max(80),
  sidebarNavNewTask: z.string().trim().min(1).max(80),
  sidebarNavPullRequests: z.string().trim().min(1).max(80),
  sidebarNavSites: z.string().trim().min(1).max(80),
  sidebarNavScheduled: z.string().trim().min(1).max(80),
  sidebarNavPlugins: z.string().trim().min(1).max(80)
}
const currentThemeCopySchema = themeCopySchema.extend(sidebarCopyFields).strict()

export type ThemeColors = z.infer<typeof themeColorsSchema>

export const createThemeInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  colors: themeColorsSchema
}).strict()

export type CreateThemeInput = z.infer<typeof createThemeInputSchema>

export const DEFAULT_THEME_COLORS: ThemeColors = {
  surface: '#F7FFFF',
  ink: '#164B59',
  accent: '#20BCC3',
  pink: '#F06EA9',
  lavender: '#B9A7E8',
  border: '#BFDADD',
  success: '#169B68',
  danger: '#D84A5D'
}

export const THEME_COLOR_PRESETS = [
  { id: 'miku', name: '初音青粉', colors: DEFAULT_THEME_COLORS },
  { id: 'ocean', name: '海盐蓝', colors: { surface: '#F7FBFF', ink: '#183B56', accent: '#2878B8', pink: '#39A6B8', lavender: '#7189C9', border: '#AFC7D8', success: '#17845D', danger: '#CF4A5B' } },
  { id: 'sakura', name: '樱花莓粉', colors: { surface: '#FFF9FC', ink: '#563247', accent: '#B94F7B', pink: '#E478A4', lavender: '#A884CF', border: '#D9B8C8', success: '#21845E', danger: '#C84458' } },
  { id: 'forest', name: '森林青绿', colors: { surface: '#F7FCF8', ink: '#214537', accent: '#287F5F', pink: '#6AA878', lavender: '#92A95F', border: '#B7CDBF', success: '#147653', danger: '#C64A54' } },
  { id: 'sunset', name: '暖阳珊瑚', colors: { surface: '#FFF9F3', ink: '#563B2C', accent: '#C8672F', pink: '#E48762', lavender: '#A9798F', border: '#D8B9A7', success: '#2F7D59', danger: '#C84646' } },
  { id: 'midnight', name: '夜幕霓虹', colors: { surface: '#171A21', ink: '#F0F5F7', accent: '#43C6CE', pink: '#F17DAA', lavender: '#9A8BE8', border: '#778491', success: '#49C98B', danger: '#FF737F' } }
] as const satisfies ReadonlyArray<{ id: string; name: string; colors: ThemeColors }>

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

export const COMPOSER_DECORATION_EFFECT_IDS = ['none', 'wave', 'barrage', 'scroll', 'float', 'pulse'] as const
export type ComposerDecorationEffect = typeof COMPOSER_DECORATION_EFFECT_IDS[number]
export const COMPOSER_DECORATION_DIRECTION_IDS = ['left', 'right'] as const
export type ComposerDecorationDirection = typeof COMPOSER_DECORATION_DIRECTION_IDS[number]

const composerMelodySchema = z.object({
  visible: z.boolean(),
  mode: z.enum(['text', 'gif']).default('text'),
  text: z.string().max(64),
  source: mediaReferenceSchema.nullable().default(null),
  effect: z.enum(COMPOSER_DECORATION_EFFECT_IDS).default('none'),
  direction: z.enum(COMPOSER_DECORATION_DIRECTION_IDS).default('left'),
  speed: z.number().finite().min(0.5).max(2).default(1),
  fontSize: z.number().int().min(10).max(32),
  gifWidth: z.number().int().min(32).max(240).default(96),
  position: z.object({
    x: z.number().finite().min(0.1).max(0.9),
    y: z.number().finite().min(0.1).max(0.65)
  }).strict(),
  hideWhenTyping: z.boolean()
}).strict().superRefine((decoration, context) => {
  if (decoration.source && (decoration.source.kind !== 'image' || decoration.source.mimeType !== 'image/gif')) {
    context.addIssue({ code: 'custom', path: ['source'], message: '输入框 GIF 装饰必须使用 GIF 图片素材。' })
  }
  if (decoration.mode === 'gif' && !decoration.source) {
    context.addIssue({ code: 'custom', path: ['source'], message: 'GIF 装饰必须引用 GIF 素材。' })
  }
})

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

export const conversationBackgroundModeSchema = z.enum(['color', 'image', 'gif', 'video'])
export type ConversationBackgroundMode = z.infer<typeof conversationBackgroundModeSchema>

const conversationBackgroundFields = {
  visible: z.boolean(),
  mode: conversationBackgroundModeSchema,
  color: cssColorSchema,
  source: mediaReferenceSchema.nullable(),
  opacity: normalized,
  focus: pointSchema,
  scale: z.number().finite().min(1).max(3)
}

const versionFourteenConversationBackgroundSchema = z.object({
  ...conversationBackgroundFields,
  overlayColor: cssColorSchema,
  overlayOpacity: normalized
}).strict().superRefine(refineConversationBackground)

const conversationBackgroundOverlaySchema = z.object({
  paint: themePaintSchema,
  opacity: normalized,
  shape: z.enum(['full', 'ellipse', 'roundedRect']),
  position: pointSchema,
  size: z.object({
    width: z.number().finite().min(0.1).max(1),
    height: z.number().finite().min(0.1).max(1)
  }).strict(),
  softness: z.number().finite().min(0).max(80),
  cornerRadius: z.number().finite().min(0).max(160)
}).strict()

const conversationBackgroundSchema = z.object({
  ...conversationBackgroundFields,
  overlay: conversationBackgroundOverlaySchema
}).strict().superRefine(refineConversationBackground)

function refineConversationBackground(background: {
  mode: ConversationBackgroundMode
  source: MediaReference | null
}, context: z.RefinementCtx): void {
  if (background.mode === 'color') {
    if (background.source !== null) context.addIssue({ code: 'custom', path: ['source'], message: '颜色背景不能引用媒体。' })
    return
  }
  if (!background.source) {
    context.addIssue({ code: 'custom', path: ['source'], message: '媒体背景必须引用素材。' })
    return
  }
  if (background.mode === 'video' && background.source.kind !== 'video') context.addIssue({ code: 'custom', path: ['source', 'kind'], message: '视频背景必须使用视频素材。' })
  if (background.mode === 'video' && !background.source.mimeType.startsWith('video/')) context.addIssue({ code: 'custom', path: ['source', 'mimeType'], message: '视频背景的 MIME 类型无效。' })
  if (background.mode === 'gif' && background.source.mimeType !== 'image/gif') context.addIssue({ code: 'custom', path: ['source', 'mimeType'], message: 'GIF 背景必须使用 GIF 素材。' })
  if (background.mode === 'gif' && background.source.kind !== 'image') context.addIssue({ code: 'custom', path: ['source', 'kind'], message: 'GIF 背景必须使用图片素材。' })
  if (background.mode === 'image' && (background.source.kind !== 'image' || background.source.mimeType === 'image/gif')) context.addIssue({ code: 'custom', path: ['source'], message: '图片背景只支持 PNG、WebP 或 JPEG。' })
}

export type ConversationBackground = z.infer<typeof conversationBackgroundSchema>
export type ConversationBackgroundOverlay = z.infer<typeof conversationBackgroundOverlaySchema>

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
  colors: themeColorsSchema,
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
  colors: themeColorsSchema,
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
  colors: themeColorsSchema,
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

const versionTwelveThemeSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  version: z.literal(12),
  updatedAt: z.string().datetime(),
  hero: currentHeroSchema,
  polaroid: currentPolaroidMediaSchema,
  conversationBackground: versionFourteenConversationBackgroundSchema.default(createDefaultVersionFourteenConversationBackground()),
  colors: themeColorsSchema,
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

const versionThirteenThemeFields = {
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  version: z.literal(13),
  updatedAt: z.string().datetime(),
  hero: currentHeroSchema,
  polaroid: currentPolaroidMediaSchema,
  conversationBackground: versionFourteenConversationBackgroundSchema.default(createDefaultVersionFourteenConversationBackground()),
  colors: themeColorsSchema,
  copy: currentThemeCopySchema,
  icons: currentSidebarIconsSchema,
  composerBadge: composerBadgeSchema,
  decorations: decorationsSchema,
  appearance: themeAppearanceSchema,
  typography: themeTypographySchema
}

const versionThirteenThemeSchema = z.object(versionThirteenThemeFields).strict().superRefine((profile, context) => {
  if (profile.hero.playback.sound && profile.polaroid.playback.sound) {
    context.addIssue({ code: 'custom', path: ['polaroid', 'playback', 'sound'], message: 'Only one media source may have sound enabled.' })
  }
})

const versionFourteenThemeSchema = z.object({
  ...versionThirteenThemeFields,
  version: z.literal(14),
  resetColors: themeColorsSchema
}).strict().superRefine((profile, context) => {
  if (profile.hero.playback.sound && profile.polaroid.playback.sound) {
    context.addIssue({ code: 'custom', path: ['polaroid', 'playback', 'sound'], message: 'Only one media source may have sound enabled.' })
  }
})

export const themeProfileSchema = z.object({
  ...versionThirteenThemeFields,
  version: z.literal(15),
  conversationBackground: conversationBackgroundSchema.default(createDefaultConversationBackground()),
  resetColors: themeColorsSchema
}).strict().superRefine((profile, context) => {
  if (profile.hero.playback.sound && profile.polaroid.playback.sound) {
    context.addIssue({ code: 'custom', path: ['polaroid', 'playback', 'sound'], message: 'Only one media source may have sound enabled.' })
  }
})

const versionEightThemeSchema = z.object({
  ...legacyCommonProfileFields,
  version: z.literal(8),
  colors: themeColorsSchema,
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
  colors: themeColorsSchema,
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
  colors: themeColorsSchema,
  copy: themeCopySchema,
  icons: currentIconsSchema,
  composerBadge: composerBadgeSchema,
  appearance: themeAppearanceSchema,
  typography: legacyThemeTypographySchema
}).strict()

const versionFiveThemeSchema = z.object({
  ...legacyCommonProfileFields,
  version: z.literal(5),
  colors: themeColorsSchema,
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
export type IconSlotMap = ThemeProfile['icons']
export type IconSlot = keyof IconSlotMap

export interface ThemeSummary {
  id: string
  name: string
  updatedAt: string
  active: boolean
  system: boolean
}

export function createDefaultTheme(id: string, name = '初音未来', resetColors: ThemeColors = DEFAULT_THEME_COLORS): ThemeProfile {
  const palette = { ...resetColors }
  return {
    id,
    name,
    version: 15,
    updatedAt: new Date().toISOString(),
    copy: { ...DEFAULT_HOME_COPY, ...DEFAULT_BRAND_COPY, ...DEFAULT_SIDEBAR_COPY, ...DEFAULT_SIDEBAR_NAV_COPY },
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
    conversationBackground: createDefaultConversationBackground(),
    colors: { ...palette },
    resetColors: { ...palette },
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
      polaroidPin: { kind: 'builtin', name: 'pin' },
      sidebarNavNewTask: { kind: 'builtin', name: 'square-pen' },
      sidebarNavPullRequests: { kind: 'builtin', name: 'git-pull-request' },
      sidebarNavSites: { kind: 'builtin', name: 'grid-2x2' },
      sidebarNavScheduled: { kind: 'builtin', name: 'clock-3' },
      sidebarNavPlugins: { kind: 'builtin', name: 'at-sign' }
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
    stripSidebarFields(legacy)
    const hero = legacy.hero && typeof legacy.hero === 'object' ? legacy.hero as Record<string, unknown> : null
    const polaroid = legacy.polaroid && typeof legacy.polaroid === 'object' ? legacy.polaroid as Record<string, unknown> : null
    if (hero && !('sourceImage' in hero)) hero.sourceImage = hero.source && typeof hero.source === 'object' && typeof (hero.source as Record<string, unknown>).asset === 'string' ? (hero.source as Record<string, unknown>).asset : null
    if (polaroid && !('sourceImage' in polaroid)) polaroid.sourceImage = polaroid.source && typeof polaroid.source === 'object' && typeof (polaroid.source as Record<string, unknown>).asset === 'string' ? (polaroid.source as Record<string, unknown>).asset : null
    if (hero) { delete hero.source; delete hero.playback; delete hero.mediaTransform; legacy.hero = hero }
    if (polaroid) { delete polaroid.source; delete polaroid.playback; delete polaroid.mediaTransform; legacy.polaroid = polaroid }
    delete legacy.conversationBackground
    input = legacy
  }
  if (input && typeof input === 'object' && 'version' in input && input.version === 15) {
    const candidate = normalizeCurrentMediaReferences(input)
    const parsed = themeProfileSchema.parse(candidate) as ThemeProfile
    return addSourceImageHints(parsed)
  }
  if (input && typeof input === 'object' && 'version' in input && input.version === 14) {
    const candidate = normalizeCurrentMediaReferences(input)
    return migrateVersionFourteen(versionFourteenThemeSchema.parse(candidate))
  }
  if (input && typeof input === 'object' && 'version' in input && input.version === 13) {
    const candidate = normalizeCurrentMediaReferences(input)
    return migrateVersionThirteen(versionThirteenThemeSchema.parse(candidate))
  }
  if (input && typeof input === 'object' && 'version' in input && input.version === 12) {
    const candidate = normalizeCurrentMediaReferences(stripSidebarFields(structuredClone(input) as Record<string, unknown>))
    return migrateVersionTwelve(versionTwelveThemeSchema.parse(candidate))
  }
  if (input && typeof input === 'object' && 'version' in input && input.version === 11) {
    const legacy = normalizeCurrentMediaReferences(stripSidebarFields(structuredClone(input) as Record<string, unknown>))
    delete legacy.conversationBackground
    return migrateVersionEleven(versionElevenThemeSchema.parse(legacy))
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
    migrated.resetColors = { ...migrated.colors }
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
  return migrateVersionTwelve(versionTwelveThemeSchema.parse({
    ...legacy,
    version: 12,
    hero: { ...legacy.hero, mediaTransform: createDefaultMediaTransform() },
    polaroid: { ...legacy.polaroid, mediaTransform: createDefaultMediaTransform() }
  }))
}

function migrateVersionTwelve(legacy: z.infer<typeof versionTwelveThemeSchema>): ThemeProfile {
  const sidebarIcons = Object.fromEntries(SIDEBAR_NAV_ITEMS.map((item) => [item.iconSlot, { kind: 'builtin', name: item.iconName }]))
  const sidebarFonts = Object.fromEntries(SIDEBAR_NAV_ITEMS.map((item) => [item.fontSlot, { kind: 'inherit' }]))
  return migrateVersionThirteen(versionThirteenThemeSchema.parse({
    ...legacy,
    version: 13,
    copy: { ...legacy.copy, ...DEFAULT_SIDEBAR_COPY, ...DEFAULT_SIDEBAR_NAV_COPY },
    icons: { ...legacy.icons, ...sidebarIcons },
    typography: { ...legacy.typography, slots: { ...legacy.typography.slots, ...sidebarFonts } }
  }))
}

function migrateVersionThirteen(legacy: z.infer<typeof versionThirteenThemeSchema>): ThemeProfile {
  return migrateVersionFourteen(versionFourteenThemeSchema.parse({
    ...legacy,
    version: 14,
    resetColors: { ...legacy.colors }
  }))
}

function migrateVersionFourteen(legacy: z.infer<typeof versionFourteenThemeSchema>): ThemeProfile {
  const { overlayColor, overlayOpacity, ...conversationBackground } = legacy.conversationBackground
  return addSourceImageHints(themeProfileSchema.parse({
    ...legacy,
    version: 15,
    conversationBackground: {
      ...conversationBackground,
      overlay: {
        ...createDefaultConversationOverlay(),
        paint: { kind: 'solid', color: overlayColor },
        opacity: overlayOpacity
      }
    }
  }))
}

function addSourceImageHints(profile: ThemeProfile): ThemeProfile {
  Object.defineProperty(profile.hero, 'sourceImage', { value: profile.hero.source?.asset ?? null, enumerable: false, configurable: true, writable: true })
  Object.defineProperty(profile.polaroid, 'sourceImage', { value: profile.polaroid.source?.asset ?? null, enumerable: false, configurable: true, writable: true })
  return profile
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

function stripSidebarFields(candidate: Record<string, unknown>): Record<string, unknown> {
  const copy = candidate.copy && typeof candidate.copy === 'object' ? candidate.copy as Record<string, unknown> : null
  if (copy) for (const field of [...Object.keys(DEFAULT_SIDEBAR_COPY), ...Object.keys(DEFAULT_SIDEBAR_NAV_COPY)]) delete copy[field]
  const icons = candidate.icons && typeof candidate.icons === 'object' ? candidate.icons as Record<string, unknown> : null
  if (icons) for (const item of SIDEBAR_NAV_ITEMS) delete icons[item.iconSlot]
  const typography = candidate.typography && typeof candidate.typography === 'object' ? candidate.typography as Record<string, unknown> : null
  const slots = typography?.slots && typeof typography.slots === 'object' ? typography.slots as Record<string, unknown> : null
  if (slots) for (const item of SIDEBAR_NAV_ITEMS) delete slots[item.fontSlot]
  return candidate
}

function createDefaultMediaTransform(): z.infer<typeof mediaTransformSchema> {
  return { flipHorizontal: false, flipVertical: false }
}

function createDefaultConversationBackground(): ConversationBackground {
  return {
    visible: false,
    mode: 'color',
    color: '#F7FFFF',
    source: null,
    opacity: 1,
    overlay: createDefaultConversationOverlay(),
    focus: { x: 0.5, y: 0.5 },
    scale: 1
  }
}

function createDefaultVersionFourteenConversationBackground(): z.infer<typeof versionFourteenConversationBackgroundSchema> {
  return {
    visible: false,
    mode: 'color',
    color: '#F7FFFF',
    source: null,
    opacity: 1,
    overlayColor: '#FFFFFF',
    overlayOpacity: 0.24,
    focus: { x: 0.5, y: 0.5 },
    scale: 1
  }
}

function createDefaultConversationOverlay(): ConversationBackgroundOverlay {
  return {
    paint: { kind: 'solid', color: '#FFFFFF' },
    opacity: 0.24,
    shape: 'full',
    position: { x: 0.5, y: 0.5 },
    size: { width: 0.72, height: 0.62 },
    softness: 18,
    cornerRadius: 28
  }
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
      mode: 'text',
      text: '♫ · · · ♡ · · · ♪',
      source: null,
      effect: 'none',
      direction: 'left',
      speed: 1,
      fontSize: 16,
      gifWidth: 96,
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
