import type { AppearanceColorToken, AppearanceGroup, AppearancePaintToken } from '../../shared/appearance'
import type { IconSlot, ThemeProfile } from '../../shared/theme'

export type InspectorTab = 'visual' | 'icons'
export type PreviewCopyField = keyof ThemeProfile['copy']
export type TypographySlot = keyof ThemeProfile['typography']['slots']
export type PreviewVisibilityField = 'composerBadge'
export type PreviewDecorationEditor = 'sparkles' | 'homeHeading' | 'composerMelody'

export interface PreviewStyleEditor {
  kind: 'style'
  colors: readonly AppearanceColorToken[]
  paints: readonly AppearancePaintToken[]
  copyField?: PreviewCopyField
  iconSlot?: IconSlot
  fontSlot?: TypographySlot
  visibility?: PreviewVisibilityField
  decoration?: PreviewDecorationEditor
}

export type PreviewEditor =
  | PreviewStyleEditor
  | { kind: 'hero' }
  | { kind: 'polaroid' }
  | { kind: 'conversationBackground' }

export interface PreviewTargetDefinition {
  label: string
  inspector: InspectorTab
  inspectorAnchor: string
  editor: PreviewEditor
}

interface StyleTargetOptions {
  colors?: readonly AppearanceColorToken[]
  paints?: readonly AppearancePaintToken[]
  copyField?: PreviewCopyField
  iconSlot?: IconSlot
  fontSlot?: TypographySlot
  visibility?: PreviewVisibilityField
  decoration?: PreviewDecorationEditor
  inspectorAnchor?: string
}

const styleTarget = (label: string, group: AppearanceGroup, options: StyleTargetOptions): PreviewTargetDefinition => ({
  label,
  inspector: 'visual',
  inspectorAnchor: options.inspectorAnchor ?? `appearance-${group}`,
  editor: { kind: 'style', colors: options.colors ?? [], paints: options.paints ?? [], copyField: options.copyField, iconSlot: options.iconSlot, fontSlot: options.fontSlot, visibility: options.visibility, decoration: options.decoration }
})

