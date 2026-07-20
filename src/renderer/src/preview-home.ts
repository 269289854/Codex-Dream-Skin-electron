import type { CSSProperties } from 'react'
import { mediaFlipCssTransform } from '../../shared/media'
import type { ThemeProfile } from '../../shared/theme'

export const PREVIEW_PROJECT_NAME = 'Miku Studio'

export const PREVIEW_HOME_CONTEXT = {
  projectName: PREVIEW_PROJECT_NAME,
  environment: '本地',
  branch: 'Miku',
  model: '5.6 Luna 极高'
} as const

export interface PreviewSidebarProject {
  readonly name: string
  readonly active?: boolean
  readonly tasks: readonly string[]
  readonly emptyLabel?: string
}

export const PREVIEW_SIDEBAR_PROJECTS: readonly PreviewSidebarProject[] = [
  { name: PREVIEW_PROJECT_NAME, active: true, tasks: ['调整预览侧边栏'] }
]

export const PREVIEW_SIDEBAR_TEAM = { avatar: 'DT', label: 'Demo Team' } as const

export const PREVIEW_HERO_FALLBACK = 'linear-gradient(135deg, #d9fbfc, #fff4fb 52%, #e7ddff)'

export type HeadingDensity = 'normal' | 'compact' | 'condensed'

export function fitPreviewHeadingDensity(root: Element): HeadingDensity | null {
  const region = root.querySelector<HTMLElement>('.dream-heading-region')
  const heading = region?.querySelector<HTMLElement>('.dream-heading')
  const decoration = region?.querySelector<HTMLElement>('.dream-heading-decoration')
  if (!region || !heading || !decoration) {
    region?.removeAttribute('data-dream-heading-density')
    return null
  }
  const actionGrid = region.closest('.dream-layout-root')?.querySelector<HTMLElement>('.dream-action-grid')
  const regionBox = region.getBoundingClientRect()
  const gridBox = actionGrid?.getBoundingClientRect()
  const limit = gridBox && gridBox.top > regionBox.top ? gridBox.top - 10 : regionBox.bottom
  const densities: readonly HeadingDensity[] = ['normal', 'compact', 'condensed']
  let selected: HeadingDensity = 'condensed'
  for (const density of densities) {
    region.dataset.dreamHeadingDensity = density
    const headingBox = heading.getBoundingClientRect()
    const decorationBox = decoration.getBoundingClientRect()
    if (Math.max(headingBox.bottom, decorationBox.bottom) <= limit && heading.scrollHeight <= region.clientHeight) {
      selected = density
      break
    }
  }
  region.dataset.dreamHeadingDensity = selected
  return selected
}

export interface PreviewHeroImageProps {
  src: string
  mediaKey: string
  style: CSSProperties
  mediaStyle: CSSProperties
  kind: 'image' | 'video'
  playback: ThemeProfile['hero']['playback']
}

export function buildPreviewHeroImageProps(heroUrl: string | undefined, hero: ThemeProfile['hero']): PreviewHeroImageProps | null {
  if (!heroUrl) return null
  const x = hero.position.x * 100
  const y = hero.position.y * 100
  const props = {
    src: heroUrl,
    style: {
      width: `${hero.scale * 100}%`,
      left: `${x}%`,
      top: `${y}%`,
      transform: `translate(-${x}%, -${y}%)`
    },
    mediaStyle: { transform: mediaFlipCssTransform(hero.mediaTransform) }
  } as PreviewHeroImageProps
  Object.defineProperties(props, {
    mediaKey: { value: hero.source?.asset ?? '', enumerable: false },
    kind: { value: hero.source?.kind ?? 'image', enumerable: false },
    playback: { value: hero.playback, enumerable: false }
  })
  return props
}
