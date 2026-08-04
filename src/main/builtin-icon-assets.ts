import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SystemIconName } from '../shared/project-icons'
import { SYSTEM_ICON_ASSET_FILES } from '../shared/builtin-icon-assets'
import { assertSafeSvgSource } from './asset-validation'

const svgRootPattern = /^\s*<svg\b[^>]*\bviewBox=["']0 0 64 64["'][^>]*>/i

export class BuiltinIconAssetStore {
  private readonly dataUrls = new Map<SystemIconName, string>()

  constructor(private readonly root: string) {}

  async getDataUrl(name: SystemIconName): Promise<string> {
    const cached = this.dataUrls.get(name)
    if (cached) return cached
    const fileName = SYSTEM_ICON_ASSET_FILES[name]
    if (!fileName) throw new Error(`系统图标资源未注册: ${name}`)
    const source = await readFile(join(this.root, fileName), 'utf8')
    assertSafeSvgSource(source)
    if (!svgRootPattern.test(source)) throw new Error(`系统图标 SVG 无效: ${name}`)
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(source, 'utf8').toString('base64')}`
    this.dataUrls.set(name, dataUrl)
    return dataUrl
  }
}
