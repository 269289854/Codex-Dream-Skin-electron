import { execFile } from 'node:child_process'
import { access, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const releaseRoot = resolve('release')
const productName = 'Codex Dream Skin Studio'
const verifyDirectoryOnly = process.argv.includes('--dir')

async function pathExists(path) {
  return access(path).then(() => true, () => false)
}

async function findApp(root, depth = 0) {
  if (depth > 3) return null
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name === `${productName}.app`) return join(root, entry.name)
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const found = await findApp(join(root, entry.name), depth + 1)
    if (found) return found
  }
  return null
}

async function assertArchitectures(path, label, expectedArchitectures) {
  const { stdout } = await execFileAsync('/usr/bin/lipo', ['-archs', path])
  const archs = new Set(stdout.trim().split(/\s+/).filter(Boolean))
  if (archs.size !== expectedArchitectures.length || expectedArchitectures.some((arch) => !archs.has(arch))) {
    throw new Error(`${label} architectures are invalid: ${stdout.trim() || 'none'}`)
  }
}

async function assertUniversal(path, label) {
  await assertArchitectures(path, label, ['x86_64', 'arm64'])
}

async function verifyApp(appPath, label) {
  const resources = join(appPath, 'Contents', 'Resources')
  const executable = join(appPath, 'Contents', 'MacOS', productName)
  const ffmpeg = join(resources, 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', 'ffmpeg')
  const sharpRoot = join(resources, 'app.asar.unpacked', 'node_modules', '@img')
  await Promise.all([
    assertUniversal(executable, `${label} main executable`),
    assertUniversal(ffmpeg, `${label} FFmpeg`),
    assertArchitectures(join(sharpRoot, 'sharp-darwin-x64', 'lib', 'sharp-darwin-x64-0.35.3.node'), `${label} Sharp x64`, ['x86_64']),
    assertArchitectures(join(sharpRoot, 'sharp-darwin-arm64', 'lib', 'sharp-darwin-arm64-0.35.3.node'), `${label} Sharp arm64`, ['arm64']),
    assertArchitectures(join(sharpRoot, 'sharp-libvips-darwin-x64', 'lib', 'libvips-cpp.8.18.3.dylib'), `${label} libvips x64`, ['x86_64']),
    assertArchitectures(join(sharpRoot, 'sharp-libvips-darwin-arm64', 'lib', 'libvips-cpp.8.18.3.dylib'), `${label} libvips arm64`, ['arm64']),
    access(join(resources, 'shared')),
    access(join(resources, 'macos', 'codex-dream-skin-trayTemplate.png'))
  ])
  if (await pathExists(join(resources, 'windows'))) throw new Error(`${label} unexpectedly contains Windows resources.`)

  const { stdout } = await execFileAsync('/usr/libexec/PlistBuddy', ['-c', 'Print :LSMinimumSystemVersion', join(appPath, 'Contents', 'Info.plist')])
  if (stdout.trim() !== '12.0.0') throw new Error(`${label} minimum macOS version is ${stdout.trim() || 'missing'}.`)
}

const directoryApp = await findApp(join(releaseRoot, 'mac-universal'))
if (!directoryApp) throw new Error('Universal macOS directory package was not found in release/mac-universal.')
await verifyApp(directoryApp, 'directory package')

if (!verifyDirectoryOnly) {
  const artifacts = await readdir(releaseRoot, { withFileTypes: true })
  const dmg = artifacts.find((entry) => entry.isFile() && /-mac-universal\.dmg$/i.test(entry.name))
  const zip = artifacts.find((entry) => entry.isFile() && /-mac-universal\.zip$/i.test(entry.name))
  if (!dmg || !zip) throw new Error('Universal DMG and ZIP artifacts were not both found.')

  const temporaryRoot = await mkdtemp(join(tmpdir(), 'codex-dream-skin-artifacts-'))
  const zipRoot = join(temporaryRoot, 'zip')
  const mountRoot = join(temporaryRoot, 'dmg')
  let mounted = false
  try {
    await execFileAsync('/bin/mkdir', ['-p', zipRoot, mountRoot])
    await execFileAsync('/usr/bin/ditto', ['-x', '-k', join(releaseRoot, zip.name), zipRoot])
    const zipApp = await findApp(zipRoot)
    if (!zipApp) throw new Error(`ZIP ${basename(zip.name)} does not contain the Studio application.`)
    await verifyApp(zipApp, 'ZIP package')

    await execFileAsync('/usr/bin/hdiutil', ['attach', join(releaseRoot, dmg.name), '-readonly', '-nobrowse', '-mountpoint', mountRoot])
    mounted = true
    const dmgApp = await findApp(mountRoot)
    if (!dmgApp) throw new Error(`DMG ${basename(dmg.name)} does not contain the Studio application.`)
    await verifyApp(dmgApp, 'DMG package')
  } finally {
    if (mounted) await execFileAsync('/usr/bin/hdiutil', ['detach', mountRoot]).catch(() => undefined)
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

console.log(verifyDirectoryOnly ? 'Verified Universal macOS directory package.' : 'Verified Universal macOS directory, DMG, and ZIP packages.')
