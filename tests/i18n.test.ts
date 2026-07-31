import { afterEach, describe, expect, it } from 'vitest'
import { captureIpcResult } from '../src/shared/ipc-result'
import { DEFAULT_LOCALE, getActiveLocale, normalizeLocale, setActiveLocale, t, translate } from '../src/shared/i18n'

afterEach(() => {
  setActiveLocale(DEFAULT_LOCALE)
})

describe('internationalization', () => {
  it('defaults invalid or unsupported locale values to Chinese', () => {
    expect(DEFAULT_LOCALE).toBe('zh-CN')
    expect(normalizeLocale(undefined)).toBe('zh-CN')
    expect(normalizeLocale('en-US')).toBe('en-US')
    expect(normalizeLocale('en-us')).toBe('zh-CN')
    expect(normalizeLocale('ja-JP')).toBe('zh-CN')
  })

  it('keeps Chinese source copy by default and translates English with interpolation', () => {
    expect(getActiveLocale()).toBe('zh-CN')
    expect(t('已创建主题“{name}”', { name: '示例' })).toBe('已创建主题“示例”')
    expect(translate('en-US', '已创建主题“{name}”', { name: 'Sample' })).toBe('Created theme "Sample"')
    expect(translate('en-US', '没有收录的文案')).toBe('没有收录的文案')
  })

  it('translates compound appearance labels and dynamic technical errors', () => {
    expect(translate('en-US', '新建任务')).toBe('New chat')
    expect(translate('en-US', '项目标题悬停文字')).toBe('Projects heading hover text')
    expect(translate('en-US', '工具活动气泡悬停')).toBe('Tool activity bubble hover')
    expect(translate('en-US', '侧栏分区标题')).toBe('Sidebar section headings')
    expect(translate('en-US', '首页标题必须且只能包含一个 {name}。')).toBe('The home title must contain exactly one {name} placeholder.')
    expect(translate('en-US', '注入中')).toBe('Injecting')
    expect(translate('en-US', '主题素材不存在: assets/hero.png')).toBe('The theme asset does not exist: assets/hero.png')
    expect(translate('en-US', 'Codex 未在端口 9335 暴露经过验证的本地主题端点。')).toBe('Codex did not expose a verified local theme endpoint on port 9335.')
  })

  it('serializes IPC failures in the active language', async () => {
    setActiveLocale('en-US')
    await expect(captureIpcResult(() => {
      throw new Error('主题素材不存在: assets/hero.png')
    })).resolves.toEqual({ ok: false, error: 'The theme asset does not exist: assets/hero.png' })
  })
})
