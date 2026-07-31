import WebSocket from 'ws'

// Runtime CSS embeds selected font files as Base64. The sidebar now supports
// independent font slots, so the legacy 20 MB ceiling rejected valid themes
// before they could reach the verified Codex page.
export const MAX_THEME_PAYLOAD_BYTES = 64 * 1024 * 1024

interface CdpVersion { webSocketDebuggerUrl: string }
interface CdpTarget { id: string; type: string; url: string; webSocketDebuggerUrl: string }
export interface CdpMediaBinding { role: 'hero' | 'polaroid' | 'conversationBackground' | 'windowBackground'; path: string; mimeType: string }
type CdpCommand = (method: string, params: Record<string, unknown>) => Promise<unknown>

const CLEANUP_EXPRESSION = '(() => { const state = window.__CODEX_DREAM_SKIN_STATE__; if (state?.cleanup) return state.cleanup(); document.documentElement.classList.remove("codex-dream-skin", "dream-window-background-active"); document.getElementById("codex-dream-skin-style")?.remove(); document.getElementById("codex-dream-skin-chrome")?.remove(); document.getElementById("codex-dream-skin-window-background")?.remove(); return true; })()'
const RUNTIME_VERSION_PATTERN = /^studio-[0-9a-f]{24}$/
const CDP_UNAVAILABLE_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ECONNABORTED', 'EPIPE', 'UND_ERR_SOCKET'])
const CDP_UNAVAILABLE_MESSAGES = [
  /(?:No Codex page target remains open\.|没有仍保持打开的 Codex 页面目标。)/i,
  /CDP 会话(?:已结束|意外关闭)。/,
  /No target with given id/i,
  /Session closed/i,
  /Target (?:page )?closed/i,
  /Inspected target navigated or closed/i,
  /WebSocket (?:is not open|was closed|closed before)/i,
  /socket hang up/i
]

export function isCdpUnavailableError(reason: unknown): boolean {
  let current: unknown = reason
  const visited = new Set<unknown>()
  while (current && !visited.has(current)) {
    visited.add(current)
    if (typeof current === 'object') {
      const error = current as { code?: unknown; message?: unknown; cause?: unknown }
      if (typeof error.code === 'string' && CDP_UNAVAILABLE_CODES.has(error.code)) return true
      const message = error.message
      if (typeof message === 'string' && CDP_UNAVAILABLE_MESSAGES.some((pattern) => pattern.test(message))) return true
      current = error.cause
    } else {
      const message = current
      return typeof message === 'string' && CDP_UNAVAILABLE_MESSAGES.some((pattern) => pattern.test(message))
    }
  }
  return false
}

export function isThemeCdpTargetUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'app:' && url.searchParams.get('initialRoute') !== '/avatar-overlay'
  } catch {
    return false
  }
}

export function isSafeCdpWebSocketUrl(value: string, port: number, kind: 'page' | 'browser', id: string): boolean {
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || !/^[A-Za-z0-9._-]{1,200}$/.test(id)) return false
  try {
    const url = new URL(value)
    return url.protocol === 'ws:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) &&
      url.port === String(port) && !url.username && !url.password && !url.search && !url.hash &&
      url.pathname === `/devtools/${kind}/${id}`
  } catch { return false }
}

export interface CdpSnapshot {
  connected: boolean
  targetCount: number
}

export class CdpWatcher {
  private timer: NodeJS.Timeout | null = null
  private payload = ''
  private expectedVersion = ''
  private mediaBindings: CdpMediaBinding[] = []
  private watchGeneration = 0
  private activeTick: Promise<void> | null = null

  constructor(
    readonly port: number,
    readonly browserId: string,
    private readonly onSnapshot: (snapshot: CdpSnapshot) => void,
    private readonly onError: (error: Error) => void
  ) {
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('CDP 端口无效。')
    if (!/^[A-Za-z0-9._-]{1,200}$/.test(browserId)) throw new Error('CDP 浏览器身份无效。')
  }

  setPayload(payload: string, expectedVersion: string): void {
    if (!payload || Buffer.byteLength(payload, 'utf8') > MAX_THEME_PAYLOAD_BYTES || !RUNTIME_VERSION_PATTERN.test(expectedVersion)) {
      throw new Error('主题载荷无效。')
    }
    this.payload = payload
    this.expectedVersion = expectedVersion
  }

  setMediaBindings(bindings: CdpMediaBinding[]): void {
    this.mediaBindings = bindings.map((binding) => ({ ...binding }))
  }

