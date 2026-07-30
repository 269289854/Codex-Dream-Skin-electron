import type { VideoAssetInspection } from '../shared/contracts'

interface VideoCompatibilityInput {
  extension: string
  videoCodec: string
  videoProfile: string | null
  bitDepth: number | null
  chromaSubsampling: string | null
  audioCodec: string | null
  audioProfile: string | null
  videoTrackCount: number
  audioTrackCount: number
}

export function isPortableVideo(input: VideoCompatibilityInput): boolean {
  if (input.videoTrackCount !== 1 || input.audioTrackCount > 1) return false
  if (input.extension === '.mp4') {
    return matchesCodec(input.videoCodec, ['avc', 'avc1', 'h264'])
      && hasPortableH264Profile(input.videoProfile)
      && input.bitDepth === 8
      && isChroma420(input.chromaSubsampling)
      && hasPortableMp4Audio(input)
  }
  if (input.extension === '.webm') {
    const vp8 = matchesCodec(input.videoCodec, ['vp8'])
    const vp9 = matchesCodec(input.videoCodec, ['vp9'])
    return (vp8 || (vp9 && normalizedProfile(input.videoProfile) === '0'))
      && input.bitDepth === 8
      && isChroma420(input.chromaSubsampling)
      && hasPortableWebmAudio(input)
  }
  return false
}

export function assertPortableVideoInspection(inspection: VideoAssetInspection): void {
  if (!inspection.portable) throw new Error('视频编码或音轨不满足 Windows 与 macOS 的主题播放兼容要求，请先转换视频。')
}

function matchesCodec(value: string, accepted: string[]): boolean {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const tokens = normalized.split(' ')
  const compact = tokens.join('')
  return accepted.some((codec) => tokens.includes(codec) || compact === codec)
}

function hasPortableH264Profile(value: string | null): boolean {
  const profile = normalizedProfile(value)
  return profile === 'constrained baseline' || profile === 'baseline' || profile === 'main' || profile === 'high'
}

function normalizedProfile(value: string | null): string {
  return ((value ?? '').split('@', 1)[0] ?? '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function isChroma420(value: string | null): boolean {
  if (!value) return false
  const samples = value.match(/4\s*:\s*[0-4]\s*:\s*[0-4]/g)
  return samples?.length ? samples.every((sample) => sample.replace(/\s+/g, '') === '4:2:0') : false
}

function hasPortableMp4Audio(input: VideoCompatibilityInput): boolean {
  if (input.audioTrackCount === 0) return true
  if (input.audioTrackCount !== 1 || !input.audioCodec || !input.audioProfile) return false
  const profile = normalizedProfile(input.audioProfile)
  return matchesCodec(input.audioCodec, ['aac'])
    && (profile === 'lc' || profile === 'low complexity')
    && /(?:^|[^0-9])(?:mp4a[-.]?40[-.]?2|40\s*\/\s*mp4a[-.]?40[-.]?2)(?:[^0-9]|$)/i.test(input.audioCodec)
}

function hasPortableWebmAudio(input: VideoCompatibilityInput): boolean {
  return input.audioTrackCount === 0
    || (input.audioTrackCount === 1 && input.audioCodec !== null && matchesCodec(input.audioCodec, ['opus', 'vorbis']))
}
