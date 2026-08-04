import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { WebSocketServer } from 'ws'
import { Window } from 'happy-dom'
import { describe, expect, it, vi } from 'vitest'
import { CdpWatcher, isCdpUnavailableError, isSafeCdpWebSocketUrl, isThemeCdpTargetUrl, MAX_THEME_PAYLOAD_BYTES, PROJECT_DISCOVERY_EXPRESSION } from '../src/main/cdp-watcher'

const runtimeVersion = `studio-${'a'.repeat(24)}`

describe('CDP endpoint validation', () => {
  it('only accepts the expected loopback endpoint and identity', () => {
    expect(isSafeCdpWebSocketUrl('ws://127.0.0.1:9335/devtools/page/page-123', 9335, 'page', 'page-123')).toBe(true)
    expect(isSafeCdpWebSocketUrl('ws://localhost:9335/devtools/browser/browser-1', 9335, 'browser', 'browser-1')).toBe(true)
    expect(isSafeCdpWebSocketUrl('ws://example.com:9335/devtools/page/page-123', 9335, 'page', 'page-123')).toBe(false)
    expect(isSafeCdpWebSocketUrl('ws://127.0.0.1:9336/devtools/page/page-123', 9335, 'page', 'page-123')).toBe(false)
    expect(isSafeCdpWebSocketUrl('ws://127.0.0.1:9335/devtools/page/other', 9335, 'page', 'page-123')).toBe(false)
    expect(isSafeCdpWebSocketUrl('ws://user@127.0.0.1:9335/devtools/page/page-123', 9335, 'page', 'page-123')).toBe(false)
  })

  it('allows multi-font runtime payloads while retaining the size guard', () => {
    const watcher = new CdpWatcher(9335, 'browser-1', () => undefined, () => undefined)
    watcher.setPayload('x'.repeat(20_000_001), runtimeVersion)
    expect(() => watcher.setPayload('x'.repeat(MAX_THEME_PAYLOAD_BYTES + 1), runtimeVersion)).toThrow('主题载荷无效。')
    expect(() => watcher.setPayload('true', 'invalid')).toThrow('主题载荷无效。')
  })

  it('only classifies closed endpoints and page targets as unavailable', () => {
    const refused = Object.assign(new Error('fetch failed'), {
      cause: Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:9335'), { code: 'ECONNREFUSED' })
    })
    expect(isCdpUnavailableError(refused)).toBe(true)
    expect(isCdpUnavailableError(new Error('CDP 会话意外关闭。'))).toBe(true)
    expect(isCdpUnavailableError(new Error('No target with given id'))).toBe(true)
    expect(isCdpUnavailableError(new Error('No Codex page target remains open.'))).toBe(true)
    expect(isCdpUnavailableError(new Error('No verified Codex page target is available.'))).toBe(false)
    expect(isCdpUnavailableError(new Error('CDP returned HTTP 500.'))).toBe(false)
    expect(isCdpUnavailableError(new Error('CDP evaluation timed out.'))).toBe(false)
    expect(isCdpUnavailableError(new Error('Theme evaluation failed.'))).toBe(false)
  })
})

describe('CDP theme target selection', () => {
  it('keeps the main Codex page and skips the avatar overlay page', () => {
    expect(isThemeCdpTargetUrl('app://-/index.html')).toBe(true)
    expect(isThemeCdpTargetUrl('app://-/index.html?initialRoute=%2Favatar-overlay')).toBe(false)
    expect(isThemeCdpTargetUrl('https://example.com/index.html')).toBe(false)
  })
})