export const PREVIEW_TARGETS = {
  'surface-canvas': styleTarget('全局画布', 'global', { colors: ['globalText', 'globalMutedText', 'globalLink', 'globalCaret', 'globalScrollbar', 'globalBorder'], paints: ['canvas'], fontSlot: 'ui' }),
  'surface-main': styleTarget('主区域', 'global', { colors: ['globalText', 'globalBorder'], paints: ['mainSurface'], fontSlot: 'ui' }),
  'conversation-message': styleTarget('会话消息', 'conversation', { colors: ['conversationText', 'conversationLink'], paints: ['conversationMessage', 'conversationMessageHover'], fontSlot: 'ui' }),
  'primary-button': styleTarget('主要按钮', 'conversation', { colors: ['primaryButtonText'], paints: ['primaryButton', 'primaryButtonHover', 'primaryButtonSelected'], fontSlot: 'ui' }),
  'conversation-background': { label: '对话区域背景', inspector: 'visual', inspectorAnchor: 'visual-conversation-background', editor: { kind: 'conversationBackground' } },

  'palette-sidebar': styleTarget('侧边栏', 'sidebar', { colors: ['sidebarBorder', 'sidebarText', 'sidebarMutedText'], paints: ['sidebarSurface'], fontSlot: 'ui' }),
  'sidebar-header': styleTarget('侧边栏头部', 'sidebar', { colors: ['sidebarHeaderText'], paints: ['sidebarHeader'], fontSlot: 'ui' }),
  'sidebar-codex': styleTarget('Codex 标题', 'sidebar', { colors: ['sidebarCodexText'], copyField: 'sidebarModeTitle', fontSlot: 'ui', inspectorAnchor: 'visual-sidebar-copy' }),
  'sidebar-project-title': styleTarget('项目标题', 'sidebar', { copyField: 'sidebarProjectsTitle', colors: ['sidebarHeaderText'], fontSlot: 'ui', inspectorAnchor: 'visual-sidebar-copy' }),
  'sidebar-task-title': styleTarget('任务标题', 'sidebar', { copyField: 'sidebarTasksTitle', colors: ['sidebarHeaderText'], fontSlot: 'ui', inspectorAnchor: 'visual-sidebar-copy' }),
  'sidebar-arrow': styleTarget('Codex 箭头', 'sidebar', { colors: ['sidebarArrow'] }),
  'sidebar-search': styleTarget('搜索按钮', 'sidebar', { colors: ['sidebarSearchIcon'], paints: ['sidebarSearchButton', 'sidebarSearchButtonHover'] }),
  'sidebar-nav': styleTarget('导航项', 'sidebar', { colors: ['sidebarNavText', 'sidebarNavHoverText', 'sidebarNavSelectedText'], paints: ['sidebarNavItem', 'sidebarNavItemHover', 'sidebarNavItemSelected'], fontSlot: 'ui' }),
  'sidebar-nav-new-task': styleTarget('新建任务导航项', 'sidebar', { copyField: 'sidebarNavNewTask', iconSlot: 'sidebarNavNewTask', fontSlot: 'sidebarNavNewTask', colors: ['sidebarNavNewTaskText', 'sidebarNavNewTaskHoverText', 'sidebarNavNewTaskSelectedText'], paints: ['sidebarNavItem', 'sidebarNavItemHover', 'sidebarNavItemSelected'], inspectorAnchor: 'visual-sidebar-copy' }),
  'sidebar-nav-pull-requests': styleTarget('拉取请求导航项', 'sidebar', { copyField: 'sidebarNavPullRequests', iconSlot: 'sidebarNavPullRequests', fontSlot: 'sidebarNavPullRequests', colors: ['sidebarNavPullRequestsText', 'sidebarNavPullRequestsHoverText', 'sidebarNavPullRequestsSelectedText'], paints: ['sidebarNavItem', 'sidebarNavItemHover', 'sidebarNavItemSelected'], inspectorAnchor: 'visual-sidebar-copy' }),
  'sidebar-nav-sites': styleTarget('站点导航项', 'sidebar', { copyField: 'sidebarNavSites', iconSlot: 'sidebarNavSites', fontSlot: 'sidebarNavSites', colors: ['sidebarNavSitesText', 'sidebarNavSitesHoverText', 'sidebarNavSitesSelectedText'], paints: ['sidebarNavItem', 'sidebarNavItemHover', 'sidebarNavItemSelected'], inspectorAnchor: 'visual-sidebar-copy' }),
  'sidebar-nav-scheduled': styleTarget('已安排导航项', 'sidebar', { copyField: 'sidebarNavScheduled', iconSlot: 'sidebarNavScheduled', fontSlot: 'sidebarNavScheduled', colors: ['sidebarNavScheduledText', 'sidebarNavScheduledHoverText', 'sidebarNavScheduledSelectedText'], paints: ['sidebarNavItem', 'sidebarNavItemHover', 'sidebarNavItemSelected'], inspectorAnchor: 'visual-sidebar-copy' }),
  'sidebar-nav-plugins': styleTarget('插件导航项', 'sidebar', { copyField: 'sidebarNavPlugins', iconSlot: 'sidebarNavPlugins', fontSlot: 'sidebarNavPlugins', colors: ['sidebarNavPluginsText', 'sidebarNavPluginsHoverText', 'sidebarNavPluginsSelectedText'], paints: ['sidebarNavItem', 'sidebarNavItemHover', 'sidebarNavItemSelected'], inspectorAnchor: 'visual-sidebar-copy' }),
  'sidebar-project': styleTarget('项目行', 'sidebar', { colors: ['sidebarProjectText', 'sidebarProjectHoverText'], paints: ['sidebarProjectRow', 'sidebarProjectRowHover'], fontSlot: 'ui' }),
  'sidebar-task': styleTarget('任务行', 'sidebar', { colors: ['sidebarTaskText', 'sidebarTaskSelectedText'], paints: ['sidebarTaskRow', 'sidebarTaskRowHover', 'sidebarTaskRowSelected'], fontSlot: 'ui' }),
  'sidebar-footer': styleTarget('侧边栏页脚', 'sidebar', { colors: ['sidebarFooterText'], paints: ['sidebarFooter'], fontSlot: 'ui' }),
  'sidebar-avatar': styleTarget('头像', 'sidebar', { colors: ['sidebarAvatarText'], paints: ['sidebarAvatar'], fontSlot: 'ui' }),
  'icon-sidebar-mode': styleTarget('侧边栏模式图标', 'sidebar', { colors: ['sidebarModeIcon'], paints: ['sidebarModeBadge'], iconSlot: 'sidebarMode' }),

  'palette-brand': styleTarget('品牌栏', 'brand', { colors: ['brandBorder'], paints: ['brandSurface'] }),
  'copy-brand-title': styleTarget('品牌主标题', 'brand', { colors: ['brandTitle'], copyField: 'brandTitle', fontSlot: 'brandTitle' }),
  'copy-brand-subtitle': styleTarget('品牌副标题', 'brand', { colors: ['brandSubtitle'], copyField: 'brandSubtitle', fontSlot: 'brandSubtitle' }),
  'copy-brand-signature': styleTarget('品牌签名', 'brand', { colors: ['brandSignature'], copyField: 'brandSignature', fontSlot: 'brandSignature' }),
  'icon-branding': styleTarget('品牌图标', 'brand', { colors: ['brandIcon'], iconSlot: 'branding' }),

  'copy-heading': styleTarget('首页标题', 'home', { colors: ['homeHeading'], paints: ['homeHeadingBackdrop'], copyField: 'headingTemplate', fontSlot: 'homeHeading' }),
  'home-heading-decoration': styleTarget('首页标题装饰', 'home', { colors: ['homeHeadingDecoration'], fontSlot: 'homeHeadingDecoration', decoration: 'homeHeading', inspectorAnchor: 'visual-home-heading-decoration' }),
  'copy-subtitle': styleTarget('副标题', 'home', { colors: ['homeSubtitle'], copyField: 'subtitle', fontSlot: 'homeSubtitle' }),
  'project-selector': styleTarget('项目选择器', 'home', { colors: ['projectSelectorText', 'projectSelectorBorder'], paints: ['projectSelector', 'projectSelectorHover', 'projectSelectorSelected'], fontSlot: 'ui' }),
  hero: { label: '主视觉', inspector: 'visual', inspectorAnchor: 'visual-hero', editor: { kind: 'hero' } },

  'palette-action-card': styleTarget('操作卡片', 'cards', { colors: ['actionCardText', 'actionCardMutedText', 'actionCardBorder'], paints: ['actionCard', 'actionCardHover', 'actionCardSelected'], fontSlot: 'ui' }),
  'action-card-text': styleTarget('操作卡片文字', 'cards', { colors: ['actionCardText', 'actionCardMutedText'], fontSlot: 'ui' }),
  'icon-card-primary': styleTarget('主卡片图标', 'cards', { colors: ['actionCardIcon'], paints: ['actionCardIconBadge'], iconSlot: 'cardPrimary' }),
  'icon-card-secondary': styleTarget('副卡片图标', 'cards', { colors: ['actionCardIcon'], paints: ['actionCardIconBadge'], iconSlot: 'cardSecondary' }),
  'icon-decoration': styleTarget('卡片装饰图标', 'cards', { colors: ['actionCardDecoration'], iconSlot: 'decoration' }),

  'palette-project-bar': styleTarget('项目栏', 'projects', { colors: ['projectBarText'], paints: ['projectBar'], fontSlot: 'ui' }),
  'project-chip': styleTarget('项目标签', 'projects', { colors: ['projectChipText', 'projectChipBorder'], paints: ['projectChip', 'projectChipHover', 'projectChipSelected'], fontSlot: 'ui' }),
  'icon-project': styleTarget('项目图标', 'projects', { colors: ['projectChipText'], iconSlot: 'project' }),
  'icon-project-sidebar': styleTarget('侧边栏项目图标', 'sidebar', { colors: ['sidebarProjectText', 'sidebarProjectHoverText'], iconSlot: 'project' }),

  'palette-composer': styleTarget('输入框', 'composer', { colors: ['composerBorder', 'composerText'], paints: ['composer'], fontSlot: 'ui' }),
  'composer-placeholder': styleTarget('输入框占位文案', 'composer', { colors: ['composerPlaceholder'], fontSlot: 'ui' }),
  'composer-tool': styleTarget('输入框工具按钮', 'composer', { colors: ['composerToolIcon'], paints: ['composerToolButton', 'composerToolButtonHover', 'composerToolButtonSelected'] }),
  'composer-permission': styleTarget('权限提示', 'composer', { colors: ['composerPermissionText'], fontSlot: 'ui' }),
  'composer-model': styleTarget('模型文字', 'composer', { colors: ['composerModelText'], fontSlot: 'ui' }),
  'icon-composer': styleTarget('发送按钮', 'composer', { colors: ['composerSendIcon'], paints: ['composerSendButton', 'composerSendButtonHover', 'composerSendButtonSelected'], iconSlot: 'composer' }),
  'icon-composer-badge': styleTarget('输入框装饰', 'composer', { colors: ['composerBadgeIcon'], paints: ['composerBadgeBackground'], iconSlot: 'composerBadge', visibility: 'composerBadge' }),
  'composer-melody': styleTarget('输入框旋律', 'composer', { colors: ['wave'], fontSlot: 'composerMelody', decoration: 'composerMelody', inspectorAnchor: 'visual-composer-melody' }),

  sparkles: styleTarget('背景粒子', 'decoration', { colors: ['sparkle'], iconSlot: 'backgroundSparkle', decoration: 'sparkles', inspectorAnchor: 'visual-sparkles' }),
  polaroid: { label: '拍立得', inspector: 'visual', inspectorAnchor: 'visual-polaroid', editor: { kind: 'polaroid' } },
  'icon-polaroid-pin': styleTarget('图钉图标', 'decoration', { colors: ['polaroidPin'], iconSlot: 'polaroidPin' })
} as const satisfies Record<string, PreviewTargetDefinition>

