import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Windows installer upgrade contract', () => {
  it('closes only the previous Studio process before replacing application files', async () => {
    const [packageJson, installer] = await Promise.all([
      readFile(join(process.cwd(), 'package.json'), 'utf8').then((content) => JSON.parse(content) as {
        build: { nsis: { include?: string } }
      }),
      readFile(join(process.cwd(), 'build', 'installer.nsh'), 'utf8')
    ])

    expect(packageJson.build.nsis.include).toBe('build/installer.nsh')
    expect(installer).toContain('!macro customCheckAppRunning')
    expect(installer).toContain('!define STUDIO_PROCESS_NAME "Codex Dream Skin Studio.exe"')
    expect(installer).toContain('${nsProcess::CloseProcess} "${STUDIO_PROCESS_NAME}"')
    expect(installer).toContain('${nsProcess::FindProcess} "${STUDIO_PROCESS_NAME}"')
    expect(installer).toContain('${nsProcess::KillProcess} "${STUDIO_PROCESS_NAME}"')
    expect(installer).not.toContain('Codex.exe')
    expect(installer).not.toContain('runtime/session.json')
    expect(installer).not.toMatch(/\b(?:Delete|RMDir)\b/)
  })
})
