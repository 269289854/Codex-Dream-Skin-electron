export const HOME_PREVIEW_VIEWPORT = { width: 1280, height: 820 } as const
export const PROJECT_PLACEHOLDER = '{project}'

export const DEFAULT_HOME_COPY = {
  headingTemplate: `我们应该在 ${PROJECT_PLACEHOLDER} 中构建什么？`,
  subtitle: '和初音未来一起，把灵感写成代码与旋律 ♫'
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
