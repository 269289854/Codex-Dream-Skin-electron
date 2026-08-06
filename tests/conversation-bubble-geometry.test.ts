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
  padding: string[]
  content: { left: number; top: number; right: number; bottom: number }
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
      { id: 'short', width: 220, height: 120 },
      { id: 'wide', width: 720, height: 120 },
      { id: 'narrow', width: 160, height: 180 },
      { id: 'high', width: 360, height: 480 }
    ])
    for (const measurement of measurements) {
      expect(measurement.backgroundImage.match(/url\(/g)).toHaveLength(4)
      expect(measurement.backgroundPosition).toBe('0% 0%, calc(100% - 64px) calc(0% + 64px), 100% 100%, calc(0% + 64px) calc(100% - 64px)')
      expect(measurement.backgroundSize).toBe('24px 12px, 21px 15px, 20px 10px, 21px 15px')
      expect(measurement.inset).toEqual(['-40px', '-40px', '-40px', '-40px'])
      expect(measurement.padding.map(Number.parseFloat)).toEqual([47.6, 53.6, 47.6, 53.6])
      expect(measurement.content.left).toBeGreaterThanOrEqual(45)
      expect(measurement.content.top).toBeGreaterThanOrEqual(39)
      expect(measurement.content.right).toBeGreaterThanOrEqual(45)
      expect(measurement.content.bottom).toBeGreaterThanOrEqual(39)
    }
  }, 40_000)
})
