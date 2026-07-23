import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CodexDetection, RuntimePhase, RuntimeStatus } from '../shared/contracts'
import { paintToCss } from '../shared/appearance'
import { buildBackgroundOverlayStyle, buildConversationOverlayStyle } from '../shared/conversation-overlay'
import type { Fence } from '../shared/geometry'
import { BUILTIN_ICON_GLYPHS } from '../shared/icon-glyphs'
import { PARTICLE_VIEWPORT_TOP, createSparkleParticles, particleEffectIconSlot, resolveParticleRenderPolicy } from '../shared/particle-effects'
import { SIDEBAR_NAV_ITEMS } from '../shared/sidebar-layout'
import { getPolaroidLayout, polaroidShadowFilter } from '../shared/polaroid'
import { mediaFlipCssTransform } from '../shared/media'
import type { ThemeProfile } from '../shared/theme'
import { HOME_ACTION_FALLBACK_BUILTINS, HOME_ACTIONS, splitHeadingTemplate } from '../shared/home-layout'
import { buildThemeVariableDeclarations } from '../shared/runtime-theme'
import { CdpWatcher, type CdpSnapshot } from './cdp-watcher'
import { runPowerShell } from './powershell'
import type { ProfileStore } from './profile-store'
import { buildRuntimeFontCss } from './theme-fonts'

interface StartResult { port: number; browserId: string; version: string }
const TRANSPARENT_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X3Y5WQAAAABJRU5ErkJggg=='

export function buildDynamicThemeCss(profile: ThemeProfile, assets: Record<string, string>): string {
  const rules = [`:root.codex-dream-skin { ${buildThemeVariableDeclarations(profile)} }`,
    'html.codex-dream-skin body { color: var(--dream-global-text) !important; background: var(--dream-canvas) !important; font-family: var(--dream-font-ui) !important; }',
    `.dream-layout-root { --dream-art-scale: ${Math.round(profile.hero.scale * 100)}%; --dream-art-x: ${profile.hero.position.x * 100}%; --dream-art-y: ${profile.hero.position.y * 100}%; }`]
  const source = profile.polaroid.source?.asset ?? profile.polaroid.sourceImage ?? null
  const imageSource = profile.polaroid.source?.kind === 'image' || !profile.polaroid.source ? source : null
  const fence = profile.polaroid.fence as Fence
  const layout = profile.polaroid.sourceSize ? getPolaroidLayout(profile.polaroid.mode, profile.polaroid.sourceSize, fence) : null
  if (profile.polaroid.visible && source && layout) {
    const p = profile.polaroid.placement
    const style = profile.polaroid.style
    rules.push(`#codex-dream-skin-chrome .dream-polaroid { right: auto !important; left: ${p.x * 100}% !important; top: ${p.y * 100}% !important; width: ${p.width * 100}% !important; height: auto !important; aspect-ratio: ${layout.aspectRatio}; transform: rotate(${p.rotation}deg); transform-origin: center; opacity: ${style.opacity}; }`)
    rules.push(`#codex-dream-skin-chrome .dream-polaroid-shadow { filter: ${polaroidShadowFilter(style)} !important; }`)
    rules.push(`#codex-dream-skin-chrome .dream-polaroid-surface { background-image: none !important; background-size: ${layout.backgroundSize} !important; background-position: ${layout.backgroundPosition} !important; clip-path: ${layout.clipPath ?? 'none'} !important; }`)
    rules.push(`#codex-dream-skin-chrome .dream-polaroid-surface::before { content: ""; position: absolute; inset: 0; background-image: ${imageSource && assets[source] ? `url("${assets[source]}")` : 'none'}; background-repeat: no-repeat; background-size: ${layout.backgroundSize}; background-position: ${layout.backgroundPosition}; transform: ${mediaFlipCssTransform(profile.polaroid.mediaTransform)}; transform-origin: center; pointer-events: none; }`)
    rules.push(`@media (max-width: ${p.hideBelowWidth}px) { #codex-dream-skin-chrome .dream-polaroid { display: none !important; } }`)
  } else rules.push('#codex-dream-skin-chrome .dream-polaroid { display: none !important; }')
  return rules.join('\n')
}

export class CodexService {
  private watcher: CdpWatcher | null = null
  private activeThemeId: string | null = null
  private recovering = false
  private operationTail: Promise<void> = Promise.resolve()
  private status: RuntimeStatus = {
    phase: 'idle', port: 9335, connected: false, targetCount: 0, codexVersion: null,
    backupAvailable: false, lastError: null, message: '等待检测 Codex'
  }

