import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('macOS Studio window contract', () => {
  it('keeps sandboxing while selecting native macOS chrome and menus', async () => {
    const [main, styles] = await Promise.all([
      readFile(join(process.cwd(), 'src', 'main', 'index.ts'), 'utf8'),
      readFile(join(process.cwd(), 'src', 'renderer', 'src', 'styles.css'), 'utf8')
    ])
    expect(main).toContain("titleBarStyle: 'hiddenInset'")
    expect(main).toContain('trafficLightPosition: { x: 14, y: 13 }')
    expect(main).toContain("role: 'copy'")
    expect(main).toContain("role: 'paste'")
    expect(main).toContain("trayIcon?.setTemplateImage(true)")
    expect(main).toContain('contextIsolation: true')
    expect(main).toContain('nodeIntegration: false')
    expect(main).toContain('sandbox: true')
    expect(styles).toContain('.studio-shell[data-platform="darwin"] .titlebar')
  })
})
