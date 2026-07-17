import { describe, expect, it } from 'vitest'
import type { IconSlot } from '../src/shared/theme'
import {
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
    const slots: IconSlot[] = ['sidebarMode', 'branding', 'cardPrimary', 'cardSecondary', 'composer', 'project', 'decoration', 'polaroidPin']
    const mapped = Object.values(PREVIEW_TARGETS)
      .filter((target) => target.editor.kind === 'icon')
      .map((target) => target.editor.kind === 'icon' ? target.editor.slot : null)

    expect(mapped).toEqual(slots)
    for (const slot of slots) {
      const target = Object.values(PREVIEW_TARGETS).find((candidate) => candidate.editor.kind === 'icon' && candidate.editor.slot === slot)
      expect(target).toMatchObject({ inspector: 'icons', inspectorAnchor: `icon-${slot}` })
    }
  })

  it('only exposes colors that participate in each preview region', () => {
    expect(PREVIEW_TARGETS['palette-sidebar'].editor).toEqual({
      kind: 'palette',
      region: 'sidebar',
      colors: ['surface', 'ink', 'accent', 'pink', 'lavender', 'border']
    })
    expect(PREVIEW_TARGETS['palette-project-bar'].editor).toEqual({ kind: 'palette', region: 'project-bar', colors: ['ink', 'accent'] })
    expect(PREVIEW_TARGETS['palette-composer'].editor).toEqual({ kind: 'palette', region: 'composer', colors: ['ink', 'accent', 'pink'] })
    expect(isPreviewTargetId('palette-composer')).toBe(true)
    expect(isPreviewTargetId('unknown-target')).toBe(false)
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
