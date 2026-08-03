import { z } from 'zod'

export const SYSTEM_ICON_LIBRARY_ID = 'system'
export const PROJECT_ICON_LIBRARY_VERSION = 1 as const
export const PROJECT_ICON_SETTINGS_VERSION = 1 as const
export const MAX_PROJECT_ICON_LIBRARY_ENTRIES = 128

export const SYSTEM_ICON_NAMES = [
  'music', 'sparkles', 'wand-sparkles', 'image', 'send', 'folder-code', 'square-pen',
  'git-pull-request', 'grid-2x2', 'clock-3', 'at-sign', 'heart', 'droplet', 'star',
  'snowflake', 'pin', 'home', 'search', 'settings', 'menu', 'plus', 'minus', 'check',
  'check-circle', 'close', 'arrow-up', 'arrow-down', 'arrow-left', 'arrow-right',
  'chevron-up', 'chevron-down', 'chevron-left', 'chevron-right', 'circle', 'square',
  'sun', 'moon', 'cloud', 'zap', 'book-open', 'bookmark', 'bell', 'calendar', 'clock',
  'user', 'users', 'message-circle', 'mail', 'globe', 'laptop', 'folder', 'folder-open',
  'file', 'file-code', 'code', 'terminal', 'copy', 'download', 'external', 'link',
  'paperclip', 'pencil', 'brush', 'palette', 'camera', 'video', 'mic', 'play', 'rocket',
  'lightbulb', 'shield', 'lock', 'key', 'eye', 'info', 'list', 'more-horizontal',
  'map-pin', 'smile', 'thumbs-up', 'trash'
] as const

export type SystemIconName = typeof SYSTEM_ICON_NAMES[number]

const DEFAULT_PROJECT_ICON_NAMES = new Set<SystemIconName>([
  'music', 'sparkles', 'wand-sparkles', 'image', 'folder-code', 'heart', 'star',
  'snowflake', 'sun', 'moon', 'cloud', 'book-open', 'globe', 'laptop', 'code',
  'terminal', 'palette', 'rocket', 'lightbulb', 'smile'
])

const uuidSchema = z.string().uuid()
const libraryIdSchema = z.union([z.literal(SYSTEM_ICON_LIBRARY_ID), uuidSchema])
const iconIdSchema = z.string().min(1).max(80).regex(/^[A-Za-z0-9._-]+$/)
const projectIdSchema = z.string().min(1).max(200).regex(/^[A-Za-z0-9._:-]+$/)
const weightSchema = z.number().int().min(1).max(10)

export const projectIconRefSchema = z.object({
  libraryId: libraryIdSchema,
  iconId: iconIdSchema
}).strict()

const customLibraryIconSchema = z.object({
  id: uuidSchema,
  name: z.string().trim().min(1).max(80),
  asset: z.string().regex(/^assets\/[A-Za-z0-9._-]+\.(?:png|webp|jpe?g|gif)$/i).max(260),
  mimeType: z.enum(['image/png', 'image/webp', 'image/jpeg', 'image/gif']),
  defaultEnabled: z.boolean(),
  defaultWeight: weightSchema,
  originalName: z.string().trim().min(1).max(255),
  width: z.number().int().positive().max(8192),
  height: z.number().int().positive().max(8192),
  sha256: z.string().regex(/^[0-9a-f]{64}$/)
}).strict()

export const customIconLibrarySchema = z.object({
  version: z.literal(PROJECT_ICON_LIBRARY_VERSION),
  id: uuidSchema,
  name: z.string().trim().min(1).max(80),
  updatedAt: z.string().datetime(),
  icons: z.array(customLibraryIconSchema).max(MAX_PROJECT_ICON_LIBRARY_ENTRIES)
}).strict()

const systemLibraryIconSchema = z.object({
  id: z.enum(SYSTEM_ICON_NAMES),
  name: z.string().min(1).max(80),
  builtinName: z.enum(SYSTEM_ICON_NAMES),
  defaultEnabled: z.boolean(),
  defaultWeight: weightSchema
}).strict()

export const systemIconLibrarySchema = z.object({
  version: z.literal(PROJECT_ICON_LIBRARY_VERSION),
  id: z.literal(SYSTEM_ICON_LIBRARY_ID),
  name: z.string().min(1).max(80),
  updatedAt: z.string().datetime(),
  icons: z.array(systemLibraryIconSchema).length(SYSTEM_ICON_NAMES.length)
}).strict()

export const iconLibrarySchema = z.union([systemIconLibrarySchema, customIconLibrarySchema])

const weightOverrideSchema = z.object({
  ref: projectIconRefSchema,
  enabled: z.boolean(),
  weight: weightSchema
}).strict()

