const GIF_HEADER_SIZE = 6
const LOGICAL_SCREEN_DESCRIPTOR_SIZE = 7
const APPLICATION_EXTENSION_LABEL = 0xff
const EXTENSION_INTRODUCER = 0x21
const IMAGE_DESCRIPTOR = 0x2c
const TRAILER = 0x3b
const LOOP_APPLICATION_IDS = ['NETSCAPE2.0', 'ANIMEXTS1.0'] as const
const INFINITE_LOOP_EXTENSION = Uint8Array.from([
  0x21, 0xff, 0x0b,
  0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30,
  0x03, 0x01, 0x00, 0x00, 0x00
])

export function gifPosterAssetKey(asset: string): string {
  return `builtin/gif-posters/${asset}.png`
}

export function ensureGifInfiniteLoop(bytes: Uint8Array): Uint8Array {
  const dataStart = gifDataStart(bytes)
  if (dataStart === null) return bytes

  let offset = dataStart
  while (offset < bytes.length) {
    const marker = bytes[offset]
    if (marker === IMAGE_DESCRIPTOR || marker === TRAILER) break
    if (marker !== EXTENSION_INTRODUCER || offset + 2 >= bytes.length) return bytes

    const label = bytes[offset + 1]
    const firstBlock = offset + 2
    const firstBlockSize = bytes[firstBlock]
    if (label === APPLICATION_EXTENSION_LABEL && firstBlockSize === 11) {
      const applicationIdStart = firstBlock + 1
      const loopBlock = applicationIdStart + 11
      if (
        loopBlock + 3 < bytes.length &&
        LOOP_APPLICATION_IDS.some((id) => matchesAscii(bytes, applicationIdStart, id)) &&
        bytes[loopBlock] === 3 &&
        bytes[loopBlock + 1] === 1
      ) {
        if (bytes[loopBlock + 2] === 0 && bytes[loopBlock + 3] === 0) return bytes
        const result = Uint8Array.from(bytes)
        result[loopBlock + 2] = 0
        result[loopBlock + 3] = 0
        return result
      }
    }

    const next = skipSubBlocks(bytes, firstBlock)
    if (next === null) return bytes
    offset = next
  }

  const result = new Uint8Array(bytes.length + INFINITE_LOOP_EXTENSION.length)
  result.set(bytes.subarray(0, dataStart), 0)
  result.set(INFINITE_LOOP_EXTENSION, dataStart)
  result.set(bytes.subarray(dataStart), dataStart + INFINITE_LOOP_EXTENSION.length)
  result.set([0x38, 0x39, 0x61], 3)
  return result
}

function gifDataStart(bytes: Uint8Array): number | null {
  if (bytes.length < GIF_HEADER_SIZE + LOGICAL_SCREEN_DESCRIPTOR_SIZE) return null
  if (!matchesAscii(bytes, 0, 'GIF87a') && !matchesAscii(bytes, 0, 'GIF89a')) return null

  const packedFields = bytes[10] ?? 0
  const globalColorTableSize = (packedFields & 0x80) !== 0
    ? 3 * (2 ** ((packedFields & 0x07) + 1))
    : 0
  const dataStart = GIF_HEADER_SIZE + LOGICAL_SCREEN_DESCRIPTOR_SIZE + globalColorTableSize
  return dataStart <= bytes.length ? dataStart : null
}

function matchesAscii(bytes: Uint8Array, offset: number, value: string): boolean {
  if (offset + value.length > bytes.length) return false
  for (let index = 0; index < value.length; index += 1) {
    if (bytes[offset + index] !== value.charCodeAt(index)) return false
  }
  return true
}

function skipSubBlocks(bytes: Uint8Array, start: number): number | null {
  let offset = start
  while (offset < bytes.length) {
    const size = bytes[offset] ?? 0
    offset += 1
    if (size === 0) return offset
    if (offset + size > bytes.length) return null
    offset += size
  }
  return null
}