  async start(): Promise<CdpSnapshot> {
    if (!this.payload || !this.expectedVersion) throw new Error('主题载荷尚未就绪。')
    await this.cleanupExcludedTargets()
    const snapshot = await this.inject()
    this.startTimer()
    return snapshot
  }

  async inject(): Promise<CdpSnapshot> {
    const targets = await this.targets()
    await Promise.all(targets.map(async (target) => {
      await this.evaluate(target, this.payload)
      if (this.mediaBindings.length > 0) await this.bindMedia(target)
    }))
    const snapshot = { connected: true, targetCount: targets.length }
    this.onSnapshot(snapshot)
    return snapshot
  }

  async verify(): Promise<CdpSnapshot> {
    const targets = await this.targets()
    const expectedVersion = JSON.stringify(this.expectedVersion)
    const results = await Promise.all(targets.map((target) => this.evaluate(target,
      `(() => { const state = window.__CODEX_DREAM_SKIN_STATE__; const style = document.getElementById("codex-dream-skin-style"); return Boolean(document.documentElement.classList.contains("codex-dream-skin") && state?.version === ${expectedVersion} && style?.dataset?.dreamVersion === ${expectedVersion}); })()`
    )))
    const connected = targets.length > 0 && results.every(Boolean)
    const snapshot = { connected, targetCount: targets.length }
    this.onSnapshot(snapshot)
    return snapshot
  }

  async stop(removeTheme: boolean): Promise<CdpSnapshot> {
    const wasWatching = this.timer !== null
    this.watchGeneration += 1
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (this.activeTick) await this.activeTick
    if (removeTheme) {
      try {
        await this.cleanupTargets()
      } catch (reason) {
        if (wasWatching) this.startTimer()
        throw reason
      }
    }
    const snapshot = { connected: false, targetCount: 0 }
    this.onSnapshot(snapshot)
    return snapshot
  }

  private startTimer(): void {
    if (this.timer) return
    const generation = ++this.watchGeneration
    this.timer = setInterval(() => void this.tick(generation), 2500)
  }

