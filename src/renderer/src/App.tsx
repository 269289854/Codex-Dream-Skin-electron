import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AtSign, Box, Check, ChevronDown, ChevronsUpDown, CircleHelp, Clock3, Copy, Folder,
  GitBranch, GitPullRequest, Grid2X2, Image, Laptop, Mic, MonitorPlay, Palette, Play,
  Plus, RotateCcw, Save, Search, Settings2, Sparkles, SquarePen, Trash2, Undo2, Upload
} from 'lucide-react'
import type { RuntimeStatus } from '../../shared/contracts'
import { clampNormalized, type Fence } from '../../shared/geometry'
import { headingTemplateError, HOME_ACTION_FALLBACK_BUILTINS, HOME_ACTIONS, HOME_PREVIEW_VIEWPORT, splitHeadingTemplate } from '../../shared/home-layout'
import { resolveBuiltinIconGlyph } from '../../shared/icon-glyphs'
import { createDefaultTheme, type IconSlot, type ThemeProfile, type ThemeSummary } from '../../shared/theme'
import { FenceEditor } from './FenceEditor'
import { builtinIconOptions, builtinIcons } from './icons'
import { PolaroidPreview } from './PolaroidPreview'
import { buildPreviewHeroImageProps, PREVIEW_HOME_CONTEXT, PREVIEW_SIDEBAR_PROJECTS, PREVIEW_SIDEBAR_TEAM } from './preview-home'

const colorLabels: Record<keyof ThemeProfile['colors'], string> = {
  surface: '背景', ink: '正文', accent: '强调', pink: '粉色', lavender: '淡紫',
  border: '边框', success: '成功', danger: '危险'
}

const iconLabels: Record<IconSlot, string> = {
  branding: '品牌', cardPrimary: '主卡片', cardSecondary: '副卡片', composer: '输入框',
  project: '项目', decoration: '装饰', polaroidPin: '图钉'
}

