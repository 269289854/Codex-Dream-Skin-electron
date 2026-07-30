import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'

const spawnMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({ spawn: spawnMock }))

import { runMacCommand } from '../src/main/macos-codex-driver'

afterEach(() => {
  spawnMock.mockReset()
  vi.useRealTimers()
})

describe('runMacCommand', () => {
  it('waits for close and includes output delivered after exit', async () => {
    const child = fakeChild()
    spawnMock.mockReturnValue(child)
    const command = runMacCommand('/usr/bin/example', ['--check'])
    let settled = false
    void command.finally(() => { settled = true })

    child.stdout.emit('data', Buffer.from('before\n'))
    child.emit('exit', 0)
    await Promise.resolve()
    expect(settled).toBe(false)
    child.stdout.emit('data', Buffer.from('after\n'))
    child.stderr.emit('data', Buffer.from('warning\n'))
    child.emit('close', 0)

    await expect(command).resolves.toEqual({ stdout: 'before\nafter\n', stderr: 'warning\n', exitCode: 0 })
  })

  it('still rejects immediately on timeout and excessive output', async () => {
    vi.useFakeTimers()
    const timedOutChild = fakeChild()
    spawnMock.mockReturnValueOnce(timedOutChild)
    const timedOut = runMacCommand('/usr/bin/example', [], 50)
    const timedOutResult = timedOut.then(() => null, (error: unknown) => error)
    await vi.advanceTimersByTimeAsync(50)
    await expect(timedOutResult).resolves.toMatchObject({ message: expect.stringContaining('执行超时') })
    expect(timedOutChild.kill).toHaveBeenCalledWith('SIGKILL')

    const noisyChild = fakeChild()
    spawnMock.mockReturnValueOnce(noisyChild)
    const noisy = runMacCommand('/usr/bin/example', [])
    const noisyResult = noisy.then(() => null, (error: unknown) => error)
    noisyChild.stdout.emit('data', Buffer.alloc(1024 * 1024 + 1, 0x61))
    await expect(noisyResult).resolves.toMatchObject({ message: expect.stringContaining('输出超过安全限制') })
    expect(noisyChild.kill).toHaveBeenCalledWith('SIGKILL')
  })
})

function fakeChild(): EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: ReturnType<typeof vi.fn> } {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: ReturnType<typeof vi.fn> }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn()
  return child
}
