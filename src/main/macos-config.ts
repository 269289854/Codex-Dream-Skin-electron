import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { chmod, link, mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { ThemeProfile } from '../shared/theme'

type MacThemeColors = Pick<ThemeProfile['colors'], 'accent' | 'ink' | 'surface' | 'success' | 'danger' | 'lavender'>

interface DesktopSection {
  body: string
  bodyStart: number
  bodyLength: number
  sectionStart: number
  sectionLength: number
}

export function decodeStrictUtf8(bytes: Uint8Array, path: string): string {
  const offset = bytes.byteLength >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0
  let content: string
  try {
    content = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(offset))
  } catch {
    throw new Error(`拒绝改写非 UTF-8 配置文件: ${path}`)
  }
  if (content.includes('\0')) throw new Error(`拒绝改写包含 NUL 字符的配置文件: ${path}`)
  return content
}

export function installMacCodexThemeContent(content: string, colors: MacThemeColors): string {
  assertDesktopShapeSupported(content)
  const newLine = content.includes('\r\n') ? '\r\n' : '\n'
  let next = content
  let desktop = getDesktopSection(next)
  if (!desktop) {
    next = addDesktopSection(next, newLine)
    desktop = getDesktopSection(next)
  }
  if (!desktop) throw new Error('无法创建 Codex [desktop] 配置表。')
  for (const value of Object.values(colors)) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(value)) throw new Error('主题包含无效颜色。')
  }
  const chrome = `appearanceLightChromeTheme = { accent = "${colors.accent}", contrast = 64, fonts = { code = "Menlo", ui = "PingFang SC" }, ink = "${colors.ink}", opaqueWindows = true, semanticColors = { diffAdded = "${colors.success}", diffRemoved = "${colors.danger}", skill = "${colors.lavender}" }, surface = "${colors.surface}" }`
  let body = desktop.body
  body = setSectionSetting(body, 'appearanceTheme', 'appearanceTheme = "light"', newLine)
  body = setSectionSetting(body, 'appearanceLightCodeThemeId', 'appearanceLightCodeThemeId = "codex"', newLine)
  body = setSectionSetting(body, 'appearanceLightChromeTheme', chrome, newLine)
  return next.slice(0, desktop.bodyStart) + body + next.slice(desktop.bodyStart + desktop.bodyLength)
}

export function restoreMacCodexThemeContent(currentContent: string, backupContent: string): string {
  assertDesktopShapeSupported(currentContent)
  assertDesktopShapeSupported(backupContent)
  const newLine = currentContent.includes('\r\n') ? '\r\n' : '\n'
  let next = currentContent
  const backupDesktop = getDesktopSection(backupContent)
  let currentDesktop = getDesktopSection(next)
  if (!currentDesktop) {
    next = addDesktopSection(next, newLine)
    currentDesktop = getDesktopSection(next)
  }
  if (!currentDesktop) throw new Error('无法创建 Codex [desktop] 配置表。')
  let body = currentDesktop.body
  for (const key of ['appearanceTheme', 'appearanceLightCodeThemeId', 'appearanceLightChromeTheme']) {
    const saved = backupDesktop ? findSettingLine(backupDesktop.body, key) : null
    body = setSectionSetting(body, key, saved, newLine)
  }
  if (!backupDesktop && body.trim().length === 0) {
    return next.slice(0, currentDesktop.sectionStart) + next.slice(currentDesktop.sectionStart + currentDesktop.sectionLength)
  }
  return next.slice(0, currentDesktop.bodyStart) + body + next.slice(currentDesktop.bodyStart + currentDesktop.bodyLength)
}

export async function installMacCodexThemeConfig(configPath: string, backupPath: string, colors: MacThemeColors): Promise<void> {
  const originalBytes = await readFile(configPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') throw new Error(`Codex 配置不存在: ${configPath}`)
    throw error
  })
  const originalContent = decodeStrictUtf8(originalBytes, configPath)
  let backupCreated = false
  try {
    await writeMacBytesAtomically(backupPath, originalBytes, null, 0o600)
    backupCreated = true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  try {
    const next = installMacCodexThemeContent(originalContent, colors)
    const mode = (await stat(configPath)).mode & 0o777
    await writeMacBytesAtomically(configPath, Buffer.from(next, 'utf8'), originalBytes, mode)
  } catch (error) {
    if (backupCreated) await rm(backupPath, { force: true }).catch(() => undefined)
    throw error
  }
}

