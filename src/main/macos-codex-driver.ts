import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { CodexDetection } from '../shared/contracts'
import { parseThemeProfile } from '../shared/theme'
import { isSafeCdpWebSocketUrl, isThemeCdpTargetUrl } from './cdp-watcher'
import {
  CodexInstallationIdentityError,
  type CodexPlatformDriver,
  type CodexRestoreResult,
  type CodexStartResult
} from './codex-platform'
import { installMacCodexThemeConfig, restoreMacCodexThemeConfig } from './macos-config'

export const MAC_CODEX_BUNDLE_ID = 'com.openai.codex'
export const MAC_CODEX_TEAM_ID = '2DC432GLL2'
const MAX_COMMAND_OUTPUT = 1024 * 1024
const DEFAULT_PORT = 9335
const MAX_PORT_OFFSET = 100

interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number | null
}

export type MacCommandRunner = (command: string, argumentsList: string[], timeoutMs?: number) => Promise<CommandResult>

interface MacProcessInfo {
  pid: number
  startedAt: string
  executable: string
}

interface MacPortListener {
  pid: number
  command: string
  endpoints: string[]
}

interface MacCodexInstall {
  appBundle: string
  executable: string
  version: string
  bundleIdentifier: typeof MAC_CODEX_BUNDLE_ID
  teamIdentifier: typeof MAC_CODEX_TEAM_ID
}

interface MacCdpIdentity {
  browserId: string
  targetCount: number
}

interface MacCodexDriverDependencies {
  runCommand?: MacCommandRunner
  fetchJson?: (url: string) => Promise<unknown>
  sleep?: (milliseconds: number) => Promise<void>
  signalProcess?: (pid: number, signal: NodeJS.Signals) => void
  processExecutable?: string
}

export class MacCodexDriver implements CodexPlatformDriver {
  readonly platform = 'darwin' as const
  private readonly runCommand: MacCommandRunner
  private readonly fetchJson: (url: string) => Promise<unknown>
  private readonly sleep: (milliseconds: number) => Promise<void>
  private readonly signalProcess: (pid: number, signal: NodeJS.Signals) => void
  private readonly processExecutable: string

