import type { MediaKind, MediaMimeType, MediaReference, ThemeProfile } from './theme'

export function mediaMimeTypeForPath(path: string): MediaMimeType {
  const lower = path.toLowerCase()
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.mp4')) return 'video/mp4'
  if (lower.endsWith('.webm')) return 'video/webm'
  return 'image/png'
}

export function mediaKindForMimeType(mimeType: MediaMimeType): MediaKind {
  return mimeType.startsWith('video/') ? 'video' : 'image'
}

export function mediaReferenceForPath(path: string): MediaReference {
  const mimeType = mediaMimeTypeForPath(path)
  return { asset: path, kind: mediaKindForMimeType(mimeType), mimeType }
}

export function isVideoMedia(reference: MediaReference | null | undefined): boolean {
  return reference?.kind === 'video'
}

export function isGifMedia(reference: MediaReference | null | undefined): boolean {
  return reference?.mimeType === 'image/gif'
}

export function mediaFlipCssTransform(transform: ThemeProfile['hero']['mediaTransform']): string {
  return `scaleX(${transform.flipHorizontal ? -1 : 1}) scaleY(${transform.flipVertical ? -1 : 1})`
}
