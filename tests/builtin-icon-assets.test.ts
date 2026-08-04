import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { DOMParser } from '@xmldom/xmldom'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { SYSTEM_ICON_ASSET_FILES } from '../src/shared/builtin-icon-assets'
import { SYSTEM_ICON_NAMES } from '../src/shared/project-icons'

const iconRoot = join(process.cwd(), 'icon')

describe('builtin icon assets', () => {
  it('maps every system icon name to one safe, renderable SVG', async () => {
    const files = (await readdir(iconRoot)).filter((file) => file.endsWith('.svg')).sort()
    expect(files).toHaveLength(116)
    expect(Object.keys(SYSTEM_ICON_ASSET_FILES)).toHaveLength(SYSTEM_ICON_NAMES.length)
    expect(new Set(Object.values(SYSTEM_ICON_ASSET_FILES)).size).toBe(SYSTEM_ICON_NAMES.length)

    for (const name of SYSTEM_ICON_NAMES) {
      const fileName = SYSTEM_ICON_ASSET_FILES[name]
      expect(files).toContain(fileName)
      const source = await readFile(join(iconRoot, fileName), 'utf8')
      const errors: string[] = []
      const document = new DOMParser({ errorHandler: { error: (message) => errors.push(message), fatalError: (message) => errors.push(message) } }).parseFromString(source, 'image/svg+xml')
      expect(errors, name).toEqual([])
      expect(document.documentElement.nodeName, name).toBe('svg')
      expect(document.documentElement.getAttribute('viewBox'), name).toBe('0 0 64 64')
      expect(source, name).not.toMatch(/<\/(?:script|foreignObject|iframe|object|embed)>|<!(?:DOCTYPE|ENTITY)|\b(?:href|src)\s*=|url\(/i)

      const { data, info } = await sharp(Buffer.from(source, 'utf8')).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      let visiblePixels = 0
      for (let index = 3; index < data.length; index += info.channels) if ((data[index] ?? 0) > 0) visiblePixels += 1
      expect(visiblePixels, name).toBeGreaterThan(0)
    }
  })
})