export function App(): React.JSX.Element {
  const [themes, setThemes] = useState<ThemeSummary[]>([])
  const [draft, setDraft] = useState<ThemeProfile | null>(null)
  const [assets, setAssets] = useState<Record<string, string>>({})
  const [activeInspector, setActiveInspector] = useState<'visual' | 'icons' | 'runtime'>('visual')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [runtimeBusy, setRuntimeBusy] = useState(false)
  const [runtime, setRuntime] = useState<RuntimeStatus>({ phase: 'idle', port: 9335, connected: false, targetCount: 0, codexVersion: null, backupAvailable: false, lastError: null, message: '等待检测 Codex' })
  const [draggingPlacement, setDraggingPlacement] = useState(false)
  const [previewScale, setPreviewScale] = useState(1)
  const previewStageRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const historyRef = useRef<ThemeProfile[]>([])

  const loadTheme = useCallback(async (id: string) => {
    try {
      setError(null)
      const [profile, compiled] = await Promise.all([window.studio.themes.get(id), window.studio.themes.compile(id)])
      setDraft(profile)
      setAssets(compiled.assets)
      historyRef.current = []
    } catch (reason) { setError(messageOf(reason)) }
  }, [])

  const refreshThemes = useCallback(async () => {
    const next = await window.studio.themes.list()
    setThemes(next)
    return next
  }, [])

  useEffect(() => {
    void refreshThemes().then((items) => {
      const selected = items.find((item) => item.active) ?? items[0]
      if (selected) void loadTheme(selected.id)
    }).catch((reason) => setError(messageOf(reason)))
  }, [loadTheme, refreshThemes])

  useEffect(() => {
    void window.studio.runtime.getStatus().then(setRuntime)
    return window.studio.runtime.subscribeStatus(setRuntime)
  }, [])

  useEffect(() => window.studio.themes.subscribePolaroidPlacement((update) => {
    setDraft((current) => current?.id === update.themeId ? {
      ...current,
      polaroid: {
        ...current.polaroid,
        placement: { ...current.polaroid.placement, x: update.x, y: update.y }
      }
    } : current)
    void refreshThemes().catch((reason) => setError(messageOf(reason)))
  }), [refreshThemes])

  useEffect(() => {
    const stage = previewStageRef.current
    if (!stage) return
    const updateScale = (): void => {
      const bounds = stage.getBoundingClientRect()
      setPreviewScale(Math.max(.1, Math.min(bounds.width / HOME_PREVIEW_VIEWPORT.width, bounds.height / HOME_PREVIEW_VIEWPORT.height)))
    }
    const observer = new ResizeObserver(updateScale)
    observer.observe(stage)
    updateScale()
    return () => observer.disconnect()
  }, [draft?.id])

  const change = (mutator: (profile: ThemeProfile) => void): void => {
    setDraft((current) => {
      if (!current) return current
      historyRef.current.push(structuredClone(current))
      if (historyRef.current.length > 60) historyRef.current.shift()
      const next = structuredClone(current)
      mutator(next)
      return next
    })
  }

  const save = async (): Promise<boolean> => {
    if (!draft) return false
    const copyError = headingTemplateError(draft.copy.headingTemplate)
    if (copyError || draft.copy.subtitle.trim().length > 160) {
      setError(copyError ?? '首页副标题不能超过 160 个字符。')
      return false
    }
    setSaving(true)
    setError(null)
    try {
      const saved = await window.studio.themes.update(draft)
      await window.studio.themes.activate(saved.id)
      setDraft(saved)
      historyRef.current = []
      await refreshThemes()
      return true
    } catch (reason) {
      setError(messageOf(reason))
      return false
    } finally { setSaving(false) }
  }

  const createTheme = async (): Promise<void> => {
    const name = window.prompt('主题名称', '新主题')?.trim()
    if (!name) return
    try {
      const profile = await window.studio.themes.create(name)
      await window.studio.themes.activate(profile.id)
      await refreshThemes()
      await loadTheme(profile.id)
    } catch (reason) { setError(messageOf(reason)) }
  }

  const duplicateTheme = async (): Promise<void> => {
    if (!draft) return
    const name = window.prompt('副本名称', `${draft.name} 副本`)?.trim()
    if (!name) return
    try {
      const profile = await window.studio.themes.duplicate(draft.id, name)
      await window.studio.themes.activate(profile.id)
      await refreshThemes()
      await loadTheme(profile.id)
    } catch (reason) { setError(messageOf(reason)) }
  }

  const deleteTheme = async (): Promise<void> => {
    if (!draft || !window.confirm(`删除主题“${draft.name}”？`)) return
    try {
      await window.studio.themes.delete(draft.id)
      const remaining = await refreshThemes()
      const next = remaining.find((theme) => theme.active) ?? remaining[0]
      if (next) await loadTheme(next.id)
    } catch (reason) { setError(messageOf(reason)) }
  }

  const selectImage = async (purpose: 'hero' | 'polaroid'): Promise<void> => {
    if (!draft) return
    try {
      const imported = await window.studio.assets.selectImage(draft.id, purpose)
      if (!imported) return
      setAssets((current) => ({ ...current, [imported.relativePath]: imported.dataUrl }))
      change((profile) => {
        if (purpose === 'hero') profile.hero.sourceImage = imported.relativePath
        else {
          profile.polaroid.sourceImage = imported.relativePath
          profile.polaroid.sourceSize = { width: imported.width, height: imported.height }
        }
      })
    } catch (reason) { setError(messageOf(reason)) }
  }

  const importIcon = async (slot: IconSlot): Promise<void> => {
    if (!draft) return
    try {
      const imported = await window.studio.assets.selectIcon(draft.id)
      if (!imported) return
      setAssets((current) => ({ ...current, [imported.relativePath]: imported.dataUrl }))
      change((profile) => { profile.icons[slot] = { kind: 'asset', asset: imported.relativePath } })
    } catch (reason) { setError(messageOf(reason)) }
  }

  const undo = (): void => {
    const previous = historyRef.current.pop()
    if (previous) setDraft(previous)
  }

  const runRuntime = async (operation: () => Promise<RuntimeStatus>): Promise<void> => {
    setRuntimeBusy(true)
    setError(null)
    try { setRuntime(await operation()) } catch (reason) { setError(messageOf(reason)) } finally { setRuntimeBusy(false) }
  }

  const startTheme = async (): Promise<void> => {
    if (!draft) return
    setRuntimeBusy(true)
    setError(null)
    try {
      if (!(await save())) return
      const detection = await window.studio.codex.detect()
      const restart = detection.running && window.confirm('Codex 需要重启一次以启用本地主题端口。未提交的输入可能丢失，继续吗？')
      if (detection.running && !restart) return
      setRuntime(await window.studio.codex.start(draft.id, restart))
    } catch (reason) { setError(messageOf(reason)) } finally { setRuntimeBusy(false) }
  }

  const beginPlacementDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!draft) return
    historyRef.current.push(structuredClone(draft))
    setDraggingPlacement(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const movePlacement = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!draggingPlacement || !previewRef.current) return
    const bounds = previewRef.current.getBoundingClientRect()
    setDraft((current) => current ? {
      ...current,
      polaroid: { ...current.polaroid, placement: {
        ...current.polaroid.placement,
        x: clampNormalized((event.clientX - bounds.left) / bounds.width - current.polaroid.placement.width / 2),
        y: clampNormalized((event.clientY - bounds.top) / bounds.height - current.polaroid.placement.width / 2)
      } }
    } : current)
  }

  if (!draft) return <div className="loading-screen"><Sparkles size={22} /><span>{error ?? '正在打开主题工作台'}</span>{error && <button className="secondary-command" onClick={() => window.location.reload()}>重新加载</button>}</div>
  const heroUrl = draft.hero.sourceImage ? assets[draft.hero.sourceImage] : undefined
  const polaroidUrl = draft.polaroid.sourceImage ? assets[draft.polaroid.sourceImage] : undefined
  const headingParts = splitHeadingTemplate(draft.copy.headingTemplate) ?? { before: draft.copy.headingTemplate, after: '' }
  const copyValidationError = headingTemplateError(draft.copy.headingTemplate) ?? (draft.copy.subtitle.trim().length > 160 ? '首页副标题不能超过 160 个字符。' : null)
  const previewStyle = {
    '--dream-surface': draft.colors.surface,
    '--dream-ink': draft.colors.ink,
    '--dream-accent': draft.colors.accent,
    '--dream-pink': draft.colors.pink,
    '--dream-lavender': draft.colors.lavender,
    '--dream-border': draft.colors.border
  } as React.CSSProperties
  const heroImage = buildPreviewHeroImageProps(heroUrl, draft.hero)

  return (
    <main className="studio-shell">
      <header className="titlebar"><span className="brand-mark"><Sparkles size={16} /></span><strong>Codex Dream Skin Studio</strong><span className="title-status">Windows Theme Editor</span></header>
      {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError(null)}>关闭</button></div>}
      <section className="workspace">
        <aside className="theme-sidebar">
          <div className="panel-heading"><div><span className="eyebrow">THEMES</span><h2>我的主题</h2></div><button className="icon-button" title="新建主题" onClick={() => void createTheme()}><Plus size={17} /></button></div>
          <div className="theme-list">
            {themes.map((theme) => <button key={theme.id} className={theme.id === draft.id ? 'theme-item active' : 'theme-item'} onClick={() => { void window.studio.themes.activate(theme.id).then(() => refreshThemes()); void loadTheme(theme.id) }}><span className="theme-swatch" style={{ background: `linear-gradient(145deg, ${draft.id === theme.id ? draft.colors.accent : '#9ab4b8'}, ${draft.id === theme.id ? draft.colors.pink : '#d2dcde'})` }} /><span><strong>{theme.name}</strong><small>{theme.active ? '当前主题' : '本地主题'}</small></span></button>)}
          </div>
          <div className="theme-actions"><button title="复制主题" onClick={() => void duplicateTheme()}><Copy size={15} /></button><button title="删除主题" onClick={() => void deleteTheme()}><Trash2 size={15} /></button></div>
          <nav className="sidebar-nav">
            <button className={activeInspector === 'visual' ? 'active' : ''} onClick={() => setActiveInspector('visual')}><Palette size={17} />视觉设计</button>
            <button className={activeInspector === 'icons' ? 'active' : ''} onClick={() => setActiveInspector('icons')}><Box size={17} />图标样式</button>
            <button className={activeInspector === 'runtime' ? 'active' : ''} onClick={() => setActiveInspector('runtime')}><Settings2 size={17} />运行设置</button>
          </nav>
          <div className="sidebar-footer"><CircleHelp size={15} />本地配置 · 可随时恢复</div>
        </aside>

        <section className="preview-panel">
          <div className="preview-toolbar"><div><span className="status-dot" />Codex 实时预览 <span className="viewport-label">{HOME_PREVIEW_VIEWPORT.width} × {HOME_PREVIEW_VIEWPORT.height}</span></div><div className="preview-actions"><button className="tool-button" title="撤销" onClick={undo}><Undo2 size={16} /></button><button className="tool-button" title="恢复默认" onClick={() => change((profile) => Object.assign(profile, createDefaultTheme(profile.id, profile.name)))}><RotateCcw size={16} /></button><button className="primary-button" disabled={Boolean(copyValidationError) || saving} onClick={() => void save()}><Save size={15} />{saving ? '保存中' : '保存主题'}</button></div></div>
          <div className="preview-stage" ref={previewStageRef}>
            <div className="preview-frame" style={{ width: HOME_PREVIEW_VIEWPORT.width * previewScale, height: HOME_PREVIEW_VIEWPORT.height * previewScale }}>
              <div
                className="codex-preview"
                onPointerMove={movePlacement}
                onPointerUp={() => setDraggingPlacement(false)}
                onPointerLeave={() => setDraggingPlacement(false)}
                style={{ ...previewStyle, transform: `scale(${previewScale})` }}
              >
                <CodexSidebarPreview />
                <section className="codex-main" ref={previewRef}>
                  <header className="preview-brand"><span className="preview-brand-icon"><RenderIcon slot="branding" profile={draft} assets={assets} /></span><div><strong>初音未来主题 Codex App</strong><small>你的专属 AI 编程与创作伙伴</small></div><em>MIKU ✦ 01</em></header>
                  <div className="preview-home-content">
                    <section className="dream-layout-root dream-hero preview-hero-explicit">
                      {heroImage
                        ? <img className="preview-hero-art" src={heroImage.src} style={heroImage.style} alt="" draggable={false} />
                        : <div className="preview-hero-fallback" aria-hidden="true" />}
                      <div className="dream-heading-region">
                        <h1 className="dream-heading">
                          <span className="dream-copy-node dream-copy-before">{headingParts.before}</span>
                          <button className="dream-project-selector dream-project-proxy" type="button">{PREVIEW_HOME_CONTEXT.projectName}</button>
                          <span className="dream-copy-node dream-copy-after">{headingParts.after}</span>
                          <span className="dream-copy-node dream-copy-subtitle">{draft.copy.subtitle}</span>
                        </h1>
                      </div>
                      <div className="dream-action-grid">
                        {HOME_ACTIONS.map((action) => <button className="dream-action-card" type="button" key={action.label}><span className="dream-action-icon"><RenderIcon slot={action.iconSlot} profile={draft} assets={assets} injected fallbackGlyph={action.icon} /></span><span className="dream-action-label">{action.label}</span><span className="dream-action-heart"><RenderIcon slot="decoration" profile={draft} assets={assets} injected /></span></button>)}
                      </div>
                    </section>
                    <div className="preview-lower-region">
                      <div className="dream-project-bar preview-project-bar">
                        <div className="preview-project-chips">
                          <button type="button" data-preview-context="project"><Folder size={16} /><span>{PREVIEW_HOME_CONTEXT.projectName}</span></button>
                          <button type="button" data-preview-context="environment"><Laptop size={15} /><span>{PREVIEW_HOME_CONTEXT.environment}</span></button>
                          <button type="button" data-preview-context="branch"><GitBranch size={15} /><span>{PREVIEW_HOME_CONTEXT.branch}</span></button>
                        </div>
                      </div>
                      <div className="dream-composer preview-composer">
                        <span className="preview-composer-placeholder">随心输入，让灵感与代码一起起飞吧～</span>
                        <div className="preview-composer-footer">
                          <div className="preview-composer-tools">
                            <button className="preview-icon-command" type="button" title="添加"><Plus size={18} /></button>
                            <button className="preview-access-command" type="button"><span aria-hidden="true">!</span>完全访问</button>
                          </div>
                          <div className="preview-composer-tools">
                            <button className="preview-model-command" type="button">{PREVIEW_HOME_CONTEXT.model}<ChevronDown size={14} /></button>
                            <button className="preview-icon-command" type="button" title="语音输入"><Mic size={17} /></button>
                            <button className="preview-send-command" type="button" title="发送"><RenderIcon slot="composer" profile={draft} assets={assets} /></button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  {draft.polaroid.visible && polaroidUrl && <PolaroidPreview imageUrl={polaroidUrl} fence={draft.polaroid.fence as Fence} sourceSize={draft.polaroid.sourceSize} placement={draft.polaroid.placement} onPointerDown={beginPlacementDrag} />}
                </section>
              </div>
            </div>
          </div>
        </section>

        <aside className="inspector">
          <div className="panel-heading inspector-title"><div><span className="eyebrow">PROPERTIES</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></div><ChevronDown size={16} /></div>
          {activeInspector === 'visual' && <>
            <Property title="首页文案">
              <label className="copy-field">首页标题<input value={draft.copy.headingTemplate} maxLength={120} aria-invalid={Boolean(headingTemplateError(draft.copy.headingTemplate))} onChange={(event) => change((profile) => { profile.copy.headingTemplate = event.target.value })} /></label>
              <label className="copy-field">副标题<textarea value={draft.copy.subtitle} maxLength={160} rows={3} onChange={(event) => change((profile) => { profile.copy.subtitle = event.target.value })} /></label>
              {copyValidationError && <p className="field-error">{copyValidationError}</p>}
            </Property>
            <Property title="主视觉">
              <button className="asset-picker" onClick={() => void selectImage('hero')}>{heroUrl ? <img src={heroUrl} alt="主视觉" /> : <Image size={20} />}<span><Upload size={13} />选择背景图片</span></button>
              <Range label="缩放" min={.5} max={3} step={.01} value={draft.hero.scale} onChange={(value) => change((profile) => { profile.hero.scale = value })} />
              <Range label="水平位置" min={0} max={1} step={.01} value={draft.hero.position.x} onChange={(value) => change((profile) => { profile.hero.position.x = value })} />
              <Range label="垂直位置" min={0} max={1} step={.01} value={draft.hero.position.y} onChange={(value) => change((profile) => { profile.hero.position.y = value })} />
            </Property>
            <Property title="拍立得">
              <label className="toggle-row"><span>显示拍立得</span><input type="checkbox" checked={draft.polaroid.visible} onChange={(event) => change((profile) => { profile.polaroid.visible = event.target.checked })} /></label>
              <button className="secondary-command" onClick={() => void selectImage('polaroid')}><Image size={15} />{polaroidUrl ? '更换拍立得原图' : '选择拍立得原图'}</button>
              {polaroidUrl && <FenceEditor imageUrl={polaroidUrl} fence={draft.polaroid.fence as Fence} onChange={(fence) => change((profile) => { profile.polaroid.fence = fence })} />}
              <Range label="宽度" min={.08} max={.6} step={.01} value={draft.polaroid.placement.width} onChange={(value) => change((profile) => { profile.polaroid.placement.width = value })} />
              <Range label="旋转" min={-45} max={45} step={1} value={draft.polaroid.placement.rotation} onChange={(value) => change((profile) => { profile.polaroid.placement.rotation = value })} suffix="°" />
              <Range label="隐藏阈值" min={320} max={1600} step={10} value={draft.polaroid.placement.hideBelowWidth} onChange={(value) => change((profile) => { profile.polaroid.placement.hideBelowWidth = value })} suffix="px" />
            </Property>
            <Property title="主题颜色"><div className="color-grid">{(Object.keys(colorLabels) as (keyof ThemeProfile['colors'])[]).map((key) => <label key={key}><input type="color" value={draft.colors[key]} onChange={(event) => change((profile) => { profile.colors[key] = event.target.value.toUpperCase() })} /><span>{colorLabels[key]}</span><code>{draft.colors[key]}</code></label>)}</div></Property>
          </>}
          {activeInspector === 'icons' && <Property title="图标槽位"><div className="icon-editor">{(Object.keys(iconLabels) as IconSlot[]).map((slot) => <div className="icon-slot" key={slot}><span className="icon-preview"><RenderIcon slot={slot} profile={draft} assets={assets} /></span><label>{iconLabels[slot]}<select value={draft.icons[slot].kind === 'builtin' ? draft.icons[slot].name : '__asset'} onChange={(event) => { if (event.target.value !== '__asset') change((profile) => { profile.icons[slot] = { kind: 'builtin', name: event.target.value } }) }}><option value="__asset">自定义图片</option>{builtinIconOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select></label><button className="tool-button" title="导入图标" onClick={() => void importIcon(slot)}><Upload size={14} /></button></div>)}</div></Property>}
          {activeInspector === 'runtime' && <>
            <Property title="运行状态"><div className="runtime-summary"><span className={`runtime-indicator ${runtime.phase}`} /><strong>{runtime.message}</strong><dl><div><dt>阶段</dt><dd>{runtime.phase}</dd></div><div><dt>端口</dt><dd>{runtime.port}</dd></div><div><dt>页面</dt><dd>{runtime.targetCount}</dd></div><div><dt>Codex</dt><dd>{runtime.codexVersion ?? '-'}</dd></div></dl>{runtime.lastError && <p>{runtime.lastError}</p>}</div></Property>
            <Property title="Codex 控制"><div className="runtime-commands">
              <button disabled={runtimeBusy} onClick={() => void runRuntime(async () => { await window.studio.codex.detect(); return window.studio.runtime.getStatus() })}><MonitorPlay size={15} />检测 Codex</button>
              <button disabled={runtimeBusy} onClick={() => void runRuntime(() => window.studio.codex.installTheme(draft.id))}><Save size={15} />安装配置</button>
              <button className="accent" disabled={runtimeBusy} onClick={() => void startTheme()}><Play size={15} />启动并应用</button>
              <button disabled={runtimeBusy} onClick={() => void runRuntime(() => window.studio.codex.reinject(draft.id))}><RotateCcw size={15} />重新注入</button>
              <button disabled={runtimeBusy} onClick={() => void runRuntime(() => window.studio.codex.verify())}><Check size={15} />验证主题</button>
              <button disabled={runtimeBusy} onClick={() => void runRuntime(() => window.studio.codex.stop())}><Box size={15} />停止注入</button>
            </div></Property>
            <button className="danger-command" disabled={runtimeBusy} onClick={() => { if (window.confirm('恢复 Codex 原始配置并正常重启 Codex？')) void runRuntime(() => window.studio.codex.restore(true)) }}><Undo2 size={15} />恢复并重启 Codex</button>
            {runtimeBusy && <div className="runtime-progress">操作进行中</div>}
          </>}
        </aside>
      </section>
    </main>
  )
}

