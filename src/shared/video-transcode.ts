import { z } from 'zod'

export const VIDEO_RESOLUTION_PRESETS = [
  { id: 'source', label: '原始分辨率', width: null, height: null },
  { id: '2160p', label: '2160p（4K）', width: 3840, height: 2160 },
  { id: '1440p', label: '1440p（2K）', width: 2560, height: 1440 },
  { id: '1080p', label: '1080p', width: 1920, height: 1080 },
  { id: '720p', label: '720p', width: 1280, height: 720 },
  { id: '480p', label: '480p', width: 854, height: 480 }
] as const

export const VIDEO_FRAME_RATE_PRESETS = [60, 30, 24, 15] as const
export const VIDEO_BIT_RATE_PRESETS = [2, 4, 6, 8, 12, 20, 40] as const
export const MIN_VIDEO_BIT_RATE = 500_000
export const MAX_VIDEO_BIT_RATE = 100_000_000
export const VIDEO_TRANSCODE_AUDIO_BIT_RATE = 128_000
export const MAX_VIDEO_TRANSCODE_PIXEL_RATE = 3840 * 2160 * 60
export const VIDEO_IMPORT_CANCELLED_MESSAGE = '媒体导入已取消。'
export const VIDEO_SELECTION_EXPIRED_MESSAGE = '视频选择已失效，请重新选择。'
export const VIDEO_ORIGINAL_IMPORT_INCOMPATIBLE_MESSAGE = '该视频必须转换为跨平台兼容格式。'
export const VIDEO_TRANSCODE_WORKLOAD_MESSAGE = '分辨率与帧率组合过高，最高支持等同 4K / 60 FPS 的转码负载。'
export const VIDEO_OPTIMIZATION_NO_CHANGE_MESSAGE = '该视频负载较低，请降低分辨率、帧率或码率后再生成优化版。'
const AUTO_VIDEO_BITS_PER_PIXEL = 0.2
const VIDEO_STORAGE_MARGIN = 1.1
const VIDEO_FRAME_RATE_EQUIVALENCE_RATIO = 0.0011

export const videoTranscodeSettingsSchema = z.object({
  maxWidth: z.number().int().min(2).max(4096),
  maxHeight: z.number().int().min(2).max(4096),
  frameRate: z.number().finite().min(1).max(240),
  videoBitRate: z.number().int().min(MIN_VIDEO_BIT_RATE).max(MAX_VIDEO_BIT_RATE).nullable()
}).strict()

export type VideoTranscodeSettings = z.infer<typeof videoTranscodeSettingsSchema>
export const videoImportDecisionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('original') }).strict(),
  z.object({ mode: z.literal('transcode'), settings: videoTranscodeSettingsSchema }).strict()
])
export type VideoImportDecision = z.infer<typeof videoImportDecisionSchema>
export type VideoResolutionPresetId = (typeof VIDEO_RESOLUTION_PRESETS)[number]['id'] | 'custom'

export interface VideoSourceSpec {
  width: number
  height: number
  frameRate: number
}

export interface VideoOutputSize {
  width: number
  height: number
}

export interface VideoStorageSourceSpec extends VideoSourceSpec {
  duration: number
  bitRate: number | null
  hasAudio: boolean
}

export interface VideoOptimizationSourceSpec extends VideoSourceSpec {
  bitRate: number | null
  portable: boolean
  highLoad: boolean
}

export function videoResolutionBounds(
  preset: Exclude<VideoResolutionPresetId, 'custom'>,
  source: Pick<VideoSourceSpec, 'width' | 'height'>
): { maxWidth: number; maxHeight: number } {
  if (preset === 'source') return { maxWidth: source.width, maxHeight: source.height }
  const selected = VIDEO_RESOLUTION_PRESETS.find((candidate) => candidate.id === preset)
  if (!selected?.width || !selected.height) throw new Error('视频分辨率预设无效。')
  return source.width >= source.height
    ? { maxWidth: selected.width, maxHeight: selected.height }
    : { maxWidth: selected.height, maxHeight: selected.width }
}

export function resolveVideoOutputSize(
  source: Pick<VideoSourceSpec, 'width' | 'height'>,
  bounds: Pick<VideoTranscodeSettings, 'maxWidth' | 'maxHeight'>
): VideoOutputSize {
  const scale = Math.min(1, bounds.maxWidth / source.width, bounds.maxHeight / source.height)
  return {
    width: toEvenDimension(source.width * scale),
    height: toEvenDimension(source.height * scale)
  }
}

