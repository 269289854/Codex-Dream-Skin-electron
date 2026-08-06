import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

interface BubbleMeasurement {
  id: string
  width: number
  height: number
  backgroundImage: string
  backgroundPosition: string
  backgroundSize: string
  inset: string[]
}

const execFileAsync = promisify(execFile)
const require = createRequire(import.meta.url)
const electronPath = require('electron') as string

describe('conversation bubble Chromium geometry', () => {
  it('keeps all four corner sizes and aspect ratios fixed across short, wide, narrow, and high bubbles', async () => {
    const fixture = join(process.cwd(), 'tests', 'fixtures', 'conversation-bubble-geometry.cjs')
    const environment = { ...process.env }
    delete environment.ELECTRON_RUN_AS_NODE
    const { stdout } = await execFileAsync(electronPath, [fixture], {
      cwd: process.cwd(),
      env: environment,
      timeout: 30_000,
      windowsHide: true
    })
    const measurements = JSON.parse(stdout.trim().split(/\r?\n/).at(-1) ?? '[]') as BubbleMeasurement[]

    expect(measurements.map(({ id, width, height }) => ({ id, width, height }))).toEqual([
      { id: 'short', width: 220, height: 96 },
      { id: 'wide', width: 720, height: 96 },
      { id: 'narrow', width: 160, height: 180 },
      { id: 'high', width: 360, height: 480 }
    ])
    for (const measurement of measurements) {
      expect(measurement.backgroundImage.match(/url\(/g)).toHaveLength(4)
      expect(measurement.backgroundPosition).toBe('0% 0%, 100% 0%, 100% 100%, 0% 100%')
      expect(measurement.backgroundSize).toBe('72px 36px, 36px 72px, 60px 30px, 30px 60px')
      expect(measurement.inset).toEqual(['-8px', '-8px', '-8px', '-8px'])
    }
  }, 40_000)
})
