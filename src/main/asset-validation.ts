import { setImmediate as yieldToEventLoop } from 'node:timers/promises'
import { Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import * as fontkit from 'fontkit'
import type { Font, FontCollection } from 'fontkit'
import sharp from 'sharp'
import type { ImportedFontFormat } from '../shared/typography'

export const MAX_STATIC_IMAGE_DIMENSION = 8192
export const MAX_STATIC_IMAGE_PIXELS = 40_000_000
export const MAX_GIF_DIMENSION = 2048
export const MAX_GIF_FRAMES = 180
export const MAX_GIF_TOTAL_PIXELS = 32_000_000
export const MAX_DECODED_FONT_BYTES = 32 * 1024 * 1024

export interface ImageInspection {
  width: number
  height: number
  pages: number
}

export function assertSafeSvgSource(source: string): void {
  if (source.length > 2_000_000 || /<(?:script|foreignObject|iframe|object|embed)\b|<!DOCTYPE|<!ENTITY|(?:href|src)\s*=\s*["']\s*(?:https?:|file:|javascript:)/i.test(source)) {
    throw new Error('SVG 包含不支持的内容或外部引用。')
  }
}

export async function inspectImageBytes(
  bytes: Buffer,
  extension: string,
  signal?: AbortSignal,
  cancelledMessage = '图片读取已取消。'
): Promise<ImageInspection> {
  throwIfAborted(signal, cancelledMessage)
  const isGif = extension === '.gif'
  const metadata = await sharp(bytes, {
    animated: isGif,
    limitInputPixels: MAX_STATIC_IMAGE_PIXELS
  }).metadata().catch(() => null)
  throwIfAborted(signal, cancelledMessage)
  if (!metadata?.width || !metadata.height) throw new Error('媒体图片无效或无法读取尺寸。')
  const expectedFormat = extension === '.jpg' || extension === '.jpeg' ? 'jpeg' : extension.slice(1)
  if (metadata.format !== expectedFormat) throw new Error('媒体图片内容与扩展名不匹配。')

  const width = metadata.width
  const height = metadata.pageHeight ?? metadata.height
  const pages = metadata.pages ?? 1
  const inspection = { width, height, pages }
  assertImageInspectionBudget(inspection, extension)

  const maxDecodedBytes = safeProduct(isGif ? MAX_GIF_TOTAL_PIXELS : MAX_STATIC_IMAGE_PIXELS, 4)
  let decodedBytes = 0
  const decoder = sharp(bytes, {
    animated: isGif,
    limitInputPixels: isGif ? MAX_GIF_TOTAL_PIXELS : MAX_STATIC_IMAGE_PIXELS
  }).toColourspace('srgb').ensureAlpha().raw({ depth: 'uchar' })
  const sink = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      decodedBytes += chunk.byteLength
      if (!Number.isSafeInteger(decodedBytes) || decodedBytes > maxDecodedBytes) {
        callback(new Error('图片完整解码大小超过限制。'))
        return
      }
      callback()
    }
  })
  try {
    await pipeline(decoder, sink, { signal })
  } catch (error) {
    if (signal?.aborted) throw new Error(cancelledMessage)
    throw new Error('媒体图片损坏或无法完整解码。', { cause: error })
  }
  throwIfAborted(signal, cancelledMessage)
  if (decodedBytes === 0) throw new Error('媒体图片没有可解码的像素。')
  return inspection
}

export function assertImageInspectionBudget(inspection: ImageInspection, extension: string): void {
  const { width, height, pages } = inspection
  const isGif = extension === '.gif'
  assertPositiveInteger(width)
  assertPositiveInteger(height)
  assertPositiveInteger(pages)
  const pixelsPerFrame = safeProduct(width, height)
  const totalPixels = safeProduct(pixelsPerFrame, pages)

  if (isGif) {
    if (Math.max(width, height) > MAX_GIF_DIMENSION) throw new Error('GIF 最长边不能超过 2048px。')
    if (pages > MAX_GIF_FRAMES) throw new Error('GIF 不能超过 180 帧。')
    if (totalPixels > MAX_GIF_TOTAL_PIXELS) throw new Error('GIF 总帧像素不能超过 32,000,000。')
  } else {
    if (Math.max(width, height) > MAX_STATIC_IMAGE_DIMENSION) throw new Error('图片最长边不能超过 8192px。')
    if (pixelsPerFrame > MAX_STATIC_IMAGE_PIXELS) throw new Error('图片像素不能超过 40,000,000。')
  }
}

