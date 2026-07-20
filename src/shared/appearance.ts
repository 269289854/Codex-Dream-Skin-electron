import { converter, formatRgb, parse } from 'culori'
import { z } from 'zod'

export const MAX_CSS_COLOR_LENGTH = 128
const UNSAFE_COLOR_SYNTAX = /[;{}\\\r\n\f]|\/\*|\*\/|\b(?:url|var)\s*\(/i

export function isCssColor(value: string): boolean {
  const candidate = value.trim()
  return candidate.length > 0 && candidate.length <= MAX_CSS_COLOR_LENGTH &&
    !UNSAFE_COLOR_SYNTAX.test(candidate) && parse(candidate) !== undefined
}

export function parseCssColor(value: string): string | null {
  const candidate = value.trim()
  return isCssColor(candidate) ? candidate : null
}

export const cssColorSchema = z.string().trim().min(1).max(MAX_CSS_COLOR_LENGTH)
  .refine(isCssColor, { message: 'Color must be a supported CSS solid color.' })

export interface LegacyThemeColors {
  surface: string
  ink: string
  accent: string
  pink: string
  lavender: string
  border: string
  success: string
  danger: string
}

export type AppearanceGroup = 'global' | 'conversation' | 'sidebar' | 'brand' | 'home' | 'cards' | 'projects' | 'composer' | 'decoration'
export type AppearanceState = 'normal' | 'hover' | 'selected'
export type LegacyColorKey = keyof LegacyThemeColors

interface AppearanceTokenDefinition {
  label: string
  group: AppearanceGroup
  cssVariable: `--dream-${string}`
  fallback: LegacyColorKey
  state?: AppearanceState
  targets: readonly string[]
  editable: boolean
}

const colorToken = (
  label: string,
  group: AppearanceGroup,
  cssVariable: `--dream-${string}`,
  fallback: LegacyColorKey,
  targets: readonly string[],
  state?: AppearanceState,
  editable = true
): AppearanceTokenDefinition => ({ label, group, cssVariable, fallback, targets, state, editable })

export const APPEARANCE_COLOR_TOKENS = {
  globalText: colorToken('全局正文', 'global', '--dream-global-text', 'ink', ['text-global']),
  globalMutedText: colorToken('全局弱化文字', 'global', '--dream-global-muted-text', 'border', ['text-muted']),
  globalLink: colorToken('链接', 'global', '--dream-global-link', 'accent', ['text-link']),
  globalCaret: colorToken('光标', 'global', '--dream-global-caret', 'accent', ['composer-text']),
  globalScrollbar: colorToken('滚动条', 'global', '--dream-global-scrollbar', 'border', ['canvas']),
  globalBorder: colorToken('全局边框', 'global', '--dream-global-border', 'border', ['canvas']),
  conversationText: colorToken('会话正文', 'conversation', '--dream-conversation-text', 'ink', ['conversation-message']),
  conversationLink: colorToken('会话链接', 'conversation', '--dream-conversation-link', 'accent', ['conversation-link']),
  primaryButtonText: colorToken('主要按钮文字', 'conversation', '--dream-primary-button-text', 'surface', ['primary-button']),
  sidebarBorder: colorToken('侧边栏边框', 'sidebar', '--dream-sidebar-border', 'border', ['sidebar']),
  sidebarText: colorToken('侧边栏正文', 'sidebar', '--dream-sidebar-text', 'ink', ['sidebar']),
  sidebarMutedText: colorToken('侧边栏弱化文字', 'sidebar', '--dream-sidebar-muted-text', 'border', ['sidebar']),
  sidebarHeaderText: colorToken('侧边栏头部文字', 'sidebar', '--dream-sidebar-header-text', 'ink', ['sidebar-header']),
  sidebarCodexText: colorToken('Codex 文字', 'sidebar', '--dream-sidebar-codex-text', 'ink', ['sidebar-codex']),
  sidebarArrow: colorToken('Codex 箭头', 'sidebar', '--dream-sidebar-arrow', 'accent', ['sidebar-arrow']),
  sidebarModeIcon: colorToken('模式图标', 'sidebar', '--dream-sidebar-mode-icon', 'pink', ['icon-sidebar-mode']),
  sidebarSearchIcon: colorToken('搜索图标', 'sidebar', '--dream-sidebar-search-icon', 'ink', ['sidebar-search']),
  sidebarNavText: colorToken('导航文字', 'sidebar', '--dream-sidebar-nav-text', 'ink', ['sidebar-nav']),
  sidebarNavHoverText: colorToken('导航悬停文字', 'sidebar', '--dream-sidebar-nav-hover-text', 'accent', ['sidebar-nav'], 'hover'),
  sidebarNavSelectedText: colorToken('导航选中文字', 'sidebar', '--dream-sidebar-nav-selected-text', 'accent', ['sidebar-nav'], 'selected'),
  sidebarProjectText: colorToken('项目行文字', 'sidebar', '--dream-sidebar-project-text', 'ink', ['sidebar-project']),
  sidebarProjectHoverText: colorToken('项目行悬停文字', 'sidebar', '--dream-sidebar-project-hover-text', 'accent', ['sidebar-project'], 'hover'),
  sidebarProjectSelectedText: colorToken('项目行选中文字', 'sidebar', '--dream-sidebar-project-selected-text', 'accent', ['sidebar-project'], 'selected', false),
  sidebarTaskText: colorToken('任务行文字', 'sidebar', '--dream-sidebar-task-text', 'ink', ['sidebar-task']),
  sidebarTaskSelectedText: colorToken('任务行选中文字', 'sidebar', '--dream-sidebar-task-selected-text', 'accent', ['sidebar-task'], 'selected'),
  sidebarFooterText: colorToken('侧边栏页脚文字', 'sidebar', '--dream-sidebar-footer-text', 'ink', ['sidebar-footer']),
  sidebarAvatarText: colorToken('头像文字', 'sidebar', '--dream-sidebar-avatar-text', 'surface', ['sidebar-avatar']),
  brandBorder: colorToken('品牌栏边框', 'brand', '--dream-brand-border', 'border', ['brand']),
  brandIcon: colorToken('品牌图标', 'brand', '--dream-brand-icon', 'pink', ['icon-branding']),
  brandTitle: colorToken('品牌标题', 'brand', '--dream-brand-title', 'ink', ['copy-brand-title']),
  brandSubtitle: colorToken('品牌副标题', 'brand', '--dream-brand-subtitle', 'border', ['copy-brand-subtitle']),
  brandSignature: colorToken('品牌签名', 'brand', '--dream-brand-signature', 'pink', ['copy-brand-signature']),
  homeHeading: colorToken('首页标题', 'home', '--dream-home-heading', 'ink', ['copy-heading']),
  homeHeadingDecoration: colorToken('首页标题装饰', 'home', '--dream-home-heading-decoration', 'pink', ['home-heading-decoration']),
  homeSubtitle: colorToken('首页副标题', 'home', '--dream-home-subtitle', 'ink', ['copy-subtitle']),
  projectSelectorText: colorToken('项目选择器文字', 'home', '--dream-project-selector-text', 'ink', ['project-selector']),
  projectSelectorBorder: colorToken('项目选择器边框', 'home', '--dream-project-selector-border', 'border', ['project-selector']),
  actionCardText: colorToken('操作卡片文字', 'cards', '--dream-action-card-text', 'ink', ['action-card']),
  actionCardMutedText: colorToken('操作卡片弱化文字', 'cards', '--dream-action-card-muted-text', 'border', ['action-card']),
  actionCardBorder: colorToken('操作卡片边框', 'cards', '--dream-action-card-border', 'border', ['action-card']),
  actionCardIcon: colorToken('卡片图标', 'cards', '--dream-action-card-icon', 'accent', ['icon-card-primary', 'icon-card-secondary']),
  actionCardDecoration: colorToken('卡片装饰', 'cards', '--dream-action-card-decoration', 'pink', ['icon-decoration']),
  projectBarText: colorToken('项目栏文字', 'projects', '--dream-project-bar-text', 'ink', ['project-bar']),
  projectChipText: colorToken('项目标签文字', 'projects', '--dream-project-chip-text', 'accent', ['project-chip']),
  projectChipBorder: colorToken('项目标签边框', 'projects', '--dream-project-chip-border', 'border', ['project-chip']),
  composerBorder: colorToken('输入框边框', 'composer', '--dream-composer-border', 'border', ['composer']),
  composerText: colorToken('输入框文字', 'composer', '--dream-composer-text', 'ink', ['composer-text']),
  composerPlaceholder: colorToken('占位文案', 'composer', '--dream-composer-placeholder', 'border', ['composer-placeholder']),
  composerToolIcon: colorToken('工具按钮图标', 'composer', '--dream-composer-tool-icon', 'ink', ['composer-tool']),
  composerPermissionText: colorToken('权限提示', 'composer', '--dream-composer-permission-text', 'border', ['composer-permission']),
  composerModelText: colorToken('模型文字', 'composer', '--dream-composer-model-text', 'ink', ['composer-model']),
  composerSendIcon: colorToken('发送按钮图标', 'composer', '--dream-composer-send-icon', 'surface', ['icon-composer']),
  composerBadgeIcon: colorToken('输入框装饰图标', 'composer', '--dream-composer-badge-icon', 'surface', ['icon-composer-badge']),
  wave: colorToken('波形', 'decoration', '--dream-wave', 'accent', ['wave']),
  sparkle: colorToken('闪光', 'decoration', '--dream-sparkle', 'pink', ['icon-decoration']),
  polaroidPin: colorToken('拍立得图钉', 'decoration', '--dream-polaroid-pin', 'pink', ['icon-polaroid-pin'])
} as const satisfies Record<string, AppearanceTokenDefinition>

export type AppearanceColorToken = keyof typeof APPEARANCE_COLOR_TOKENS

export interface ThemePaintStop {
  color: string
  position: number
}

export type ThemePaint =
  | { kind: 'solid'; color: string }
  | { kind: 'linear'; angle: number; stops: ThemePaintStop[] }
  | { kind: 'radial'; center: { x: number; y: number }; stops: ThemePaintStop[] }

const paintStopSchema = z.object({
  color: cssColorSchema,
  position: z.number().finite().min(0).max(1)
}).strict()

const gradientStopsSchema = z.array(paintStopSchema).min(2).max(8).superRefine((stops, context) => {
  for (let index = 1; index < stops.length; index += 1) {
    if (stops[index]!.position < stops[index - 1]!.position) {
      context.addIssue({ code: 'custom', path: [index, 'position'], message: 'Gradient stops must be ordered.' })
    }
  }
})

export const themePaintSchema: z.ZodType<ThemePaint> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('solid'), color: cssColorSchema }).strict(),
  z.object({ kind: z.literal('linear'), angle: z.number().finite().min(0).max(360), stops: gradientStopsSchema }).strict(),
  z.object({ kind: z.literal('radial'), center: z.object({ x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1) }).strict(), stops: gradientStopsSchema }).strict()
])