export type PreviewTargetId = keyof typeof PREVIEW_TARGETS
export const PREVIEW_TARGET_ATTRIBUTE = 'data-preview-target'

export const ICON_PREVIEW_TARGETS: Record<IconSlot, PreviewTargetId> = {
  sidebarMode: 'icon-sidebar-mode',
  branding: 'icon-branding',
  cardPrimary: 'icon-card-primary',
  cardSecondary: 'icon-card-secondary',
  composer: 'icon-composer',
  composerBadge: 'icon-composer-badge',
  backgroundSparkle: 'sparkles',
  backgroundFloat: 'sparkles',
  backgroundRain: 'sparkles',
  backgroundMeteor: 'sparkles',
  backgroundSnow: 'sparkles',
  project: 'icon-project',
  decoration: 'icon-decoration',
  polaroidPin: 'icon-polaroid-pin',
  sidebarNavNewTask: 'sidebar-nav-new-task',
  sidebarNavPullRequests: 'sidebar-nav-pull-requests',
  sidebarNavSites: 'sidebar-nav-sites',
  sidebarNavScheduled: 'sidebar-nav-scheduled',
  sidebarNavPlugins: 'sidebar-nav-plugins'
}

export function isPreviewTargetId(value: string | undefined): value is PreviewTargetId {
  return Boolean(value && Object.prototype.hasOwnProperty.call(PREVIEW_TARGETS, value))
}

