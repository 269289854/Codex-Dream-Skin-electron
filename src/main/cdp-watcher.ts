import WebSocket from 'ws'
interface CdpVersion { webSocketDebuggerUrl: string }
interface CdpTarget { id: string; type: string; url: string; webSocketDebuggerUrl: string }
export interface CdpMediaBinding { role: 'hero' | 'polaroid'; path: string; mimeType: string }
type CdpCommand = (method: string, params: Record<string, unknown>) => Promise<unknown>

const CLEANUP_EXPRESSION = '(() => { const state = window.__CODEX_DREAM_SKIN_STATE__; if (state?.cleanup) return state.cleanup(); document.documentElement.classList.remove("codex-dream-skin"); document.getElementById("codex-dream-skin-style")?.remove(); document.getElementById("codex-dream-skin-chrome")?.remove(); return true; })()'

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
  private mediaBindings: CdpMediaBinding[] = []
  private busy = false

  constructor(
    readonly port: number,
    readonly browserId: string,
    private readonly onSnapshot: (snapshot: CdpSnapshot) => void,
    private readonly onError: (error: Error) => void
  ) {
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('CDP port is invalid.')
    if (!/^[A-Za-z0-9._-]{1,200}$/.test(browserId)) throw new Error('CDP browser identity is invalid.')
  }

  setPayload(payload: string): void {
    if (!payload || payload.length > 20_000_000) throw new Error('Theme payload is invalid.')
    this.payload = payload
  }

  setMediaBindings(bindings: CdpMediaBinding[]): void {
    this.mediaBindings = bindings.map((binding) => ({ ...binding }))
  }

  async start(): Promise<CdpSnapshot> {
    if (!this.payload) throw new Error('Theme payload is not ready.')
    await this.cleanupExcludedTargets()
    const snapshot = await this.inject()
    if (!this.timer) this.timer = setInterval(() => void this.tick(), 2500)
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
    const results = await Promise.all(targets.map((target) => this.evaluate(target,
      'Boolean(document.documentElement.classList.contains("codex-dream-skin") && document.getElementById("codex-dream-skin-style"))'
    )))
    const connected = targets.length > 0 && results.every(Boolean)
    const snapshot = { connected, targetCount: targets.length }
    this.onSnapshot(snapshot)
    return snapshot
  }

  async stop(removeTheme: boolean): Promise<CdpSnapshot> {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (removeTheme) {
      try {
        const targets = await this.targets(true)
        await Promise.all(targets.map((target) => this.evaluate(target,
          CLEANUP_EXPRESSION
        )))
      } catch {
        // Codex may already be closed.
      }
    }
    const snapshot = { connected: false, targetCount: 0 }
    this.onSnapshot(snapshot)
    return snapshot
  }

  private async tick(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      const verified = await this.verify()
      if (!verified.connected) await this.inject()
    } catch (reason) {
      this.onError(reason instanceof Error ? reason : new Error(String(reason)))
    } finally { this.busy = false }
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
    if (!browserUrl) throw new Error('CDP browser identity changed or is not loopback-only.')
    const targets = await this.fetchJson<CdpTarget[]>('/json/list')
    const valid = targets.filter((target) => target.type === 'page' && target.url.startsWith('app://') &&
      /^[A-Za-z0-9._-]{1,200}$/.test(target.id) && this.validateWebSocketUrl(target.webSocketDebuggerUrl, 'page', target.id))
    const selected = includeExcluded ? valid : valid.filter((target) => isThemeCdpTargetUrl(target.url))
    if (selected.length === 0) throw new Error('No verified Codex page target is available.')
    return selected
  }

  private validateWebSocketUrl(value: string, kind: 'page' | 'browser', id: string): boolean {
    return isSafeCdpWebSocketUrl(value, this.port, kind, id)
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const response = await fetch(`http://127.0.0.1:${this.port}${path}`, {
      redirect: 'error', signal: AbortSignal.timeout(2500)
    })
    if (!response.ok) throw new Error(`CDP returned HTTP ${response.status}.`)
    return await response.json() as T
  }

  private async evaluate(target: CdpTarget, expression: string): Promise<unknown> {
    return this.command(target, 'Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }).then((message) => {
      const result = message as { error?: { message: string }; result?: { result?: { value?: unknown }; exceptionDetails?: unknown } }
      if (result.error || result.result?.exceptionDetails) throw new Error(result.error?.message ?? 'Theme evaluation failed.')
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
    if (!this.validateWebSocketUrl(target.webSocketDebuggerUrl, 'page', target.id)) throw new Error('Unsafe CDP page URL was rejected.')
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
      const timeout = setTimeout(() => finish(new Error('CDP evaluation timed out.')), 12_000)
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
