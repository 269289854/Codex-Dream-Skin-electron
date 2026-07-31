import { describe, expect, it } from 'vitest'
import { LocalizedError, joinLocalizedMessages, localizedMessage, localizedMessageFrom } from '../src/shared/localized-message'
import { captureIpcResult, unwrapIpcResult } from '../src/shared/ipc-result'

describe('IPC result transport', () => {
  it('returns successful values without changing the public result', async () => {
    const result = await captureIpcResult(async () => ({ port: 9336 }))

    expect(unwrapIpcResult(result)).toEqual({ port: 9336 })
  })

  it('serializes failures and restores them as renderer errors', async () => {
    const result = await captureIpcResult(async () => { throw new Error('Port unavailable.') })

    expect(result).toEqual({ ok: false, error: { source: 'Port unavailable.' } })
    expect(() => unwrapIpcResult(result)).toThrow('Port unavailable.')
  })

  it('preserves nested localized messages across the IPC round trip', async () => {
    const message = joinLocalizedMessages([
      localizedMessage('主题启动失败'),
      localizedMessage('恢复失败：{reason}', {
        reason: localizedMessage('端口 {port} 均不可用。', { port: '9335, 9336' })
      })
    ])
    const result = await captureIpcResult(async () => { throw new LocalizedError(message) })

    expect(result).toEqual({ ok: false, error: message })
    try {
      unwrapIpcResult(result)
      throw new Error('Expected unwrapIpcResult to throw.')
    } catch (reason) {
      expect(reason).toBeInstanceOf(LocalizedError)
      expect((reason as LocalizedError).localizedMessage).toEqual(message)
      expect((reason as Error).message).toBe('主题启动失败；恢复失败：端口 9335, 9336 均不可用。')
    }
  })

  it('recovers localized messages when the context bridge preserves only Error.message', () => {
    const message = localizedMessage('主题导入失败：{reason}', {
      reason: localizedMessage('分享包缺少素材: {asset}', { asset: 'assets/hero.png' })
    })
    const result = { ok: false, error: message } as const

    try {
      unwrapIpcResult(result, true)
      throw new Error('Expected unwrapIpcResult to throw.')
    } catch (reason) {
      const bridgedError = new Error(`Error invoking remote method 'share:import': ${(reason as Error).message}`)
      expect(localizedMessageFrom(bridgedError)).toEqual(message)
    }
  })

  it('recognizes localized errors reconstructed by an isolated renderer realm', () => {
    const message = localizedMessage('素材路径无效。')
    const bridgedError = { name: 'LocalizedError', message: '素材路径无效。', localizedMessage: structuredClone(message) }

    expect(localizedMessageFrom(bridgedError)).toEqual(message)
    expect(localizedMessageFrom({ localizedMessage: { source: 42 } })).toEqual({ source: '操作失败' })
  })
})
