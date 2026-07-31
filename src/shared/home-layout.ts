export const HOME_PREVIEW_VIEWPORT = { width: 1280, height: 820 } as const
export const PROJECT_PLACEHOLDER = '{project}'

export const DEFAULT_HOME_COPY = {
  headingTemplate: `我们应该在 ${PROJECT_PLACEHOLDER} 中构建什么？`,
  subtitle: '和初音未来一起，把灵感写成代码与旋律 ♫'
} as const

export const DEFAULT_HOME_COPY_EN = {
  headingTemplate: `What should we build in ${PROJECT_PLACEHOLDER}?`,
  subtitle: 'Turn ideas into code and melodies with Hatsune Miku ♫'
} as const

export const DEFAULT_HOME_HEADING_DECORATION = '♫ · ✦ · ♡'

export const DEFAULT_BRAND_COPY = {
  brandTitle: '初音未来主题 Codex App',
  brandSubtitle: '你的专属 AI 编程与创作伙伴',
  brandSignature: 'MIKU ✦ 01'
} as const

export const DEFAULT_BRAND_COPY_EN = {
  brandTitle: 'Hatsune Miku Theme for Codex',
  brandSubtitle: 'Your AI coding and creative companion',
  brandSignature: 'MIKU ✦ 01'
} as const

export const HOME_ACTION_FALLBACK_BUILTINS = {
  cardPrimary: 'wand-sparkles',
  cardSecondary: 'image'
} as const

export const HOME_ACTIONS = [
  {
    icon: '</>',
    iconSlot: 'cardPrimary',
    label: '探索并理解代码',
    prompt: '请探索并理解当前项目的代码结构，说明关键模块、入口和主要数据流。'
  },
  {
    icon: '+',
    iconSlot: 'cardSecondary',
    label: '构建新功能、应用或工具',
    prompt: '请基于当前项目构建一个新功能、应用或工具。先分析现有模式，再完成实现和验证。'
  },
  {
    icon: '✓',
    iconSlot: 'cardSecondary',
    label: '审查代码并提出修改建议',
    prompt: '请审查当前项目的代码，优先指出缺陷、回归风险和缺失测试，并提出具体修改建议。'
  },
  {
    icon: '✦',
    iconSlot: 'cardSecondary',
    label: '修复问题和失败',
    prompt: '请诊断并修复当前项目中的问题或失败，先定位根因，再实施修复并运行相关验证。'
  }
] as const

export const HOME_ACTIONS_EN = [
  {
    icon: '</>',
    iconSlot: 'cardPrimary',
    label: 'Explore and understand code',
    prompt: 'Explore and understand the current project. Explain its key modules, entry points, and main data flows.'
  },
  {
    icon: '+',
    iconSlot: 'cardSecondary',
    label: 'Build a feature, app, or tool',
    prompt: 'Build a new feature, app, or tool for the current project. Analyze the existing patterns first, then implement and verify it.'
  },
  {
    icon: '✓',
    iconSlot: 'cardSecondary',
    label: 'Review code and suggest changes',
    prompt: 'Review the current project. Prioritize defects, regression risks, and missing tests, then suggest concrete changes.'
  },
  {
    icon: '✦',
    iconSlot: 'cardSecondary',
    label: 'Fix issues and failures',
    prompt: 'Diagnose and fix issues or failures in the current project. Find the root cause first, then implement the fix and run relevant checks.'
  }
] as const

export const HOME_ACTIONS_BY_LOCALE = {
  'zh-CN': HOME_ACTIONS,
  'en-US': HOME_ACTIONS_EN
} as const

export type HomeAction = (typeof HOME_ACTIONS)[number]

export function splitHeadingTemplate(template: string): { before: string; after: string } | null {
  const first = template.indexOf(PROJECT_PLACEHOLDER)
  if (first < 0 || template.indexOf(PROJECT_PLACEHOLDER, first + PROJECT_PLACEHOLDER.length) >= 0) return null
  return {
    before: template.slice(0, first),
    after: template.slice(first + PROJECT_PLACEHOLDER.length)
  }
}

export function headingTemplateError(template: string): string | null {
  const trimmed = template.trim()
  if (!trimmed) return '首页标题不能为空。'
  if (trimmed.length > 120) return '首页标题不能超过 120 个字符。'
  if (!splitHeadingTemplate(trimmed)) return `首页标题必须且只能包含一个 ${PROJECT_PLACEHOLDER}。`
  return null
}

export function brandCopyError(copy: {
  brandTitle: string
  brandSubtitle: string
  brandSignature: string
}): string | null {
  if (!copy.brandTitle.trim()) return '品牌主标题不能为空。'
  if (copy.brandTitle.length > 80) return '品牌主标题不能超过 80 个字符。'
  if (copy.brandSubtitle.length > 120) return '品牌副标题不能超过 120 个字符。'
  if (copy.brandSignature.length > 32) return '品牌签名不能超过 32 个字符。'
  return null
}
