import { afterEach, describe, expect, it } from 'vitest'
import { captureIpcResult } from '../src/shared/ipc-result'
import { DEFAULT_LOCALE, getActiveLocale, joinLocalizedMessages, localizedMessage, normalizeLocale, setActiveLocale, t, tm, translate, translateLocalizedMessage } from '../src/shared/i18n'

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
    expect(translate('en-US', '素材必须是文件且不能超过 30 MB。')).toBe('The asset must be a file no larger than 30 MB.')
    expect(translate('en-US', '保存的运行会话无效。')).toBe('The saved runtime session is invalid.')
    expect(translate('en-US', 'PowerShell 退出，代码 7。')).toBe('PowerShell exited with code 7.')
    expect(translate('en-US', 'Studio 版本无效。')).toBe('The Studio version is invalid.')
    expect(translate('en-US', '主题列表')).toBe('Themes')
    expect(translate('en-US', '属性')).toBe('Properties')
    expect(translate('en-US', '快捷编辑')).toBe('Quick Edit')
    expect(translate('en-US', '字体文件')).toBe('Fonts')
    expect(translate('en-US', '图片和视频')).toBe('Images and Video')
    expect(translate('en-US', '主题编辑')).toBe('Theme Editor')
    expect(translate('en-US', '素材库')).toBe('Icon Library')
    expect(translate('en-US', '立方体')).toBe('Cube')
    expect(translate('en-US', '故障')).toBe('Bug')
    expect(translate('en-US', '日历完成')).toBe('Calendar check')
    expect(translate('en-US', '稳定随机 · 优先级 1-10')).toBe('Stable random · Priority 1-10')
    expect(translate('en-US', '项目图标配置仅保存在本机')).toBe('Project icon settings are stored only on this device')
    expect(translate('en-US', '已刷新 {count} 个 Codex 项目。', { count: 3 })).toBe('Refreshed 3 Codex projects.')
    expect(translate('en-US', '显示会话图标')).toBe('Show session icons')
    expect(translate('en-US', '随机素材已用尽 · Codex 默认图标')).toBe('Random icons exhausted · Codex default icon')
    expect(translate('en-US', '已刷新 {projectCount} 个 Codex 项目和 {sessionCount} 个会话。', { projectCount: 2, sessionCount: 5 })).toBe('Refreshed 2 Codex projects and 5 sessions.')
    expect(translate('en-US', '搜索图标')).toBe('Search icons')
    expect(translate('en-US', '没有匹配的图标')).toBe('No matching icons')
  })

  it('retranslates structured messages with nested values and joined parts', () => {
    const message = joinLocalizedMessages([
      localizedMessage('主题已注入 {count} 个 Codex 页面', { count: 2 }),
      localizedMessage('正在生成 {width}×{height} / {frameRate} FPS / {bitRate} 视频', {
        width: 1920,
        height: 1080,
        frameRate: 60,
        bitRate: localizedMessage('自动码率')
      })
    ])

    expect(translateLocalizedMessage('zh-CN', message)).toContain('主题已注入 2 个 Codex 页面；正在生成 1920×1080 / 60 FPS / 自动码率 视频')
    expect(translateLocalizedMessage('en-US', message)).toContain('2')
    expect(translateLocalizedMessage('en-US', message)).toContain('Automatic bit rate')
    setActiveLocale('en-US')
    expect(tm(message)).toBe(translateLocalizedMessage('en-US', message))
    setActiveLocale('zh-CN')
    expect(tm(message)).toBe(translateLocalizedMessage('zh-CN', message))
  })

  it('preserves stable IPC error sources for renderer-side translation', async () => {
    setActiveLocale('en-US')
    await expect(captureIpcResult(() => {
      throw new Error('主题素材不存在: assets/hero.png')
    })).resolves.toEqual({ ok: false, error: { source: '主题素材不存在: assets/hero.png' } })
  })
})
