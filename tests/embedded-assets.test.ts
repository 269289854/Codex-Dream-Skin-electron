import { describe, expect, it } from 'vitest'
import {
  dataUrlByteLength,
  EmbeddedAssetBudget,
  MAX_EMBEDDED_ASSET_BYTES
} from '../src/main/embedded-assets'

describe('embedded asset budget', () => {
  it('accepts exactly 64 MiB and rejects one byte more', () => {
    const budget = new EmbeddedAssetBudget()
    budget.set('first', MAX_EMBEDDED_ASSET_BYTES - 1)
    budget.set('second', 1)
    expect(budget.size).toBe(MAX_EMBEDDED_ASSET_BYTES)
    expect(() => budget.set('third', 1)).toThrow('64 MiB')
  })

  it('replaces an existing entry without double counting and rejects unsafe sizes', () => {
    const budget = new EmbeddedAssetBudget()
    budget.set('asset', 12)
    budget.set('asset', 20)
    expect(budget.size).toBe(20)
    expect(() => budget.set('unsafe', Number.MAX_SAFE_INTEGER + 1)).toThrow('大小无效')
    expect(() => budget.set('negative', -1)).toThrow('大小无效')
  })

  it('calculates decoded Base64 bytes without allocating the decoded payload', () => {
    expect(dataUrlByteLength('data:image/png;base64,')).toBe(0)
    expect(dataUrlByteLength('data:image/png;base64,AQ==')).toBe(1)
    expect(dataUrlByteLength('data:image/png;base64,AQI=')).toBe(2)
    expect(dataUrlByteLength('data:image/png;base64,AQID')).toBe(3)
    expect(() => dataUrlByteLength('data:image/png,raw')).toThrow('Data URL')
    expect(() => dataUrlByteLength('data:image/png;base64,A')).toThrow('Base64')
  })
})
