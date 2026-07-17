import type { IconSlot, ThemeColors } from '../../shared/theme'

export type InspectorTab = 'visual' | 'icons'
export type PreviewPaletteRegion = 'sidebar' | 'brand' | 'canvas' | 'action-card' | 'project-bar' | 'composer'

export type PreviewEditor =
  | { kind: 'copy'; field: 'headingTemplate' | 'subtitle' }
  | { kind: 'hero' }
  | { kind: 'polaroid' }
  | { kind: 'palette'; region: PreviewPaletteRegion; colors: readonly (keyof ThemeColors)[] }
  | { kind: 'icon'; slot: IconSlot }

export interface PreviewTargetDefinition {
  label: string
  inspector: InspectorTab
  inspectorAnchor: string
  editor: PreviewEditor
}

const paletteTarget = (
  label: string,
  region: PreviewPaletteRegion,
  colors: readonly (keyof ThemeColors)[]
): PreviewTargetDefinition => ({
  label,
  inspector: 'visual',
  inspectorAnchor: 'visual-colors',
  editor: { kind: 'palette', region, colors }
})

const iconTarget = (label: string, slot: IconSlot): PreviewTargetDefinition => ({
  label,
  inspector: 'icons',
  inspectorAnchor: `icon-${slot}`,
  editor: { kind: 'icon', slot }
})

export const PREVIEW_TARGETS = {
  'copy-heading': {
    label: '首页标题',
    inspector: 'visual',
    inspectorAnchor: 'visual-copy',
    editor: { kind: 'copy', field: 'headingTemplate' }
  },
  'copy-subtitle': {
    label: '副标题',
    inspector: 'visual',
    inspectorAnchor: 'visual-copy',
    editor: { kind: 'copy', field: 'subtitle' }
  },
  hero: {
    label: '主视觉',
    inspector: 'visual',
    inspectorAnchor: 'visual-hero',
    editor: { kind: 'hero' }
  },
  polaroid: {
    label: '拍立得',
    inspector: 'visual',
    inspectorAnchor: 'visual-polaroid',
    editor: { kind: 'polaroid' }
  },
  'palette-sidebar': paletteTarget('侧边栏颜色', 'sidebar', ['surface', 'ink', 'accent', 'pink', 'lavender', 'border']),
  'palette-brand': paletteTarget('品牌栏颜色', 'brand', ['surface', 'ink', 'accent', 'pink', 'border']),
  'palette-canvas': paletteTarget('主背景颜色', 'canvas', ['surface', 'ink', 'pink']),
  'palette-action-card': paletteTarget('操作卡片颜色', 'action-card', ['ink', 'accent', 'pink', 'lavender', 'border']),
  'palette-project-bar': paletteTarget('项目栏颜色', 'project-bar', ['ink', 'accent']),
  'palette-composer': paletteTarget('输入框颜色', 'composer', ['ink', 'accent', 'pink']),
  'icon-sidebar-mode': iconTarget('侧边栏模式图标', 'sidebarMode'),
  'icon-branding': iconTarget('品牌图标', 'branding'),
  'icon-card-primary': iconTarget('主卡片图标', 'cardPrimary'),
  'icon-card-secondary': iconTarget('副卡片图标', 'cardSecondary'),
  'icon-composer': iconTarget('输入框图标', 'composer'),
  'icon-project': iconTarget('项目图标', 'project'),
  'icon-decoration': iconTarget('装饰图标', 'decoration'),
  'icon-polaroid-pin': iconTarget('图钉图标', 'polaroidPin')
} as const satisfies Record<string, PreviewTargetDefinition>

export type PreviewTargetId = keyof typeof PREVIEW_TARGETS

export const PREVIEW_TARGET_ATTRIBUTE = 'data-preview-target'

export const ICON_PREVIEW_TARGETS: Record<IconSlot, PreviewTargetId> = {
  sidebarMode: 'icon-sidebar-mode',
  branding: 'icon-branding',
  cardPrimary: 'icon-card-primary',
  cardSecondary: 'icon-card-secondary',
  composer: 'icon-composer',
  project: 'icon-project',
  decoration: 'icon-decoration',
  polaroidPin: 'icon-polaroid-pin'
}

export function isPreviewTargetId(value: string | undefined): value is PreviewTargetId {
  return Boolean(value && Object.prototype.hasOwnProperty.call(PREVIEW_TARGETS, value))
}

export interface PreviewTargetMatch {
  id: PreviewTargetId
  anchor: HTMLElement
}

export function findPreviewTarget(source: EventTarget | null, root: Element): PreviewTargetMatch | null {
  const candidate = source as Element | null
  if (!candidate || typeof candidate.closest !== 'function') return null
  const anchor = candidate.closest<HTMLElement>(`[${PREVIEW_TARGET_ATTRIBUTE}]`)
  if (!anchor || !root.contains(anchor) || !isPreviewTargetId(anchor.dataset.previewTarget)) return null
  return { id: anchor.dataset.previewTarget, anchor }
}

export interface RectLike {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface SizeLike {
  width: number
  height: number
}

export type PopoverPlacement = 'right' | 'left' | 'bottom' | 'top'

export interface PopoverPosition {
  left: number
  top: number
  placement: PopoverPlacement
}

interface Candidate extends PopoverPosition {
  overflow: number
}

export function placePreviewPopover(
  anchor: RectLike,
  container: RectLike,
  popover: SizeLike,
  gap = 10,
  padding = 8
): PopoverPosition {
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
  return {
    placement: selected.placement,
    left: clamp(selected.left, padding, maxLeft),
    top: clamp(selected.top, padding, maxTop)
  }
}

function overflow(value: number, min: number, max: number): number {
  return value < min ? min - value : value > max ? value - max : 0
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
