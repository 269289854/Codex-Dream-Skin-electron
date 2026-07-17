import { describe, expect, it } from 'vitest'
import { isSafeCdpWebSocketUrl, isThemeCdpTargetUrl, parsePolaroidPlacementUpdate } from '../src/main/cdp-watcher'

describe('CDP endpoint validation', () => {
  it('only accepts the expected loopback endpoint and identity', () => {
    expect(isSafeCdpWebSocketUrl('ws://127.0.0.1:9335/devtools/page/page-123', 9335, 'page', 'page-123')).toBe(true)
    expect(isSafeCdpWebSocketUrl('ws://localhost:9335/devtools/browser/browser-1', 9335, 'browser', 'browser-1')).toBe(true)
    expect(isSafeCdpWebSocketUrl('ws://example.com:9335/devtools/page/page-123', 9335, 'page', 'page-123')).toBe(false)
    expect(isSafeCdpWebSocketUrl('ws://127.0.0.1:9336/devtools/page/page-123', 9335, 'page', 'page-123')).toBe(false)
    expect(isSafeCdpWebSocketUrl('ws://127.0.0.1:9335/devtools/page/other', 9335, 'page', 'page-123')).toBe(false)
    expect(isSafeCdpWebSocketUrl('ws://user@127.0.0.1:9335/devtools/page/page-123', 9335, 'page', 'page-123')).toBe(false)
  })
})

describe('CDP theme target selection', () => {
  it('keeps the main Codex page and skips the avatar overlay page', () => {
    expect(isThemeCdpTargetUrl('app://-/index.html')).toBe(true)
    expect(isThemeCdpTargetUrl('app://-/index.html?initialRoute=%2Favatar-overlay')).toBe(false)
    expect(isThemeCdpTargetUrl('https://example.com/index.html')).toBe(false)
  })
})

describe('CDP polaroid placement validation', () => {
  const themeId = '11111111-1111-4111-8111-111111111111'

  it('accepts finite normalized coordinates for a theme UUID', () => {
    expect(parsePolaroidPlacementUpdate({ themeId, x: 0.25, y: 0.75 })).toEqual({ themeId, x: 0.25, y: 0.75 })
  })

  it('rejects malformed, stale, and out-of-range messages', () => {
    expect(parsePolaroidPlacementUpdate(null)).toBeNull()
    expect(parsePolaroidPlacementUpdate({ themeId: 'not-a-theme', x: 0.25, y: 0.75 })).toBeNull()
    expect(parsePolaroidPlacementUpdate({ themeId, x: -0.01, y: 0.5 })).toBeNull()
    expect(parsePolaroidPlacementUpdate({ themeId, x: 0.5, y: 1.01 })).toBeNull()
    expect(parsePolaroidPlacementUpdate({ themeId, x: Number.NaN, y: 0.5 })).toBeNull()
    expect(parsePolaroidPlacementUpdate({ themeId, x: '0.5', y: 0.5 })).toBeNull()
  })
})