export function createDefaultVideoTranscodeSettings(source: VideoSourceSpec): VideoTranscodeSettings {
  const bounds = videoResolutionBounds('1080p', source)
  return {
    ...bounds,
    frameRate: Math.min(source.frameRate, 30),
    videoBitRate: null
  }
}

export function areVideoFrameRatesEquivalent(left: number, right: number): boolean {
  const reference = Math.max(Math.abs(left), Math.abs(right))
  return Math.abs(left - right) <= Math.max(0.001, reference * VIDEO_FRAME_RATE_EQUIVALENCE_RATIO)
}

export function isVideoFrameRateAllowed(target: number, source: number): boolean {
  return target <= source || areVideoFrameRatesEquivalent(target, source)
}

export function isVideoTranscodeWorkloadAllowed(source: VideoSourceSpec, settings: VideoTranscodeSettings): boolean {
  const output = resolveVideoOutputSize(source, settings)
  return output.width * output.height * settings.frameRate <= MAX_VIDEO_TRANSCODE_PIXEL_RATE
}

export function isMeaningfulVideoOptimization(source: VideoOptimizationSourceSpec, settings: VideoTranscodeSettings): boolean {
  if (!source.portable || source.highLoad) return true
  const output = resolveVideoOutputSize(source, settings)
  if (output.width < source.width || output.height < source.height) return true
  if (settings.frameRate < source.frameRate && !areVideoFrameRatesEquivalent(settings.frameRate, source.frameRate)) return true
  return settings.videoBitRate !== null && (source.bitRate === null || settings.videoBitRate < source.bitRate)
}

export function assertVideoImportDecisionCompatible(decision: VideoImportDecision, source: { portable: boolean }): void {
  if (decision.mode === 'original' && !source.portable) throw new Error(VIDEO_ORIGINAL_IMPORT_INCOMPATIBLE_MESSAGE)
}

export function estimateVideoTranscodeStorageBytes(
  sourceBytes: number,
  source: VideoStorageSourceSpec,
  settings: VideoTranscodeSettings,
  includeSourceCopy: boolean
): number {
  if (!Number.isSafeInteger(sourceBytes) || sourceBytes < 0) throw new Error('源视频大小无效，无法估算转换空间。')
  if (!Number.isFinite(source.duration) || source.duration <= 0) throw new Error('视频时长无效，无法安全估算转换所需空间。')
  const output = resolveVideoOutputSize(source, settings)
  const outputPixelRate = output.width * output.height * settings.frameRate
  const sourcePixelRate = source.width * source.height * source.frameRate
  const measuredBitRate = Math.max(source.bitRate ?? 0, sourceBytes * 8 / source.duration)
  const scaledMeasuredBitRate = measuredBitRate * Math.min(1, outputPixelRate / sourcePixelRate)
  const automaticBitRate = Math.max(scaledMeasuredBitRate, outputPixelRate * AUTO_VIDEO_BITS_PER_PIXEL)
  const videoBitRate = settings.videoBitRate ?? automaticBitRate
  const audioBitRate = source.hasAudio ? VIDEO_TRANSCODE_AUDIO_BIT_RATE : 0
  const outputBytes = Math.ceil((videoBitRate + audioBitRate) * source.duration / 8 * VIDEO_STORAGE_MARGIN)
  const reservedBytes = outputBytes + (includeSourceCopy ? sourceBytes : 0)
  if (!Number.isSafeInteger(reservedBytes)) throw new Error('预计视频输出过大，无法安全预留磁盘空间。')
  return reservedBytes
}

export function parseVideoTranscodeSettings(input: unknown, source: VideoSourceSpec): VideoTranscodeSettings {
  const parsed = videoTranscodeSettingsSchema.safeParse(input)
  if (!parsed.success) throw new Error('视频转换参数无效。')
  if (!isVideoFrameRateAllowed(parsed.data.frameRate, source.frameRate)) throw new Error('目标帧率不能高于源视频。')
  if (!isVideoTranscodeWorkloadAllowed(source, parsed.data)) throw new Error(VIDEO_TRANSCODE_WORKLOAD_MESSAGE)
  return parsed.data
}

function toEvenDimension(value: number): number {
  return Math.max(2, Math.floor(value / 2) * 2)
}
