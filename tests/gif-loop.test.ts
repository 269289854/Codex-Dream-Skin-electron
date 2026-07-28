import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { prepareIconGif } from '../src/main/icon-assets'
import { compileTheme } from '../src/main/theme-compiler'
import { ensureGifInfiniteLoop } from '../src/shared/gif'
import { createDefaultTheme } from '../src/shared/theme'

const TEST_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64')
const LOOP_EXTENSION = Buffer.from([
  0x21, 0xff, 0x0b,
  0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30,
  0x03, 0x01, 0x02, 0x00, 0x00
])

describe('GIF loop normalization', () => {
  it('changes a finite loop extension without touching frame bytes', () => {
    const finite = gifWithLoopCount(2)
    const expected = Buffer.from(finite)
    const loopOffset = applicationLoopOffset(expected)
    expected[loopOffset] = 0
    expected[loopOffset + 1] = 0

    const normalized = Buffer.from(ensureGifInfiniteLoop(finite))

    expect(normalized).toEqual(expected)
    expect(readLoopCount(normalized)).toBe(0)
  })

  it('adds an infinite loop extension to GIFs that omit one', () => {
    const normalized = Buffer.from(ensureGifInfiniteLoop(TEST_GIF))

    expect(normalized.length).toBe(TEST_GIF.length + 19)
    expect(normalized.subarray(0, 6).toString('ascii')).toBe('GIF89a')
    expect(readLoopCount(normalized)).toBe(0)
    expect(TEST_GIF.toString('base64')).toBe('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==')
  })

  it('preserves already infinite and invalid inputs without allocating replacements', () => {
    const infinite = Buffer.from(gifWithLoopCount(0))
    const invalid = Buffer.from([0, 1, 2, 3])

    expect(ensureGifInfiniteLoop(infinite)).toBe(infinite)
    expect(ensureGifInfiniteLoop(invalid)).toBe(invalid)
  })

  it('normalizes an existing brand signature GIF in compiled Studio and runtime assets', async () => {
    const profile = createDefaultTheme('11111111-1111-4111-8111-111111111111')
    const asset = 'assets/brand-signature.gif'
    const finite = gifWithLoopCount(2)
    profile.brandSignature = {
      mode: 'gif',
      source: { asset, kind: 'image', mimeType: 'image/gif' },
      mediaWidth: 96
    }

    const compiled = await compileTheme(profile, async () => `data:image/gif;base64,${finite.toString('base64')}`)
    const compiledBytes = Buffer.from(compiled.assets[asset]?.split(',')[1] ?? '', 'base64')
    const runtimePayload = JSON.parse(compiled.rendererPayload) as { assets: Record<string, string> }
    const runtimeBytes = Buffer.from(runtimePayload.assets[asset]?.split(',')[1] ?? '', 'base64')

    expect(readLoopCount(compiledBytes)).toBe(0)
    expect(runtimeBytes).toEqual(compiledBytes)
  })

  it('normalizes finite and missing icon loops while generating a PNG first frame', async () => {
    for (const source of [gifWithLoopCount(2), TEST_GIF]) {
      const prepared = await prepareIconGif(source)
      expect(readLoopCount(prepared.bytes)).toBe(0)
      expect(prepared.dataUrl).toBe(`data:image/gif;base64,${prepared.bytes.toString('base64')}`)
      expect(prepared.posterDataUrl).toMatch(/^data:image\/png;base64,/)
      expect(Buffer.from(prepared.posterDataUrl.split(',')[1] ?? '', 'base64').subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      expect(prepared).toMatchObject({ width: 1, height: 1, frames: 1 })
    }
  })
})

function gifWithLoopCount(loopCount: number): Buffer {
  const extension = Buffer.from(LOOP_EXTENSION)
  extension[16] = loopCount & 0xff
  extension[17] = (loopCount >>> 8) & 0xff
  const dataStart = 19
  return Buffer.concat([TEST_GIF.subarray(0, dataStart), extension, TEST_GIF.subarray(dataStart)])
}

function applicationLoopOffset(bytes: Uint8Array): number {
  const id = Buffer.from(bytes).indexOf(Buffer.from('NETSCAPE2.0'))
  if (id < 0) throw new Error('GIF loop extension is missing.')
  return id + 13
}

function readLoopCount(bytes: Uint8Array): number {
  const offset = applicationLoopOffset(bytes)
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8)
}
