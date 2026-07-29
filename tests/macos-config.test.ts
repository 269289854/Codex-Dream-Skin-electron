import { chmod, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDefaultTheme } from '../src/shared/theme'
import {
  decodeStrictUtf8,
  installMacCodexThemeConfig,
  installMacCodexThemeContent,
  restoreMacCodexThemeConfig,
  restoreMacCodexThemeContent,
  writeMacBytesAtomically
} from '../src/main/macos-config'

const roots: string[] = []
const colors = createDefaultTheme('11111111-1111-4111-8111-111111111111').colors

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('macOS Codex config editing', () => {
  it('preserves CRLF content and nested desktop tables while restoring only owned keys', () => {
    const nested = '[desktop.open-in-target-preferences]\r\ndefault = "finder"\r\n[desktop.open-in-target-preferences.perPath]\r\n"/虚构项目" = "finder"\r\n'
    const original = `model = "gpt-test"\r\n[desktop]\r\nfollowUpQueueMode = "queue"\r\n${nested}`
    const installed = installMacCodexThemeContent(original, colors)
    expect(installed.slice(installed.indexOf('[desktop.open-in-target-preferences]'))).toBe(nested)
    expect(installed).toContain('fonts = { code = "Menlo", ui = "PingFang SC" }')
    expect(installed).toContain('appearanceTheme = "light"\r\n')

    const current = installed.replace('followUpQueueMode = "queue"', 'followUpQueueMode = "steer"')
    const restored = restoreMacCodexThemeContent(current, original)
    expect(restored).toContain('followUpQueueMode = "steer"')
    expect(restored).not.toContain('appearanceLightChromeTheme')
    expect(restored.slice(restored.indexOf('[desktop.open-in-target-preferences]'))).toBe(nested)
  })

  it('creates an exact backup, preserves mode, restores scoped keys, and archives the backup', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-macos-config-'))
    roots.push(root)
    const configPath = join(root, '.codex', 'config.toml')
    const backupPath = join(root, 'studio', 'backups', 'config.before-studio.toml')
    const original = Buffer.from('\ufeffmodel = "gpt-test"\n[desktop]\nappearanceTheme = "dark"\nfollowUpQueueMode = "queue"\n', 'utf8')
    await writeMacBytesAtomically(configPath, original, null, 0o640)
    await chmod(configPath, 0o640)

    await installMacCodexThemeConfig(configPath, backupPath, colors)
    expect(await readFile(backupPath)).toEqual(original)
    expect((await stat(configPath)).mode & 0o777).toBe(0o640)
    const installed = await readFile(configPath, 'utf8')
    expect(installed.charCodeAt(0)).not.toBe(0xfeff)
    await writeFile(configPath, installed.replace('followUpQueueMode = "queue"', 'followUpQueueMode = "steer"'))

    await expect(restoreMacCodexThemeConfig(configPath, backupPath)).resolves.toBe(true)
    const restored = await readFile(configPath, 'utf8')
    expect(restored).toContain('appearanceTheme = "dark"')
    expect(restored).toContain('followUpQueueMode = "steer"')
    await expect(readFile(backupPath)).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await readdir(join(root, 'studio', 'backups'))).some((name) => /^config\.restored-\d{17}-[0-9a-f-]+\.toml$/.test(name))).toBe(true)
  })

  it('rejects invalid encodings, unsafe TOML shapes, and removes a newly created backup on failure', async () => {
    expect(() => decodeStrictUtf8(Uint8Array.from([0xff, 0xfe, 0x00]), 'config.toml')).toThrow('UTF-8')
    expect(() => decodeStrictUtf8(Buffer.from('a\0b'), 'config.toml')).toThrow('NUL')
    expect(() => installMacCodexThemeContent('[desktop]\na = """unsafe"""\n', colors)).toThrow('多行字符串')
    expect(() => installMacCodexThemeContent('[desktop]\n[desktop]\n', colors)).toThrow('多个')

    const root = await mkdtemp(join(tmpdir(), 'dream-skin-macos-invalid-'))
    roots.push(root)
    const configPath = join(root, 'config.toml')
    const backupPath = join(root, 'backup.toml')
    await writeFile(configPath, '[desktop]\na = """unsafe"""\n')
    await expect(installMacCodexThemeConfig(configPath, backupPath, colors)).rejects.toThrow('多行字符串')
    await expect(readFile(backupPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('refuses an atomic replacement when another writer changed the file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dream-skin-macos-cas-'))
    roots.push(root)
    const path = join(root, 'config.toml')
    await writeFile(path, 'current')
    await expect(writeMacBytesAtomically(path, Buffer.from('next'), Buffer.from('expected'))).rejects.toThrow('发生变化')
    await expect(readFile(path, 'utf8')).resolves.toBe('current')
  })
})
