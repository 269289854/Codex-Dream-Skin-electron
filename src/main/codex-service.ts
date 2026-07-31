import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CodexDetection, RuntimePhase, RuntimeStatus, SupportedDesktopPlatform } from '../shared/contracts'
import { paintToCss } from '../shared/appearance'
import { buildBackgroundOverlayStyle, buildConversationOverlayStyle } from '../shared/conversation-overlay'
import { iconGifPosterAssetKey } from '../shared/icon-assets'
import type { Fence } from '../shared/geometry'
import { BUILTIN_ICON_GLYPHS } from '../shared/icon-glyphs'
import { PARTICLE_VIEWPORT_TOP, createSparkleParticles, particleEffectIconSlot, resolveParticleCyclePositionPolicy, resolveParticleRenderPolicy } from '../shared/particle-effects'
import { SIDEBAR_NAV_ITEMS } from '../shared/sidebar-layout'
import { ACCOUNT_MENU_ITEMS, buildAccountMenuBackgroundStyle } from '../shared/account-menu'
import { getPolaroidLayout, polaroidShadowFilter } from '../shared/polaroid'
import { mediaFlipCssTransform } from '../shared/media'
import { resolveConversationBubbles } from '../shared/conversation-bubbles'
import type { ThemeProfile } from '../shared/theme'
import { HOME_ACTION_FALLBACK_BUILTINS, HOME_ACTIONS, splitHeadingTemplate } from '../shared/home-layout'
import { buildThemeVariableDeclarations } from '../shared/runtime-theme'
import { CdpWatcher, type CdpMediaBinding, type CdpSnapshot } from './cdp-watcher'
import type { ProfileStore } from './profile-store'
import { buildRuntimeFontCss } from './theme-fonts'
import { budgetDataUrls } from './embedded-assets'
import {
  CodexInstallationIdentityError,
  type CodexPlatformDriver,
  type CodexRestoreResult,
  type CodexStartResult
} from './codex-platform'