  constructor(
    private readonly studioRoot: string,
    private readonly homeDirectory = homedir(),
    dependencies: MacCodexDriverDependencies = {}
  ) {
    this.runCommand = dependencies.runCommand ?? runMacCommand
    this.fetchJson = dependencies.fetchJson ?? fetchLoopbackJson
    this.sleep = dependencies.sleep ?? ((milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)))
    this.signalProcess = dependencies.signalProcess ?? ((pid, signal) => process.kill(pid, signal))
    this.processExecutable = dependencies.processExecutable ?? process.execPath
  }

  async detect(): Promise<CodexDetection> {
    const install = await this.findInstall()
    const backupAvailable = await stat(this.backupPath()).then((value) => value.isFile(), (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return false
      throw error
    })
    return this.toDetection(install, (await this.mainProcesses(install)).length > 0, backupAvailable)
  }

  async applyConfig(themePath: string): Promise<void> {
    await this.withOperationLock(async () => {
      this.assertThemePath(themePath)
      const profile = parseThemeProfile(JSON.parse(decodeStrictJson(await readFile(themePath), themePath)) as unknown)
      await installMacCodexThemeConfig(this.configPath(), this.backupPath(), profile.colors)
    })
  }

  async start(preferredPort: number, restartExisting: boolean, expectedInstallationId?: string): Promise<CodexStartResult> {
    return await this.withOperationLock(async () => {
      assertPort(preferredPort)
      const install = await this.findInstall(expectedInstallationId)
      const existingIdentity = await this.verifyCdpIdentity(preferredPort, install)
      if (existingIdentity) return this.toStartResult(install, preferredPort, existingIdentity.browserId)
      const processes = await this.mainProcesses(install)
      if (processes.length > 0) {
        if (!restartExisting) throw new Error('Codex 需要重启一次以启用本地主题端口。')
        await this.stopVerifiedProcesses(install, processes)
      }
      let selectedPort = preferredPort
      if (!await this.waitForPortAvailable(selectedPort, 3_000)) selectedPort = await this.selectPort(preferredPort)
      await this.openApplication(install, ['--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${selectedPort}`])
      const deadline = Date.now() + 45_000
      while (Date.now() < deadline) {
        await this.sleep(400)
        const identity = await this.verifyCdpIdentity(selectedPort, install)
        if (identity) return this.toStartResult(install, selectedPort, identity.browserId)
      }
      throw new Error(`Codex 未在端口 ${selectedPort} 暴露经过验证的本地主题端点。`)
    })
  }

  async verifySession(port: number, browserId: string, detection: CodexDetection, expectedInstallationId = detection.installationId): Promise<CodexStartResult> {
    assertPort(port)
    if (detection.platform !== this.platform) throw new Error('保存的 Codex 会话属于其他安装。')
    const install = await this.findInstall(expectedInstallationId)
    if (expectedInstallationId !== this.installationId(install)) throw new Error('保存的 Codex 会话属于其他安装。')
    const identity = await this.verifyCdpIdentity(port, install)
    if (!identity || identity.browserId !== browserId) throw new Error('保存的 Codex 浏览器身份已失效。')
    return this.toStartResult(install, port, identity.browserId)
  }

  async restore(restartCodex: boolean, expectedInstallationId?: string): Promise<CodexRestoreResult> {
    return await this.withOperationLock(async () => {
      const install = restartCodex ? await this.findInstall(expectedInstallationId) : null
      const configRestored = await restoreMacCodexThemeConfig(this.configPath(), this.backupPath())
      if (!install) return { configRestored, restart: { status: 'not-requested' } }
      try {
        const processes = await this.mainProcesses(install)
        if (processes.length > 0) await this.stopVerifiedProcesses(install, processes)
        await this.openApplication(install, [])
        return { configRestored, restart: { status: 'succeeded' } }
      } catch (reason) {
        return {
          configRestored,
          restart: {
            status: 'failed',
            error: reason instanceof Error ? reason.message : String(reason)
          }
        }
      }
    })
  }

  private async findInstall(expectedInstallationId?: string): Promise<MacCodexInstall> {
    if (expectedInstallationId) {
      try {
        const prefix = `${MAC_CODEX_BUNDLE_ID}:${MAC_CODEX_TEAM_ID}:`
        if (!expectedInstallationId.startsWith(prefix)) throw new CodexInstallationIdentityError('保存的 Codex 会话属于其他安装。')
        const appBundle = expectedInstallationId.slice(prefix.length)
        if (!isAbsolute(appBundle) || !appBundle.endsWith('.app')) throw new CodexInstallationIdentityError('保存的 Codex 会话属于其他安装。')
        const install = await this.validateInstallCandidate(appBundle)
        if (this.installationId(install) !== expectedInstallationId) throw new CodexInstallationIdentityError('保存的 Codex 会话属于其他安装。')
        return install
      } catch (reason) {
        if (reason instanceof CodexInstallationIdentityError) throw reason
        throw new CodexInstallationIdentityError('保存的 Codex 安装已移动、不可访问或身份无效。')
      }
    }
    const candidates = new Set<string>([
      '/Applications/ChatGPT.app',
      '/Applications/Codex.app',
      join(this.homeDirectory, 'Applications', 'ChatGPT.app'),
      join(this.homeDirectory, 'Applications', 'Codex.app')
    ])
    const metadata = await this.runCommand('/usr/bin/mdfind', [`kMDItemCFBundleIdentifier == "${MAC_CODEX_BUNDLE_ID}"`], 5_000)
    if (metadata.exitCode === 0) {
      for (const line of metadata.stdout.split(/\r?\n/)) if (line.trim().endsWith('.app')) candidates.add(line.trim())
    }
    const installs: MacCodexInstall[] = []
    for (const candidate of candidates) {
      const install = await this.validateInstallCandidate(candidate).catch(() => null)
      if (install) installs.push(install)
    }
    if (installs.length === 0) throw new Error('未找到签名身份有效的官方 Codex macOS 应用。')
    const runningExecutables = new Set<string>()
    for (const processInfo of await this.processSnapshot()) {
      const executable = await realpath(processInfo.executable).catch(() => '')
      if (executable) runningExecutables.add(executable)
    }
    installs.sort((left, right) =>
      Number(runningExecutables.has(right.executable)) - Number(runningExecutables.has(left.executable)) ||
      Number(this.isStandardApplicationInstall(right.appBundle)) - Number(this.isStandardApplicationInstall(left.appBundle)) ||
      right.version.localeCompare(left.version, undefined, { numeric: true }) ||
      left.appBundle.localeCompare(right.appBundle)
    )
    const install = installs[0]
    if (!install) throw new Error('未找到签名身份有效的官方 Codex macOS 应用。')
    return install
  }

  private async validateInstallCandidate(candidate: string): Promise<MacCodexInstall> {
    const appBundle = await realpath(candidate)
    if (!(await stat(appBundle)).isDirectory() || !appBundle.endsWith('.app')) throw new Error('Codex 应用包路径无效。')
    await this.assertCodeSignature(appBundle, MAC_CODEX_BUNDLE_ID)
    const infoPath = join(appBundle, 'Contents', 'Info.plist')
    const [bundleIdentifier, version, executableName] = await Promise.all([
      this.readPlistValue(infoPath, 'CFBundleIdentifier'),
      this.readPlistValue(infoPath, 'CFBundleShortVersionString'),
      this.readPlistValue(infoPath, 'CFBundleExecutable')
    ])
    if (bundleIdentifier !== MAC_CODEX_BUNDLE_ID || !/^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/.test(version)) throw new Error('Codex 应用元数据无效。')
    if (!executableName || basename(executableName) !== executableName || /[\\/\0]/.test(executableName)) throw new Error('Codex 可执行文件名无效。')
    const executable = await realpath(join(appBundle, 'Contents', 'MacOS', executableName))
    if (!isPathWithin(executable, appBundle) || !(await stat(executable)).isFile()) throw new Error('Codex 可执行文件路径无效。')
    await this.assertCodeSignature(executable)
    return { appBundle, executable, version, bundleIdentifier: MAC_CODEX_BUNDLE_ID, teamIdentifier: MAC_CODEX_TEAM_ID }
  }

  private async assertCodeSignature(path: string, expectedIdentifier?: string): Promise<void> {
    const verification = await this.runCommand('/usr/bin/codesign', ['--verify', '--deep', '--strict', path], 10_000)
    assertCommandSucceeded(verification, 'Codex 代码签名验证失败。')
    const detailsResult = await this.runCommand('/usr/bin/codesign', ['-dv', '--verbose=4', path], 10_000)
    assertCommandSucceeded(detailsResult, 'Codex 签名身份读取失败。')
    const details = parseCodesignDetails(`${detailsResult.stdout}\n${detailsResult.stderr}`)
    if (details.teamIdentifier !== MAC_CODEX_TEAM_ID || (expectedIdentifier && details.identifier !== expectedIdentifier)) throw new Error('Codex 签名身份不受信任。')
  }

  private async readPlistValue(infoPath: string, key: string): Promise<string> {
    const result = await this.runCommand('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', infoPath], 5_000)
    assertCommandSucceeded(result, `无法读取 Codex ${key}。`)
    return result.stdout.trim()
  }

  private async mainProcesses(install: MacCodexInstall): Promise<MacProcessInfo[]> {
    const processes = await this.processSnapshot()
    const selected: MacProcessInfo[] = []
    for (const processInfo of processes) {
      const executable = await realpath(processInfo.executable).catch(() => '')
      if (executable === install.executable) selected.push({ ...processInfo, executable })
    }
    return selected
  }

  private async processSnapshot(): Promise<MacProcessInfo[]> {
    const result = await this.runCommand('/bin/ps', ['-axo', 'pid=,lstart=,comm='], 5_000)
    assertCommandSucceeded(result, '无法读取 macOS 进程列表。')
    return parseMacProcessList(result.stdout)
  }

  private async processByPid(pid: number): Promise<MacProcessInfo | null> {
    return (await this.processSnapshot()).find((processInfo) => processInfo.pid === pid) ?? null
  }

  private async stopVerifiedProcesses(install: MacCodexInstall, processes: MacProcessInfo[]): Promise<void> {
    for (const processInfo of processes) await this.signalVerifiedProcess(processInfo, install, 'SIGTERM')
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      if ((await this.mainProcesses(install)).length === 0) return
      await this.sleep(200)
    }
    for (const processInfo of processes) {
      const current = await this.processByPid(processInfo.pid)
      if (current && current.startedAt === processInfo.startedAt) await this.signalVerifiedProcess(processInfo, install, 'SIGKILL')
    }
    const forceDeadline = Date.now() + 3_000
    while (Date.now() < forceDeadline) {
      if ((await this.mainProcesses(install)).length === 0) return
      await this.sleep(100)
    }
    throw new Error('无法安全停止官方 Codex 进程。')
  }

  private async signalVerifiedProcess(expected: MacProcessInfo, install: MacCodexInstall, signal: NodeJS.Signals): Promise<void> {
    const current = await this.processByPid(expected.pid)
    if (!current || current.startedAt !== expected.startedAt) return
    const executable = await realpath(current.executable).catch(() => '')
    if (executable !== install.executable) throw new Error('Codex 进程身份在停止前发生变化。')
    try {
      this.signalProcess(expected.pid, signal)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
    }
  }

  private async openApplication(install: MacCodexInstall, argumentsList: string[]): Promise<void> {
    const result = await this.runCommand('/usr/bin/open', ['-na', install.appBundle, ...(argumentsList.length > 0 ? ['--args', ...argumentsList] : [])], 10_000)
    assertCommandSucceeded(result, '无法启动官方 Codex 应用。')
  }

  private async verifyCdpIdentity(port: number, install: MacCodexInstall): Promise<MacCdpIdentity | null> {
    const listeners = await this.portListeners(port)
    if (listeners.length === 0 || !await this.verifyPortOwners(listeners, port, install)) return null
    let versionInput: unknown
    let targetsInput: unknown
    try {
      [versionInput, targetsInput] = await Promise.all([
        this.fetchJson(`http://127.0.0.1:${port}/json/version`),
        this.fetchJson(`http://127.0.0.1:${port}/json/list`)
      ])
    } catch { return null }
    if (!versionInput || typeof versionInput !== 'object') return null
    const webSocketUrl = (versionInput as { webSocketDebuggerUrl?: unknown }).webSocketDebuggerUrl
    if (typeof webSocketUrl !== 'string') return null
    let browserId: string
    try {
      const url = new URL(webSocketUrl)
      const match = /^\/devtools\/browser\/([A-Za-z0-9._-]{1,200})$/.exec(url.pathname)
      if (!match?.[1] || !isSafeCdpWebSocketUrl(webSocketUrl, port, 'browser', match[1])) return null
      browserId = match[1]
    } catch { return null }
    if (!Array.isArray(targetsInput)) return null
    const targets = targetsInput.filter((target): target is { id: string; type: string; url: string; webSocketDebuggerUrl: string } => {
      if (!target || typeof target !== 'object') return false
      const value = target as Record<string, unknown>
      return value.type === 'page' && typeof value.id === 'string' && typeof value.url === 'string' && typeof value.webSocketDebuggerUrl === 'string' &&
        isThemeCdpTargetUrl(value.url) && isSafeCdpWebSocketUrl(value.webSocketDebuggerUrl, port, 'page', value.id)
    })
    if (targets.length === 0) return null
    const confirmed = await this.portListeners(port)
    if (!await this.verifyPortOwners(confirmed, port, install)) return null
    return { browserId, targetCount: targets.length }
  }

  private async portListeners(port: number): Promise<MacPortListener[]> {
    const result = await this.runCommand('/usr/sbin/lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpcn'], 5_000)
    if (result.exitCode === 1 && !result.stdout.trim()) return []
    assertCommandSucceeded(result, '无法验证本地主题端口归属。')
    return parseLsofListeners(result.stdout)
  }

  private async verifyPortOwners(listeners: MacPortListener[], port: number, install: MacCodexInstall): Promise<boolean> {
    if (listeners.length === 0) return false
    for (const listener of listeners) {
      if (listener.endpoints.length === 0 || listener.endpoints.some((endpoint) => endpoint !== `127.0.0.1:${port}`)) return false
      const processInfo = await this.processByPid(listener.pid)
      if (!processInfo) return false
      const executable = await realpath(processInfo.executable).catch(() => '')
      if (!executable || !isPathWithin(executable, install.appBundle)) return false
      try { await this.assertCodeSignature(executable) } catch { return false }
    }
    return true
  }

  private async waitForPortAvailable(port: number, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    do {
      if ((await this.portListeners(port)).length === 0) return true
      await this.sleep(200)
    } while (Date.now() < deadline)
    return false
  }

  private async selectPort(preferredPort: number): Promise<number> {
    for (let port = preferredPort; port <= Math.min(65_535, preferredPort + MAX_PORT_OFFSET); port += 1) {
      if ((await this.portListeners(port)).length === 0) return port
    }
    throw new Error(`端口 ${preferredPort}-${Math.min(65_535, preferredPort + MAX_PORT_OFFSET)} 均不可用。`)
  }

  private toDetection(install: MacCodexInstall, running: boolean, backupAvailable: boolean): CodexDetection {
    return {
      found: true,
      platform: this.platform,
      distribution: 'mac-app-bundle',
      version: install.version,
      executable: install.executable,
      installationId: this.installationId(install),
      running,
      backupAvailable
    }
  }

  private toStartResult(install: MacCodexInstall, port: number, browserId: string): CodexStartResult {
    return { port, browserId, version: install.version, platform: this.platform, installationId: this.installationId(install) }
  }

  private isStandardApplicationInstall(appBundle: string): boolean {
    const parent = dirname(resolve(appBundle))
    return parent === resolve('/Applications') || parent === resolve(this.homeDirectory, 'Applications')
  }
  private installationId(install: MacCodexInstall): string { return `${MAC_CODEX_BUNDLE_ID}:${MAC_CODEX_TEAM_ID}:${install.appBundle}` }
  private configPath(): string { return join(this.homeDirectory, '.codex', 'config.toml') }
  private backupPath(): string { return join(this.studioRoot, 'backups', 'config.before-studio.toml') }

  private assertThemePath(themePath: string): void {
    if (!isAbsolute(themePath) || !isPathWithin(resolve(themePath), resolve(this.studioRoot))) throw new Error('主题清单必须位于 Studio 数据目录内。')
  }

  private async withOperationLock<T>(operation: () => Promise<T>): Promise<T> {
    const lockRoot = join(this.studioRoot, 'runtime')
    const lockPath = join(lockRoot, 'macos-operation.lock')
    await mkdir(lockRoot, { recursive: true })
    const token = randomUUID()
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await mkdir(lockPath)
        try {
          await writeFile(join(lockPath, 'owner.json'), `${JSON.stringify({ pid: process.pid, executable: this.processExecutable, token })}\n`, { encoding: 'utf8', mode: 0o600 })
        } catch (error) {
          await rm(lockPath, { recursive: true, force: true }).catch(() => undefined)
          throw error
        }
        try { return await operation() } finally { await this.releaseOperationLock(lockPath, token) }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || attempt > 0) throw error
        if (await this.operationLockIsActive(lockPath)) throw new Error('另一个 Studio 进程正在执行 Codex 操作。')
        const stale = join(lockRoot, `macos-operation.stale-${Date.now()}-${randomUUID()}`)
        await rename(lockPath, stale).catch((renameError: NodeJS.ErrnoException) => {
          if (renameError.code !== 'ENOENT') throw renameError
        })
        await rm(stale, { recursive: true, force: true })
      }
    }
    throw new Error('无法获取 Studio 操作锁。')
  }

  private async operationLockIsActive(lockPath: string): Promise<boolean> {
    try {
      const owner = JSON.parse(await readFile(join(lockPath, 'owner.json'), 'utf8')) as { pid?: unknown; executable?: unknown }
      if (!Number.isInteger(owner.pid) || typeof owner.executable !== 'string') return false
      const processInfo = await this.processByPid(owner.pid as number)
      if (!processInfo) return false
      return await realpath(processInfo.executable).catch(() => '') === await realpath(owner.executable).catch(() => '')
    } catch { return false }
  }

  private async releaseOperationLock(lockPath: string, token: string): Promise<void> {
    try {
      const owner = JSON.parse(await readFile(join(lockPath, 'owner.json'), 'utf8')) as { token?: unknown }
      if (owner.token === token) await rm(lockPath, { recursive: true, force: true })
    } catch {}
  }
}

