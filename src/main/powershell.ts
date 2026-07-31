import { spawn } from 'node:child_process'

export async function runPowerShell<T>(script: string, argumentsList: string[], timeoutMs = 60_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const child = spawn('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, ...argumentsList
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const append = (current: string, chunk: Buffer): string => {
      const next = current + chunk.toString('utf8')
      if (next.length > 1_000_000) throw new Error('PowerShell 输出超过安全限制。')
      return next
    }
    child.stdout.on('data', (chunk: Buffer) => { try { stdout = append(stdout, chunk) } catch (error) { child.kill(); reject(error) } })
    child.stderr.on('data', (chunk: Buffer) => { try { stderr = append(stderr, chunk) } catch (error) { child.kill(); reject(error) } })
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('PowerShell 操作超时。'))
    }, timeoutMs)
    child.once('error', (error) => { clearTimeout(timer); reject(error) })
    child.once('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        reject(new Error((stderr || stdout || `PowerShell 退出，代码 ${code}。`).trim()))
        return
      }
      const jsonLine = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).reverse().find((line) => line.startsWith('{'))
      if (!jsonLine) { reject(new Error('PowerShell 未返回结构化结果。')); return }
      try { resolve(JSON.parse(jsonLine) as T) } catch { reject(new Error('PowerShell 返回的 JSON 无效。')) }
    })
  })
}