  constructor(
    private readonly store: ProfileStore,
    private readonly resourcesRoot: string,
    private readonly onStatus: (status: RuntimeStatus) => void
  ) {}

  getStatus(): RuntimeStatus { return { ...this.status } }
  isActive(): boolean { return this.status.phase === 'active' || this.status.phase === 'injecting' || this.status.phase === 'starting' }

  async resume(): Promise<void> { return this.enqueueOperation(() => this.resumeInternal()) }

  private async resumeInternal(): Promise<void> {
    let detection: CodexDetection
    try {
      detection = await this.bridge<CodexDetection>('Detect')
      this.status.codexVersion = detection.version
      this.status.backupAvailable = detection.backupAvailable
    } catch (reason) {
      this.status.lastError = reason instanceof Error ? reason.message : String(reason)
      this.patch('error', '启动时无法检测 Microsoft Store Codex')
      return
    }

    let session: { version?: number; themeId?: string; port?: number; browserId?: string }
    try {
      session = JSON.parse(await readFile(this.sessionPath(), 'utf8')) as typeof session
    } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code === 'ENOENT') {
        const message = detection.backupAvailable
          ? '检测到可恢复的 Codex 配置备份'
          : detection.running ? '已找到 Codex，当前正在运行' : '已找到 Codex'
        this.patch('ready', message)
        return
      }
      this.status.lastError = reason instanceof Error ? reason.message : String(reason)
      this.patch('ready', '运行会话记录不可用，可重新启动或恢复')
      return
    }

    try {
      if (session.version !== 1 || !session.themeId || !session.browserId || !session.port) throw new Error('Saved runtime session is invalid.')
      await this.store.get(session.themeId)
      this.status.port = session.port
      this.activeThemeId = session.themeId
      this.patch('injecting', '正在恢复上次主题会话')
      const payload = await this.buildPayload(session.themeId)
      await this.writeRuntimePayload(payload)
      await this.replaceWatcher(session.browserId, payload)
      this.patch('active', '已恢复上次主题会话')
    } catch (reason) {
      await rm(this.sessionPath(), { force: true })
      this.activeThemeId = null
      this.status.lastError = reason instanceof Error ? reason.message : String(reason)
      this.patch('ready', detection.backupAvailable ? '上次主题会话已结束，可恢复配置或重新启动' : '上次主题会话已结束，可重新启动')
    }
  }

  async detect(): Promise<CodexDetection> { return this.enqueueOperation(() => this.detectInternal()) }

  private async detectInternal(): Promise<CodexDetection> {
    this.patch('detecting', '正在检测 Microsoft Store Codex')
    try {
      const detection = await this.bridge<CodexDetection>('Detect')
      this.status.codexVersion = detection.version
      this.status.backupAvailable = detection.backupAvailable
      this.patch('ready', detection.running ? '已找到 Codex，当前正在运行' : '已找到 Codex')
      return detection
    } catch (reason) { throw this.fail(reason) }
  }

  async installTheme(themeId: string): Promise<RuntimeStatus> {
    return this.enqueueOperation(() => this.installThemeInternal(themeId))
  }

  private async installThemeInternal(themeId: string): Promise<RuntimeStatus> {
    this.patch('installing', '正在生成并安装主题配置')
    try {
      const payload = await this.buildPayload(themeId)
      await this.writeRuntimePayload(payload)
      await this.bridge('ApplyConfig', ['-ThemePath', join(this.store.themesRoot, themeId, 'theme.json')])
      this.status.backupAvailable = true
      this.patch('ready', '主题配置已安装')
      return this.getStatus()
    } catch (reason) { throw this.fail(reason) }
  }

  async start(themeId: string, restartExisting: boolean): Promise<RuntimeStatus> {
    return this.enqueueOperation(() => this.startInternal(themeId, restartExisting))
  }

  private async startInternal(themeId: string, restartExisting: boolean): Promise<RuntimeStatus> {
    try {
      await this.installThemeInternal(themeId)
      this.patch('starting', '正在启动 Codex 本地主题会话')
      const args = ['-Port', String(this.status.port)]
      if (restartExisting) args.push('-RestartExisting')
      const result = await this.bridge<StartResult>('Start', args, 65_000)
      this.status.port = result.port
      this.status.codexVersion = result.version
      this.activeThemeId = themeId
      const snapshot = await this.replaceWatcher(result.browserId, await this.readRuntimePayload())
      await this.writeSession(themeId, result.browserId)
      this.patch('active', `主题已注入 ${snapshot.targetCount} 个 Codex 页面`)
      return this.getStatus()
    } catch (reason) { throw this.fail(reason) }
  }

  async reinject(themeId: string): Promise<RuntimeStatus> {
    return this.enqueueOperation(() => this.reinjectInternal(themeId))
  }

  private async reinjectInternal(themeId: string): Promise<RuntimeStatus> {
    if (!this.watcher) throw this.fail(new Error('当前没有活动的 Codex 主题会话。'))
    try {
      this.patch('injecting', '正在重新编译并注入主题')
      const payload = await this.buildPayload(themeId)
      await this.writeRuntimePayload(payload)
      this.watcher.setPayload(payload)
      this.watcher.setMediaBindings(await this.store.getRuntimeMediaBindings(themeId))
      const snapshot = await this.watcher.inject()
      this.patch('active', `主题已重新注入 ${snapshot.targetCount} 个页面`)
      return this.getStatus()
    } catch (reason) { throw this.fail(reason) }
  }

  async verify(): Promise<RuntimeStatus> {
    return this.enqueueOperation(() => this.verifyInternal())
  }

  private async verifyInternal(): Promise<RuntimeStatus> {
    if (!this.watcher) throw this.fail(new Error('当前没有活动的 Codex 主题会话。'))
    try {
      const snapshot = await this.watcher.verify()
      this.patch(snapshot.connected ? 'active' : 'error', snapshot.connected ? `验证通过，共 ${snapshot.targetCount} 个页面` : '主题验证失败')
      return this.getStatus()
    } catch (reason) { throw this.fail(reason) }
  }

  async stop(): Promise<RuntimeStatus> { return this.enqueueOperation(() => this.stopInternal()) }

  private async stopInternal(): Promise<RuntimeStatus> {
    this.activeThemeId = null
    await rm(this.sessionPath(), { force: true })
    if (this.watcher) await this.watcher.stop(true)
    this.watcher = null
    this.patch('stopped', '已停止注入并移除当前页面主题')
    return this.getStatus()
  }

  async restore(restartCodex: boolean): Promise<RuntimeStatus> {
    return this.enqueueOperation(() => this.restoreInternal(restartCodex))
  }

  private async restoreInternal(restartCodex: boolean): Promise<RuntimeStatus> {
    this.patch('restoring', '正在恢复 Codex 原始配置')
    try {
      if (this.watcher) await this.watcher.stop(true)
      this.watcher = null
      this.activeThemeId = null
      await rm(this.sessionPath(), { force: true })
      const args = restartCodex ? ['-RestartCodex'] : []
      await this.bridge('Restore', args, 65_000)
      this.status.backupAvailable = false
      this.patch('stopped', restartCodex ? '已恢复配置并正常重启 Codex' : '已恢复 Codex 配置')
      return this.getStatus()
    } catch (reason) { throw this.fail(reason) }
  }

  private async replaceWatcher(browserId: string, payload: string): Promise<CdpSnapshot> {
    if (this.watcher) await this.watcher.stop(true)
    this.patch('injecting', '已连接 Codex，正在注入主题')
    this.watcher = new CdpWatcher(this.status.port, browserId,
      (snapshot) => {
        this.status.connected = snapshot.connected
        this.status.targetCount = snapshot.targetCount
        this.emit()
      },
      (error) => {
        this.status.lastError = error.message
        this.status.message = 'Codex 会话中断，正在尝试恢复'
        this.emit()
        void this.recoverActiveSession()
      }
    )
    this.watcher.setPayload(payload)
    if (this.activeThemeId) this.watcher.setMediaBindings(await this.store.getRuntimeMediaBindings(this.activeThemeId))
    return await this.watcher.start()
  }

  private async buildPayload(themeId: string): Promise<string> {
    const [profile, compiled, baseCss, homeLayoutCss, particleEffectsCss, renderer] = await Promise.all([
      this.store.get(themeId), this.store.compile(themeId),
      readFile(join(this.resourcesRoot, 'dream-skin.css'), 'utf8'),
      readFile(join(this.resourcesRoot, 'dream-home-layout.css'), 'utf8'),
      readFile(join(this.resourcesRoot, 'dream-particle-effects.css'), 'utf8'),
      readFile(join(this.resourcesRoot, 'renderer-inject.js'), 'utf8')
    ])
    // Video media is bound through CDP; only image media belongs in the base64 art payload.
    const hero = profile.hero.source
      ? profile.hero.source.kind === 'image' ? compiled.assets[profile.hero.source.asset] : TRANSPARENT_PNG
      : profile.hero.sourceImage ? compiled.assets[profile.hero.sourceImage] : TRANSPARENT_PNG
    const fontCss = await buildRuntimeFontCss(profile, compiled.assets, this.resourcesRoot)
    const css = `${baseCss}\n${homeLayoutCss}\n${particleEffectsCss}\n${fontCss}\n${buildDynamicThemeCss(profile, compiled.assets)}\n`
    const icons = Object.fromEntries(Object.entries(profile.icons).map(([slot, source]) => [slot,
      source.kind === 'asset' ? { dataUrl: compiled.assets[source.asset] } : { name: source.name }
    ]))
    const { overlay, ...conversationBackground } = profile.conversationBackground
    const windowBackground = profile.windowBackground
    const windowBackgroundSource = windowBackground.source
    const composerMelody = profile.decorations.composerMelody
    const conversationOverlayStyle = buildConversationOverlayStyle(overlay)
    const windowBackgroundStyle = {
      background: paintToCss(windowBackground.paint),
      opacity: String(windowBackground.opacity),
      objectPosition: `${windowBackground.focus.x * 100}% ${windowBackground.focus.y * 100}%`,
      transform: `scale(${windowBackground.scale}) ${mediaFlipCssTransform(windowBackground.mediaTransform)}`
    }
    const windowBackgroundMasks = windowBackground.masks.map((mask) => ({
      id: mask.id,
      visible: mask.visible,
      style: buildBackgroundOverlayStyle(mask)
    }))
    const runtimeConfig = {
      themeId: profile.id,
      media: {
        hero: profile.hero.source ? { asset: profile.hero.source.asset, kind: profile.hero.source.kind, mimeType: profile.hero.source.mimeType, playback: profile.hero.playback, transform: profile.hero.mediaTransform } : null,
        polaroid: profile.polaroid.source ? { asset: profile.polaroid.source.asset, kind: profile.polaroid.source.kind, mimeType: profile.polaroid.source.mimeType, playback: profile.polaroid.playback, transform: profile.polaroid.mediaTransform } : null,
        conversationBackground: profile.conversationBackground.source
          ? { ...conversationBackground, overlayStyle: conversationOverlayStyle, kind: profile.conversationBackground.source.kind, mimeType: profile.conversationBackground.source.mimeType, asset: profile.conversationBackground.source.asset, dataUrl: profile.conversationBackground.source.kind === 'image' ? compiled.assets[profile.conversationBackground.source.asset] : null }
          : { ...conversationBackground, overlayStyle: conversationOverlayStyle, dataUrl: null },
        windowBackground: windowBackgroundSource
          ? { visible: windowBackground.visible, mode: windowBackground.mode, backgroundStyle: windowBackgroundStyle, masks: windowBackgroundMasks, kind: windowBackgroundSource.kind, mimeType: windowBackgroundSource.mimeType, asset: windowBackgroundSource.asset, dataUrl: windowBackgroundSource.kind === 'image' ? compiled.assets[windowBackgroundSource.asset] : null }
          : { visible: windowBackground.visible, mode: windowBackground.mode, backgroundStyle: windowBackgroundStyle, masks: windowBackgroundMasks, dataUrl: null }
      },
      icons,
      decorations: {
        ...profile.decorations,
        composerMelody: {
          ...composerMelody,
          dataUrl: composerMelody.source ? compiled.assets[composerMelody.source.asset] ?? null : null
        }
      },
      particleViewportTop: PARTICLE_VIEWPORT_TOP,
      sparkleIconSlot: particleEffectIconSlot(profile.decorations.sparkles.effect),
      sparkleParticles: createSparkleParticles(profile.decorations.sparkles),
      sparklePolicy: resolveParticleRenderPolicy(profile.decorations.sparkles.performanceMode, profile.decorations.sparkles.count),
      composerBadge: profile.composerBadge,
      conversationBubbles: { visible: profile.conversationBubbles.visible },
      toolActivityBubbles: { visible: profile.toolActivityBubbles.visible },
      builtinGlyphs: BUILTIN_ICON_GLYPHS,
      actionFallbackBuiltins: HOME_ACTION_FALLBACK_BUILTINS,
      copy: { ...profile.copy, parts: splitHeadingTemplate(profile.copy.headingTemplate) },
      sidebarNavigation: SIDEBAR_NAV_ITEMS,
      actions: HOME_ACTIONS
    }
    const art = hero ?? TRANSPARENT_PNG
    const serializedConfig = JSON.stringify(runtimeConfig)
    const runtimeVersion = `studio-${createHash('sha256').update(renderer).update(css).update(art).update(serializedConfig).digest('hex').slice(0, 24)}`
    return renderer
      .replace('__DREAM_VERSION_JSON__', JSON.stringify(runtimeVersion))
      .replace('__DREAM_CSS_JSON__', JSON.stringify(css))
      .replace('__DREAM_ART_JSON__', JSON.stringify(art))
      .replace('__DREAM_CONFIG_JSON__', serializedConfig)
  }

  private async writeRuntimePayload(payload: string): Promise<void> {
    const directory = join(this.store.root, 'runtime')
    await mkdir(directory, { recursive: true })
    const temporary = join(directory, 'payload.js.tmp')
    const target = join(directory, 'payload.js')
    const backup = join(directory, 'payload.js.previous')
    await writeFile(temporary, payload, 'utf8')
    let hadTarget = false
    try {
      try { await rename(target, backup); hadTarget = true } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      await rename(temporary, target)
      if (hadTarget) await rm(backup, { force: true })
    } catch (error) {
      await rm(temporary, { force: true })
      if (hadTarget) await rename(backup, target).catch(() => undefined)
      throw error
    }
  }
  private readRuntimePayload(): Promise<string> { return readFile(join(this.store.root, 'runtime', 'payload.js'), 'utf8') }

  private async recoverActiveSession(): Promise<void> {
    if (this.recovering || !this.activeThemeId) return
    this.recovering = true
    const themeId = this.activeThemeId
    try {
      await this.enqueueOperation(() => this.recoverActiveSessionInternal(themeId))
    } finally { this.recovering = false }
  }

  private async recoverActiveSessionInternal(themeId: string): Promise<void> {
    try {
      this.patch('starting', '正在恢复 Codex 主题会话')
      const result = await this.bridge<StartResult>('Start', ['-Port', String(this.status.port), '-RestartExisting'], 65_000)
      const payload = await this.buildPayload(themeId)
      await this.writeRuntimePayload(payload)
      await this.replaceWatcher(result.browserId, payload)
      await this.writeSession(themeId, result.browserId)
      this.patch('active', 'Codex 主题会话已自动恢复')
    } catch (reason) {
      this.status.lastError = reason instanceof Error ? reason.message : String(reason)
      this.status.phase = 'error'
      this.status.message = '自动恢复失败，请重新启动主题'
      this.emit()
    }
  }

  private sessionPath(): string { return join(this.store.root, 'runtime', 'session.json') }
  private async writeSession(themeId: string, browserId: string): Promise<void> {
    const path = this.sessionPath()
    await mkdir(join(this.store.root, 'runtime'), { recursive: true })
    await writeFile(path, `${JSON.stringify({ version: 1, themeId, port: this.status.port, browserId }, null, 2)}\n`, 'utf8')
  }

  private bridge<T>(action: string, extra: string[] = [], timeoutMs?: number): Promise<T> {
    return runPowerShell<T>(join(this.resourcesRoot, 'studio-bridge.ps1'), ['-Action', action, '-StudioRoot', this.store.root, ...extra], timeoutMs)
  }
  private enqueueOperation<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operationTail.then(operation)
    this.operationTail = next.then(() => undefined, () => undefined)
    return next
  }
  private patch(phase: RuntimePhase, message: string): void { this.status.phase = phase; this.status.message = message; if (phase !== 'error') this.status.lastError = null; this.emit() }
  private fail(reason: unknown): Error { const error = reason instanceof Error ? reason : new Error(String(reason)); this.status.phase = 'error'; this.status.connected = false; this.status.lastError = error.message; this.status.message = '操作失败'; this.emit(); return error }
  private emit(): void { this.onStatus(this.getStatus()) }
}