interface RuntimePayload { script: string; version: string }
interface RuntimeSessionV1 { version: 1; themeId: string; port: number; browserId: string }
interface RuntimeSessionV2 extends Omit<RuntimeSessionV1, 'version'> {
  version: 2
  platform: SupportedDesktopPlatform
  installationId: string
}
interface RestoredRuntimeSessionMarker {
  version: 1
  sessionFingerprint: string
  restoredAt: string
}
const LEGACY_MAC_INSTALLATION_ID = 'com.openai.codex:2DC432GLL2'
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
  private activeSession: CodexStartResult | null = null
  private activePayload: RuntimePayload | null = null
  private activeMediaBindings: CdpMediaBinding[] = []
  private sessionGeneration = 0
  private activeSessionGeneration: number | null = null
  private recoveringGeneration: number | null = null
  private operationTail: Promise<void> = Promise.resolve()
  private status: RuntimeStatus = {
    phase: 'idle', port: 9335, connected: false, targetCount: 0, codexVersion: null,
    backupAvailable: false, lastError: null, message: '等待检测 Codex'
  }

  constructor(
    private readonly store: ProfileStore,
    private readonly resourcesRoot: string,
    private readonly platformDriver: CodexPlatformDriver,
    private readonly studioVersion: string,
    private readonly onStatus: (status: RuntimeStatus) => void
  ) {}

  getStatus(): RuntimeStatus { return { ...this.status } }
  isActive(): boolean { return this.status.phase === 'active' || this.status.phase === 'injecting' || this.status.phase === 'starting' }

  async resume(): Promise<void> {
    const generation = this.beginSessionIntent()
    return this.enqueueOperation(() => this.resumeInternal(generation))
  }

  private async resumeInternal(generation: number): Promise<void> {
    let detection: CodexDetection
    try {
      detection = await this.platformDriver.detect()
      if (!this.isCurrentGeneration(generation)) return
      this.status.codexVersion = detection.version
      this.status.backupAvailable = detection.backupAvailable
    } catch (reason) {
      if (!this.isCurrentGeneration(generation)) return
      this.status.lastError = reason instanceof Error ? reason.message : String(reason)
      this.patch('error', '启动时无法检测官方 Codex 应用')
      return
    }

    let sessionContent: Buffer
    try {
      sessionContent = await readFile(this.sessionPath())
      if (!this.isCurrentGeneration(generation)) return
    } catch (reason) {
      if (!this.isCurrentGeneration(generation)) return
      if ((reason as NodeJS.ErrnoException).code === 'ENOENT') {
        await rm(this.restoredSessionMarkerPath(), { force: true }).catch(() => undefined)
        const message = detection.backupAvailable
          ? '检测到可恢复的 Codex 配置备份'
          : detection.running ? '已找到 Codex，当前正在运行' : '已找到 Codex'
        this.patch('ready', message)
        return
      }
      if (await this.hasMatchingRestoredSessionMarker()) {
        await this.finishRestoredSessionResume(generation)
        return
      }
      this.status.lastError = reason instanceof Error ? reason.message : String(reason)
      this.patch('ready', '运行会话记录不可用，可重新启动或恢复')
      return
    }

    const sessionFingerprint = this.sessionFingerprint(sessionContent)
    if (await this.hasMatchingRestoredSessionMarker(sessionFingerprint)) {
      await this.finishRestoredSessionResume(generation)
      return
    }

    let session: Partial<RuntimeSessionV1 | RuntimeSessionV2>
    try {
      session = JSON.parse(sessionContent.toString('utf8')) as typeof session
    } catch (reason) {
      if (!this.isCurrentGeneration(generation)) return
      this.status.lastError = reason instanceof Error ? reason.message : String(reason)
      this.patch('ready', '运行会话记录不可用，可重新启动或恢复')
      return
    }

    try {
      if ((session.version !== 1 && session.version !== 2) || !session.themeId || !session.browserId || !session.port) throw new Error('Saved runtime session is invalid.')
      if (session.version === 1 && this.platformDriver.platform !== 'win32') throw new Error('Legacy runtime sessions are only supported on Windows.')
      const migrateLegacyMacSession = session.version === 2 &&
        session.platform === 'darwin' &&
        detection.platform === 'darwin' &&
        session.installationId === LEGACY_MAC_INSTALLATION_ID
      const pathScopedMacSession = session.version === 2 &&
        session.platform === 'darwin' &&
        detection.platform === 'darwin' &&
        session.installationId?.startsWith(`${LEGACY_MAC_INSTALLATION_ID}:`)
      if (session.version === 2) {
        if (session.platform !== detection.platform ||
          (session.installationId !== detection.installationId && !migrateLegacyMacSession && !pathScopedMacSession)) {
          throw new Error('Saved runtime session belongs to another Codex installation.')
        }
      }
      await this.store.get(session.themeId)
      if (!this.isCurrentGeneration(generation)) return
      const expectedInstallationId = session.version === 2
        ? migrateLegacyMacSession ? detection.installationId : session.installationId
        : undefined
      const verified = expectedInstallationId
        ? await this.platformDriver.verifySession(session.port, session.browserId, detection, expectedInstallationId)
        : await this.platformDriver.verifySession(session.port, session.browserId, detection)
      if (!this.isCurrentGeneration(generation)) return
      this.patch('injecting', '正在恢复上次主题会话')
      const payload = await this.buildPayload(session.themeId)
      if (!this.isCurrentGeneration(generation)) return
      await this.writeRuntimePayload(payload.script)
      if (!this.isCurrentGeneration(generation)) return
      if (session.version === 1 || migrateLegacyMacSession) await this.writeSession(session.themeId, verified)
      if (!this.isCurrentGeneration(generation)) return
      this.status.port = verified.port
      this.status.codexVersion = verified.version
      this.activeThemeId = session.themeId
      this.activeSession = verified
      this.activeSessionGeneration = generation
      await this.replaceWatcher(verified.browserId, payload)
      if (!this.isCurrentGeneration(generation)) return
      this.patch('active', '已恢复上次主题会话')
    } catch (reason) {
      if (!this.isCurrentGeneration(generation)) return
      if (this.activeSessionGeneration === generation && this.watcher) {
        const watcher = this.watcher
        await watcher.stop(true).catch(() => undefined)
        if (this.watcher === watcher) this.watcher = null
      }
      if (!this.persistedSessionInstallationId(session)) {
        await rm(this.sessionPath(), { force: true })
      }
      this.clearActiveSession()
      this.status.lastError = reason instanceof Error ? reason.message : String(reason)
      this.patch('ready', detection.backupAvailable ? '上次主题会话已结束，可恢复配置或重新启动' : '上次主题会话已结束，可重新启动')
    }
  }

  async detect(): Promise<CodexDetection> { return this.enqueueOperation(() => this.detectInternal()) }

  private async detectInternal(): Promise<CodexDetection> {
    const preserveActiveSession = this.hasCurrentActiveSession()
    this.patch(preserveActiveSession ? 'active' : 'detecting', '正在检测官方 Codex 应用')
    try {
      const detection = await this.platformDriver.detect()
      this.status.codexVersion = detection.version
      this.status.backupAvailable = detection.backupAvailable
      const active = preserveActiveSession && this.hasCurrentActiveSession()
      this.patch(active ? 'active' : 'ready', active
        ? 'Codex 检测完成，当前主题会话仍在运行'
        : detection.running ? '已找到 Codex，当前正在运行' : '已找到 Codex')
      return detection
    } catch (reason) {
      if (preserveActiveSession && this.hasCurrentActiveSession()) {
        throw this.reportActiveFailure(reason, 'Codex 检测失败，当前主题会话仍在运行')
      }
      throw this.fail(reason)
    }
  }

  async installTheme(themeId: string): Promise<RuntimeStatus> {
    return this.enqueueOperation(async () => {
      await this.installThemeInternal(themeId)
      return this.getStatus()
    })
  }

  private async installThemeInternal(themeId: string): Promise<RuntimePayload> {
    const preserveActiveSession = this.hasCurrentActiveSession()
    this.patch(preserveActiveSession ? 'active' : 'installing', '正在生成并安装主题配置')
    try {
      const payload = await this.buildPayload(themeId)
      await this.writeRuntimePayload(payload.script)
      await this.platformDriver.applyConfig(join(this.store.themesRoot, themeId, 'theme.json'))
      this.status.backupAvailable = true
      const active = preserveActiveSession && this.hasCurrentActiveSession()
      this.patch(active ? 'active' : 'ready', active ? '主题配置已安装，当前主题会话仍在运行' : '主题配置已安装')
      return payload
    } catch (reason) {
      if (preserveActiveSession && this.hasCurrentActiveSession()) {
        throw this.reportActiveFailure(reason, '主题配置安装失败，当前主题会话仍在运行')
      }
      throw this.fail(reason)
    }
  }

  async start(themeId: string, restartExisting: boolean): Promise<RuntimeStatus> {
    const continueActiveSession = this.hasCurrentActiveSession()
    const expectedInstallationId = continueActiveSession ? this.activeSession?.installationId : undefined
    const generation = this.beginSessionIntent()
    if (continueActiveSession) this.activeSessionGeneration = generation
    return this.enqueueOperation(() => this.startInternal(themeId, restartExisting, generation, expectedInstallationId))
  }

  private async startInternal(
    themeId: string,
    restartExisting: boolean,
    generation: number,
    expectedInstallationId?: string
  ): Promise<RuntimeStatus> {
    if (!this.isCurrentGeneration(generation)) return this.getStatus()
    const previousThemeId = this.activeThemeId
    const previousSession = this.activeSession
    const previousPayload = this.activePayload
    const previousMediaBindings = this.activeMediaBindings.map((binding) => ({ ...binding }))
    const previousWatcher = previousThemeId && previousSession && previousPayload &&
      this.isActiveSession(previousThemeId, generation)
      ? this.watcher
      : null
    let runtimeChanged = false
    let configChanged = false
    try {
      this.patch(previousWatcher ? 'starting' : 'installing', '正在生成并安装主题配置')
      const payload = await this.buildPayload(themeId)
      if (!this.isCurrentGeneration(generation)) return this.getStatus()
      await this.writeRuntimePayload(payload.script)
      runtimeChanged = true
      if (!this.isCurrentGeneration(generation)) return this.getStatus()
      await this.platformDriver.applyConfig(join(this.store.themesRoot, themeId, 'theme.json'))
      configChanged = true
      this.status.backupAvailable = true
      if (!this.isCurrentGeneration(generation)) return this.getStatus()
      this.patch('starting', '正在启动 Codex 本地主题会话')
      const result = await this.platformDriver.start(this.status.port, restartExisting, expectedInstallationId)
      if (!this.isCurrentGeneration(generation)) return this.getStatus()
      await this.writeSession(themeId, result)
      if (!this.isCurrentGeneration(generation)) return this.getStatus()
      this.status.port = result.port
      this.status.codexVersion = result.version
      this.activeThemeId = themeId
      this.activeSession = result
      this.activeSessionGeneration = generation
      const snapshot = await this.replaceWatcher(result.browserId, payload)
      if (!this.isCurrentGeneration(generation)) return this.getStatus()
      this.patch('active', `主题已注入 ${snapshot.targetCount} 个 Codex 页面`)
      return this.getStatus()
    } catch (reason) {
      if (!this.isCurrentGeneration(generation)) return this.getStatus()
      if (previousWatcher && previousThemeId && previousSession && previousPayload) {
        if (!configChanged) {
          if (runtimeChanged) {
            try {
              await this.writeRuntimePayload(previousPayload.script)
            } catch (rollbackReason) {
              const original = reason instanceof Error ? reason.message : String(reason)
              const rollback = rollbackReason instanceof Error ? rollbackReason.message : String(rollbackReason)
              throw this.reportActiveFailure(new Error(`${original}；运行时载荷回滚失败: ${rollback}`), '新主题启动失败，原主题会话仍在运行')
            }
          }
          throw this.reportActiveFailure(reason, '新主题启动失败，原主题会话仍在运行')
        }
        try {
          await this.rollbackStartedSession(
            previousThemeId,
            previousSession,
            previousPayload,
            previousMediaBindings,
            generation
          )
        } catch (rollbackReason) {
          if (!this.isCurrentGeneration(generation)) return this.getStatus()
          await this.discardIncompleteSession()
          const original = reason instanceof Error ? reason.message : String(reason)
          const rollback = rollbackReason instanceof Error ? rollbackReason.message : String(rollbackReason)
          throw this.fail(new Error(`${original}；原主题会话回滚失败: ${rollback}`))
        }
        if (!this.isCurrentGeneration(generation)) return this.getStatus()
        throw this.reportActiveFailure(reason, '新主题启动失败，已恢复原主题会话')
      }
      await this.discardIncompleteSession()
      throw this.fail(reason)
    }
  }

  async reinject(themeId: string): Promise<RuntimeStatus> {
    const continueActiveSession = this.hasCurrentActiveSession()
    const generation = this.beginSessionIntent()
    if (continueActiveSession) this.activeSessionGeneration = generation
    return this.enqueueOperation(() => this.reinjectInternal(themeId, generation))
  }

  private async reinjectInternal(themeId: string, generation: number): Promise<RuntimeStatus> {
    if (!this.isCurrentGeneration(generation)) return this.getStatus()
    const watcher = this.watcher
    const previousThemeId = this.activeThemeId
    const previousSession = this.activeSession
    const previousPayload = this.activePayload
    const previousMediaBindings = this.activeMediaBindings.map((binding) => ({ ...binding }))
    if (!watcher || !previousThemeId || !previousSession || !previousPayload ||
      !this.isActiveSession(previousThemeId, generation)) {
      throw this.fail(new Error('当前没有活动的 Codex 主题会话。'))
    }
    let runtimeChanged = false
    try {
      this.patch('injecting', '正在重新编译并注入主题')
      const payload = await this.buildPayload(themeId)
      if (!this.isActiveSession(previousThemeId, generation)) return this.getStatus()
      const mediaBindings = await this.store.getRuntimeMediaBindings(themeId)
      if (!this.isActiveSession(previousThemeId, generation)) return this.getStatus()
      await this.writeRuntimePayload(payload.script)
      runtimeChanged = true
      if (!this.isActiveSession(previousThemeId, generation)) return this.getStatus()
      watcher.setPayload(payload.script, payload.version)
      watcher.setMediaBindings(mediaBindings)
      const snapshot = await watcher.inject()
      if (!this.isActiveSession(previousThemeId, generation)) return this.getStatus()
      await this.writeSession(themeId, previousSession)
      if (!this.isActiveSession(previousThemeId, generation)) return this.getStatus()
      this.activeThemeId = themeId
      this.activePayload = payload
      this.activeMediaBindings = mediaBindings.map((binding) => ({ ...binding }))
      this.activeSessionGeneration = generation
      this.patch('active', `主题已重新注入 ${snapshot.targetCount} 个页面`)
      return this.getStatus()
    } catch (reason) {
      if (!this.isCurrentGeneration(generation)) return this.getStatus()
      if (!runtimeChanged) throw this.reportActiveFailure(reason, '重新注入失败，原主题会话仍在运行')
      try {
        await this.rollbackReinjection(previousThemeId, previousSession, previousPayload, previousMediaBindings, watcher, generation)
      } catch (rollbackReason) {
        if (!this.isCurrentGeneration(generation)) return this.getStatus()
        await watcher.stop(true).catch(() => undefined)
        if (this.watcher === watcher) this.watcher = null
        this.clearActiveSession()
        await rm(this.sessionPath(), { force: true }).catch(() => undefined)
        const original = reason instanceof Error ? reason.message : String(reason)
        const rollback = rollbackReason instanceof Error ? rollbackReason.message : String(rollbackReason)
        throw this.fail(new Error(`${original}；原主题回滚失败: ${rollback}`))
      }
      if (!this.isCurrentGeneration(generation)) return this.getStatus()
      throw this.reportActiveFailure(reason, '重新注入失败，已恢复原主题会话')
    }
  }

  async verify(): Promise<RuntimeStatus> {
    return this.enqueueOperation(() => this.verifyInternal())
  }

  private async verifyInternal(): Promise<RuntimeStatus> {
    if (!this.watcher) throw this.fail(new Error('当前没有活动的 Codex 主题会话。'))
    try {
      const snapshot = await this.watcher.verify()
      if (snapshot.connected) {
        this.patch('active', `验证通过，共 ${snapshot.targetCount} 个页面`)
        return this.getStatus()
      }
      this.patch('injecting', '检测到旧版或不完整主题，正在自动修复')
      const repaired = await this.watcher.inject()
      this.patch('active', `主题已自动修复，共 ${repaired.targetCount} 个页面`)
      return this.getStatus()
    } catch (reason) { throw this.fail(reason) }
  }

  async stop(): Promise<RuntimeStatus> {
    this.beginSessionIntent()
    return this.enqueueOperation(() => this.stopInternal())
  }

  private async stopInternal(): Promise<RuntimeStatus> {
    this.clearActiveSession()
    await rm(this.sessionPath(), { force: true })
    if (this.watcher) await this.watcher.stop(true)
    this.watcher = null
    this.patch('stopped', '已停止注入并移除当前页面主题')
    return this.getStatus()
  }

  async restore(restartCodex: boolean): Promise<RuntimeStatus> {
    const activeInstallationId = restartCodex ? this.activeSession?.installationId : undefined
    this.beginSessionIntent()
    return this.enqueueOperation(() => this.restoreInternal(restartCodex, activeInstallationId))
  }

  private async restoreInternal(requestedRestart: boolean, activeInstallationId?: string): Promise<RuntimeStatus> {
    this.patch('restoring', '正在恢复 Codex 原始配置')
    try {
      let restartCodex = requestedRestart
      let expectedInstallationId = activeInstallationId
      let backupArchiveWarning: string | null = null
      let restartWarning: string | null = null
      let diagnostic: string | null = null
      const sessionFingerprint = await this.persistedSessionFingerprint()
      if (restartCodex && !expectedInstallationId) {
        try {
          expectedInstallationId = await this.readPersistedInstallationId()
        } catch (reason) {
          restartCodex = false
          restartWarning = '保存的运行会话不可用，未自动重启 Codex'
          diagnostic = reason instanceof Error ? reason.message : String(reason)
        }
      }
      if (this.watcher) await this.watcher.stop(true)
      this.watcher = null
      let restoreResult: CodexRestoreResult
      try {
        restoreResult = await this.platformDriver.restore(restartCodex, expectedInstallationId)
      } catch (reason) {
        if (!restartCodex || !expectedInstallationId || !(reason instanceof CodexInstallationIdentityError)) throw reason
        restartCodex = false
        restartWarning = '保存的 Codex 安装身份已失效，未自动重启 Codex'
        diagnostic = reason.message
        restoreResult = await this.platformDriver.restore(false)
      }
      if (!restoreResult.configRestored) {
        this.status.backupAvailable = false
        const restartFailure = restoreResult.restart.status === 'failed'
          ? `；Codex 自动重启也失败: ${restoreResult.restart.error}`
          : ''
        throw new Error(`未找到可恢复的 Codex 配置备份${restartFailure}`)
      }
      if (restoreResult.backupArchive.status === 'failed') {
        backupArchiveWarning = 'Codex 配置已恢复，但配置备份归档失败'
        diagnostic = [diagnostic, restoreResult.backupArchive.error].filter((part): part is string => part !== null).join('；')
      }
      if (restoreResult.restart.status === 'failed') {
        restartWarning = 'Codex 配置已恢复，但自动重启失败'
        diagnostic = [diagnostic, restoreResult.restart.error].filter((part): part is string => part !== null).join('；')
      }
      let markerWritten = false
      let markerError: string | null = null
      if (sessionFingerprint) {
        try {
          await this.writeRestoredSessionMarker(sessionFingerprint)
          markerWritten = true
        } catch (reason) {
          markerError = reason instanceof Error ? reason.message : String(reason)
        }
      }
      this.clearActiveSession()
      this.status.backupAvailable = restoreResult.backupArchive.status === 'failed'
        ? restoreResult.backupArchive.backupAvailable
        : false
      let cleanupError: string | null = null
      try {
        await this.retirePersistedSession()
      } catch (reason) {
        cleanupError = reason instanceof Error ? reason.message : String(reason)
      }
      const message = [
        restoreResult.restart.status === 'succeeded' ? '已恢复配置并正常重启 Codex' : '已恢复 Codex 配置',
        backupArchiveWarning,
        restartWarning,
        cleanupError
          ? markerWritten
            ? '运行会话记录清理失败，下次启动将根据完成标记忽略该记录'
            : '运行会话记录清理失败，下次启动将重新验证该记录'
          : null
      ].filter((part): part is string => part !== null).join('；')
      const details = [
        diagnostic,
        cleanupError ? markerError : null,
        cleanupError
      ].filter((part): part is string => part !== null).join('；') || null
      this.patch('stopped', message, details)
      return this.getStatus()
    } catch (reason) { throw this.fail(reason) }
  }

  private async replaceWatcher(
    browserId: string,
    payload: RuntimePayload,
    mediaBindings?: CdpMediaBinding[]
  ): Promise<CdpSnapshot> {
    if (this.watcher) {
      const previousWatcher = this.watcher
      await previousWatcher.stop(true)
      if (this.watcher === previousWatcher) this.watcher = null
    }
    this.patch('injecting', '已连接 Codex，正在注入主题')
    const watcher = new CdpWatcher(this.status.port, browserId,
      (snapshot) => {
        if (this.watcher !== watcher) return
        this.status.connected = snapshot.connected
        this.status.targetCount = snapshot.targetCount
        this.emit()
      },
      (error) => {
        if (this.watcher !== watcher || !this.activeThemeId ||
          this.activeSessionGeneration === null ||
          this.activeSessionGeneration !== this.sessionGeneration) return
        const generation = this.activeSessionGeneration
        this.status.lastError = error.message
        this.status.message = 'Codex 会话中断，正在尝试恢复'
        this.emit()
        void this.recoverActiveSession(generation)
      }
    )
    this.watcher = watcher
    watcher.setPayload(payload.script, payload.version)
    const resolvedMediaBindings = mediaBindings
      ? mediaBindings.map((binding) => ({ ...binding }))
      : this.activeThemeId ? await this.store.getRuntimeMediaBindings(this.activeThemeId) : []
    watcher.setMediaBindings(resolvedMediaBindings)
    const snapshot = await watcher.start()
    this.activePayload = payload
    this.activeMediaBindings = resolvedMediaBindings.map((binding) => ({ ...binding }))
    return snapshot
  }

  private async buildPayload(themeId: string): Promise<RuntimePayload> {
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
    const fontCss = await buildRuntimeFontCss(profile, compiled.assets, this.resourcesRoot, budgetDataUrls(compiled.assets))
    const css = `${baseCss}\n${homeLayoutCss}\n${particleEffectsCss}\n${fontCss}\n${buildDynamicThemeCss(profile, compiled.assets)}\n`
    const icons = Object.fromEntries(Object.entries(profile.icons).map(([slot, source]) => [slot,
      source.kind === 'asset'
        ? {
            dataUrl: compiled.assets[source.asset],
            posterDataUrl: source.asset.toLowerCase().endsWith('.gif') ? compiled.assets[iconGifPosterAssetKey(source.asset)] : undefined
          }
        : { name: source.name }
    ]))
    const { overlay, ...conversationBackground } = profile.conversationBackground
    const windowBackground = profile.windowBackground
    const windowBackgroundSource = windowBackground.source
    const accountMenuBackground = profile.accountMenuBackground
    const accountMenuBackgroundSource = accountMenuBackground.source
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
      videoPlayback: profile.videoPlayback,
      media: {
        hero: profile.hero.source ? { asset: profile.hero.source.asset, kind: profile.hero.source.kind, mimeType: profile.hero.source.mimeType, playback: profile.hero.playback, transform: profile.hero.mediaTransform } : null,
        polaroid: profile.polaroid.source ? { asset: profile.polaroid.source.asset, kind: profile.polaroid.source.kind, mimeType: profile.polaroid.source.mimeType, playback: profile.polaroid.playback, transform: profile.polaroid.mediaTransform } : null,
        conversationBackground: profile.conversationBackground.source
          ? { ...conversationBackground, overlayStyle: conversationOverlayStyle, kind: profile.conversationBackground.source.kind, mimeType: profile.conversationBackground.source.mimeType, asset: profile.conversationBackground.source.asset, dataUrl: profile.conversationBackground.source.kind === 'image' ? compiled.assets[profile.conversationBackground.source.asset] : null }
          : { ...conversationBackground, overlayStyle: conversationOverlayStyle, dataUrl: null },
        windowBackground: windowBackgroundSource
          ? { visible: windowBackground.visible, mode: windowBackground.mode, backgroundStyle: windowBackgroundStyle, masks: windowBackgroundMasks, kind: windowBackgroundSource.kind, mimeType: windowBackgroundSource.mimeType, asset: windowBackgroundSource.asset, dataUrl: windowBackgroundSource.kind === 'image' ? compiled.assets[windowBackgroundSource.asset] : null }
          : { visible: windowBackground.visible, mode: windowBackground.mode, backgroundStyle: windowBackgroundStyle, masks: windowBackgroundMasks, dataUrl: null },
        accountMenuBackground: accountMenuBackgroundSource
          ? { mode: accountMenuBackground.mode, style: buildAccountMenuBackgroundStyle(accountMenuBackground), kind: accountMenuBackgroundSource.kind, mimeType: accountMenuBackgroundSource.mimeType, asset: accountMenuBackgroundSource.asset, dataUrl: compiled.assets[accountMenuBackgroundSource.asset] ?? null }
          : { mode: accountMenuBackground.mode, style: buildAccountMenuBackgroundStyle(accountMenuBackground), dataUrl: null }
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
      sparkleCyclePositionPolicy: resolveParticleCyclePositionPolicy(profile.decorations.sparkles.effect),
      composerBadge: profile.composerBadge,
      brandSignature: {
        ...profile.brandSignature,
        dataUrl: profile.brandSignature.source ? compiled.assets[profile.brandSignature.source.asset] ?? null : null
      },
      conversationBubbles: resolveConversationBubbles(profile.conversationBubbles, compiled.assets),
      toolActivityBubbles: { visible: profile.toolActivityBubbles.visible },
      builtinGlyphs: BUILTIN_ICON_GLYPHS,
      actionFallbackBuiltins: HOME_ACTION_FALLBACK_BUILTINS,
      copy: { ...profile.copy, parts: splitHeadingTemplate(profile.copy.headingTemplate) },
      sidebarNavigation: SIDEBAR_NAV_ITEMS,
      accountMenu: ACCOUNT_MENU_ITEMS,
      actions: HOME_ACTIONS
    }
    const art = hero ?? TRANSPARENT_PNG
    const serializedConfig = JSON.stringify(runtimeConfig)
    const runtimeVersion = `studio-${createHash('sha256').update(this.studioVersion).update('\0').update(renderer).update(css).update(art).update(serializedConfig).digest('hex').slice(0, 24)}`
    const script = renderer
      .replace('__DREAM_VERSION_JSON__', JSON.stringify(runtimeVersion))
      .replace('__DREAM_CSS_JSON__', JSON.stringify(css))
      .replace('__DREAM_ART_JSON__', JSON.stringify(art))
      .replace('__DREAM_CONFIG_JSON__', serializedConfig)
    return { script, version: runtimeVersion }
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
  private async recoverActiveSession(generation: number): Promise<void> {
    const themeId = this.activeThemeId
    if (this.recoveringGeneration === generation || !themeId || !this.isActiveSession(themeId, generation)) return
    this.recoveringGeneration = generation
    try {
      await this.enqueueOperation(() => this.recoverActiveSessionInternal(themeId, generation))
    } finally {
      if (this.recoveringGeneration === generation) this.recoveringGeneration = null
    }
  }

  private async recoverActiveSessionInternal(themeId: string, generation: number): Promise<void> {
    if (!this.isActiveSession(themeId, generation)) return
    const previousSession = this.activeSession
    if (!previousSession) return
    try {
      this.patch('starting', '正在恢复 Codex 主题会话')
      const result = await this.platformDriver.start(
        this.status.port,
        true,
        previousSession.installationId
      )
      if (!this.isActiveSession(themeId, generation)) return
      const payload = await this.buildPayload(themeId)
      if (!this.isActiveSession(themeId, generation)) return
      await this.writeRuntimePayload(payload.script)
      if (!this.isActiveSession(themeId, generation)) return
      await this.writeSession(themeId, result)
      if (!this.isActiveSession(themeId, generation)) return
      this.status.port = result.port
      this.status.codexVersion = result.version
      this.activeSession = result
      await this.replaceWatcher(result.browserId, payload)
      if (!this.isActiveSession(themeId, generation)) return
      this.patch('active', 'Codex 主题会话已自动恢复')
    } catch (reason) {
      if (!this.isActiveSession(themeId, generation)) return
      await this.discardIncompleteSession()
      this.status.lastError = reason instanceof Error ? reason.message : String(reason)
      this.status.phase = 'error'
      this.status.message = '自动恢复失败，请重新启动主题'
      this.emit()
    }
  }

  private async rollbackStartedSession(
    themeId: string,
    session: CodexStartResult,
    payload: RuntimePayload,
    mediaBindings: CdpMediaBinding[],
    generation: number
  ): Promise<void> {
    if (this.watcher) {
      const watcher = this.watcher
      await watcher.stop(true)
      if (this.watcher === watcher) this.watcher = null
    }
    await this.writeRuntimePayload(payload.script)
    await this.platformDriver.applyConfig(join(this.store.themesRoot, themeId, 'theme.json'))
    const restored = await this.platformDriver.start(
      session.port,
      true,
      session.installationId
    )
    if (!this.isCurrentGeneration(generation)) return
    await this.writeSession(themeId, restored)
    if (!this.isCurrentGeneration(generation)) return
    this.status.port = restored.port
    this.status.codexVersion = restored.version
    this.activeThemeId = themeId
    this.activeSession = restored
    this.activeSessionGeneration = generation
    await this.replaceWatcher(restored.browserId, payload, mediaBindings)
  }

  private async discardIncompleteSession(): Promise<void> {
    if (this.watcher) {
      const watcher = this.watcher
      await watcher.stop(true).catch(() => undefined)
      if (this.watcher === watcher) this.watcher = null
    }
    this.clearActiveSession()
    await rm(this.sessionPath(), { force: true })
  }

  private async rollbackReinjection(
    themeId: string,
    session: CodexStartResult,
    payload: RuntimePayload,
    mediaBindings: CdpMediaBinding[],
    watcher: CdpWatcher,
    generation: number
  ): Promise<void> {
    await this.writeRuntimePayload(payload.script)
    watcher.setPayload(payload.script, payload.version)
    watcher.setMediaBindings(mediaBindings)
    await watcher.inject()
    await this.writeSession(themeId, session)
    if (!this.isCurrentGeneration(generation)) return
    this.activeThemeId = themeId
    this.activeSession = session
    this.activePayload = payload
    this.activeMediaBindings = mediaBindings.map((binding) => ({ ...binding }))
    this.activeSessionGeneration = generation
  }

  private sessionPath(): string { return join(this.store.root, 'runtime', 'session.json') }
  private restoredSessionMarkerPath(): string { return join(this.store.root, 'runtime', 'session.restore-completed.json') }
  private async retirePersistedSession(): Promise<void> {
    await rm(this.sessionPath(), { force: true })
    await rm(this.restoredSessionMarkerPath(), { force: true })
  }
  private sessionFingerprint(content: Uint8Array): string {
    return `sha256:${createHash('sha256').update(content).digest('hex')}`
  }
  private async persistedSessionFingerprint(): Promise<string | undefined> {
    try {
      return this.sessionFingerprint(await readFile(this.sessionPath()))
    } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      try {
        const metadata = await stat(this.sessionPath())
        return `metadata:${metadata.size}:${metadata.mtimeMs}:${metadata.ctimeMs}`
      } catch {
        return undefined
      }
    }
  }
  private async hasMatchingRestoredSessionMarker(sessionFingerprint?: string): Promise<boolean> {
    const fingerprint = sessionFingerprint ?? await this.persistedSessionFingerprint()
    if (!fingerprint) return false
    try {
      const marker = JSON.parse(await readFile(this.restoredSessionMarkerPath(), 'utf8')) as Partial<RestoredRuntimeSessionMarker>
      return marker.version === 1 && marker.sessionFingerprint === fingerprint
    } catch {
      return false
    }
  }
  private async writeRestoredSessionMarker(sessionFingerprint: string): Promise<void> {
    if (await this.hasMatchingRestoredSessionMarker(sessionFingerprint)) return
    const path = this.restoredSessionMarkerPath()
    const temporary = `${path}.tmp`
    const marker: RestoredRuntimeSessionMarker = {
      version: 1,
      sessionFingerprint,
      restoredAt: new Date().toISOString()
    }
    await mkdir(join(this.store.root, 'runtime'), { recursive: true })
    try {
      await writeFile(temporary, `${JSON.stringify(marker, null, 2)}\n`, 'utf8')
      await rm(path, { force: true })
      await rename(temporary, path)
    } catch (reason) {
      await rm(temporary, { force: true }).catch(() => undefined)
      throw reason
    }
  }
  private async finishRestoredSessionResume(generation: number): Promise<void> {
    let cleanupError: string | null = null
    try {
      await this.retirePersistedSession()
    } catch (reason) {
      cleanupError = reason instanceof Error ? reason.message : String(reason)
    }
    if (!this.isCurrentGeneration(generation)) return
    this.clearActiveSession()
    this.patch(
      'ready',
      cleanupError
        ? '已确认 Codex 配置恢复完成，已忽略无法清理的旧运行会话记录'
        : '已确认 Codex 配置恢复完成，旧运行会话记录已清理',
      cleanupError
    )
  }
  private async readPersistedInstallationId(): Promise<string | undefined> {
    let content: string
    try {
      content = await readFile(this.sessionPath(), 'utf8')
    } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw reason
    }
    let session: Partial<RuntimeSessionV1 | RuntimeSessionV2>
    try {
      session = JSON.parse(content) as typeof session
    } catch {
      throw new Error('Saved runtime session is invalid.')
    }
    if (session.version === 1 && this.platformDriver.platform === 'win32') return undefined
    const installationId = this.persistedSessionInstallationId(session)
    if (!installationId) throw new Error('Saved runtime session does not contain a verified installation identity.')
    return installationId
  }
  private persistedSessionInstallationId(session: Partial<RuntimeSessionV1 | RuntimeSessionV2>): string | undefined {
    if (session.version !== 2 ||
      session.platform !== this.platformDriver.platform ||
      !session.themeId ||
      !session.browserId ||
      !Number.isInteger(session.port) ||
      typeof session.installationId !== 'string' ||
      session.installationId.length === 0) return undefined
    if (session.platform === 'darwin' && !session.installationId.startsWith(`${LEGACY_MAC_INSTALLATION_ID}:`)) return undefined
    return session.installationId
  }
  private async writeSession(themeId: string, result: CodexStartResult): Promise<void> {
    const path = this.sessionPath()
    const temporary = `${path}.tmp`
    await mkdir(join(this.store.root, 'runtime'), { recursive: true })
    const session: RuntimeSessionV2 = {
      version: 2,
      themeId,
      port: result.port,
      browserId: result.browserId,
      platform: result.platform,
      installationId: result.installationId
    }
    try {
      await rm(this.restoredSessionMarkerPath(), { force: true })
      await writeFile(temporary, `${JSON.stringify(session, null, 2)}\n`, 'utf8')
      await rename(temporary, path)
    } catch (reason) {
      await rm(temporary, { force: true }).catch(() => undefined)
      throw reason
    }
  }
  private beginSessionIntent(): number {
    this.sessionGeneration += 1
    return this.sessionGeneration
  }
  private isCurrentGeneration(generation: number): boolean { return this.sessionGeneration === generation }
  private hasCurrentActiveSession(): boolean {
    return this.status.phase !== 'error' &&
      this.activeThemeId !== null &&
      this.activeSession !== null &&
      this.watcher !== null &&
      this.activeSessionGeneration === this.sessionGeneration
  }
  private isActiveSession(themeId: string, generation: number): boolean {
    return this.isCurrentGeneration(generation) &&
      this.activeSessionGeneration === generation &&
      this.activeThemeId === themeId &&
      this.hasCurrentActiveSession()
  }
  private clearActiveSession(): void {
    this.activeThemeId = null
    this.activeSession = null
    this.activePayload = null
    this.activeMediaBindings = []
    this.activeSessionGeneration = null
  }
  private enqueueOperation<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operationTail.then(operation)
    this.operationTail = next.then(() => undefined, () => undefined)
    return next
  }
  private patch(phase: RuntimePhase, message: string, diagnostic: string | null = null): void {
    this.status.phase = phase
    this.status.message = message
    if (phase !== 'error') this.status.lastError = diagnostic
    this.emit()
  }
  private reportActiveFailure(reason: unknown, message: string): Error {
    const error = reason instanceof Error ? reason : new Error(String(reason))
    this.status.phase = 'active'
    this.status.lastError = error.message
    this.status.message = message
    this.emit()
    return error
  }
  private fail(reason: unknown): Error { const error = reason instanceof Error ? reason : new Error(String(reason)); this.status.phase = 'error'; this.status.connected = false; this.status.lastError = error.message; this.status.message = '操作失败'; this.emit(); return error }
  private emit(): void { this.onStatus(this.getStatus()) }
}
