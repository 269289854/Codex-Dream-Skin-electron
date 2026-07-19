import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BUILTIN_ICON_GLYPHS, resolveBuiltinIconGlyph } from '../src/shared/icon-glyphs'
import { HOME_ACTION_FALLBACK_BUILTINS, HOME_ACTIONS } from '../src/shared/home-layout'
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
      },
      mediaStyle: { transform: 'scaleX(1) scaleY(1)' }
    })
  })

  it('uses the preview fallback when the configured asset is unavailable', () => {
    const profile = createDefaultTheme('00000000-0000-4000-8000-000000000000')
    expect(buildPreviewHeroImageProps(undefined, profile.hero)).toBeNull()
    expect(PREVIEW_HERO_FALLBACK).toContain('linear-gradient')
  })

  it('models the current Codex project toolbar and composer controls', async () => {
    const [source, css] = await Promise.all([
      readFile(join(process.cwd(), 'src', 'renderer', 'src', 'App.tsx'), 'utf8'),
      readFile(join(process.cwd(), 'src', 'renderer', 'src', 'styles.css'), 'utf8')
    ])
    const sendButtonRule = css.match(/\.preview-send-command\s*\{[^}]+\}/)?.[0]
    const sendIconRule = css.match(/\.preview-send-command \.custom-icon, \.preview-send-command svg\s*\{[^}]+\}/)?.[0]
    expect(source).toContain('className="dream-layout-root dream-hero preview-hero-explicit"')
    expect(source).toContain('className="preview-hero-art"')
    expect(source).toContain('className="preview-hero-fallback"')
    expect(source).toContain('className="preview-lower-region"')
    expect(source).toContain('data-preview-context="project"')
    expect(source).toContain('data-preview-context="environment"')
    expect(source).toContain('data-preview-context="branch"')
    expect(source).toContain('className="preview-access-command"')
    expect(source).toContain('className="preview-model-command"')
    expect(source).toContain('className="preview-send-command bg-token-foreground"')
    expect(source).toContain('title="语音输入"')
    expect(source).toContain('title="发送"')
    expect(sendButtonRule).toContain('width: 28px')
    expect(sendButtonRule).toContain('height: 28px')
    expect(sendIconRule).toContain('width: 20px')
    expect(sendIconRule).toContain('height: 20px')
    expect(PREVIEW_HOME_CONTEXT).toEqual({
      projectName: 'Codex-Dream-Skin-electron',
      environment: '本地',
      branch: 'Miku',
      model: '5.6 Luna 极高'
    })
  })

  it('renders the four default action glyphs with the same fallback rules as the Codex injection', async () => {
    const source = await readFile(join(process.cwd(), 'src', 'renderer', 'src', 'App.tsx'), 'utf8')

    expect(HOME_ACTIONS.map((action) => action.icon)).toEqual(['</>', '+', '✓', '✦'])
    expect(HOME_ACTION_FALLBACK_BUILTINS).toEqual({ cardPrimary: 'wand-sparkles', cardSecondary: 'image' })
    expect(resolveBuiltinIconGlyph('heart')).toBe('♥')
    expect(BUILTIN_ICON_GLYPHS).toEqual(expect.objectContaining({ heart: '♥' }))
    expect(source).toContain('slot={action.iconSlot} profile={draft} assets={assets} injected fallbackGlyph={action.icon}')
    expect(source).toContain('slot="decoration" profile={draft} assets={assets} injected')
  })

  it('models the current single-column Codex sidebar', async () => {
    const [source, css] = await Promise.all([
      readFile(join(process.cwd(), 'src', 'renderer', 'src', 'App.tsx'), 'utf8'),
      readFile(join(process.cwd(), 'src', 'renderer', 'src', 'styles.css'), 'utf8')
    ])
    const previewRule = css.match(/\.codex-preview\s*\{[^}]+\}/)?.[0]
    const sidebarRule = css.match(/\.codex-sidebar\s*\{[^}]+\}/)?.[0]
    const modeIconRule = css.match(/\.codex-mode-icon\s*\{[^}]+\}/)?.[0]
    const brandGlyphRule = css.match(/\.preview-brand-icon \.builtin-icon-glyph\s*\{[^}]+\}/)?.[0]

    expect(source).toContain('<CodexSidebarPreview profile={draft} assets={assets} />')
    expect(source).not.toContain('className="codex-rail"')
    expect(source).toContain('className="codex-project-scroll"')
    expect(source).toContain('className="codex-sidebar-footer"')
    expect(source).toContain('slot="branding" profile={draft} assets={assets} injected')
    expect(source).toContain('slot="sidebarMode" profile={profile} assets={assets} injected')
    expect(previewRule).toContain('grid-template-columns: 270px minmax(0,1fr)')
    expect(sidebarRule).toContain('display: flex')
    expect(sidebarRule).toContain('border-radius: 0 18px 18px 0')
    expect(modeIconRule).toContain('width: 21px')
    expect(modeIconRule).toContain('height: 21px')
    expect(brandGlyphRule).toContain('font-size: 28px')
  })

  it('uses a representative project and task snapshot', () => {
    expect(PREVIEW_SIDEBAR_PROJECTS[0]).toEqual({
      name: 'Codex-Dream-Skin-electron',
      active: true,
      tasks: ['调整预览侧边栏']
    })
    expect(PREVIEW_SIDEBAR_PROJECTS).toHaveLength(1)
    expect(PREVIEW_SIDEBAR_PROJECTS[0]?.tasks).toEqual(['调整预览侧边栏'])
    expect(PREVIEW_SIDEBAR_PROJECTS[0]?.emptyLabel).toBeUndefined()
    expect(PREVIEW_SIDEBAR_TEAM).toEqual({ avatar: 'DT', label: 'Demo Team' })
  })

  it('anchors the lower preview to the bottom without duplicating shared theme visuals', async () => {
    const css = await readFile(join(process.cwd(), 'src', 'renderer', 'src', 'styles.css'), 'utf8')
    const lowerRule = css.match(/\.preview-lower-region\s*\{[^}]+\}/)?.[0]
    const projectRule = css.match(/\.preview-project-bar\s*\{[^}]+\}/)?.[0]
    const composerRule = css.match(/\.preview-composer\s*\{[^}]+\}/)?.[0]
    const composerBadgeGlyphRule = css.match(/\.dream-composer-badge \.builtin-icon-glyph\s*\{[^}]+\}/)?.[0]

    expect(lowerRule).toContain('flex: 1')
    expect(lowerRule).toContain('justify-content: flex-end')
    expect(projectRule).toContain('width: 100%')
    expect(projectRule).toContain('border-radius: 28px 28px 0 0')
    expect(lowerRule).toContain('padding: 0 54px 14px')
    expect(composerRule).toContain('width: 100%')
    expect(composerRule).toContain('height: 128px')
    expect(composerBadgeGlyphRule).toContain('display: grid')
    expect(composerBadgeGlyphRule).toContain('place-items: center')
    expect(composerBadgeGlyphRule).toContain('line-height: 1')
    expect(projectRule).not.toMatch(/(?:background|box-shadow|border):/)
    expect(composerRule).not.toMatch(/(?:background|box-shadow|border):/)
  })

  it('keeps quick editor chrome fixed while only its body scrolls', async () => {
    const css = await readFile(join(process.cwd(), 'src', 'renderer', 'src', 'styles.css'), 'utf8')
    const popoverRule = css.match(/\.preview-edit-popover\s*\{[^}]+\}/)?.[0]
    const bodyRule = css.match(/\.preview-edit-popover-body\s*\{[^}]+\}/)?.[0]

    expect(popoverRule).toContain('display: flex')
    expect(popoverRule).toContain('flex-direction: column')
    expect(bodyRule).toContain('flex: 1 1 auto')
    expect(bodyRule).toContain('overflow-y: auto')
  })

  it('only renders the Studio polaroid when the visibility option is enabled', async () => {
    const source = await readFile(join(process.cwd(), 'src', 'renderer', 'src', 'App.tsx'), 'utf8')
    const controls = await readFile(join(process.cwd(), 'src', 'renderer', 'src', 'PolaroidControls.tsx'), 'utf8')
    expect(source).toContain('draft.polaroid.visible && polaroidUrl')
    expect(controls).toContain('checked={polaroid.visible}')
    expect(controls).toContain('const visible = event.currentTarget.checked')
    expect(controls).toContain('next.polaroid.visible = visible')
    expect(controls).toContain('next.polaroid.style.shadow')
  })
})
