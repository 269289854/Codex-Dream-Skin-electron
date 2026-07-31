import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('GitHub Actions release documentation contract', () => {
  it('provides repository context to every gh release command', async () => {
    const document = await readFile(join(process.cwd(), 'docs', 'GITHUB_ACTIONS_RELEASE.md'), 'utf8')
    const stepStart = document.indexOf('      - name: Create or update GitHub Release')
    const stepEnd = document.indexOf('\n```', stepStart)

    expect(stepStart).toBeGreaterThanOrEqual(0)
    expect(stepEnd).toBeGreaterThan(stepStart)
    const releaseStep = document.slice(stepStart, stepEnd)
    expect(releaseStep).toContain('GH_TOKEN: ${{ github.token }}')
    expect(releaseStep).toContain('GH_REPO: ${{ github.repository }}')
    expect(releaseStep.match(/\bgh release (?:view|upload|create)\b/g)).toEqual([
      'gh release view',
      'gh release upload',
      'gh release create'
    ])
  })
})
