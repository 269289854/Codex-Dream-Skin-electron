import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Studio application lifecycle contract', () => {
  it('routes direct exit through preload without stopping or restoring Codex', async () => {
    const [main, preload] = await Promise.all([
      readFile(join(process.cwd(), 'src', 'main', 'index.ts'), 'utf8'),
      readFile(join(process.cwd(), 'src', 'preload', 'index.ts'), 'utf8')
    ])
    const quitStudio = main.match(/function quitStudio\(\): void \{[\s\S]*?\n\}/)?.[0]

    expect(preload).toContain("quit: () => ipcRenderer.send('app:quit')")
    expect(main).toContain("ipcMain.on('app:quit', () => quitStudio())")
    expect(main).toContain("label: '退出 Studio（保留当前主题）', click: quitStudio")
    expect(quitStudio).toContain('quitting = true')
    expect(quitStudio).toContain('app.quit()')
    expect(quitStudio).not.toContain('codexService.stop')
    expect(quitStudio).not.toContain('codexService.restore')
  })
})
