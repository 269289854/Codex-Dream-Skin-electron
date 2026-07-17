import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const commonScript = resolve('resources/windows/common-windows.ps1').replaceAll("'", "''")

async function selectPort(availabilityBody: string): Promise<number> {
  const command = [
    `. '${commonScript}'`,
    `function Test-DreamSkinPortAvailable { param([int]$Port) ${availabilityBody} }`,
    'Select-DreamSkinPort -PreferredPort 9335'
  ].join('; ')
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command
  ])
  return Number(stdout.trim())
}

describe('Windows CDP port selection', () => {
  it('keeps the preferred port when it is available', async () => {
    await expect(selectPort('return $Port -eq 9335')).resolves.toBe(9335)
  })

  it('uses the next available port when the preferred port is occupied', async () => {
    await expect(selectPort('return $Port -eq 9336')).resolves.toBe(9336)
  })

  it('reports an error when the candidate range is occupied', async () => {
    await expect(selectPort('return $false')).rejects.toThrow('No free loopback port was found between 9335 and 9435.')
  })
})
