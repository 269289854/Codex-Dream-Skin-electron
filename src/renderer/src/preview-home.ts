import type { CSSProperties } from 'react'
import type { AccountMenuItemId } from '../../shared/account-menu'
import type { SupportedLocale } from '../../shared/i18n'
import { mediaFlipCssTransform } from '../../shared/media'
import type { ThemeProfile } from '../../shared/theme'

export const PREVIEW_PROJECT_NAME = 'Miku Studio'

export const PREVIEW_HOME_CONTEXT = {
  projectName: PREVIEW_PROJECT_NAME,
  environment: '本地',
  branch: 'Miku',
  model: '5.6 Luna 极高'
} as const

export const PREVIEW_HOME_CONTEXT_EN = {
  projectName: PREVIEW_PROJECT_NAME,
  environment: 'Local',
  branch: 'Miku',
  model: '5.6 Luna Extra High'
} as const

export const PREVIEW_HOME_CONTEXT_BY_LOCALE = {
  'zh-CN': PREVIEW_HOME_CONTEXT,
  'en-US': PREVIEW_HOME_CONTEXT_EN
} as const satisfies Record<SupportedLocale, typeof PREVIEW_HOME_CONTEXT | typeof PREVIEW_HOME_CONTEXT_EN>

export interface PreviewSidebarProject {
  readonly name: string
  readonly active?: boolean
  readonly tasks: readonly string[]
  readonly emptyLabel?: string
}

export const PREVIEW_SIDEBAR_PROJECTS: readonly PreviewSidebarProject[] = [
  { name: PREVIEW_PROJECT_NAME, active: true, tasks: ['调整预览侧边栏'] }
]

export const PREVIEW_SIDEBAR_PROJECTS_EN: readonly PreviewSidebarProject[] = [
  { name: PREVIEW_PROJECT_NAME, active: true, tasks: ['Refine preview sidebar'] }
]

export const PREVIEW_SIDEBAR_PROJECTS_BY_LOCALE = {
  'zh-CN': PREVIEW_SIDEBAR_PROJECTS,
  'en-US': PREVIEW_SIDEBAR_PROJECTS_EN
} as const satisfies Record<SupportedLocale, readonly PreviewSidebarProject[]>

export const PREVIEW_SIDEBAR_TEAM = { avatar: 'DT', label: 'Demo Team' } as const

export const PREVIEW_ACCOUNT_MENU_LABELS = {
  account: '演示账号',
  team: '演示团队',
  usage: '剩余用量',
  hidePet: '隐藏宠物',
  settings: '设置',
  logout: '退出登录'
} as const satisfies Record<AccountMenuItemId, string>

export const PREVIEW_ACCOUNT_MENU_LABELS_EN = {
  account: 'Demo account',
  team: 'Demo team',
  usage: 'Usage left',
  hidePet: 'Hide pet',
  settings: 'Settings',
  logout: 'Log out'
} as const satisfies Record<AccountMenuItemId, string>

export const PREVIEW_ACCOUNT_MENU_LABELS_BY_LOCALE = {
  'zh-CN': PREVIEW_ACCOUNT_MENU_LABELS,
  'en-US': PREVIEW_ACCOUNT_MENU_LABELS_EN
} as const satisfies Record<SupportedLocale, Record<AccountMenuItemId, string>>

export const PREVIEW_CONTENT_BY_LOCALE = {
  'zh-CN': {
    composerPlaceholder: '随心输入，让灵感与代码一起起飞吧～',
    fullAccess: '完全访问',
    conversationTitle: '完善主题编辑器',
    userLabel: '你',
    userMessage: '让预览里的每个元素都可以直接点击配置。',
    codexMessageBeforeLink: '已建立全界面外观令牌，并同步到 ',
    codexMessageLink: '运行时主题',
    codexMessageAfterLink: '。颜色、渐变和字体会实时更新。',
    planLabel: '生成计划',
    planMessage: '整理主题模型、Studio 预览与运行时注入，并逐项完成验证。',
    commandLabel: '已运行命令',
    elapsed: '2.1 秒',
    viewChanges: '查看改动'
  },
  'en-US': {
    composerPlaceholder: 'Describe what you want to build',
    fullAccess: 'Full access',
    conversationTitle: 'Refine the theme editor',
    userLabel: 'You',
    userMessage: 'Make every element in the preview directly configurable.',
    codexMessageBeforeLink: 'The full interface token set is ready and synchronized with the ',
    codexMessageLink: 'runtime theme',
    codexMessageAfterLink: '. Colors, gradients, and fonts now update live.',
    planLabel: 'Plan',
    planMessage: 'Align the theme model, Studio preview, and runtime injection, then verify each part.',
    commandLabel: 'Ran command',
    elapsed: '2.1s',
    viewChanges: 'View changes'
  }
} as const satisfies Record<SupportedLocale, Record<string, string>>

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
