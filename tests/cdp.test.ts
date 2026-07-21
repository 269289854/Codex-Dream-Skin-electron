import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { WebSocketServer } from 'ws'
import { describe, expect, it } from 'vitest'
import { CdpWatcher, isSafeCdpWebSocketUrl, isThemeCdpTargetUrl, MAX_THEME_PAYLOAD_BYTES } from '../src/main/cdp-watcher'

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
    watcher.setPayload('x'.repeat(20_000_001))
    expect(() => watcher.setPayload('x'.repeat(MAX_THEME_PAYLOAD_BYTES + 1))).toThrow('Theme payload is invalid.')
  })
})

describe('CDP theme target selection', () => {
  it('keeps the main Codex page and skips the avatar overlay page', () => {
    expect(isThemeCdpTargetUrl('app://-/index.html')).toBe(true)
    expect(isThemeCdpTargetUrl('app://-/index.html?initialRoute=%2Favatar-overlay')).toBe(false)
    expect(isThemeCdpTargetUrl('https://example.com/index.html')).toBe(false)
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
            ? { hero: 'codex-dream-skin-media-hero', polaroid: 'codex-dream-skin-media-polaroid' }
            : true
          result = { result: { value } }
        } else if (command.method === 'DOM.getDocument') {
          result = { root: { nodeId: rootNodeId } }
        } else if (command.method === 'DOM.querySelector') {
          if (command.params.nodeId !== rootNodeId) {
            socket.send(JSON.stringify({ id: command.id, error: { message: 'Could not find node with given id' } }))
            return
          }
          result = { nodeId: rootNodeId + (String(command.params.selector).endsWith('hero') ? 1 : 2) }
        } else if (command.method === 'DOM.setFileInputFiles') {
          const nodeId = Number(command.params.nodeId)
          if (nodeId !== rootNodeId + 1 && nodeId !== rootNodeId + 2) {
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
      watcher.setPayload('true')
      watcher.setMediaBindings([
        { role: 'hero', path: 'C:\\theme\\hero.mp4', mimeType: 'video/mp4' },
        { role: 'polaroid', path: 'C:\\theme\\polaroid.webm', mimeType: 'video/webm' }
      ])

      await expect(watcher.inject()).resolves.toEqual({ connected: true, targetCount: 1 })
      expect(boundFiles.map((binding) => binding.files[0])).toEqual(['C:\\theme\\hero.mp4', 'C:\\theme\\polaroid.webm'])
      expect(boundFiles[0]!.nodeId - 1).toBe(boundFiles[1]!.nodeId - 2)
    } finally {
      for (const client of webSockets.clients) client.terminate()
      await new Promise<void>((resolve) => webSockets.close(() => resolve()))
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
