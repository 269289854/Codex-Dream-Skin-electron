import type { CSSProperties } from 'react'
import type { ThemeProfile } from '../../shared/theme'

export const PREVIEW_HOME_CONTEXT = {
  projectName: 'Codex-Dream-Skin-electron',
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
  { name: 'Codex-Dream-Skin-electron', active: true, tasks: ['调整预览侧边栏'] },
  { name: 'melody-ui-kit', tasks: ['完善主题色变量', '补充组件状态'] },
  { name: 'starlight-notes', tasks: ['优化启动页面布局'] },
  { name: 'pixel-workbench', tasks: ['修复项目筛选状态', '更新示例图标'] },
  { name: 'sample-api-service', tasks: [], emptyLabel: '无任务' },
  { name: 'demo-file-audit', tasks: [], emptyLabel: '无任务' }
]

export const PREVIEW_SIDEBAR_TEAM = { avatar: 'DT', label: 'Demo Team' } as const

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
