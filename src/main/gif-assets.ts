import { Buffer } from 'node:buffer'
import sharp from 'sharp'
import { ensureGifInfiniteLoop } from '../shared/gif'

export interface PreparedGif {
  bytes: Buffer
  dataUrl: string
  posterDataUrl: string
}

export async function prepareGif(bytes: Uint8Array): Promise<PreparedGif> {
  const normalized = Buffer.from(ensureGifInfiniteLoop(bytes))
  const poster = await sharp(normalized, { page: 0, pages: 1 }).png().toBuffer()
  return {
    bytes: normalized,
    dataUrl: `data:image/gif;base64,${normalized.toString('base64')}`,
    posterDataUrl: `data:image/png;base64,${poster.toString('base64')}`
  }
}

export async function prepareGifDataUrl(dataUrl: string): Promise<PreparedGif> {
  const prefix = 'data:image/gif;base64,'
  if (!dataUrl.startsWith(prefix)) throw new Error('GIF 数据格式无效。')
  return prepareGif(Buffer.from(dataUrl.slice(prefix.length), 'base64'))
}
