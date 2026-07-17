import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import sharp from 'sharp'

const source = resolve(process.argv[2] ?? 'resources/branding/codex-dream-skin-source.png')
const output = resolve(process.argv[3] ?? 'resources/windows/codex-dream-skin.ico')
const sizes = [16, 24, 32, 48, 64, 128, 256]

const sourceBuffer = await readFile(source)
const metadata = await sharp(sourceBuffer).metadata()
if (!metadata.width || !metadata.height || metadata.width !== metadata.height) {
  throw new Error('The icon source must be a square raster image.')
}

const mask = Buffer.from(
  `<svg width="${metadata.width}" height="${metadata.height}" viewBox="0 0 ${metadata.width} ${metadata.height}"><rect x="2" y="2" width="${metadata.width - 4}" height="${metadata.height - 4}" rx="${Math.round(metadata.width * 0.172)}" fill="white"/></svg>`
)
const maskedSource = await sharp(sourceBuffer)
  .ensureAlpha()
  .composite([{ input: mask, blend: 'dest-in' }])
  .png()
  .toBuffer()
const frames = []

for (const size of sizes) {
  frames.push({
    size,
    data: await sharp(maskedSource).resize(size, size, { fit: 'cover' }).png().toBuffer()
  })
}

const header = Buffer.alloc(6 + frames.length * 16)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(frames.length, 4)

let offset = header.length
for (const [index, frame] of frames.entries()) {
  const entryOffset = 6 + index * 16
  header[entryOffset] = frame.size === 256 ? 0 : frame.size
  header[entryOffset + 1] = frame.size === 256 ? 0 : frame.size
  header[entryOffset + 2] = 0
  header[entryOffset + 3] = 0
  header.writeUInt16LE(1, entryOffset + 4)
  header.writeUInt16LE(32, entryOffset + 6)
  header.writeUInt32LE(frame.data.length, entryOffset + 8)
  header.writeUInt32LE(offset, entryOffset + 12)
  offset += frame.data.length
}

await mkdir(dirname(output), { recursive: true })
await writeFile(output, Buffer.concat([header, ...frames.map((frame) => frame.data)]))
console.log(`Generated ${output} (${offset} bytes, ${sizes.join(', ')} px)`)
