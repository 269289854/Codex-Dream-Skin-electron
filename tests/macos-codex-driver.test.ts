import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
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
      installationId: `${MAC_CODEX_BUNDLE_ID}:${MAC_CODEX_TEAM_ID}:${fixture.appBundle}`,
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
      installationId: `${MAC_CODEX_BUNDLE_ID}:${MAC_CODEX_TEAM_ID}:${fixture.appBundle}`
    })
    expect(runCommand).not.toHaveBeenCalledWith('/usr/bin/open', expect.anything(), expect.anything())
  })

  it('does not attach to a wildcard listener owned by a running Codex process', async () => {
    const fixture = await createAppFixture()
    const runCommand = createCommandRunner(fixture, MAC_CODEX_TEAM_ID, true, '*:9335')
    const driver = new MacCodexDriver(fixture.studioRoot, fixture.homeRoot, { runCommand, fetchJson: vi.fn() })
    await expect(driver.start(9335, false)).rejects.toThrow('需要重启')
  })

  it('prefers a verified running install over a newer standard Applications copy', async () => {
    const fixture = await createSelectionFixture()
    const standard = await createAppBundle(join(fixture.homeRoot, 'Applications', 'ChatGPT.app'), '27.0.0')
    const running = await createAppBundle(join(fixture.root, 'Volumes', 'Codex Preview', 'ChatGPT.app'), '26.0.0')
    const runCommand = createSelectionCommandRunner([standard, running], running.executable)
    const driver = new MacCodexDriver(fixture.studioRoot, fixture.homeRoot, { runCommand })

    await expect(driver.detect()).resolves.toMatchObject({
      version: running.version,
      executable: running.executable,
      installationId: `${MAC_CODEX_BUNDLE_ID}:${MAC_CODEX_TEAM_ID}:${running.appBundle}`,
      running: true
    })
  })

  it('prefers a standard Applications install over a newer mounted copy', async () => {
    const fixture = await createSelectionFixture()
    const standard = await createAppBundle(join(fixture.homeRoot, 'Applications', 'ChatGPT.app'), '26.0.0')
    const mounted = await createAppBundle(join(fixture.root, 'Volumes', 'Codex Installer', 'ChatGPT.app'), '27.0.0')
    const runCommand = createSelectionCommandRunner([standard, mounted])
    const driver = new MacCodexDriver(fixture.studioRoot, fixture.homeRoot, { runCommand })

    await expect(driver.detect()).resolves.toMatchObject({
      version: standard.version,
      executable: standard.executable,
      installationId: `${MAC_CODEX_BUNDLE_ID}:${MAC_CODEX_TEAM_ID}:${standard.appBundle}`,
      running: false
    })
  })

  it('verifies a saved session against its exact app when multiple official copies are running', async () => {
    const fixture = await createSelectionFixture()
    const standard = await createAppBundle(join(fixture.homeRoot, 'Applications', 'ChatGPT.app'), '26.0.0')
    const mounted = await createAppBundle(join(fixture.root, 'Volumes', 'Codex Preview', 'ChatGPT.app'), '27.0.0')
    const runCommand = createSelectionCommandRunner(
      [standard, mounted],
      [standard.executable, mounted.executable],
      mounted.executable
    )
    const fetchJson = vi.fn(async (url: string) => url.endsWith('/json/version')
      ? { webSocketDebuggerUrl: 'ws://127.0.0.1:9335/devtools/browser/browser-mounted' }
      : [{ id: 'page-1', type: 'page', url: 'app://-/index.html', webSocketDebuggerUrl: 'ws://127.0.0.1:9335/devtools/page/page-1' }])
    const driver = new MacCodexDriver(fixture.studioRoot, fixture.homeRoot, { runCommand, fetchJson })
    const detected = await driver.detect()

    expect(detected.installationId).toBe(`${MAC_CODEX_BUNDLE_ID}:${MAC_CODEX_TEAM_ID}:${standard.appBundle}`)
    await expect(driver.verifySession(
      9335,
      'browser-mounted',
      detected,
      `${MAC_CODEX_BUNDLE_ID}:${MAC_CODEX_TEAM_ID}:${mounted.appBundle}`
    )).resolves.toEqual({
      port: 9335,
      browserId: 'browser-mounted',
      version: mounted.version,
      platform: 'darwin',
      installationId: `${MAC_CODEX_BUNDLE_ID}:${MAC_CODEX_TEAM_ID}:${mounted.appBundle}`
    })
  })

  it('starts the exact saved app when multiple official copies are running', async () => {
    const fixture = await createSelectionFixture()
    const standard = await createAppBundle(join(fixture.homeRoot, 'Applications', 'ChatGPT.app'), '26.0.0')
    const mounted = await createAppBundle(join(fixture.root, 'Volumes', 'Codex Preview', 'ChatGPT.app'), '27.0.0')
    const runCommand = createSelectionCommandRunner(
      [standard, mounted],
      [standard.executable, mounted.executable],
      mounted.executable
    )
    const fetchJson = vi.fn(async (url: string) => url.endsWith('/json/version')
      ? { webSocketDebuggerUrl: 'ws://127.0.0.1:9335/devtools/browser/browser-mounted' }
      : [{ id: 'page-1', type: 'page', url: 'app://-/index.html', webSocketDebuggerUrl: 'ws://127.0.0.1:9335/devtools/page/page-1' }])
    const driver = new MacCodexDriver(fixture.studioRoot, fixture.homeRoot, { runCommand, fetchJson })
    const installationId = `${MAC_CODEX_BUNDLE_ID}:${MAC_CODEX_TEAM_ID}:${mounted.appBundle}`

    await expect(driver.start(9335, true, installationId)).resolves.toEqual({
      port: 9335,
      browserId: 'browser-mounted',
      version: mounted.version,
      platform: 'darwin',
      installationId
    })
    expect(runCommand).not.toHaveBeenCalledWith('/usr/bin/mdfind', expect.anything(), expect.anything())
  })

  it('restarts the exact saved app while restoring configuration', async () => {
    const fixture = await createSelectionFixture()
    const standard = await createAppBundle(join(fixture.homeRoot, 'Applications', 'ChatGPT.app'), '26.0.0')
    const mounted = await createAppBundle(join(fixture.root, 'Volumes', 'Codex Preview', 'ChatGPT.app'), '27.0.0')
    const runCommand = createSelectionCommandRunner([standard, mounted])
    const driver = new MacCodexDriver(fixture.studioRoot, fixture.homeRoot, { runCommand })
    const installationId = `${MAC_CODEX_BUNDLE_ID}:${MAC_CODEX_TEAM_ID}:${mounted.appBundle}`

    await driver.restore(true, installationId)

    expect(runCommand).toHaveBeenCalledWith('/usr/bin/open', ['-na', mounted.appBundle], 10_000)
    expect(runCommand).not.toHaveBeenCalledWith('/usr/bin/mdfind', expect.anything(), expect.anything())
  })

  it('does not consume the configuration backup when the saved app is invalid', async () => {
    const fixture = await createSelectionFixture()
    const configPath = join(fixture.homeRoot, '.codex', 'config.toml')
    const backupPath = join(fixture.studioRoot, 'backups', 'config.before-studio.toml')
    const currentConfig = '[desktop]\nappearanceTheme = "light"\n'
    const backupConfig = '[desktop]\nappearanceTheme = "system"\n'
    await mkdir(join(fixture.homeRoot, '.codex'), { recursive: true })
    await mkdir(join(fixture.studioRoot, 'backups'), { recursive: true })
    await writeFile(configPath, currentConfig)
    await writeFile(backupPath, backupConfig)
    const runCommand = createSelectionCommandRunner([])
    const driver = new MacCodexDriver(fixture.studioRoot, fixture.homeRoot, { runCommand })
    const missingApp = join(fixture.root, 'Moved Codex.app')
    const installationId = `${MAC_CODEX_BUNDLE_ID}:${MAC_CODEX_TEAM_ID}:${missingApp}`

    await expect(driver.restore(true, installationId)).rejects.toThrow()

    await expect(readFile(configPath, 'utf8')).resolves.toBe(currentConfig)
    await expect(readFile(backupPath, 'utf8')).resolves.toBe(backupConfig)
    expect(runCommand).not.toHaveBeenCalledWith('/usr/bin/open', expect.anything(), expect.anything())
  })

  it('ignores only ESRCH when a verified process exits before it is signalled', async () => {
    const fixture = await createAppFixture()
    const runCommand = createCommandRunner(fixture, MAC_CODEX_TEAM_ID, true)
    const install = {
      appBundle: fixture.appBundle,
      executable: fixture.executable,
      version: '26.721.81911',
      bundleIdentifier: MAC_CODEX_BUNDLE_ID,
      teamIdentifier: MAC_CODEX_TEAM_ID
    }
    const processInfo = { pid: 123, startedAt: 'Wed Jul 29 12:34:56 2026', executable: fixture.executable }
    const esrch = Object.assign(new Error('process exited'), { code: 'ESRCH' })
    const esrchDriver = new MacCodexDriver(fixture.studioRoot, fixture.homeRoot, {
      runCommand,
      signalProcess: () => { throw esrch }
    }) as unknown as {
      signalVerifiedProcess: (expected: typeof processInfo, selectedInstall: typeof install, signal: NodeJS.Signals) => Promise<void>
    }
    await expect(esrchDriver.signalVerifiedProcess(processInfo, install, 'SIGTERM')).resolves.toBeUndefined()

    const eperm = Object.assign(new Error('not permitted'), { code: 'EPERM' })
    const epermDriver = new MacCodexDriver(fixture.studioRoot, fixture.homeRoot, {
      runCommand,
      signalProcess: () => { throw eperm }
    }) as unknown as {
      signalVerifiedProcess: (expected: typeof processInfo, selectedInstall: typeof install, signal: NodeJS.Signals) => Promise<void>
    }
    await expect(epermDriver.signalVerifiedProcess(processInfo, install, 'SIGTERM')).rejects.toBe(eperm)
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

interface SelectionAppFixture {
  appBundle: string
  executable: string
  version: string
}

async function createSelectionFixture(): Promise<{ root: string; studioRoot: string; homeRoot: string }> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dream-skin-macos-selection-')))
  roots.push(root)
  return { root, studioRoot: join(root, 'studio'), homeRoot: join(root, 'home') }
}

async function createAppBundle(appBundle: string, version: string): Promise<SelectionAppFixture> {
  const executable = join(appBundle, 'Contents', 'MacOS', 'ChatGPT')
  await mkdir(join(appBundle, 'Contents', 'MacOS'), { recursive: true })
  await writeFile(join(appBundle, 'Contents', 'Info.plist'), 'fixture')
  await writeFile(executable, 'fixture', { mode: 0o755 })
  return { appBundle, executable, version }
}

function createSelectionCommandRunner(
  apps: SelectionAppFixture[],
  runningExecutable?: string | string[],
  listenerExecutable?: string
): MacCommandRunner & ReturnType<typeof vi.fn> {
  const runningExecutables = typeof runningExecutable === 'string'
    ? [runningExecutable]
    : runningExecutable ?? []
  return vi.fn(async (command: string, argumentsList: string[]) => {
    if (command === '/usr/bin/mdfind') return { stdout: `${apps.map((app) => app.appBundle).join('\n')}\n`, stderr: '', exitCode: 0 }
    if (command === '/usr/bin/codesign' && argumentsList[0] === '--verify') return { stdout: '', stderr: '', exitCode: 0 }
    if (command === '/usr/bin/codesign' && argumentsList[0] === '-dv') {
      const path = argumentsList.at(-1)
      const identifier = apps.some((app) => app.appBundle === path) ? MAC_CODEX_BUNDLE_ID : 'com.openai.codex.helper'
      return { stdout: '', stderr: `Identifier=${identifier}\nTeamIdentifier=${MAC_CODEX_TEAM_ID}\n`, exitCode: 0 }
    }
    if (command === '/usr/bin/plutil') {
      const key = argumentsList[1]
      const infoPath = argumentsList.at(-1)
      const app = apps.find((candidate) => join(candidate.appBundle, 'Contents', 'Info.plist') === infoPath)
      if (!app) throw new Error(`Unexpected plist: ${infoPath}`)
      const value = key === 'CFBundleIdentifier' ? MAC_CODEX_BUNDLE_ID : key === 'CFBundleShortVersionString' ? app.version : 'ChatGPT'
      return { stdout: `${value}\n`, stderr: '', exitCode: 0 }
    }
    if (command === '/bin/ps') {
      const stdout = runningExecutables
        .map((executable, index) => `${123 + index} Wed Jul 29 12:34:56 2026 ${executable}`)
        .join('\n')
      return { stdout: stdout ? `${stdout}\n` : '', stderr: '', exitCode: 0 }
    }
    if (command === '/usr/sbin/lsof') {
      const index = listenerExecutable ? runningExecutables.indexOf(listenerExecutable) : -1
      if (index < 0) return { stdout: '', stderr: '', exitCode: 1 }
      const pid = 123 + index
      return { stdout: `p${pid}\ncChatGPT\nn127.0.0.1:9335\n`, stderr: '', exitCode: 0 }
    }
    if (command === '/usr/bin/open') return { stdout: '', stderr: '', exitCode: 0 }
    throw new Error(`Unexpected command: ${command} ${argumentsList.join(' ')}`)
  }) as MacCommandRunner & ReturnType<typeof vi.fn>
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
