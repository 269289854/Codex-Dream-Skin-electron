import type { CSSProperties } from 'react'
import type { ThemeProfile } from '../../shared/theme'

export const PREVIEW_HOME_CONTEXT = {
  projectName: 'Codex-Dream-Skin-electron',
  environment: '本地',
  branch: 'Miku',
  model: '5.6 Luna 极高'
} as const

export const PREVIEW_HERO_FALLBACK = 'linear-gradient(135deg, #d9fbfc, #fff4fb 52%, #e7ddff)'

export interface PreviewHeroImageProps {
  src: string
  style: CSSProperties
}

export function buildPreviewHeroImageProps(heroUrl: string | undefined, hero: ThemeProfile['hero']): PreviewHeroImageProps | null {
  if (!heroUrl) return null
  const x = hero.position.x * 100
  const y = hero.position.y * 100
  return {
    src: heroUrl,
    style: {
      width: `${hero.scale * 100}%`,
      left: `${x}%`,
      top: `${y}%`,
      transform: `translate(-${x}%, -${y}%)`
    }
  }
}
