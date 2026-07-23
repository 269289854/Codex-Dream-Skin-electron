import { spawn } from 'node:child_process'
import ffmpegPath from 'ffmpeg-static'
import type { VideoAssetInspection } from '../shared/contracts'

const MAX_ERROR_OUTPUT = 64 * 1024

export interface VideoTranscodeRequest {
  inputPath: string
  outputPath: string
  inspection: VideoAssetInspection
  signal?: AbortSignal
}

export function buildVideoTranscodeArgs(request: VideoTranscodeRequest): string[] {
  const landscape = request.inspection.width >= request.inspection.height
  const maxWidth = landscape ? 1920 : 1080
  const maxHeight = landscape ? 1080 : 1920
  const filters: string[] = []
  if (request.inspection.width > maxWidth || request.inspection.height > maxHeight) {
    filters.push(`scale=w=${maxWidth}:h=${maxHeight}:force_original_aspect_ratio=decrease:force_divisible_by=2`)
  }
  if (request.inspection.frameRate > 30.5) filters.push('fps=30')

  return [
    '-hide_banner',
    '-loglevel', 'error',
    '-nostdin',
    '-y',
    '-i', request.inputPath,
    '-map', '0:v:0',
    '-map', '0:a:0?',
    '-sn',
    '-dn',
    ...(filters.length > 0 ? ['-vf', filters.join(',')] : []),
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ac', '2',
    request.outputPath
  ]
}

export function assertOptimizedVideoInspection(source: VideoAssetInspection, optimized: VideoAssetInspection): void {
  const landscape = source.width >= source.height
  const maxWidth = landscape ? 1920 : 1080
  const maxHeight = landscape ? 1080 : 1920
  const maxFrameRate = Math.min(source.frameRate, 30)
  if (optimized.width > maxWidth || optimized.height > maxHeight || optimized.width > source.width || optimized.height > source.height) {
    throw new Error('优化视频尺寸复检失败。')
  }
  if (optimized.frameRate > maxFrameRate + 0.5) throw new Error('优化视频帧率复检失败。')
  if (!/avc|h264/i.test(optimized.codec)) throw new Error('优化视频编码复检失败。')
  if (optimized.hasAudio !== source.hasAudio) throw new Error('优化视频音轨复检失败。')
}

export async function transcodeVideo(request: VideoTranscodeRequest): Promise<void> {
  if (request.signal?.aborted) throw new Error('视频优化已取消。')
  const executable = resolveFfmpegPath(ffmpegPath)
  const args = buildVideoTranscodeArgs(request)
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe']
    })
    let settled = false
    let stderr = ''
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      request.signal?.removeEventListener('abort', abort)
      if (error) reject(error)
      else resolve()
    }
    const abort = (): void => {
      child.kill('SIGKILL')
    }
    request.signal?.addEventListener('abort', abort, { once: true })
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length >= MAX_ERROR_OUTPUT) return
      stderr += chunk.toString('utf8', 0, Math.max(0, MAX_ERROR_OUTPUT - stderr.length))
    })
    child.once('error', (error) => finish(new Error(`无法启动视频优化器: ${error.message}`)))
    child.once('exit', (code) => {
      if (request.signal?.aborted) {
        finish(new Error('视频优化已取消。'))
        return
      }
      if (code !== 0) {
        const detail = stderr.trim().split(/\r?\n/).slice(-3).join(' ')
        finish(new Error(detail ? `视频优化失败: ${detail}` : `视频优化失败，FFmpeg 退出码 ${code ?? 'unknown'}。`))
        return
      }
      finish()
    })
  })
}

export function resolveFfmpegPath(value: string | null): string {
  if (!value) throw new Error('内置视频优化器不可用。')
  return value.replace(/([\\/])app\.asar([\\/])/i, '$1app.asar.unpacked$2')
}
