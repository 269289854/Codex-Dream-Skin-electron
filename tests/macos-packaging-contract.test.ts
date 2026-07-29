import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

interface FileSet {
  from: string
  to: string
  filter: string[]
}

interface Target {
  target: string
  arch: string[]
}

describe('macOS packaging contract', () => {
  it('builds unsigned Universal DMG and ZIP packages with isolated resources', async () => {
    const packageJson = JSON.parse(await readFile(join(process.cwd(), 'package.json'), 'utf8')) as {
      description: string
      scripts: Record<string, string>
      dependencies: Record<string, string>
      build: {
        beforePack: string
        asarUnpack: string[]
        extraResources: FileSet[]
        win: { artifactName: string; extraResources: FileSet[] }
        mac: {
          icon: string
          identity: null
          notarize: boolean
          minimumSystemVersion: string
          artifactName: string
          x64ArchFiles: string
          extraResources: FileSet[]
          target: Target[]
        }
        dmg: { sign: boolean }
      }
    }

    expect(packageJson.description).toContain('Windows and macOS')
    expect(packageJson.dependencies['ffmpeg-static']).toBe('5.3.0')
    expect(packageJson.build.beforePack).toBe('scripts/prepare-ffmpeg.cjs')
    expect(packageJson.build.asarUnpack).toEqual(['node_modules/ffmpeg-static/ffmpeg*'])
    expect(packageJson.build.extraResources.map((entry) => entry.from)).toEqual(['resources/shared'])
    expect(packageJson.build.win.extraResources.map((entry) => entry.from)).toEqual(['resources/windows'])
    expect(packageJson.build.win.artifactName).toBe('Codex-Dream-Skin-Studio-Setup-${version}.${ext}')

    expect(packageJson.build.mac).toMatchObject({
      icon: 'resources/macos/codex-dream-skin.icns',
      identity: null,
      notarize: false,
      minimumSystemVersion: '12.0.0',
      artifactName: 'Codex-Dream-Skin-Studio-${version}-mac-${arch}.${ext}',
      x64ArchFiles: 'Contents/Resources/app.asar.unpacked/node_modules/@img/{sharp,sharp-libvips}-darwin-*/**/*'
    })
    expect(packageJson.build.mac.extraResources.map((entry) => entry.from)).toEqual(['resources/macos'])
    expect(packageJson.build.mac.target).toEqual([
      { target: 'dmg', arch: ['universal'] },
      { target: 'zip', arch: ['universal'] }
    ])
    expect(packageJson.build.dmg.sign).toBe(false)
    expect(packageJson.scripts['package:win']).toContain('electron-builder --win nsis --x64')
    expect(packageJson.scripts['package:mac:dir']).toContain('electron-builder --mac --universal --dir')
    expect(packageJson.scripts['package:mac']).toContain('electron-builder --mac --universal')
  })

  it('prepares architecture-specific FFmpeg before Universal merging', async () => {
    const [hook, verifier] = await Promise.all([
      readFile(join(process.cwd(), 'scripts', 'prepare-ffmpeg.cjs'), 'utf8'),
      readFile(join(process.cwd(), 'scripts', 'verify-macos-artifacts.mjs'), 'utf8')
    ])

    expect(hook).toContain("npm_config_platform: 'darwin'")
    expect(hook).toContain('npm_config_arch: arch')
    expect(hook).toContain("FFMPEG_BINARY_RELEASE = 'b6.1.1'")
    expect(hook).toContain("'@img/sharp-darwin-x64'")
    expect(hook).toContain("'@img/sharp-darwin-arm64'")
    expect(hook).toContain("execFileAsync('npm', ['pack'")
    expect(hook).toContain("execFileAsync('/usr/bin/lipo', ['-archs', binaryPath])")
    expect(verifier).toContain("join(resources, 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', 'ffmpeg')")
    expect(verifier).toContain("['x86_64', 'arm64']")
    expect(verifier).toContain("'sharp-darwin-x64-0.35.3.node'")
    expect(verifier).toContain("'sharp-darwin-arm64-0.35.3.node'")
    expect(verifier).toContain("join(resources, 'windows')")
  })
})
