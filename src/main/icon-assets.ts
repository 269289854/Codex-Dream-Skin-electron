import { Buffer } from 'node:buffer'
import sharp from 'sharp'
import { ensureGifInfiniteLoop } from '../shared/gif'
import { MAX_ICON_GIF_BYTES, MAX_ICON_GIF_DIMENSION, MAX_ICON_GIF_FRAMES } from '../shared/icon-assets'

interface IconGifInspection {
  width: number
  height: number
  frames: number
}

export interface PreparedIconGif extends IconGifInspection {
  bytes: Buffer
  dataUrl: string
  posterDataUrl: string
}

export async function inspectIconGif(bytes: Uint8Array): Promise<IconGifInspection> {
  if (bytes.byteLength > MAX_ICON_GIF_BYTES) throw new Error('GIF 图标不能超过 5 MB。')
  const metadata = await sharp(bytes, { animated: true }).metadata().catch(() => null)
  if (!metadata?.width || !metadata.height || metadata.format !== 'gif') throw new Error('GIF 图标无效或文件头不匹配。')
  const height = metadata.pageHeight ?? metadata.height
  const frames = metadata.pages ?? 1
  if (Math.max(metadata.width, height) > MAX_ICON_GIF_DIMENSION) throw new Error('GIF 图标最长边不能超过 512px。')
  if (frames > MAX_ICON_GIF_FRAMES) throw new Error('GIF 图标不能超过 180 帧。')
  return { width: metadata.width, height, frames }
}

export async function prepareIconGif(bytes: Uint8Array): Promise<PreparedIconGif> {
  const inspection = await inspectIconGif(bytes)
  const normalized = Buffer.from(ensureGifInfiniteLoop(bytes))
  const poster = await sharp(normalized, { page: 0, pages: 1 }).png().toBuffer()
  return {
    ...inspection,
    bytes: normalized,
    dataUrl: `data:image/gif;base64,${normalized.toString('base64')}`,
    posterDataUrl: `data:image/png;base64,${poster.toString('base64')}`
  }
}

export async function prepareIconGifDataUrl(dataUrl: string): Promise<PreparedIconGif> {
  const prefix = 'data:image/gif;base64,'
  if (!dataUrl.startsWith(prefix)) throw new Error('GIF 图标数据格式无效。')
  return prepareIconGif(Buffer.from(dataUrl.slice(prefix.length), 'base64'))
}
