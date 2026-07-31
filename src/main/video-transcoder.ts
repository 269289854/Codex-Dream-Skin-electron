import { spawn } from 'node:child_process'
import ffmpegPath from 'ffmpeg-static'
import type { VideoAssetInspection } from '../shared/contracts'
import { VIDEO_TRANSCODE_AUDIO_BIT_RATE, resolveVideoOutputSize, type VideoTranscodeSettings } from '../shared/video-transcode'
import { assertPortableVideoInspection } from './video-compatibility'

const MAX_ERROR_OUTPUT = 64 * 1024

export interface VideoTranscodeRequest {
  inputPath: string
  outputPath: string
  inspection: VideoAssetInspection
  settings: VideoTranscodeSettings
  signal?: AbortSignal
}

export function buildVideoTranscodeArgs(request: VideoTranscodeRequest): string[] {
  const outputSize = resolveVideoOutputSize(request.inspection, request.settings)
  const filters: string[] = []
  if (outputSize.width !== request.inspection.width || outputSize.height !== request.inspection.height) {
    filters.push(`scale=w=${outputSize.width}:h=${outputSize.height}:flags=lanczos`)
  }
  if (Math.abs(request.settings.frameRate - request.inspection.frameRate) > 0.001) {
    filters.push(`fps=${formatFfmpegNumber(request.settings.frameRate)}`)
  }
  const qualityArgs = request.settings.videoBitRate === null
    ? ['-crf', '23']
    : [
        '-b:v', String(request.settings.videoBitRate),
        '-maxrate', String(request.settings.videoBitRate),
        '-bufsize', String(request.settings.videoBitRate * 2)
      ]

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
    ...qualityArgs,
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-c:a', 'aac',
    '-b:a', `${VIDEO_TRANSCODE_AUDIO_BIT_RATE / 1000}k`,
    '-ac', '2',
    request.outputPath
  ]
}

export function assertOptimizedVideoInspection(source: VideoAssetInspection, optimized: VideoAssetInspection, settings: VideoTranscodeSettings): void {
  const outputSize = resolveVideoOutputSize(source, settings)
  if (optimized.width > outputSize.width || optimized.height > outputSize.height || optimized.width > source.width || optimized.height > source.height) {
    throw new Error('优化视频尺寸复检失败。')
  }
  if (optimized.frameRate > Math.min(source.frameRate, settings.frameRate) + 0.5) throw new Error('优化视频帧率复检失败。')
  try {
    assertPortableVideoInspection(optimized)
  } catch {
    throw new Error('优化视频编码或音轨复检失败。')
  }
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

function formatFfmpegNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}
