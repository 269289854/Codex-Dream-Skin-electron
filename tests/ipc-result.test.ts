import { describe, expect, it } from 'vitest'
import { captureIpcResult, unwrapIpcResult } from '../src/shared/ipc-result'

describe('IPC result transport', () => {
  it('returns successful values without changing the public result', async () => {
    const result = await captureIpcResult(async () => ({ port: 9336 }))

    expect(unwrapIpcResult(result)).toEqual({ port: 9336 })
  })

  it('serializes failures and restores them as renderer errors', async () => {
    const result = await captureIpcResult(async () => { throw new Error('Port unavailable.') })

    expect(result).toEqual({ ok: false, error: 'Port unavailable.' })
    expect(() => unwrapIpcResult(result)).toThrow('Port unavailable.')
  })
})