describe('CDP project discovery', () => {
  it('temporarily expands projects and complete session lists before restoring both states', async () => {
    const window = new Window()
    window.document.body.innerHTML = `
      <div data-sidebar-project-kind="local">
        <div data-app-action-sidebar-project-row data-app-action-sidebar-project-id="project-1" data-app-action-sidebar-project-label="Project" data-app-action-sidebar-project-collapsed="true"></div>
      </div>`
    const row = window.document.querySelector('[data-app-action-sidebar-project-row]') as unknown as HTMLElement | null
    if (!row) throw new Error('Project row fixture is missing.')
    row.addEventListener('click', () => {
      const collapsed = row.getAttribute('data-app-action-sidebar-project-collapsed') === 'true'
      row.setAttribute('data-app-action-sidebar-project-collapsed', collapsed ? 'false' : 'true')
      if (!collapsed) {
        window.document.querySelector('[data-app-action-sidebar-project-list-id]')?.remove()
        return
      }
      row.insertAdjacentHTML('afterend', `
        <div data-app-action-sidebar-project-list-id="project-1" data-app-action-sidebar-project-show-all="false">
          <div role="list">
            <div role="listitem"><div data-app-action-sidebar-thread-row data-app-action-sidebar-thread-id="local:session-1" data-app-action-sidebar-thread-title="First"></div></div>
            <div role="listitem"><button type="button">Show all</button></div>
          </div>
        </div>`)
      const list = window.document.querySelector('[data-app-action-sidebar-project-list-id]') as unknown as HTMLElement | null
      const button = list?.querySelector('button') as HTMLButtonElement | null | undefined
      button?.addEventListener('click', () => {
        const showingAll = list?.getAttribute('data-app-action-sidebar-project-show-all') === 'true'
        list?.setAttribute('data-app-action-sidebar-project-show-all', showingAll ? 'false' : 'true')
        if (showingAll) list?.querySelector('[data-session-extra]')?.remove()
        else {
          button.closest('[role="listitem"]')?.insertAdjacentHTML('beforebegin', '<div role="listitem" data-session-extra><div data-app-action-sidebar-thread-row data-app-action-sidebar-thread-id="local:session-2" data-app-action-sidebar-thread-title="Second"></div></div>')
          button.closest('[role="listitem"]')?.remove()
        }
      })
    })

    const result = await window.eval(PROJECT_DISCOVERY_EXPRESSION) as Array<{ id: string; sessions: Array<{ id: string; title: string }> }>
    expect(result).toEqual([{ id: 'project-1', label: 'Project', kind: 'local', sessions: [{ id: 'local:session-1', title: 'First' }, { id: 'local:session-2', title: 'Second' }] }])
    expect(row.getAttribute('data-app-action-sidebar-project-collapsed')).toBe('true')
    expect(window.document.querySelector('[data-app-action-sidebar-project-list-id]')).toBeNull()
    await window.close()
  })

  it('discovers and restores sessions when background page timers are throttled', async () => {
    const window = new Window()
    window.document.body.innerHTML = `
      <div data-sidebar-project-kind="local">
        <div data-app-action-sidebar-project-row data-app-action-sidebar-project-id="project-1" data-app-action-sidebar-project-label="Project" data-app-action-sidebar-project-collapsed="true"></div>
      </div>`
    const row = window.document.querySelector('[data-app-action-sidebar-project-row]') as unknown as HTMLElement | null
    if (!row) throw new Error('Project row fixture is missing.')
    row.addEventListener('click', () => {
      const collapsed = row.getAttribute('data-app-action-sidebar-project-collapsed') === 'true'
      void Promise.resolve().then(() => {
        row.setAttribute('data-app-action-sidebar-project-collapsed', collapsed ? 'false' : 'true')
        if (!collapsed) {
          window.document.querySelector('[data-app-action-sidebar-project-list-id]')?.remove()
          return
        }
        row.insertAdjacentHTML('afterend', `
          <div data-app-action-sidebar-project-list-id="project-1" data-app-action-sidebar-project-show-all="false">
            <div role="list">
              <div role="listitem"><div data-app-action-sidebar-thread-row data-app-action-sidebar-thread-id="local:session-1" data-app-action-sidebar-thread-title="First"></div></div>
              <div role="listitem"><button type="button">Show all</button></div>
            </div>
          </div>`)
        const list = window.document.querySelector('[data-app-action-sidebar-project-list-id]')
        const button = list?.querySelector('button')
        button?.addEventListener('click', () => {
          void Promise.resolve().then(() => {
            list?.setAttribute('data-app-action-sidebar-project-show-all', 'true')
            button.closest('[role="listitem"]')?.insertAdjacentHTML('beforebegin', '<div role="listitem"><div data-app-action-sidebar-thread-row data-app-action-sidebar-thread-id="local:session-2" data-app-action-sidebar-thread-title="Second"></div></div>')
            button.closest('[role="listitem"]')?.remove()
          })
        })
      })
    })
    const throttledSetTimeout = vi.fn(() => 1)
    window.setTimeout = throttledSetTimeout as unknown as typeof window.setTimeout

    const result = await window.eval(PROJECT_DISCOVERY_EXPRESSION) as Array<{ sessions: Array<{ id: string }> }>

    expect(result[0]?.sessions.map((session) => session.id)).toEqual(['local:session-1', 'local:session-2'])
    expect(row.getAttribute('data-app-action-sidebar-project-collapsed')).toBe('true')
    expect(window.document.querySelector('[data-app-action-sidebar-project-list-id]')).toBeNull()
    expect(throttledSetTimeout).toHaveBeenCalled()
    await window.close()
  })

  it('does not activate an irreversible show-all control for an originally expanded project', async () => {
    const window = new Window()
    window.document.body.innerHTML = `
      <div data-sidebar-project-kind="local">
        <div data-app-action-sidebar-project-row data-app-action-sidebar-project-id="project-1" data-app-action-sidebar-project-label="Project" data-app-action-sidebar-project-collapsed="false"></div>
        <div data-app-action-sidebar-project-list-id="project-1" data-app-action-sidebar-project-show-all="false">
          <div role="list"><div role="listitem"><div data-app-action-sidebar-thread-row data-app-action-sidebar-thread-id="local:session-1" data-app-action-sidebar-thread-title="First"></div></div><div role="listitem" data-show-all-item><button type="button">Show all</button></div></div>
        </div>
      </div>`
    const row = window.document.querySelector('[data-app-action-sidebar-project-row]') as unknown as HTMLElement | null
    if (!row) throw new Error('Project row fixture is missing.')
    let projectClicks = 0
    row.addEventListener('click', () => { projectClicks += 1 })
    const showAll = window.document.querySelector('[data-show-all-item] button') as HTMLButtonElement | null
    let showAllClicks = 0
    showAll?.addEventListener('click', () => {
      showAllClicks += 1
      const list = window.document.querySelector('[data-app-action-sidebar-project-list-id]')
      list?.setAttribute('data-app-action-sidebar-project-show-all', 'true')
      showAll.closest('[data-show-all-item]')?.remove()
      list?.querySelector('[role="list"]')?.insertAdjacentHTML('beforeend', '<div role="listitem"><div data-app-action-sidebar-thread-row data-app-action-sidebar-thread-id="local:session-2" data-app-action-sidebar-thread-title="Second"></div></div>')
    })

    const result = await window.eval(PROJECT_DISCOVERY_EXPRESSION) as Array<{ sessions: Array<{ id: string }> }>
    expect(result[0]?.sessions.map((session) => session.id)).toEqual(['local:session-1'])
    expect(projectClicks).toBe(0)
    expect(showAllClicks).toBe(0)
    expect(row.getAttribute('data-app-action-sidebar-project-collapsed')).toBe('false')
    expect(window.document.querySelector('[data-app-action-sidebar-project-list-id]')?.getAttribute('data-app-action-sidebar-project-show-all')).toBe('false')
    await window.close()
  })

  it('reports a failed sidebar restoration after still attempting the original project state', async () => {
    const window = new Window()
    window.document.body.innerHTML = `
      <div data-sidebar-project-kind="local">
        <div data-app-action-sidebar-project-row data-app-action-sidebar-project-id="project-1" data-app-action-sidebar-project-label="Project" data-app-action-sidebar-project-collapsed="true"></div>
      </div>`
    const row = window.document.querySelector('[data-app-action-sidebar-project-row]') as unknown as HTMLElement | null
    if (!row) throw new Error('Project row fixture is missing.')
    let clicks = 0
    row.addEventListener('click', () => {
      clicks += 1
      if (clicks !== 1) return
      row.setAttribute('data-app-action-sidebar-project-collapsed', 'false')
      row.insertAdjacentHTML('afterend', '<div data-app-action-sidebar-project-list-id="project-1" data-app-action-sidebar-project-show-all="true"></div>')
    })

    await expect(window.eval(PROJECT_DISCOVERY_EXPRESSION)).rejects.toThrow(/Codex sidebar state could not be restored/)
    expect(clicks).toBe(2)
    await window.close()
  })

  it('preserves Codex DOM order while merging duplicate projects from verified targets', async () => {
    const watcher = new CdpWatcher(9335, 'browser-1', () => undefined, () => undefined)
    const internals = watcher as unknown as {
      targets: () => Promise<Array<{ id: string }>>
      evaluate: (target: { id: string }) => Promise<unknown>
    }
    internals.targets = vi.fn().mockResolvedValue([{ id: 'page-1' }, { id: 'page-2' }])
    internals.evaluate = vi.fn(async (target) => target.id === 'page-1'
      ? [{ id: 'project-2', label: 'Zulu', kind: 'local', sessions: [] }, { id: 'project-1', label: 'Old label', kind: 'local', sessions: [{ id: 'local:session-1', title: 'Old title' }] }]
      : [{ id: 'project-1', label: 'Alpha', kind: 'workspace', sessions: [{ id: 'local:session-1', title: 'Updated title' }, { id: 'local:session-2', title: 'Second' }] }])

    await expect(watcher.listProjects()).resolves.toEqual([
      { id: 'project-2', label: 'Zulu', kind: 'local', sessions: [] },
      { id: 'project-1', label: 'Alpha', kind: 'workspace', sessions: [{ id: 'local:session-1', title: 'Updated title' }, { id: 'local:session-2', title: 'Second' }] }
    ])
  })

  it('rejects invalid project data returned by a page', async () => {
    const watcher = new CdpWatcher(9335, 'browser-1', () => undefined, () => undefined)
    const internals = watcher as unknown as {
      targets: () => Promise<Array<{ id: string }>>
      evaluate: () => Promise<unknown>
    }
    internals.targets = vi.fn().mockResolvedValue([{ id: 'page-1' }])
    internals.evaluate = vi.fn().mockResolvedValue([{ id: '../private/path', label: 'Private', kind: 'local' }])

    await expect(watcher.listProjects()).rejects.toThrow()
  })

  it('rejects a changed browser identity before evaluating project rows', async () => {
    let port = 0
    const server = createServer((request, response) => {
      response.setHeader('content-type', 'application/json')
      if (request.url === '/json/version') {
        response.end(JSON.stringify({ webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/browser/other-browser` }))
      } else {
        response.end('[]')
      }
    })
    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
      port = (server.address() as AddressInfo).port
      const watcher = new CdpWatcher(port, 'browser-1', () => undefined, () => undefined)
      await expect(watcher.listProjects()).rejects.toThrow('浏览器身份')
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})

describe('CDP renderer migration', () => {
  it('reloads a verified target when the renderer requests a clean React remount', async () => {
    const watcher = new CdpWatcher(9335, 'browser-1', () => undefined, () => undefined)
    watcher.setPayload('valid-payload', 'studio-1234567890abcdef12345678')
    const internals = watcher as unknown as {
      targets: () => Promise<Array<{ id: string }>>
      evaluate: (target: { id: string }, expression: string) => Promise<unknown>
      command: (target: { id: string }, method: string, params: Record<string, unknown>) => Promise<unknown>
    }
    internals.targets = vi.fn().mockResolvedValue([{ id: 'page-1' }])
    internals.evaluate = vi.fn()
      .mockResolvedValueOnce({ installed: false, reloading: true })
      .mockResolvedValueOnce({ installed: true })
    internals.command = vi.fn().mockResolvedValue({})

    await expect(watcher.inject()).resolves.toEqual({ connected: true, targetCount: 1 })
    expect(internals.command).toHaveBeenCalledWith({ id: 'page-1' }, 'Page.reload', { ignoreCache: true })
    expect(internals.evaluate).toHaveBeenCalledTimes(2)
  })
})

describe('CDP cleanup', () => {
  it('waits for an in-flight reinjection before removing the theme', async () => {
    const watcher = new CdpWatcher(9335, 'browser-1', () => undefined, () => undefined)
    let finishInjection!: (snapshot: { connected: boolean; targetCount: number }) => void
    const injection = new Promise<{ connected: boolean; targetCount: number }>((resolve) => { finishInjection = resolve })
    const order: string[] = []
    const internals = watcher as unknown as {
      startTimer: () => void
      tick: () => Promise<void>
      verify: () => Promise<{ connected: boolean; targetCount: number }>
      inject: () => Promise<{ connected: boolean; targetCount: number }>
      cleanupTargets: () => Promise<void>
    }
    internals.verify = vi.fn().mockResolvedValue({ connected: false, targetCount: 1 })
    internals.inject = vi.fn(async () => {
      order.push('inject-started')
      const snapshot = await injection
      order.push('inject-finished')
      return snapshot
    })
    internals.cleanupTargets = vi.fn(async () => { order.push('cleanup') })
    internals.startTimer()

    const tick = internals.tick()
    await vi.waitFor(() => expect(internals.inject).toHaveBeenCalledTimes(1))
    const stop = watcher.stop(true)
    await Promise.resolve()
    expect(internals.cleanupTargets).not.toHaveBeenCalled()

    finishInjection({ connected: true, targetCount: 1 })
    await Promise.all([tick, stop])

    expect(order).toEqual(['inject-started', 'inject-finished', 'cleanup'])
    await watcher.stop(false)
  })

  it('invalidates a pending tick before it can reinject', async () => {
    const watcher = new CdpWatcher(9335, 'browser-1', () => undefined, () => undefined)
    let finishVerification!: (snapshot: { connected: boolean; targetCount: number }) => void
    const verification = new Promise<{ connected: boolean; targetCount: number }>((resolve) => { finishVerification = resolve })
    const internals = watcher as unknown as {
      startTimer: () => void
      tick: () => Promise<void>
      verify: () => Promise<{ connected: boolean; targetCount: number }>
      inject: () => Promise<{ connected: boolean; targetCount: number }>
      cleanupTargets: () => Promise<void>
    }
    internals.verify = vi.fn(() => verification)
    internals.inject = vi.fn().mockResolvedValue({ connected: true, targetCount: 1 })
    internals.cleanupTargets = vi.fn().mockResolvedValue(undefined)
    internals.startTimer()

    const tick = internals.tick()
    await vi.waitFor(() => expect(internals.verify).toHaveBeenCalledTimes(1))
    const stop = watcher.stop(true)
    finishVerification({ connected: false, targetCount: 1 })
    await Promise.all([tick, stop])

    expect(internals.inject).not.toHaveBeenCalled()
    expect(internals.cleanupTargets).toHaveBeenCalledTimes(1)
    await watcher.stop(false)
  })

  it('ignores closed page targets but propagates unconfirmed cleanup and resumes watching', async () => {
    const watcher = new CdpWatcher(9335, 'browser-1', () => undefined, () => undefined)
    const internals = watcher as unknown as {
      timer: NodeJS.Timeout | null
      targets: () => Promise<Array<{ id: string }>>
      evaluate: (target: { id: string }) => Promise<unknown>
    }
    internals.timer = setInterval(() => undefined, 60_000)
    internals.targets = vi.fn().mockResolvedValue([{ id: 'closed' }, { id: 'unclean' }])
    internals.evaluate = vi.fn(async (target) => {
      if (target.id === 'closed') throw new Error('No target with given id')
      return false
    })

    await expect(watcher.stop(true)).rejects.toThrow('未确认主题清理完成')
    expect(internals.timer).not.toBeNull()
    await watcher.stop(false)
  })

  it('treats a fully closed Codex endpoint as already cleaned', async () => {
    const watcher = new CdpWatcher(9335, 'browser-1', () => undefined, () => undefined)
    const internals = watcher as unknown as {
      targets: () => Promise<never>
    }
    internals.targets = vi.fn().mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }))

    await expect(watcher.stop(true)).resolves.toEqual({ connected: false, targetCount: 0 })
  })
})

describe('CDP media binding', () => {
  it('queries and binds hero and polaroid file inputs in one CDP session', async () => {
    let port = 0
    const browserId = 'browser-1'
    const targetId = 'page-1'
    const boundFiles: Array<{ nodeId: number; files: string[] }> = []
    const server = createServer((request, response) => {
      response.setHeader('content-type', 'application/json')
      if (request.url === '/json/version') {
        response.end(JSON.stringify({ webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/browser/${browserId}` }))
      } else if (request.url === '/json/list') {
        response.end(JSON.stringify([{ id: targetId, type: 'page', url: 'app://-/index.html', webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/${targetId}` }]))
      } else {
        response.statusCode = 404
        response.end('{}')
      }
    })
    const webSockets = new WebSocketServer({ server })
    let session = 0
    webSockets.on('connection', (socket) => {
      const rootNodeId = ++session * 100
      socket.on('message', (data) => {
        const command = JSON.parse(data.toString()) as { id: number; method: string; params: Record<string, unknown> }
        let result: unknown = {}
        if (command.method === 'Runtime.evaluate') {
          const expression = String(command.params.expression ?? '')
          const value = expression.includes('__CODEX_DREAM_SKIN_PREPARE_MEDIA__')
            ? { hero: 'codex-dream-skin-media-hero', polaroid: 'codex-dream-skin-media-polaroid', windowBackground: 'codex-dream-skin-media-windowBackground' }
            : true
          result = { result: { value } }
        } else if (command.method === 'DOM.getDocument') {
          result = { root: { nodeId: rootNodeId } }
        } else if (command.method === 'DOM.querySelector') {
          if (command.params.nodeId !== rootNodeId) {
            socket.send(JSON.stringify({ id: command.id, error: { message: 'Could not find node with given id' } }))
            return
          }
          const selector = String(command.params.selector)
          result = { nodeId: rootNodeId + (selector.endsWith('hero') ? 1 : selector.endsWith('polaroid') ? 2 : 3) }
        } else if (command.method === 'DOM.setFileInputFiles') {
          const nodeId = Number(command.params.nodeId)
          if (nodeId !== rootNodeId + 1 && nodeId !== rootNodeId + 2 && nodeId !== rootNodeId + 3) {
            socket.send(JSON.stringify({ id: command.id, error: { message: 'Input node belongs to another session' } }))
            return
          }
          boundFiles.push({ nodeId, files: command.params.files as string[] })
        }
        socket.send(JSON.stringify({ id: command.id, result }))
      })
    })

    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
      port = (server.address() as AddressInfo).port
      const watcher = new CdpWatcher(port, browserId, () => undefined, () => undefined)
      watcher.setPayload('true', runtimeVersion)
      watcher.setMediaBindings([
        { role: 'hero', path: 'C:\\theme\\hero.mp4', mimeType: 'video/mp4' },
        { role: 'polaroid', path: 'C:\\theme\\polaroid.webm', mimeType: 'video/webm' },
        { role: 'windowBackground', path: 'C:\\theme\\window.mp4', mimeType: 'video/mp4' }
      ])

      await expect(watcher.inject()).resolves.toEqual({ connected: true, targetCount: 1 })
      expect(boundFiles.map((binding) => binding.files[0])).toEqual(['C:\\theme\\hero.mp4', 'C:\\theme\\polaroid.webm', 'C:\\theme\\window.mp4'])
      expect(boundFiles[0]!.nodeId - 1).toBe(boundFiles[1]!.nodeId - 2)
      expect(boundFiles[0]!.nodeId - 1).toBe(boundFiles[2]!.nodeId - 3)
    } finally {
      for (const client of webSockets.clients) client.terminate()
      await new Promise<void>((resolve) => webSockets.close(() => resolve()))
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})

describe('CDP runtime version recovery', () => {
  it('reinjects when either runtime state or the installed style is stale', async () => {
    let port = 0
    const browserId = 'browser-1'
    const targetId = 'page-1'
    let stateVersion: string | null = 'studio-old'
    let styleVersion: string | null = 'studio-old'
    let injections = 0
    const verificationExpressions: string[] = []
    const errors: Error[] = []
    const server = createServer((request, response) => {
      response.setHeader('content-type', 'application/json')
      if (request.url === '/json/version') {
        response.end(JSON.stringify({ webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/browser/${browserId}` }))
      } else if (request.url === '/json/list') {
        response.end(JSON.stringify([{ id: targetId, type: 'page', url: 'app://-/index.html', webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/${targetId}` }]))
      } else {
        response.statusCode = 404
        response.end('{}')
      }
    })
    const webSockets = new WebSocketServer({ server })
    webSockets.on('connection', (socket) => {
      socket.on('message', (data) => {
        const command = JSON.parse(data.toString()) as { id: number; method: string; params: Record<string, unknown> }
        const expression = String(command.params.expression ?? '')
        let value = true
        if (command.method === 'Runtime.evaluate' && expression === 'payload-script') {
          injections += 1
          stateVersion = runtimeVersion
          styleVersion = runtimeVersion
        } else if (command.method === 'Runtime.evaluate' && expression.includes('__CODEX_DREAM_SKIN_STATE__')) {
          verificationExpressions.push(expression)
          value = stateVersion === runtimeVersion && styleVersion === runtimeVersion
        }
        socket.send(JSON.stringify({ id: command.id, result: { result: { value } } }))
      })
    })

    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
      port = (server.address() as AddressInfo).port
      const watcher = new CdpWatcher(port, browserId, () => undefined, (error) => errors.push(error))
      watcher.setPayload('payload-script', runtimeVersion)
      const tick = (watcher as unknown as { tick(): Promise<void> }).tick.bind(watcher)

      await tick()
      expect(injections).toBe(1)
      await tick()
      expect(injections).toBe(1)

      stateVersion = null
      await tick()
      expect(injections).toBe(2)

      styleVersion = 'studio-old'
      await tick()
      expect(injections).toBe(3)
      expect(errors).toEqual([])
      expect(verificationExpressions.every((expression) =>
        expression.includes(`state?.version === "${runtimeVersion}"`) &&
        expression.includes(`style?.dataset?.dreamVersion === "${runtimeVersion}"`)
      )).toBe(true)
    } finally {
      for (const client of webSockets.clients) client.terminate()
      await new Promise<void>((resolve) => webSockets.close(() => resolve()))
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
