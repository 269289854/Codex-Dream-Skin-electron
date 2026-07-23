import * as React from 'react'

interface VideoThumbnailProps {
  src: string
  className?: string
  style?: React.CSSProperties
}

export function VideoThumbnail({ src, className, style }: VideoThumbnailProps): React.JSX.Element {
  const freezeFirstFrame = (event: React.SyntheticEvent<HTMLVideoElement>): void => {
    const video = event.currentTarget
    video.pause()
    if (Number.isFinite(video.currentTime) && video.currentTime !== 0) video.currentTime = 0
  }

  return <video className={className} src={src} style={style} muted playsInline preload="auto" tabIndex={-1} aria-hidden="true" draggable={false} onLoadedData={freezeFirstFrame} />
}
