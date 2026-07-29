import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MAC_CODEX_BUNDLE_ID,
  MAC_CODEX_TEAM_ID,
  MacCodexDriver,
  parseCodesignDetails,
  parseLsofListeners,
  parseMacProcessList,
  type MacCommandRunner
} from '../src/main/macos-codex-driver'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('macOS Codex identity helpers', () => {
  it('parses signatures, process identities, and loopback listeners', () => {
    expect(parseCodesignDetails(`Identifier=${MAC_CODEX_BUNDLE_ID}\nTeamIdentifier=${MAC_CODEX_TEAM_ID}\n`)).toEqual({ identifier: MAC_CODEX_BUNDLE_ID, teamIdentifier: MAC_CODEX_TEAM_ID })
    expect(parseMacProcessList('  123 Wed Jul 29 12:34:56 2026 /Applications/ChatGPT.app/Contents/MacOS/ChatGPT\n')).toEqual([{ pid: 123, startedAt: 'Wed Jul 29 12:34:56 2026', executable: '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT' }])
    expect(parseLsofListeners('p123\ncChatGPT\nn127.0.0.1:9335\n')).toEqual([{ pid: 123, command: 'ChatGPT', endpoints: ['127.0.0.1:9335'] }])
  })
})

describe('MacCodexDriver', () => {
  it('detects only a valid official signed app and reports backup availability', async () => {
    const fixture = await createAppFixture()
    await writeFile(join(fixture.studioRoot, 'backups', 'config.before-studio.toml'), 'backup')
    const runCommand = createCommandRunner(fixture)
    const driver = new MacCodexDriver(fixture.studioRoot, fixture.homeRoot, { runCommand })

    await expect(driver.detect()).resolves.toMatchObject({
      platform: 'darwin',
      distribution: 'mac-app-bundle',
      version: '26.721.81911',
      executable: fixture.executable,
      installationId: `${MAC_CODEX_BUNDLE_ID}:${MAC_CODEX_TEAM_ID}`,
      running: false,
      backupAvailable: true
    })
  })

  it('rejects an app signed by another team', async () => {
    const fixture = await createAppFixture()
    const runCommand = createCommandRunner(fixture, 'UNTRUSTED')
    const driver = new MacCodexDriver(fixture.studioRoot, fixture.homeRoot, { runCommand })
    await expect(driver.detect()).rejects.toThrow('未找到签名身份有效')
  })

  it('reuses a CDP endpoint only when its listener and websocket targets are verified', async () => {
    const fixture = await createAppFixture()
    const runCommand = createCommandRunner(fixture, MAC_CODEX_TEAM_ID, true)
    const fetchJson = vi.fn(async (url: string) => url.endsWith('/json/version')
      ? { webSocketDebuggerUrl: 'ws://127.0.0.1:9335/devtools/browser/browser-1' }
      : [{ id: 'page-1', type: 'page', url: 'app://-/index.html', webSocketDebuggerUrl: 'ws://127.0.0.1:9335/devtools/page/page-1' }])
    const driver = new MacCodexDriver(fixture.studioRoot, fixture.homeRoot, { runCommand, fetchJson })

    await expect(driver.start(9335, false)).resolves.toEqual({
      port: 9335,
      browserId: 'browser-1',
      version: '26.721.81911',
      platform: 'darwin',
      installationId: `${MAC_CODEX_BUNDLE_ID}:${MAC_CODEX_TEAM_ID}`
    })
    expect(runCommand).not.toHaveBeenCalledWith('/usr/bin/open', expect.anything(), expect.anything())
  })

  it('does not attach to a wildcard listener owned by a running Codex process', async () => {
    const fixture = await createAppFixture()
    const runCommand = createCommandRunner(fixture, MAC_CODEX_TEAM_ID, true, '*:9335')
    const driver = new MacCodexDriver(fixture.studioRoot, fixture.homeRoot, { runCommand, fetchJson: vi.fn() })
    await expect(driver.start(9335, false)).rejects.toThrow('需要重启')
  })
})

async function createAppFixture(): Promise<{ root: string; studioRoot: string; homeRoot: string; appBundle: string; executable: string }> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dream-skin-macos-app-')))
  roots.push(root)
  const homeRoot = join(root, 'home')
  const studioRoot = join(root, 'studio')
  const appBundle = join(root, 'ChatGPT.app')
  const executable = join(appBundle, 'Contents', 'MacOS', 'ChatGPT')
  await mkdir(join(appBundle, 'Contents', 'MacOS'), { recursive: true })
  await mkdir(join(studioRoot, 'backups'), { recursive: true })
  await writeFile(join(appBundle, 'Contents', 'Info.plist'), 'fixture')
  await writeFile(executable, 'fixture', { mode: 0o755 })
  return { root, studioRoot, homeRoot, appBundle, executable }
}

function createCommandRunner(
  fixture: { appBundle: string; executable: string },
  teamIdentifier = MAC_CODEX_TEAM_ID,
  running = false,
  endpoint = '127.0.0.1:9335'
): MacCommandRunner & ReturnType<typeof vi.fn> {
  return vi.fn(async (command: string, argumentsList: string[]) => {
    if (command === '/usr/bin/mdfind') return { stdout: `${fixture.appBundle}\n`, stderr: '', exitCode: 0 }
    if (command === '/usr/bin/codesign' && argumentsList[0] === '--verify') return { stdout: '', stderr: '', exitCode: 0 }
    if (command === '/usr/bin/codesign' && argumentsList[0] === '-dv') {
      const path = argumentsList.at(-1)
      return { stdout: '', stderr: `Identifier=${path === fixture.appBundle ? MAC_CODEX_BUNDLE_ID : 'com.openai.codex.helper'}\nTeamIdentifier=${teamIdentifier}\n`, exitCode: 0 }
    }
    if (command === '/usr/bin/plutil') {
      const key = argumentsList[1]
      const value = key === 'CFBundleIdentifier' ? MAC_CODEX_BUNDLE_ID : key === 'CFBundleShortVersionString' ? '26.721.81911' : 'ChatGPT'
      return { stdout: `${value}\n`, stderr: '', exitCode: 0 }
    }
    if (command === '/bin/ps') {
      return { stdout: running ? `123 Wed Jul 29 12:34:56 2026 ${fixture.executable}\n` : '', stderr: '', exitCode: 0 }
    }
    if (command === '/usr/sbin/lsof') {
      return running ? { stdout: `p123\ncChatGPT\nn${endpoint}\n`, stderr: '', exitCode: 0 } : { stdout: '', stderr: '', exitCode: 1 }
    }
    if (command === '/usr/bin/open') return { stdout: '', stderr: '', exitCode: 0 }
    throw new Error(`Unexpected command: ${command} ${argumentsList.join(' ')}`)
  }) as MacCommandRunner & ReturnType<typeof vi.fn>
}