export function paintToCss(paint: ThemePaint): string {
  if (paint.kind === 'solid') return paint.color
  const stops = paint.stops.map((stop) => `${stop.color} ${formatNumber(stop.position * 100)}%`).join(', ')
  if (paint.kind === 'linear') return `linear-gradient(${formatNumber(paint.angle)}deg, ${stops})`
  return `radial-gradient(circle at ${formatNumber(paint.center.x * 100)}% ${formatNumber(paint.center.y * 100)}%, ${stops})`
}

const paintToken = (
  label: string,
  group: AppearanceGroup,
  cssVariable: `--dream-${string}`,
  fallback: LegacyColorKey,
  targets: readonly string[],
  state?: AppearanceState,
  editable = true
): AppearanceTokenDefinition => ({ label, group, cssVariable, fallback, targets, state, editable })

export const APPEARANCE_PAINT_TOKENS = {
  canvas: paintToken('全局画布', 'global', '--dream-canvas', 'surface', ['canvas']),
  mainSurface: paintToken('主区域', 'global', '--dream-main-surface', 'surface', ['main-surface']),
  conversationMessage: paintToken('会话消息', 'conversation', '--dream-conversation-message', 'surface', ['conversation-message']),
  conversationMessageHover: paintToken('会话消息悬停', 'conversation', '--dream-conversation-message-hover', 'lavender', ['conversation-message'], 'hover'),
  primaryButton: paintToken('主要按钮', 'conversation', '--dream-primary-button', 'accent', ['primary-button']),
  primaryButtonHover: paintToken('主要按钮悬停', 'conversation', '--dream-primary-button-hover', 'pink', ['primary-button'], 'hover'),
  primaryButtonSelected: paintToken('主要按钮选中', 'conversation', '--dream-primary-button-selected', 'lavender', ['primary-button'], 'selected'),
  sidebarSurface: paintToken('侧边栏表面', 'sidebar', '--dream-sidebar-surface', 'surface', ['sidebar']),
  sidebarHeader: paintToken('侧边栏头部', 'sidebar', '--dream-sidebar-header', 'surface', ['sidebar-header']),
  sidebarModeBadge: paintToken('模式图标底色', 'sidebar', '--dream-sidebar-mode-badge', 'lavender', ['icon-sidebar-mode']),
  sidebarSearchButton: paintToken('搜索按钮', 'sidebar', '--dream-sidebar-search-button', 'surface', ['sidebar-search']),
  sidebarSearchButtonHover: paintToken('搜索按钮悬停', 'sidebar', '--dream-sidebar-search-button-hover', 'lavender', ['sidebar-search'], 'hover'),
  sidebarNavItem: paintToken('导航项', 'sidebar', '--dream-sidebar-nav-item', 'surface', ['sidebar-nav']),
  sidebarNavItemHover: paintToken('导航项悬停', 'sidebar', '--dream-sidebar-nav-item-hover', 'lavender', ['sidebar-nav'], 'hover'),
  sidebarNavItemSelected: paintToken('导航项选中', 'sidebar', '--dream-sidebar-nav-item-selected', 'pink', ['sidebar-nav'], 'selected'),
  sidebarProjectRow: paintToken('项目行', 'sidebar', '--dream-sidebar-project-row', 'surface', ['sidebar-project']),
  sidebarProjectRowHover: paintToken('项目行悬停', 'sidebar', '--dream-sidebar-project-row-hover', 'lavender', ['sidebar-project'], 'hover'),
  sidebarProjectRowSelected: paintToken('项目行选中', 'sidebar', '--dream-sidebar-project-row-selected', 'pink', ['sidebar-project'], 'selected', false),
  sidebarTaskRow: paintToken('任务行', 'sidebar', '--dream-sidebar-task-row', 'surface', ['sidebar-task']),
  sidebarTaskRowHover: paintToken('任务行悬停', 'sidebar', '--dream-sidebar-task-row-hover', 'lavender', ['sidebar-task'], 'hover'),
  sidebarTaskRowSelected: paintToken('任务行选中', 'sidebar', '--dream-sidebar-task-row-selected', 'pink', ['sidebar-task'], 'selected'),
  sidebarFooter: paintToken('侧边栏页脚', 'sidebar', '--dream-sidebar-footer', 'surface', ['sidebar-footer']),
  sidebarAvatar: paintToken('头像', 'sidebar', '--dream-sidebar-avatar', 'accent', ['sidebar-avatar']),
  brandSurface: paintToken('品牌栏背景', 'brand', '--dream-brand-surface', 'surface', ['brand']),
  homeHeadingBackdrop: paintToken('首页标题背景', 'home', '--dream-home-heading-backdrop', 'surface', ['copy-heading']),
  projectSelector: paintToken('项目选择器', 'home', '--dream-project-selector', 'surface', ['project-selector']),
  projectSelectorHover: paintToken('项目选择器悬停', 'home', '--dream-project-selector-hover', 'lavender', ['project-selector'], 'hover'),
  projectSelectorSelected: paintToken('项目选择器选中', 'home', '--dream-project-selector-selected', 'pink', ['project-selector'], 'selected'),
  actionCard: paintToken('操作卡片', 'cards', '--dream-action-card', 'surface', ['action-card']),
  actionCardHover: paintToken('操作卡片悬停', 'cards', '--dream-action-card-hover', 'lavender', ['action-card'], 'hover'),
  actionCardSelected: paintToken('操作卡片选中', 'cards', '--dream-action-card-selected', 'pink', ['action-card'], 'selected'),
  actionCardIconBadge: paintToken('卡片图标底色', 'cards', '--dream-action-card-icon-badge', 'lavender', ['icon-card-primary', 'icon-card-secondary']),
  projectBar: paintToken('项目栏', 'projects', '--dream-project-bar', 'surface', ['project-bar']),
  projectChip: paintToken('项目标签', 'projects', '--dream-project-chip', 'surface', ['project-chip']),
  projectChipHover: paintToken('项目标签悬停', 'projects', '--dream-project-chip-hover', 'lavender', ['project-chip'], 'hover'),
  projectChipSelected: paintToken('项目标签选中', 'projects', '--dream-project-chip-selected', 'pink', ['project-chip'], 'selected'),
  composer: paintToken('输入框背景', 'composer', '--dream-composer', 'surface', ['composer']),
  composerToolButton: paintToken('工具按钮', 'composer', '--dream-composer-tool-button', 'surface', ['composer-tool']),
  composerToolButtonHover: paintToken('工具按钮悬停', 'composer', '--dream-composer-tool-button-hover', 'lavender', ['composer-tool'], 'hover'),
  composerToolButtonSelected: paintToken('工具按钮选中', 'composer', '--dream-composer-tool-button-selected', 'pink', ['composer-tool'], 'selected'),
  composerSendButton: paintToken('发送按钮', 'composer', '--dream-composer-send-button', 'accent', ['icon-composer']),
  composerSendButtonHover: paintToken('发送按钮悬停', 'composer', '--dream-composer-send-button-hover', 'pink', ['icon-composer'], 'hover'),
  composerSendButtonSelected: paintToken('发送按钮选中', 'composer', '--dream-composer-send-button-selected', 'lavender', ['icon-composer'], 'selected'),
  composerBadgeBackground: paintToken('输入框装饰底色', 'composer', '--dream-composer-badge-background', 'accent', ['icon-composer-badge'])
} as const satisfies Record<string, AppearanceTokenDefinition>

