import { describe, expect, it } from 'vitest'
import type { IconSlot } from '../src/shared/theme'
import { APPEARANCE_COLOR_TOKENS, APPEARANCE_PAINT_TOKENS } from '../src/shared/appearance'
import { PARTICLE_EFFECT_IDS, particleEffectIconSlot } from '../src/shared/particle-effects'
import {
  ICON_PREVIEW_TARGETS,
  findPreviewTarget,
  isPreviewTargetId,
  placePreviewPopover,
  PREVIEW_TARGETS,
  type RectLike
} from '../src/renderer/src/preview-editing'

const rect = (left: number, top: number, width: number, height: number): RectLike => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height
})

describe('preview editing registry', () => {
  it('maps every theme icon slot to a preview target and inspector anchor', () => {
    const slots: IconSlot[] = ['sidebarMode', 'branding', 'cardPrimary', 'cardSecondary', 'composer', 'composerBadge', 'backgroundSparkle', 'backgroundFloat', 'backgroundRain', 'backgroundMeteor', 'backgroundSnow', 'project', 'decoration', 'polaroidPin']
    const directlyMapped = Object.values(PREVIEW_TARGETS)
      .filter((target) => target.editor.kind === 'style' && target.editor.iconSlot)
      .map((target) => target.editor.kind === 'style' ? target.editor.iconSlot : null)
    const particleSlots: IconSlot[] = PARTICLE_EFFECT_IDS.map(particleEffectIconSlot)

    expect(new Set([...directlyMapped, ...particleSlots])).toEqual(new Set(slots))
    for (const slot of slots) {
      if (particleSlots.includes(slot)) {
        expect(ICON_PREVIEW_TARGETS[slot]).toBe('sparkles')
        expect(PREVIEW_TARGETS.sparkles).toMatchObject({ inspector: 'visual', inspectorAnchor: 'visual-sparkles' })
      } else {
        const target = Object.values(PREVIEW_TARGETS).find((candidate) => candidate.editor.kind === 'style' && candidate.editor.iconSlot === slot)
        expect(target?.editor).toMatchObject({ kind: 'style', iconSlot: slot })
      }
    }
  })

  it('only exposes appearance tokens that participate in each preview region', () => {
    expect(PREVIEW_TARGETS['palette-sidebar'].editor).toEqual({
      kind: 'style',
      colors: ['sidebarBorder', 'sidebarText', 'sidebarMutedText'],
      paints: ['sidebarSurface'],
      copyField: undefined,
      iconSlot: undefined,
      fontSlot: 'ui'
    })
    expect(PREVIEW_TARGETS['palette-project-bar'].editor).toMatchObject({ kind: 'style', colors: ['projectBarText'], paints: ['projectBar'] })
    expect(PREVIEW_TARGETS['palette-composer'].editor).toMatchObject({ kind: 'style', colors: ['composerBorder', 'composerText'], paints: ['composer'] })
    expect(isPreviewTargetId('palette-composer')).toBe(true)
    expect(isPreviewTargetId('unknown-target')).toBe(false)
  })

  it('maps each editable copy target to its independent font slot', () => {
    expect(PREVIEW_TARGETS['copy-heading']).toMatchObject({
      inspectorAnchor: 'appearance-home',
      editor: { kind: 'style', copyField: 'headingTemplate', fontSlot: 'homeHeading' }
    })
    expect(PREVIEW_TARGETS['copy-subtitle']).toMatchObject({
      inspectorAnchor: 'appearance-home',
      editor: { kind: 'style', copyField: 'subtitle', fontSlot: 'homeSubtitle' }
    })
    expect(PREVIEW_TARGETS['copy-brand-title']).toMatchObject({
      inspectorAnchor: 'appearance-brand',
      editor: { kind: 'style', copyField: 'brandTitle', fontSlot: 'brandTitle' }
    })
    expect(PREVIEW_TARGETS['copy-brand-subtitle']).toMatchObject({
      inspectorAnchor: 'appearance-brand',
      editor: { kind: 'style', copyField: 'brandSubtitle', fontSlot: 'brandSubtitle' }
    })
    expect(PREVIEW_TARGETS['copy-brand-signature']).toMatchObject({
      inspectorAnchor: 'appearance-brand',
      editor: { kind: 'style', copyField: 'brandSignature', fontSlot: 'brandSignature' }
    })
  })

  it('maps shared decorations to dedicated full-setting groups', () => {
    expect(PREVIEW_TARGETS.sparkles).toMatchObject({
      inspectorAnchor: 'visual-sparkles',
      editor: { kind: 'style', colors: ['sparkle'], iconSlot: 'backgroundSparkle', decoration: 'sparkles' }
    })
    expect(PREVIEW_TARGETS['composer-melody']).toMatchObject({
      inspectorAnchor: 'visual-composer-melody',
      editor: { kind: 'style', colors: ['wave'], fontSlot: 'composerMelody', decoration: 'composerMelody' }
    })
    expect(PREVIEW_TARGETS['home-heading-decoration']).toMatchObject({
      inspectorAnchor: 'visual-home-heading-decoration',
      editor: { kind: 'style', colors: ['homeHeadingDecoration'], fontSlot: 'homeHeadingDecoration', decoration: 'homeHeading' }
    })
    expect(isPreviewTargetId('background-dust')).toBe(false)
    expect(isPreviewTargetId('wave')).toBe(false)
  })

  it('exposes every appearance token and the global UI font through preview targets', () => {
    const styleEditors = Object.values(PREVIEW_TARGETS).flatMap((target) => target.editor.kind === 'style' ? [target.editor] : [])
    expect(new Set(styleEditors.flatMap((editor) => editor.colors))).toEqual(new Set(Object.keys(APPEARANCE_COLOR_TOKENS).filter((token) => APPEARANCE_COLOR_TOKENS[token as keyof typeof APPEARANCE_COLOR_TOKENS].editable)))
    expect(new Set(styleEditors.flatMap((editor) => editor.paints))).toEqual(new Set(Object.keys(APPEARANCE_PAINT_TOKENS).filter((token) => APPEARANCE_PAINT_TOKENS[token as keyof typeof APPEARANCE_PAINT_TOKENS].editable)))
    for (const target of ['conversation-message', 'primary-button', 'sidebar-nav', 'sidebar-project', 'sidebar-task', 'action-card-text', 'project-chip', 'composer-model'] as const) {
      expect(PREVIEW_TARGETS[target].editor).toMatchObject({ kind: 'style', fontSlot: 'ui' })
    }
    expect(PREVIEW_TARGETS['sidebar-task'].editor).toMatchObject({
      colors: ['sidebarTaskText', 'sidebarTaskSelectedText'],
      paints: ['sidebarTaskRow', 'sidebarTaskRowHover', 'sidebarTaskRowSelected']
    })
    expect(PREVIEW_TARGETS['sidebar-project'].editor).toMatchObject({
      colors: ['sidebarProjectText', 'sidebarProjectHoverText'],
      paints: ['sidebarProjectRow', 'sidebarProjectRowHover']
    })
    expect(PREVIEW_TARGETS['icon-project-sidebar'].editor).toMatchObject({
      colors: ['sidebarProjectText', 'sidebarProjectHoverText']
    })
  })

  it('resolves the most specific nested target inside the preview root', () => {
    const root = {
      contains: () => true
    } as unknown as Element
    const card = { dataset: { previewTarget: 'palette-action-card' } } as unknown as HTMLElement
    const icon = { dataset: { previewTarget: 'icon-card-primary' } } as unknown as HTMLElement
    const iconSource = {
      closest: () => icon
    } as unknown as Element
    const cardSource = {
      closest: () => card
    } as unknown as Element

    expect(findPreviewTarget(iconSource, root)).toEqual({ id: 'icon-card-primary', anchor: icon })
    expect(findPreviewTarget(cardSource, root)).toEqual({ id: 'palette-action-card', anchor: card })
  })
})