  private async cleanupTargets(): Promise<void> {
    let targets: CdpTarget[]
    try {
      targets = await this.targets(true)
    } catch (reason) {
      if (isCdpUnavailableError(reason)) return
      throw reason
    }
    const outcomes = await Promise.allSettled(targets.map((target) => this.evaluate(target, CLEANUP_EXPRESSION)))
    const failures: Error[] = []
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') {
        if (!isCdpUnavailableError(outcome.reason)) {
          failures.push(outcome.reason instanceof Error ? outcome.reason : new Error(String(outcome.reason)))
        }
      } else if (outcome.value !== true) {
        failures.push(new Error('Codex 页面未确认主题清理完成。'))
      }
    }
    if (failures.length > 0) {
      throw new Error(`Codex 页面主题清理失败: ${failures.map((error) => error.message).join('；')}`)
    }
  }

  private tick(generation = this.watchGeneration): Promise<void> {
    if (generation !== this.watchGeneration) return Promise.resolve()
    if (this.activeTick) return this.activeTick
    const operation = this.performTick(generation)
    this.activeTick = operation
    void operation.finally(() => {
      if (this.activeTick === operation) this.activeTick = null
    }).catch(() => undefined)
    return operation
  }

  private async performTick(generation: number): Promise<void> {
    try {
      const verified = await this.verify()
      if (generation !== this.watchGeneration) return
      if (!verified.connected) await this.inject()
    } catch (reason) {
      if (generation === this.watchGeneration) {
        this.onError(reason instanceof Error ? reason : new Error(String(reason)))
      }
    }
  }

  private async cleanupExcludedTargets(): Promise<void> {
    const targets = await this.targets(true)
    await Promise.all(targets
      .filter((target) => !isThemeCdpTargetUrl(target.url))
      .map((target) => this.evaluate(target, CLEANUP_EXPRESSION)))
  }

  private async targets(includeExcluded = false): Promise<CdpTarget[]> {
    const version = await this.fetchJson<CdpVersion>('/json/version')
    const browserUrl = this.validateWebSocketUrl(version.webSocketDebuggerUrl, 'browser', this.browserId)
    if (!browserUrl) throw new Error('CDP 浏览器身份已变化或不是仅回环地址。')
    const targets = await this.fetchJson<CdpTarget[]>('/json/list')
    const candidates = targets.filter((target) => target.type === 'page' && target.url.startsWith('app://'))
    const valid = candidates.filter((target) =>
      /^[A-Za-z0-9._-]{1,200}$/.test(target.id) && this.validateWebSocketUrl(target.webSocketDebuggerUrl, 'page', target.id))
    const selected = includeExcluded ? valid : valid.filter((target) => isThemeCdpTargetUrl(target.url))
    if (selected.length === 0) {
      if (includeExcluded && candidates.length === 0) throw new Error('没有仍保持打开的 Codex 页面目标。')
      throw new Error('没有可用的已验证 Codex 页面目标。')
    }
    return selected
  }

  private validateWebSocketUrl(value: string, kind: 'page' | 'browser', id: string): boolean {
    return isSafeCdpWebSocketUrl(value, this.port, kind, id)
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const response = await fetch(`http://127.0.0.1:${this.port}${path}`, {
      redirect: 'error', signal: AbortSignal.timeout(2500)
    })
    if (!response.ok) throw new Error(`CDP 返回 HTTP ${response.status}。`)
    return await response.json() as T
  }

  private async evaluate(target: CdpTarget, expression: string): Promise<unknown> {
    return this.command(target, 'Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }).then((message) => {
      const result = message as { error?: { message: string }; result?: { result?: { value?: unknown }; exceptionDetails?: unknown } }
      if (result.error || result.result?.exceptionDetails) throw new Error('主题脚本执行失败。')
      return result.result?.result?.value
    })
  }

  private async bindMedia(target: CdpTarget): Promise<void> {
    const prepared = await this.evaluate(target, 'window.__CODEX_DREAM_SKIN_PREPARE_MEDIA__?.() ?? {}')
    if (!prepared || typeof prepared !== 'object') return
    await this.withSession(target, async (send) => {
      await send('DOM.enable', {})
      for (const binding of this.mediaBindings) {
        const inputId = (prepared as Record<string, unknown>)[binding.role]
        if (typeof inputId !== 'string') continue
        let nodeId: number | undefined
        for (let attempt = 0; attempt < 4 && !nodeId; attempt += 1) {
          const documentResult = await send('DOM.getDocument', { depth: 1, pierce: true }) as { result?: { root?: { nodeId?: number } } }
          const rootNodeId = documentResult.result?.root?.nodeId
          if (!rootNodeId) throw new Error('Codex 页面 DOM 根节点不可用。')
          const query = await send('DOM.querySelector', { nodeId: rootNodeId, selector: `#${inputId}` }) as { result?: { nodeId?: number } }
          nodeId = query.result?.nodeId || undefined
          if (!nodeId && attempt < 3) await new Promise((resolve) => setTimeout(resolve, 80))
        }
        if (!nodeId) throw new Error('Codex 媒体输入节点不可用。')
        await send('DOM.setFileInputFiles', { files: [binding.path], nodeId })
      }
    })
    await this.evaluate(target, 'window.__CODEX_DREAM_SKIN_ATTACH_MEDIA__?.()')
  }

  private async command(target: CdpTarget, method: string, params: Record<string, unknown>): Promise<unknown> {
    return await this.withSession(target, (send) => send(method, params))
  }

  private async withSession<T>(target: CdpTarget, operation: (send: CdpCommand) => Promise<T>): Promise<T> {
    if (!this.validateWebSocketUrl(target.webSocketDebuggerUrl, 'page', target.id)) throw new Error('不安全的 CDP 页面地址已被拒绝。')
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(target.webSocketDebuggerUrl, { handshakeTimeout: 3000 })
      const pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason: Error) => void }>()
      let requestId = 0
      let settled = false
      const finish = (reason?: Error, value?: T): void => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        for (const request of pending.values()) request.reject(reason ?? new Error('CDP 会话已结束。'))
        pending.clear()
        socket.close()
        if (reason) reject(reason)
        else resolve(value as T)
      }
      const timeout = setTimeout(() => finish(new Error('CDP 主题求值超时。')), 12_000)
      const send: CdpCommand = (method, params) => new Promise((resolveCommand, rejectCommand) => {
        const id = ++requestId
        pending.set(id, { resolve: resolveCommand, reject: rejectCommand })
        socket.send(JSON.stringify({ id, method, params }))
      })
      socket.once('open', () => { void operation(send).then((value) => finish(undefined, value), (error) => finish(error instanceof Error ? error : new Error(String(error)))) })
      socket.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString()) as { id?: number; error?: { message: string } }
          if (typeof message.id !== 'number') return
          const request = pending.get(message.id)
          if (!request) return
          pending.delete(message.id)
          if (message.error) request.reject(new Error(message.error.message))
          else request.resolve(message)
        } catch (error) { finish(error instanceof Error ? error : new Error(String(error))) }
      })
      socket.once('error', (error) => finish(error))
      socket.once('close', () => { if (!settled) finish(new Error('CDP 会话意外关闭。')) })
    })
  }
}
