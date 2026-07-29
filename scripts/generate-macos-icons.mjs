import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import sharp from 'sharp'

const execFileAsync = promisify(execFile)
const source = resolve(process.argv[2] ?? 'resources/branding/codex-dream-skin-source.png')
const output = resolve(process.argv[3] ?? 'resources/macos/codex-dream-skin.icns')
const outputDirectory = dirname(output)
const iconsetRoot = await mkdtemp(join(tmpdir(), 'codex-dream-skin-iconset-'))
const iconset = join(iconsetRoot, 'codex-dream-skin.iconset')

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

const iconFiles = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024]
]

const traySvg = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
    <path fill="#000" d="M9 1.2c.65 4.62 3.18 7.15 7.8 7.8-4.62.65-7.15 3.18-7.8 7.8C8.35 12.18 5.82 9.65 1.2 9 5.82 8.35 8.35 5.82 9 1.2Z"/>
    <path fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m6.7 7.35-1.65 1.65 1.65 1.65m4.6-3.3 1.65 1.65-1.65 1.65"/>
  </svg>
`)

await mkdir(iconset, { recursive: true })
await mkdir(outputDirectory, { recursive: true })

try {
  await Promise.all(iconFiles.map(([fileName, size]) => sharp(maskedSource).resize(size, size, { fit: 'cover' }).png().toFile(join(iconset, fileName))))
  await execFileAsync('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', output])
  await Promise.all([
    sharp(traySvg, { density: 72 }).png().toFile(join(outputDirectory, 'codex-dream-skin-trayTemplate.png')),
    sharp(traySvg, { density: 144 }).resize(36, 36).png().toFile(join(outputDirectory, 'codex-dream-skin-trayTemplate@2x.png'))
  ])
} finally {
  await rm(iconsetRoot, { recursive: true, force: true })
}

console.log(`Generated ${output} and macOS template tray icons.`)