const projectAssignmentSchema = z.object({
  projectId: projectIdSchema,
  ref: projectIconRefSchema
}).strict()

export const themeProjectIconSettingsSchema = z.object({
  enabledLibraryIds: z.array(libraryIdSchema).max(32),
  weightOverrides: z.array(weightOverrideSchema).max(4096),
  assignments: z.array(projectAssignmentSchema).max(1000)
}).strict()

export const codexProjectSchema = z.object({
  id: projectIdSchema,
  label: z.string().trim().min(1).max(200),
  kind: z.string().trim().min(1).max(40)
}).strict()

export const cachedCodexProjectSchema = codexProjectSchema.extend({
  lastSeenAt: z.string().datetime()
}).strict()

export const projectIconPrivateSettingsSchema = z.object({
  version: z.literal(PROJECT_ICON_SETTINGS_VERSION),
  themes: z.record(uuidSchema, themeProjectIconSettingsSchema),
  projects: z.array(cachedCodexProjectSchema).max(1000)
}).strict()

export type ProjectIconRef = z.infer<typeof projectIconRefSchema>
export type CustomLibraryIcon = z.infer<typeof customLibraryIconSchema>
export type CustomIconLibrary = z.infer<typeof customIconLibrarySchema>
export type SystemLibraryIcon = z.infer<typeof systemLibraryIconSchema>
export type SystemIconLibrary = z.infer<typeof systemIconLibrarySchema>
export type IconLibrary = z.infer<typeof iconLibrarySchema>
export type ThemeProjectIconSettings = z.infer<typeof themeProjectIconSettingsSchema>
export type CachedCodexProject = z.infer<typeof cachedCodexProjectSchema>
export type CodexProject = z.infer<typeof codexProjectSchema>
export type ProjectIconPrivateSettings = z.infer<typeof projectIconPrivateSettingsSchema>

export interface IconLibrarySummary {
  id: string
  name: string
  system: boolean
  iconCount: number
  updatedAt: string
}

export interface RuntimeProjectIconCandidate {
  ref: ProjectIconRef
  weight: number
  builtinName?: string
  dataUrl?: string
  posterDataUrl?: string
}

export interface RuntimeProjectIconConfig {
  pool: RuntimeProjectIconCandidate[]
  assignments: Array<{ projectId: string; icon: RuntimeProjectIconCandidate }>
}

export function createSystemIconLibrary(): SystemIconLibrary {
  return systemIconLibrarySchema.parse({
    version: PROJECT_ICON_LIBRARY_VERSION,
    id: SYSTEM_ICON_LIBRARY_ID,
    name: '系统图标',
    updatedAt: '2026-01-01T00:00:00.000Z',
    icons: SYSTEM_ICON_NAMES.map((name) => ({
      id: name,
      name,
      builtinName: name,
      defaultEnabled: DEFAULT_PROJECT_ICON_NAMES.has(name),
      defaultWeight: 1
    }))
  })
}

export function createDefaultThemeProjectIconSettings(): ThemeProjectIconSettings {
  return {
    enabledLibraryIds: [SYSTEM_ICON_LIBRARY_ID],
    weightOverrides: [],
    assignments: []
  }
}

export function projectIconRefKey(ref: ProjectIconRef): string {
  return `${ref.libraryId}:${ref.iconId}`
}

export function resolveProjectIconWeight(
  settings: ThemeProjectIconSettings,
  ref: ProjectIconRef,
  defaults: { enabled: boolean; weight: number }
): { enabled: boolean; weight: number } {
  const key = projectIconRefKey(ref)
  const override = settings.weightOverrides.find((candidate) => projectIconRefKey(candidate.ref) === key)
  return override ? { enabled: override.enabled, weight: override.weight } : defaults
}

export function selectStableProjectIcon(
  themeId: string,
  projectId: string,
  candidates: RuntimeProjectIconCandidate[]
): RuntimeProjectIconCandidate | null {
  const usable = candidates.filter((candidate) => Number.isInteger(candidate.weight) && candidate.weight >= 1 && candidate.weight <= 10)
  const total = usable.reduce((sum, candidate) => sum + candidate.weight, 0)
  if (total === 0) return null
  const fingerprint = usable.map((candidate) => `${projectIconRefKey(candidate.ref)}=${candidate.weight}`).join('|')
  let target = stableHash(`${themeId}\u0000${projectId}\u0000${fingerprint}`) % total
  for (const candidate of usable) {
    if (target < candidate.weight) return candidate
    target -= candidate.weight
  }
  return usable[usable.length - 1] ?? null
}

function stableHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
