import { z } from 'zod'

const normalized = z.number().finite().min(0).max(1)

export const pointSchema = z.object({ x: normalized, y: normalized }).strict()

const iconSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('builtin'), name: z.string().min(1).max(64) }).strict(),
  z.object({ kind: z.literal('asset'), asset: z.string().min(1).max(260) }).strict()
])

export const themeProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  version: z.literal(1),
  updatedAt: z.string().datetime(),
  hero: z.object({
    sourceImage: z.string().max(260).nullable(),
    focus: pointSchema,
    scale: z.number().finite().min(0.5).max(3),
    position: pointSchema
  }).strict(),
  polaroid: z.object({
    sourceImage: z.string().max(260).nullable(),
    fence: z.tuple([pointSchema, pointSchema, pointSchema, pointSchema]),
    placement: z.object({
      x: normalized,
      y: normalized,
      width: normalized,
      rotation: z.number().finite().min(-180).max(180),
      hideBelowWidth: z.number().int().min(320).max(3840)
    }).strict()
  }).strict(),
  colors: z.object({
    surface: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    ink: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    pink: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    lavender: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    border: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    success: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    danger: z.string().regex(/^#[0-9A-Fa-f]{6}$/)
  }).strict(),
  icons: z.object({
    branding: iconSourceSchema,
    cardPrimary: iconSourceSchema,
    cardSecondary: iconSourceSchema,
    composer: iconSourceSchema,
    project: iconSourceSchema,
    decoration: iconSourceSchema,
    polaroidPin: iconSourceSchema
  }).strict()
}).strict()

const legacyThemeSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  version: z.literal(0),
  colors: themeProfileSchema.shape.colors.partial().optional()
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
    version: 1,
    updatedAt: new Date().toISOString(),
    hero: {
      sourceImage: null,
      focus: { x: 0.62, y: 0.42 },
      scale: 1,
      position: { x: 0.5, y: 0.5 }
    },
    polaroid: {
      sourceImage: null,
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
      branding: { kind: 'builtin', name: 'sparkles' },
      cardPrimary: { kind: 'builtin', name: 'wand-sparkles' },
      cardSecondary: { kind: 'builtin', name: 'image' },
      composer: { kind: 'builtin', name: 'send' },
      project: { kind: 'builtin', name: 'folder-code' },
      decoration: { kind: 'builtin', name: 'heart' },
      polaroidPin: { kind: 'builtin', name: 'pin' }
    }
  }
}

export function parseThemeProfile(input: unknown): ThemeProfile {
  if (input && typeof input === 'object' && 'version' in input && input.version === 1) {
    return themeProfileSchema.parse(input)
  }
  if (input && typeof input === 'object' && 'version' in input && input.version === 0) {
    const legacy = legacyThemeSchema.parse(input)
    const migrated = createDefaultTheme(legacy.id, legacy.name)
    migrated.colors = { ...migrated.colors, ...legacy.colors }
    return themeProfileSchema.parse(migrated)
  }
  throw new Error('Unsupported theme profile version.')
}