export async function restoreMacCodexThemeConfig(configPath: string, backupPath: string): Promise<boolean> {
  let backupBytes: Buffer
  try {
    backupBytes = await readFile(backupPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
  const currentBytes = await readFile(configPath)
  const backupContent = decodeStrictUtf8(backupBytes, backupPath)
  const currentContent = decodeStrictUtf8(currentBytes, configPath)
  const restored = restoreMacCodexThemeContent(currentContent, backupContent)
  const mode = (await stat(configPath)).mode & 0o777
  await writeMacBytesAtomically(configPath, Buffer.from(restored, 'utf8'), currentBytes, mode)
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 17)
  await rename(backupPath, join(dirname(backupPath), `config.restored-${stamp}-${randomUUID()}.toml`))
  await syncDirectory(dirname(backupPath))
  return true
}

function assertDesktopShapeSupported(content: string): void {
  assertTomlLineEditingSafe(content)
  if (findDesktopSections(content).length > 1) throw new Error('拒绝改写多个等价的 [desktop] 配置表。')
  const desktopToken = tomlKeyToken('desktop')
  if (new RegExp(`^[\\t ]*\\[\\[[\\t ]*${desktopToken}[\\t ]*\\]\\]`, 'm').test(content)) throw new Error('拒绝改写 desktop 数组表。')
  const firstTable = /^[\t ]*\[\[?/m.exec(content)
  const rootContent = firstTable?.index === undefined ? content : content.slice(0, firstTable.index)
  if (new RegExp(`^[\\t ]*${desktopToken}[\\t ]*(?:\\.|=)`, 'm').test(rootContent)) throw new Error('拒绝改写根级 dotted 或 inline desktop 配置。')
  const desktop = getDesktopSection(content)
  if (!desktop) return
  const bodyProbe = asciiEscapeProbe(desktop.body)
  for (const key of ['appearanceTheme', 'appearanceLightCodeThemeId', 'appearanceLightChromeTheme']) {
    const keyToken = tomlKeyToken(key)
    const shape = new RegExp(`^[\\t ]*${keyToken}[\\t ]*(?:\\.|=)`, 'gm')
    if (countMatches(bodyProbe, shape) > countMatches(desktop.body, shape)) throw new Error(`拒绝改写转义形式的 '${key}' 键。`)
    if (new RegExp(`^[\\t ]*${keyToken}[\\t ]*\\.`, 'm').test(desktop.body)) throw new Error(`拒绝替换 [desktop] 中的 dotted '${key}' 键。`)
  }
}

function assertTomlLineEditingSafe(content: string): void {
  if (content.includes('"""') || content.includes("'''")) throw new Error('拒绝改写包含多行字符串的 TOML。')
  for (const match of content.matchAll(/^[^\r\n]*=[\t ]*\[[^\r\n]*\r?$/gm)) {
    if (tomlArrayBracketBalance(match[0]) !== 0) throw new Error('拒绝改写包含多行数组的 TOML。')
  }
  const probe = asciiEscapeProbe(content)
  if (probe === content) return
  const desktopToken = tomlKeyToken('desktop')
  const shape = new RegExp(`^[\\t ]*(?:\\[\\[?[\\t ]*${desktopToken}[\\t ]*(?:\\]|\\.)|${desktopToken}[\\t ]*(?:\\.|=))`, 'gm')
  if (countMatches(probe, shape) > countMatches(content, shape)) throw new Error('拒绝改写等价于 desktop 的转义 TOML 键。')
}

function findDesktopSections(content: string): DesktopSection[] {
  const desktopToken = tomlKeyToken('desktop')
  const header = new RegExp(`^[\\t ]*\\[[\\t ]*${desktopToken}[\\t ]*\\][\\t ]*(?:#[^\\r\\n]*)?(?:\\r?\\n|$)`, 'gm')
  const sections: DesktopSection[] = []
  for (const match of content.matchAll(header)) {
    if (match.index === undefined) continue
    const bodyStart = match.index + match[0].length
    const nextTable = /^[\t ]*\[\[?/gm
    nextTable.lastIndex = bodyStart
    const next = nextTable.exec(content)
    const sectionEnd = next?.index ?? content.length
    sections.push({
      body: content.slice(bodyStart, sectionEnd),
      bodyStart,
      bodyLength: sectionEnd - bodyStart,
      sectionStart: match.index,
      sectionLength: sectionEnd - match.index
    })
  }
  return sections
}

function getDesktopSection(content: string): DesktopSection | null {
  return findDesktopSections(content)[0] ?? null
}

function addDesktopSection(content: string, newLine: string): string {
  if (!content) return `[desktop]${newLine}`
  return `${content}${content.endsWith('\n') ? newLine : newLine + newLine}[desktop]${newLine}`
}

function setSectionSetting(body: string, key: string, line: string | null, newLine: string): string {
  const matcher = settingPattern(key)
  const matches = [...body.matchAll(matcher)]
  if (matches.length > 1) throw new Error(`拒绝改写 [desktop] 中重复的 '${key}'。`)
  if (!line) return body.replace(matcher, '')
  const normalized = line.replace(/[\r\n]+$/g, '') + newLine
  if (matches.length === 1) return body.replace(matcher, () => normalized)
  return body + (body.length === 0 || body.endsWith('\n') ? '' : newLine) + normalized
}

function findSettingLine(body: string, key: string): string | null {
  return settingPattern(key).exec(body)?.[0] ?? null
}

function settingPattern(key: string): RegExp {
  return new RegExp(`^[\\t ]*${tomlKeyToken(key)}[\\t ]*=[^\\r\\n]*(?:\\r?\\n|$)`, 'gm')
}

function tomlKeyToken(key: string): string {
  const escaped = escapeRegExp(key)
  return `(?:${escaped}|"${escaped}"|'${escaped}')`
}

function asciiEscapeProbe(value: string): string {
  return value.replace(/\\(?:u00([0-9a-f]{2})|U000000([0-9a-f]{2}))/gi, (match, short: string | undefined, long: string | undefined) => {
    const character = String.fromCharCode(Number.parseInt(short ?? long ?? '', 16))
    return /^[A-Za-z0-9_-]$/.test(character) ? character : match
  })
}

function tomlArrayBracketBalance(line: string): number {
  let quote: '"' | "'" | null = null
  let escaped = false
  let balance = 0
  for (const character of line) {
    if (!quote) {
      if (character === '#') break
      if (character === '"' || character === "'") quote = character
      else if (character === '[') balance += 1
      else if (character === ']') balance -= 1
      continue
    }
    if (quote === '"') {
      if (escaped) { escaped = false; continue }
      if (character === '\\') { escaped = true; continue }
    }
    if (character === quote) quote = null
  }
  return balance
}

export async function writeMacBytesAtomically(path: string, bytes: Uint8Array, expectedBytes?: Uint8Array | null, mode = 0o600): Promise<void> {
  const directory = dirname(path)
  await mkdir(directory, { recursive: true })
  const temporary = join(directory, `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`)
  let handle: Awaited<ReturnType<typeof open>> | null = null
  try {
    handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, mode)
    await handle.writeFile(bytes)
    await handle.sync()
    await handle.close()
    handle = null
    await chmod(temporary, mode)
    if (expectedBytes === null) {
      await link(temporary, path)
      await rm(temporary)
    } else {
      if (expectedBytes !== undefined) await assertFileUnchanged(path, expectedBytes)
      await rename(temporary, path)
    }
    await syncDirectory(directory)
  } finally {
    await handle?.close().catch(() => undefined)
    await rm(temporary, { force: true }).catch(() => undefined)
  }
}

async function assertFileUnchanged(path: string, expectedBytes: Uint8Array): Promise<void> {
  const current = await readFile(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') throw new Error(`配置文件在操作期间消失: ${path}`)
    throw error
  })
  if (!current.equals(Buffer.from(expectedBytes))) throw new Error(`配置文件在操作期间发生变化，请重试: ${path}`)
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, constants.O_RDONLY)
  try {
    await handle.sync().catch((error: NodeJS.ErrnoException) => {
      if (process.platform === 'win32' && (error.code === 'EPERM' || error.code === 'EINVAL')) return
      throw error
    })
  } finally {
    await handle.close()
  }
}

function countMatches(value: string, pattern: RegExp): number {
  pattern.lastIndex = 0
  return [...value.matchAll(pattern)].length
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
