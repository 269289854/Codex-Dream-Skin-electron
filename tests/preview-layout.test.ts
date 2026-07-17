import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDefaultTheme } from '../src/shared/theme'
import { buildPreviewHeroImageProps, PREVIEW_HERO_FALLBACK, PREVIEW_HOME_CONTEXT, PREVIEW_SIDEBAR_PROJECTS, PREVIEW_SIDEBAR_TEAM } from '../src/renderer/src/preview-home'

describe('Studio home preview', () => {
  it('binds the complete hero data URL directly to the hero style', () => {
    const profile = createDefaultTheme('00000000-0000-4000-8000-000000000000')
    profile.hero.scale = 1.25
    profile.hero.position = { x: 0.32, y: 0.68 }
    const dataUrl = 'data:image/png;base64,AAECAwQ='

    expect(buildPreviewHeroImageProps(dataUrl, profile.hero)).toEqual({
      src: dataUrl,
      style: {
        width: '125%',
        left: '32%',
        top: '68%',
        transform: 'translate(-32%, -68%)'
      }
    })
  })

  it('uses the preview fallback when the configured asset is unavailable', () => {
    const profile = createDefaultTheme('00000000-0000-4000-8000-000000000000')
    expect(buildPreviewHeroImageProps(undefined, profile.hero)).toBeNull()
    expect(PREVIEW_HERO_FALLBACK).toContain('linear-gradient')
  })

  it('models the current Codex project toolbar and composer controls', async () => {
    const source = await readFile(join(process.cwd(), 'src', 'renderer', 'src', 'App.tsx'), 'utf8')
    expect(source).toContain('className="dream-layout-root dream-hero preview-hero-explicit"')
    expect(source).toContain('className="preview-hero-art"')
    expect(source).toContain('className="preview-hero-fallback"')
    expect(source).toContain('className="preview-lower-region"')
    expect(source).toContain('data-preview-context="project"')
    expect(source).toContain('data-preview-context="environment"')
    expect(source).toContain('data-preview-context="branch"')
    expect(source).toContain('className="preview-access-command"')
    expect(source).toContain('className="preview-model-command"')
    expect(source).toContain('title="语音输入"')
    expect(source).toContain('title="发送"')
    expect(PREVIEW_HOME_CONTEXT).toEqual({
      projectName: 'Codex-Dream-Skin-electron',
      environment: '本地',
      branch: 'Miku',
      model: '5.6 Luna 极高'
    })
  })

  it('models the current single-column Codex sidebar', async () => {
    const [source, css] = await Promise.all([
      readFile(join(process.cwd(), 'src', 'renderer', 'src', 'App.tsx'), 'utf8'),
      readFile(join(process.cwd(), 'src', 'renderer', 'src', 'styles.css'), 'utf8')
    ])
    const previewRule = css.match(/\.codex-preview\s*\{[^}]+\}/)?.[0]
    const sidebarRule = css.match(/\.codex-sidebar\s*\{[^}]+\}/)?.[0]

    expect(source).toContain('<CodexSidebarPreview />')
    expect(source).not.toContain('className="codex-rail"')
    expect(source).toContain('className="codex-project-scroll"')
    expect(source).toContain('className="codex-sidebar-footer"')
    expect(source).toContain('slot="branding"')
    expect(previewRule).toContain('grid-template-columns: 270px minmax(0,1fr)')
    expect(sidebarRule).toContain('display: flex')
    expect(sidebarRule).toContain('border-radius: 0 18px 18px 0')
  })

  it('uses a representative project and task snapshot', () => {
    expect(PREVIEW_SIDEBAR_PROJECTS[0]).toEqual({
      name: 'Codex-Dream-Skin-electron',
      active: true,
      tasks: ['调整预览侧边栏']
    })
    expect(PREVIEW_SIDEBAR_PROJECTS.map((project) => project.name)).toEqual([
      'Codex-Dream-Skin-electron',
      'melody-ui-kit',
      'starlight-notes',
      'pixel-workbench',
      'sample-api-service',
      'demo-file-audit'
    ])
    expect(PREVIEW_SIDEBAR_PROJECTS.some((project) => project.tasks.length > 1)).toBe(true)
    expect(PREVIEW_SIDEBAR_PROJECTS.filter((project) => 'emptyLabel' in project)).toHaveLength(2)
    expect(PREVIEW_SIDEBAR_TEAM).toEqual({ avatar: 'DT', label: 'Demo Team' })
  })

  it('anchors the lower preview to the bottom without duplicating shared theme visuals', async () => {
    const css = await readFile(join(process.cwd(), 'src', 'renderer', 'src', 'styles.css'), 'utf8')
    const lowerRule = css.match(/\.preview-lower-region\s*\{[^}]+\}/)?.[0]
    const projectRule = css.match(/\.preview-project-bar\s*\{[^}]+\}/)?.[0]
    const composerRule = css.match(/\.preview-composer\s*\{[^}]+\}/)?.[0]

    expect(lowerRule).toContain('flex: 1')
    expect(lowerRule).toContain('justify-content: flex-end')
    expect(projectRule).toContain('width: 100%')
    expect(lowerRule).toContain('padding: 0 54px 14px')
    expect(composerRule).toContain('width: 100%')
    expect(composerRule).toContain('height: 128px')
    expect(projectRule).not.toMatch(/(?:background|box-shadow|border):/)
    expect(composerRule).not.toMatch(/(?:background|box-shadow|border):/)
  })

  it('only renders the Studio polaroid when the visibility option is enabled', async () => {
    const source = await readFile(join(process.cwd(), 'src', 'renderer', 'src', 'App.tsx'), 'utf8')
    expect(source).toContain('draft.polaroid.visible && polaroidUrl')
    expect(source).toContain('checked={draft.polaroid.visible}')
    expect(source).toContain('profile.polaroid.visible = event.target.checked')
  })
})