export function parseCodesignDetails(output: string): { identifier: string | null; teamIdentifier: string | null } {
  const identifier = /^Identifier=(.+)$/m.exec(output)?.[1]?.trim() ?? null
  const teamIdentifier = /^TeamIdentifier=(.+)$/m.exec(output)?.[1]?.trim() ?? null
  return { identifier, teamIdentifier }
}

export function parseMacProcessList(output: string): MacProcessInfo[] {
  const processes: MacProcessInfo[] = []
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s*(\d+)\s+([A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.+?)\s*$/.exec(line)
    if (!match?.[1] || !match[2] || !match[3]) continue
    const pid = Number.parseInt(match[1], 10)
    if (Number.isInteger(pid) && pid > 0 && isAbsolute(match[3])) processes.push({ pid, startedAt: match[2], executable: match[3] })
  }
  return processes
}

export function parseLsofListeners(output: string): MacPortListener[] {
  const listeners: MacPortListener[] = []
  let current: MacPortListener | null = null
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith('p')) {
      const pid = Number.parseInt(line.slice(1), 10)
      current = Number.isInteger(pid) && pid > 0 ? { pid, command: '', endpoints: [] } : null
      if (current) listeners.push(current)
    } else if (current && line.startsWith('c')) current.command = line.slice(1)
    else if (current && line.startsWith('n')) current.endpoints.push(line.slice(1).replace(/^TCP\s+/, ''))
  }
  return listeners
}

