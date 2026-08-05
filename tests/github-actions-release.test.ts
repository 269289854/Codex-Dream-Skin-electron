import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

async function releaseContract(): Promise<{ document: string, workflow: string }> {
  const [document, workflow] = await Promise.all([
    readFile(join(root, 'docs', 'GITHUB_ACTIONS_RELEASE.md'), 'utf8'),
    readFile(join(root, '.github', 'workflows', 'release.yml'), 'utf8')
  ])
  return { document, workflow }
}

function job(workflow: string, name: string, nextName?: string): string {
  const start = workflow.indexOf(`  ${name}:`)
  const end = nextName ? workflow.indexOf(`  ${nextName}:`, start + 1) : workflow.length

  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return workflow.slice(start, end)
}

describe('GitHub Actions release contract', () => {
  it('keeps the documented workflow synchronized with the installed workflow', async () => {
    const { document, workflow } = await releaseContract()
    const documentedWorkflow = /```yaml\r?\n([\s\S]*?)\r?\n```/.exec(document)?.[1]

    expect(documentedWorkflow).toBeDefined()
    expect(documentedWorkflow?.replace(/\r\n/g, '\n').trim()).toBe(workflow.replace(/\r\n/g, '\n').trim())
  })

  it('builds and verifies the required artifacts on standard Windows and macOS runners', async () => {
    const { workflow } = await releaseContract()
    const versionJob = job(workflow, 'version', 'windows')
    const windowsJob = job(workflow, 'windows', 'macos')
    const macosJob = job(workflow, 'macos', 'release')

    expect(versionJob).toContain('runs-on: ubuntu-24.04')
    expect(versionJob).toContain('Tag ${GITHUB_REF_NAME} does not match package version ${version}.')
    expect(versionJob).toContain('docs/releases/${GITHUB_REF_NAME}.md')
    expect(windowsJob).toContain('needs: version')
    expect(windowsJob).toContain('runs-on: windows-2025')
    expect(windowsJob).toContain('- run: npm test')
    expect(windowsJob).toContain('- run: npm run test:config')
    expect(windowsJob).toContain('- run: npm run package:win')
    expect(macosJob).toContain('needs: version')
    expect(macosJob).toContain('runs-on: macos-15')
    expect(macosJob).toContain('- name: Free macOS runner disk space')
    expect(macosJob).toContain('sudo rm -rf /Library/Developer/CoreSimulator/Profiles/Runtimes')
    expect(macosJob).toContain('- run: npm test')
    expect(macosJob).toContain('- run: npm run package:mac')
  })

  it('creates a release only for tags after both platform builds and grants write access only there', async () => {
    const { workflow } = await releaseContract()
    const releaseJob = job(workflow, 'release')

    expect(workflow).toMatch(/on:\r?\n  workflow_dispatch:\r?\n  push:\r?\n    tags:\r?\n      - 'v\*'/)
    expect(workflow).toMatch(/permissions:\r?\n  contents: read/)
    expect(releaseJob).toContain("if: github.ref_type == 'tag'")
    expect(releaseJob).toContain('needs: [version, windows, macos]')
    expect(releaseJob).toMatch(/permissions:\r?\n      contents: write/)
  })

  it('prevents electron-builder from publishing during platform build jobs', async () => {
    const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }

    expect(packageJson.scripts['package:win']).toContain('--publish never')
    expect(packageJson.scripts['package:mac']).toContain('--publish never')
  })

  it('publishes exactly the five supported release assets', async () => {
    const { workflow } = await releaseContract()
    const releaseJob = job(workflow, 'release')
    const requiredBlock = /required=\(\r?\n([\s\S]*?)\r?\n\s*\)/.exec(releaseJob)?.[1]
    const required = [...(requiredBlock?.matchAll(/"([^"]+)"/g) ?? [])].map((match) => match[1])

    expect(required).toEqual([
      'release/Codex-Dream-Skin-Studio-Setup-${version}.exe',
      'release/Codex-Dream-Skin-Studio-Setup-${version}.exe.blockmap',
      'release/latest.yml',
      'release/Codex-Dream-Skin-Studio-${version}-mac-universal.dmg',
      'release/Codex-Dream-Skin-Studio-${version}-mac-universal.zip'
    ])
    expect(releaseJob).toContain('Expected exactly ${#required[@]} release artifacts')
  })

  it('uses repository release notes and provides repository context to every gh command', async () => {
    const { workflow } = await releaseContract()
    const stepStart = workflow.indexOf('      - name: Create or update GitHub Release')
    const releaseStep = workflow.slice(stepStart)

    expect(stepStart).toBeGreaterThanOrEqual(0)
    expect(workflow).toContain('docs/releases/${GITHUB_REF_NAME}.md')
    expect(workflow).toContain('The first line of ${notes_file} must be a Markdown H1 title.')
    expect(releaseStep).toContain('GH_TOKEN: ${{ github.token }}')
    expect(releaseStep).toContain('GH_REPO: ${{ github.repository }}')
    expect(releaseStep.match(/\bgh release (?:view|edit|upload|create)\b/g)).toEqual([
      'gh release view',
      'gh release edit',
      'gh release upload',
      'gh release create'
    ])
  })
})