export type AppearancePaintToken = keyof typeof APPEARANCE_PAINT_TOKENS

export interface ThemeAppearance {
  colors: Partial<Record<AppearanceColorToken, string>>
  paints: Partial<Record<AppearancePaintToken, ThemePaint>>
}

const colorTokenNames = Object.keys(APPEARANCE_COLOR_TOKENS) as [AppearanceColorToken, ...AppearanceColorToken[]]
const paintTokenNames = Object.keys(APPEARANCE_PAINT_TOKENS) as [AppearancePaintToken, ...AppearancePaintToken[]]

export const themeAppearanceSchema: z.ZodType<ThemeAppearance> = z.object({
  colors: z.partialRecord(z.enum(colorTokenNames), cssColorSchema),
  paints: z.partialRecord(z.enum(paintTokenNames), themePaintSchema)
}).strict()

export function createEmptyAppearance(): ThemeAppearance {
  return { colors: {}, paints: {} }
}

export function resolveAppearanceColor(appearance: ThemeAppearance, colors: LegacyThemeColors, token: AppearanceColorToken): string {
  return appearance.colors[token] ?? colors[APPEARANCE_COLOR_TOKENS[token].fallback]
}

export function resolveAppearancePaint(appearance: ThemeAppearance, colors: LegacyThemeColors, token: AppearancePaintToken): ThemePaint {
  return appearance.paints[token] ?? resolveDefaultAppearancePaint(colors, token)
}

