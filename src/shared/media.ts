import type { MediaKind, MediaMimeType, MediaReference, ThemeProfile, VideoAssetVariant, VideoVariants } from './theme'

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

export function mediaReferenceAssets(reference: MediaReference): Array<{ asset: string; mimeType: MediaMimeType }> {
  if (!reference.videoVariants) return [{ asset: reference.asset, mimeType: reference.mimeType }]
  return [
    { asset: reference.videoVariants.original.asset, mimeType: reference.videoVariants.original.mimeType },
    { asset: reference.videoVariants.optimized.asset, mimeType: reference.videoVariants.optimized.mimeType }
  ]
}

export function createVideoVariantReference(original: VideoAssetVariant, optimized: VideoAssetVariant, active: VideoVariants['active'] = 'optimized'): MediaReference {
  const selected = active === 'original' ? original : optimized
  return {
    asset: selected.asset,
    kind: 'video',
    mimeType: selected.mimeType,
    videoVariants: { active, original, optimized }
  }
}

export function activateVideoVariant(reference: MediaReference, active: VideoVariants['active']): MediaReference {
  if (reference.kind !== 'video' || !reference.videoVariants) return reference
  const selected = reference.videoVariants[active]
  return {
    ...reference,
    asset: selected.asset,
    mimeType: selected.mimeType,
    videoVariants: { ...reference.videoVariants, active }
  }
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