export async function runMacCommand(command: string, argumentsList: string[], timeoutMs = 10_000): Promise<CommandResult> {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(command, argumentsList, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (error?: Error, exitCode: number | null = null): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (error) reject(error)
      else resolvePromise({ stdout, stderr, exitCode })
    }
    const append = (current: string, chunk: Buffer): string => {
      const next = current + chunk.toString('utf8')
      if (Buffer.byteLength(next, 'utf8') > MAX_COMMAND_OUTPUT) {
        child.kill('SIGKILL')
        finish(new Error('macOS 系统命令输出超过安全限制。'))
        return current
      }
      return next
    }
    child.stdout.on('data', (chunk: Buffer) => { stdout = append(stdout, chunk) })
    child.stderr.on('data', (chunk: Buffer) => { stderr = append(stderr, chunk) })
    child.once('error', (error) => finish(error))
    child.once('exit', (code) => finish(undefined, code))
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      finish(new Error('macOS 系统命令执行超时。'))
    }, timeoutMs)
  })
}

async function fetchLoopbackJson(url: string): Promise<unknown> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || !parsed.port || !['/json/version', '/json/list'].includes(parsed.pathname) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('拒绝访问非预期的 CDP 地址。')
  }
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(2500) })
  if (!response.ok) throw new Error(`CDP 返回 HTTP ${response.status}。`)
  return await response.json() as unknown
}

function assertCommandSucceeded(result: CommandResult, message: string): void {
  if (result.exitCode !== 0) throw new Error((result.stderr || result.stdout || message).trim())
}

function assertPort(port: number): void {
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) throw new Error(`本地主题端口无效: ${port}`)
}

function isPathWithin(path: string, root: string): boolean {
  const pathRelative = relative(resolve(root), resolve(path))
  return pathRelative === '' || (!pathRelative.startsWith(`..${sep}`) && pathRelative !== '..' && !isAbsolute(pathRelative))
}

function decodeStrictJson(bytes: Uint8Array, path: string): string {
  try {
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    if (content.includes('\0')) throw new Error('NUL')
    return content
  } catch { throw new Error(`主题清单不是有效 UTF-8: ${path}`) }
}