export interface PreviewTargetMatch { id: PreviewTargetId; anchor: HTMLElement }

export function findPreviewTarget(source: EventTarget | null, root: Element): PreviewTargetMatch | null {
  const candidate = source as Element | null
  if (!candidate || typeof candidate.closest !== 'function') return null
  const anchor = candidate.closest<HTMLElement>(`[${PREVIEW_TARGET_ATTRIBUTE}]`)
  if (!anchor || !root.contains(anchor) || !isPreviewTargetId(anchor.dataset.previewTarget)) return null
  return { id: anchor.dataset.previewTarget, anchor }
}

export interface RectLike { left: number; top: number; right: number; bottom: number; width: number; height: number }
export interface SizeLike { width: number; height: number }
export type PopoverPlacement = 'right' | 'left' | 'bottom' | 'top'
export interface PopoverPosition { left: number; top: number; placement: PopoverPlacement }
interface Candidate extends PopoverPosition { overflow: number }

export function placePreviewPopover(anchor: RectLike, container: RectLike, popover: SizeLike, gap = 10, padding = 8): PopoverPosition {
  const anchorLeft = anchor.left - container.left
  const anchorTop = anchor.top - container.top
  const anchorRight = anchor.right - container.left
  const anchorBottom = anchor.bottom - container.top
  const centeredX = anchorLeft + (anchor.width - popover.width) / 2
  const centeredY = anchorTop + (anchor.height - popover.height) / 2
  const candidates: Omit<Candidate, 'overflow'>[] = [
    { placement: 'right', left: anchorRight + gap, top: centeredY },
    { placement: 'left', left: anchorLeft - popover.width - gap, top: centeredY },
    { placement: 'bottom', left: centeredX, top: anchorBottom + gap },
    { placement: 'top', left: centeredX, top: anchorTop - popover.height - gap }
  ]
  const maxLeft = Math.max(padding, container.width - popover.width - padding)
  const maxTop = Math.max(padding, container.height - popover.height - padding)
  const scored = candidates.map((candidate): Candidate => ({
    ...candidate,
    overflow: overflow(candidate.left, padding, maxLeft) + overflow(candidate.top, padding, maxTop)
  }))
  const selected = scored.find((candidate) => candidate.overflow === 0) ?? scored.reduce((best, candidate) => candidate.overflow < best.overflow ? candidate : best)
  return { placement: selected.placement, left: clamp(selected.left, padding, maxLeft), top: clamp(selected.top, padding, maxTop) }
}

function overflow(value: number, min: number, max: number): number { return value < min ? min - value : value > max ? value - max : 0 }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)) }
