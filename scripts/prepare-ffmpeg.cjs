const { execFile } = require('node:child_process')
const { access, mkdir, mkdtemp, readFile, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { promisify } = require('node:util')
const { Arch } = require('builder-util')

const execFileAsync = promisify(execFile)
const FFMPEG_BINARY_RELEASE = 'b6.1.1'
const SHARP_DARWIN_PACKAGES = [
  { name: '@img/sharp-darwin-x64', version: '0.35.3', marker: 'lib/sharp-darwin-x64-0.35.3.node' },
  { name: '@img/sharp-libvips-darwin-x64', version: '1.3.2', marker: 'lib/libvips-cpp.8.18.3.dylib' },
  { name: '@img/sharp-darwin-arm64', version: '0.35.3', marker: 'lib/sharp-darwin-arm64-0.35.3.node' },
  { name: '@img/sharp-libvips-darwin-arm64', version: '1.3.2', marker: 'lib/libvips-cpp.8.18.3.dylib' }
]

async function ensureSharpDarwinPackages(projectRoot) {
  for (const dependency of SHARP_DARWIN_PACKAGES) {
    const packageRoot = join(projectRoot, 'node_modules', ...dependency.name.split('/'))
    const packageJsonPath = join(packageRoot, 'package.json')
    const installedVersion = await readFile(packageJsonPath, 'utf8')
      .then((content) => JSON.parse(content).version, () => null)
    const markerExists = await access(join(packageRoot, dependency.marker)).then(() => true, () => false)
    if (installedVersion === dependency.version && markerExists) continue

    const temporaryRoot = await mkdtemp(join(tmpdir(), 'codex-dream-skin-sharp-'))
    try {
      const spec = `${dependency.name}@${dependency.version}`
      const { stdout } = await execFileAsync('npm', ['pack', '--silent', '--pack-destination', temporaryRoot, spec], {
        cwd: projectRoot,
        maxBuffer: 8 * 1024 * 1024
      })
      const archiveName = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1)
      if (!archiveName) throw new Error(`npm pack did not return an archive for ${spec}.`)
      await rm(packageRoot, { recursive: true, force: true })
      await mkdir(packageRoot, { recursive: true })
      await execFileAsync('/usr/bin/tar', ['-xzf', join(temporaryRoot, archiveName), '--strip-components=1', '-C', packageRoot])
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true })
    }
  }
}

module.exports = async function prepareFfmpeg(context) {
  if (context.electronPlatformName !== 'darwin') return

  const arch = Arch[context.arch]
  if (arch !== 'x64' && arch !== 'arm64') throw new Error(`Unsupported macOS FFmpeg architecture: ${arch}`)

  await ensureSharpDarwinPackages(context.packager.projectDir)

  const packageRoot = join(context.packager.projectDir, 'node_modules', 'ffmpeg-static')
  const binaryPath = join(packageRoot, 'ffmpeg')
  await Promise.all([
    rm(binaryPath, { force: true }),
    rm(`${binaryPath}.README`, { force: true }),
    rm(`${binaryPath}.LICENSE`, { force: true })
  ])

  await execFileAsync(process.execPath, [join(packageRoot, 'install.js')], {
    cwd: packageRoot,
    env: {
      ...process.env,
      FFMPEG_BINARY_RELEASE,
      npm_config_arch: arch,
      npm_config_platform: 'darwin'
    },
    maxBuffer: 8 * 1024 * 1024
  })

  const { stdout } = await execFileAsync('/usr/bin/lipo', ['-archs', binaryPath])
  const binaryArchs = stdout.trim().split(/\s+/)
  const expectedBinaryArch = arch === 'x64' ? 'x86_64' : arch
  if (binaryArchs.length !== 1 || binaryArchs[0] !== expectedBinaryArch) {
    throw new Error(`Prepared FFmpeg architecture mismatch: expected ${expectedBinaryArch}, received ${stdout.trim() || 'none'}`)
  }
  await Promise.all([
    rm(`${binaryPath}.README`, { force: true }),
    rm(`${binaryPath}.LICENSE`, { force: true })
  ])
}