const previewNavigation = [
  { label: '新建任务', icon: SquarePen },
  { label: '拉取请求', icon: GitPullRequest },
  { label: '站点', icon: Grid2X2 },
  { label: '已安排', icon: Clock3 },
  { label: '插件', icon: AtSign }
] as const

function CodexSidebarPreview(): React.JSX.Element {
  return (
    <aside className="codex-sidebar" aria-label="Codex 侧边栏预览">
      <div className="codex-sidebar-header">
        <button className="codex-mode-button" type="button"><strong>Codex</strong><ChevronDown size={16} /><span aria-hidden="true">♫</span></button>
        <button className="codex-sidebar-icon-button" type="button" title="搜索"><Search size={19} /></button>
      </div>
      <nav className="codex-primary-nav" aria-label="主要导航">
        {previewNavigation.map(({ label, icon: Icon }) => <button type="button" key={label}><Icon size={18} /><span>{label}</span></button>)}
      </nav>
      <section className="codex-project-section">
        <div className="codex-project-heading">项目</div>
        <div className="codex-project-scroll">
          {PREVIEW_SIDEBAR_PROJECTS.map((project) => (
            <div className="codex-project-group" key={project.name}>
              <button className={project.active ? 'codex-project-row active' : 'codex-project-row'} type="button">
                <Folder size={18} />
                <span>{project.name}</span>
                {project.active && <ChevronsUpDown size={16} />}
              </button>
              {project.tasks.map((task) => <button className="codex-task-row" type="button" key={task}>{task}</button>)}
              {'emptyLabel' in project && <div className="codex-task-empty">{project.emptyLabel}</div>}
            </div>
          ))}
        </div>
      </section>
      <footer className="codex-sidebar-footer"><span className="codex-team-avatar">{PREVIEW_SIDEBAR_TEAM.avatar}</span><span>{PREVIEW_SIDEBAR_TEAM.label}</span><CircleHelp size={18} /></footer>
    </aside>
  )
}

