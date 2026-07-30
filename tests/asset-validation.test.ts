import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import {
  assertImageInspectionBudget,
  inspectImageBytes,
  MAX_DECODED_FONT_BYTES,
  validateFontBytes
} from '../src/main/asset-validation'

const TEST_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64')
const TEST_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64')
const TEST_FONT = join(process.cwd(), 'resources', 'shared', 'fonts', 'dancing-script', 'dancing-script-latin-wght-normal.woff2')

describe('image asset validation', () => {
  it('fully decodes valid images and rejects the 65-byte metadata-only PNG', async () => {
    await expect(inspectImageBytes(TEST_PNG, '.png')).resolves.toEqual({ width: 1, height: 1, pages: 1 })
    await expect(inspectImageBytes(TEST_PNG.subarray(0, 65), '.png')).rejects.toThrow('完整解码')
  })

  it('rejects truncated JPEG, WebP, and GIF payloads and extension mismatches', async () => {
    const jpeg = await sharp(TEST_PNG).jpeg().toBuffer()
    const webp = await sharp(TEST_PNG).webp().toBuffer()
    await expect(inspectImageBytes(jpeg.subarray(0, Math.floor(jpeg.length / 2)), '.jpg')).rejects.toThrow()
    await expect(inspectImageBytes(webp.subarray(0, Math.floor(webp.length / 2)), '.webp')).rejects.toThrow()
    await expect(inspectImageBytes(TEST_GIF.subarray(0, TEST_GIF.length - 4), '.gif')).rejects.toThrow()
    await expect(inspectImageBytes(TEST_PNG, '.jpg')).rejects.toThrow('扩展名')
  })

  it('enforces exact static image dimensions and pixel budgets', () => {
    expect(() => assertImageInspectionBudget({ width: 8192, height: 1, pages: 1 }, '.png')).not.toThrow()
    expect(() => assertImageInspectionBudget({ width: 8193, height: 1, pages: 1 }, '.png')).toThrow('8192')
    expect(() => assertImageInspectionBudget({ width: 8000, height: 5000, pages: 1 }, '.webp')).not.toThrow()
    expect(() => assertImageInspectionBudget({ width: 8000, height: 5001, pages: 1 }, '.webp')).toThrow('40,000,000')
    expect(() => assertImageInspectionBudget({ width: Number.MAX_SAFE_INTEGER, height: 2, pages: 1 }, '.png')).toThrow('像素信息')
  })

  it('applies static image limits to fully decoded SVG input', async () => {
    const valid = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8192" height="1"><rect width="8192" height="1"/></svg>')
    const oversized = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8193" height="1"><rect width="8193" height="1"/></svg>')
    await expect(inspectImageBytes(valid, '.svg')).resolves.toEqual({ width: 8192, height: 1, pages: 1 })
    await expect(inspectImageBytes(oversized, '.svg')).rejects.toThrow('8192')
  })

  it('enforces exact GIF dimensions, frame count, and total frame pixels', () => {
    expect(() => assertImageInspectionBudget({ width: 2048, height: 1, pages: 180 }, '.gif')).not.toThrow()
    expect(() => assertImageInspectionBudget({ width: 2049, height: 1, pages: 1 }, '.gif')).toThrow('2048')
    expect(() => assertImageInspectionBudget({ width: 1, height: 1, pages: 181 }, '.gif')).toThrow('180')
    expect(() => assertImageInspectionBudget({ width: 1000, height: 200, pages: 160 }, '.gif')).not.toThrow()
    expect(() => assertImageInspectionBudget({ width: 1000, height: 200, pages: 161 }, '.gif')).toThrow('32,000,000')
  })
})

describe('font asset validation', () => {
  it('fully parses the bundled Dancing Script WOFF2 font', async () => {
    await expect(validateFontBytes(await readFile(TEST_FONT), 'woff2')).resolves.toBeUndefined()
  })

  it('rejects truncated, mismatched, collection, and corrupt table data', async () => {
    const valid = await readFile(TEST_FONT)
    await expect(validateFontBytes(valid.subarray(0, 32), 'woff2')).rejects.toThrow()
    await expect(validateFontBytes(valid, 'ttf')).rejects.toThrow('扩展名')

    const collection = Buffer.alloc(12)
    collection.write('ttcf')
    await expect(validateFontBytes(collection, 'ttf')).rejects.toThrow('集合')

    const corruptTtf = Buffer.alloc(28)
    corruptTtf.writeUInt32BE(0x00010000, 0)
    corruptTtf.writeUInt16BE(1, 4)
    corruptTtf.write('head', 12)
    corruptTtf.writeUInt32BE(100, 20)
    corruptTtf.writeUInt32BE(20, 24)
    await expect(validateFontBytes(corruptTtf, 'ttf')).rejects.toThrow('超出文件范围')
  })

  it('rejects WOFF containers whose declared decoded SFNT exceeds 32 MiB', async () => {
    const woff = Buffer.alloc(64)
    woff.write('wOFF')
    woff.writeUInt32BE(64, 8)
    woff.writeUInt16BE(1, 12)
    woff.writeUInt32BE(MAX_DECODED_FONT_BYTES + 1, 16)
    await expect(validateFontBytes(woff, 'woff')).rejects.toThrow('32 MiB')
  })

  it('honors cancellation while parsing glyphs', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(validateFontBytes(await readFile(TEST_FONT), 'woff2', controller.signal, '字体测试已取消。')).rejects.toThrow('字体测试已取消')
  })
})
