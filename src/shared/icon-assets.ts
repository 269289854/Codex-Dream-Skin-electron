export const MAX_ICON_GIF_BYTES = 5 * 1024 * 1024
export const MAX_ICON_GIF_DIMENSION = 512
export const MAX_ICON_GIF_FRAMES = 180

export function iconGifPosterAssetKey(asset: string): string {
  return `builtin/icon-posters/${asset}.png`
}