function Property({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return <section className="property-group"><h3>{title}</h3>{children}</section>
}

function Range({ label, value, onChange, min, max, step, suffix = '' }: { label: string; value: number; onChange: (value: number) => void; min: number; max: number; step: number; suffix?: string }): React.JSX.Element {
  return <label className="range-row"><span>{label}</span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /><output>{Number.isInteger(step) ? value : value.toFixed(2)}{suffix}</output></label>
}

function RenderIcon({ slot, profile, assets, injected = false, fallbackGlyph }: { slot: IconSlot; profile: ThemeProfile; assets: Record<string, string>; injected?: boolean; fallbackGlyph?: string }): React.JSX.Element {
  const source = profile.icons[slot]
  if (source.kind === 'asset') return <img className="custom-icon" src={assets[source.asset]} alt="" />
  const fallbackBuiltin = HOME_ACTION_FALLBACK_BUILTINS[slot as keyof typeof HOME_ACTION_FALLBACK_BUILTINS]
  if (fallbackGlyph && source.name === fallbackBuiltin) return <span className="builtin-icon-glyph" aria-hidden="true">{fallbackGlyph}</span>
  if (injected) return <span className="builtin-icon-glyph" aria-hidden="true">{resolveBuiltinIconGlyph(source.name)}</span>
  const Icon = builtinIcons[source.name] ?? Sparkles
  return <Icon size={18} />
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}