describe('preview popover placement', () => {
  const container = rect(100, 50, 800, 600)
  const popover = { width: 220, height: 180 }

  it('prefers the right and then flips to the left', () => {
    expect(placePreviewPopover(rect(250, 200, 100, 60), container, popover)).toEqual({ left: 260, top: 90, placement: 'right' })
    expect(placePreviewPopover(rect(780, 200, 80, 60), container, popover)).toEqual({ left: 450, top: 90, placement: 'left' })
  })

  it('uses the bottom or top when neither side fits', () => {
    const narrowContainer = rect(0, 0, 300, 500)
    expect(placePreviewPopover(rect(120, 80, 60, 40), narrowContainer, popover)).toEqual({ left: 40, top: 130, placement: 'bottom' })
    expect(placePreviewPopover(rect(120, 390, 60, 40), narrowContainer, popover)).toEqual({ left: 40, top: 200, placement: 'top' })
  })

  it('keeps scaled target coordinates and oversized candidates inside the stage', () => {
    expect(placePreviewPopover(rect(140, 75, 64, 41), container, popover)).toEqual({ left: 8, top: 76, placement: 'bottom' })
    expect(placePreviewPopover(rect(110, 55, 10, 10), rect(100, 50, 180, 140), { width: 220, height: 180 })).toMatchObject({ left: 8, top: 8 })
  })
})
