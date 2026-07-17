import { useEffect, useState } from 'react'
import { CircleHelp, Image, Palette, Play, Plus, Settings2, Sparkles } from 'lucide-react'
import type { AppInfo } from '../../shared/contracts'

export function App(): React.JSX.Element {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    void window.studio.app.getInfo().then(setAppInfo)
  }, [])

  return (
    <main className="studio-shell">
      <header className="titlebar">
        <div className="brand-mark"><Sparkles size={17} /></div>
        <strong>Codex Dream Skin Studio</strong>
        <span className="version">Windows {appInfo ? `v${appInfo.version}` : ''}</span>
      </header>

      <section className="workspace">
        <aside className="theme-sidebar">
          <div className="panel-heading">
            <div><span className="eyebrow">THEMES</span><h2>我的主题</h2></div>
            <button className="icon-button" title="新建主题"><Plus size={17} /></button>
          </div>
          <button className="theme-item active">
            <span className="theme-swatch" />
            <span><strong>初音未来</strong><small>正在编辑</small></span>
          </button>
          <nav className="sidebar-nav">
            <button className="active"><Palette size={17} />主题设计</button>
            <button><Image size={17} />素材管理</button>
            <button><Settings2 size={17} />运行设置</button>
          </nav>
          <div className="sidebar-footer"><CircleHelp size={15} />本地主题，不修改 Codex 安装包</div>
        </aside>

        <section className="preview-panel">
          <div className="preview-toolbar">
            <div><span className="status-dot" />实时预览</div>
            <button className="primary-button"><Play size={16} fill="currentColor" />启动主题</button>
          </div>
          <div className="codex-preview">
            <aside className="mock-sidebar">
              <span className="mock-logo">C</span>
              <span /><span /><span />
            </aside>
            <div className="mock-content">
              <div className="mock-hero" />
              <h1>开始构建你的主题</h1>
              <p>选择图片、颜色与图标，效果会在这里实时呈现。</p>
              <div className="mock-cards"><article /><article /><article /></div>
              <div className="mock-composer">询问 Codex 或描述一个任务…</div>
            </div>
          </div>
        </section>

        <aside className="inspector">
          <div className="panel-heading"><div><span className="eyebrow">PROPERTIES</span><h2>主题属性</h2></div></div>
          <section className="property-group">
            <h3>主视觉</h3>
            <button className="asset-placeholder"><Image size={20} /><span>选择背景图片</span></button>
          </section>
          <section className="property-group">
            <h3>主题色</h3>
            <div className="color-row"><span className="color-chip cyan" />强调色 <code>#20BCC3</code></div>
            <div className="color-row"><span className="color-chip pink" />辅助色 <code>#F06EA9</code></div>
            <div className="color-row"><span className="color-chip ink" />正文 <code>#164B59</code></div>
          </section>
          <section className="property-group muted"><h3>拍立得围栏</h3><p>选择图片后即可标记四个角点。</p></section>
          <button className="save-button">保存主题</button>
        </aside>
      </section>
    </main>
  )
}