export async function validateFontBytes(
  bytes: Buffer,
  format: ImportedFontFormat,
  signal?: AbortSignal,
  cancelledMessage = '字体读取已取消。'
): Promise<void> {
  throwIfAborted(signal, cancelledMessage)
  validateFontContainer(bytes, format)
  let parsed: Font | FontCollection
  try {
    parsed = fontkit.create(bytes)
  } catch (error) {
    throw new Error('字体文件损坏或无法完整解析。', { cause: error })
  }
  if ('fonts' in parsed) throw new Error('不支持字体集合文件。')
  const font = parsed
  if (!Number.isSafeInteger(font.numGlyphs) || font.numGlyphs < 1 || font.numGlyphs > 65_535) {
    throw new Error('字体字形数量无效。')
  }
  try {
    void font.postscriptName
    void font.familyName
    void font.characterSet
    void font.availableFeatures
    for (let glyphIndex = 0; glyphIndex < font.numGlyphs; glyphIndex += 1) {
      throwIfAborted(signal, cancelledMessage)
      const glyph = font.getGlyph(glyphIndex)
      void glyph.advanceWidth
      void glyph.path.commands
      if (glyphIndex > 0 && glyphIndex % 256 === 0) await yieldToEventLoop()
    }
  } catch (error) {
    if (signal?.aborted) throw new Error(cancelledMessage)
    throw new Error('字体字形数据损坏或无法解析。', { cause: error })
  }
}

function validateFontContainer(bytes: Buffer, format: ImportedFontFormat): void {
  if (bytes.length < 12) throw new Error('字体文件已截断。')
  const signature = bytes.toString('latin1', 0, 4)
  if (signature === 'ttcf') throw new Error('不支持字体集合文件。')
  const expected = format === 'ttf'
    ? signature === '\u0000\u0001\u0000\u0000' || signature === 'true'
    : format === 'otf'
      ? signature === 'OTTO'
      : format === 'woff'
        ? signature === 'wOFF'
        : signature === 'wOF2'
  if (!expected) throw new Error('字体文件内容与扩展名不匹配。')

  if (format === 'woff' || format === 'woff2') {
    const minimumHeader = format === 'woff' ? 44 : 48
    if (bytes.length < minimumHeader) throw new Error('字体文件头已截断。')
    const declaredLength = bytes.readUInt32BE(8)
    const tableCount = bytes.readUInt16BE(12)
    const totalSfntSize = bytes.readUInt32BE(16)
    if (declaredLength !== bytes.length || tableCount < 1 || tableCount > 128) throw new Error('字体容器目录无效。')
    if (totalSfntSize < 12 || totalSfntSize > MAX_DECODED_FONT_BYTES) throw new Error('字体解压后不能超过 32 MiB。')
    if (format === 'woff') validateWoffDirectory(bytes, tableCount)
    else {
      const compressedSize = bytes.readUInt32BE(20)
      if (compressedSize < 1 || compressedSize > bytes.length - minimumHeader) throw new Error('WOFF2 压缩数据范围无效。')
    }
    return
  }

  const tableCount = bytes.readUInt16BE(4)
  if (tableCount < 1 || tableCount > 128 || 12 + tableCount * 16 > bytes.length) throw new Error('字体表目录无效。')
  for (let index = 0; index < tableCount; index += 1) {
    const recordOffset = 12 + index * 16
    const tableOffset = bytes.readUInt32BE(recordOffset + 8)
    const tableLength = bytes.readUInt32BE(recordOffset + 12)
    assertRange(bytes.length, tableOffset, tableLength)
  }
}

function validateWoffDirectory(bytes: Buffer, tableCount: number): void {
  const directoryEnd = 44 + tableCount * 20
  if (directoryEnd > bytes.length) throw new Error('WOFF 表目录已截断。')
  for (let index = 0; index < tableCount; index += 1) {
    const recordOffset = 44 + index * 20
    const tableOffset = bytes.readUInt32BE(recordOffset + 4)
    const compressedLength = bytes.readUInt32BE(recordOffset + 8)
    const originalLength = bytes.readUInt32BE(recordOffset + 12)
    if (compressedLength > originalLength) throw new Error('WOFF 表压缩长度无效。')
    assertRange(bytes.length, tableOffset, compressedLength)
  }
}

function assertRange(total: number, offset: number, length: number): void {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset > total || length > total - offset) {
    throw new Error('字体表数据超出文件范围。')
  }
}

function safeProduct(left: number, right: number): number {
  const result = left * right
  if (!Number.isSafeInteger(result)) throw new Error('图片像素信息无效。')
  return result
}

function assertPositiveInteger(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('图片尺寸或帧数无效。')
}

function throwIfAborted(signal: AbortSignal | undefined, message: string): void {
  if (signal?.aborted) throw new Error(message)
}
