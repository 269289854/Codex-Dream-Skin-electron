import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('renderer injection template', () => {
  it('produces valid JavaScript with no unresolved markers', async () => {
    const template = await readFile(join(process.cwd(), 'resources', 'windows', 'renderer-inject.js'), 'utf8')
    const payload = template
      .replace('__DREAM_VERSION_JSON__', JSON.stringify('test-version'))
      .replace('__DREAM_CSS_JSON__', JSON.stringify(':root { --test: 1; }'))
      .replace('__DREAM_ART_JSON__', JSON.stringify('data:image/png;base64,AA=='))
      .replace('__DREAM_CONFIG_JSON__', JSON.stringify({ icons: {} }))
    expect(payload).not.toMatch(/__DREAM_[A-Z_]+__/)
    expect(() => new Function(payload)).not.toThrow()
  })

  it('keeps the custom polaroid container transparent', async () => {
    const css = await readFile(join(process.cwd(), 'resources', 'windows', 'dream-skin.css'), 'utf8')
    const rule = css.match(/\.dream-polaroid\s*\{[^}]+\}/)?.[0]

    expect(rule).toContain('background-color: transparent !important')
    expect(rule).toContain('box-shadow: none !important')
    expect(rule).toContain('filter: none !important')
  })
})