const toRgb = converter('rgb')

export function resolveDefaultAppearancePaint(colors: LegacyThemeColors, token: AppearancePaintToken): ThemePaint {
  const tint = (color: string, amount: number): string => mixCssColors(colors.surface, color, amount)
  const blend = (from: string, to: string, amount: number): string => mixCssColors(from, to, amount)
  const linear = (angle: number, stops: Array<[string, number]>): ThemePaint => ({
    kind: 'linear',
    angle,
    stops: stops.map(([color, position]) => ({ color, position }))
  })

  switch (token) {
    case 'canvas':
      return linear(135, [[colors.surface, 0], [tint(colors.lavender, 0.1), 0.52], [tint(colors.pink, 0.08), 1]])
    case 'mainSurface':
      return linear(180, [[tint(colors.accent, 0.03), 0], [colors.surface, 0.48], [tint(colors.pink, 0.06), 1]])
    case 'conversationMessage':
      return linear(145, [[colors.surface, 0], [tint(colors.lavender, 0.06), 0.54], [tint(colors.pink, 0.05), 1]])
    case 'conversationMessageHover':
      return linear(135, [[tint(colors.accent, 0.1), 0], [tint(colors.lavender, 0.16), 0.55], [tint(colors.pink, 0.12), 1]])
    case 'primaryButton':
      return linear(145, [[colors.accent, 0], [blend(colors.accent, colors.lavender, 0.45), 0.55], [colors.lavender, 1]])
    case 'primaryButtonHover':
      return linear(145, [[colors.accent, 0], [colors.lavender, 0.52], [colors.pink, 1]])
    case 'primaryButtonSelected':
      return linear(145, [[colors.lavender, 0], [blend(colors.lavender, colors.pink, 0.55), 0.56], [colors.pink, 1]])
    case 'sidebarSurface':
      return linear(180, [[colors.surface, 0], [tint(colors.accent, 0.08), 0.58], [tint(colors.lavender, 0.1), 1]])
    case 'sidebarHeader':
    case 'sidebarModeBadge':
    case 'sidebarSearchButton':
    case 'sidebarNavItem':
    case 'sidebarProjectRow':
    case 'sidebarTaskRow':
    case 'sidebarFooter':
    case 'composerToolButton':
      return { kind: 'solid', color: 'transparent' }
    case 'sidebarSearchButtonHover':
    case 'sidebarNavItemHover':
    case 'sidebarProjectRowHover':
    case 'sidebarTaskRowHover':
    case 'composerToolButtonHover':
      return linear(90, [[tint(colors.accent, 0.24), 0], [tint(colors.pink, 0.18), 1]])
    case 'sidebarNavItemSelected':
    case 'sidebarProjectRowSelected':
    case 'sidebarTaskRowSelected':
    case 'composerToolButtonSelected':
      return linear(90, [[tint(colors.accent, 0.27), 0], [tint(colors.pink, 0.2), 1]])
    case 'sidebarAvatar':
      return linear(145, [[tint(colors.lavender, 0.13), 0], [tint(colors.pink, 0.1), 1]])
    case 'brandSurface':
      return linear(90, [[colors.surface, 0], [tint(colors.accent, 0.12), 0.5], [tint(colors.pink, 0.14), 1]])
    case 'homeHeadingBackdrop':
      return { kind: 'solid', color: tint(colors.accent, 0.1) }
    case 'projectSelector':
      return linear(135, [[colors.surface, 0], [tint(colors.accent, 0.12), 1]])
    case 'projectSelectorHover':
      return linear(90, [[tint(colors.accent, 0.18), 0], [tint(colors.pink, 0.12), 1]])
    case 'projectSelectorSelected':
      return linear(90, [[tint(colors.accent, 0.24), 0], [tint(colors.pink, 0.18), 1]])
    case 'actionCard':
      return linear(145, [[colors.surface, 0], [tint(colors.lavender, 0.06), 0.54], [tint(colors.pink, 0.08), 1]])
    case 'actionCardHover':
      return linear(145, [[tint(colors.accent, 0.12), 0], [tint(colors.lavender, 0.14), 0.55], [tint(colors.pink, 0.14), 1]])
    case 'actionCardSelected':
      return linear(145, [[tint(colors.accent, 0.18), 0], [tint(colors.pink, 0.2), 1]])
    case 'actionCardIconBadge':
      return linear(145, [[colors.accent, 0], [colors.lavender, 0.58], [colors.pink, 1]])
    case 'projectBar':
      return linear(180, [[colors.surface, 0], [tint(colors.pink, 0.12), 1]])
    case 'projectChip':
      return linear(135, [[colors.surface, 0], [tint(colors.accent, 0.12), 1]])
    case 'projectChipHover':
      return linear(90, [[tint(colors.accent, 0.18), 0], [tint(colors.pink, 0.12), 1]])
    case 'projectChipSelected':
      return linear(90, [[tint(colors.accent, 0.24), 0], [tint(colors.pink, 0.18), 1]])
    case 'composer':
      return linear(145, [[colors.surface, 0], [tint(colors.lavender, 0.05), 0.52], [tint(colors.pink, 0.08), 1]])
    case 'composerSendButton':
      return linear(145, [[colors.accent, 0], [colors.pink, 1]])
    case 'composerSendButtonHover':
      return linear(145, [[colors.accent, 0], [colors.lavender, 0.52], [colors.pink, 1]])
    case 'composerSendButtonSelected':
      return linear(145, [[colors.lavender, 0], [colors.pink, 1]])
    case 'composerBadgeBackground':
      return linear(145, [[colors.accent, 0], [colors.pink, 1]])
    default: {
      const exhaustiveToken: never = token
      return exhaustiveToken
    }
  }
}

function mixCssColors(from: string, to: string, amount: number): string {
  const parsedFrom = parse(from)
  const parsedTo = parse(to)
  if (!parsedFrom || !parsedTo) return from
  const fromRgb = toRgb(parsedFrom)
  const toRgbColor = toRgb(parsedTo)
  if (!fromRgb || !toRgbColor ||
    typeof fromRgb.r !== 'number' || typeof fromRgb.g !== 'number' || typeof fromRgb.b !== 'number' ||
    typeof toRgbColor.r !== 'number' || typeof toRgbColor.g !== 'number' || typeof toRgbColor.b !== 'number') return from
  return formatRgb({
    mode: 'rgb',
    r: fromRgb.r + (toRgbColor.r - fromRgb.r) * amount,
    g: fromRgb.g + (toRgbColor.g - fromRgb.g) * amount,
    b: fromRgb.b + (toRgbColor.b - fromRgb.b) * amount,
    alpha: (fromRgb.alpha ?? 1) + ((toRgbColor.alpha ?? 1) - (fromRgb.alpha ?? 1)) * amount
  }) ?? from
}

function formatNumber(value: number): string {
  return Number(value.toFixed(3)).toString()
}
