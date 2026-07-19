import * as React from 'react'
import { Play } from 'lucide-react'
import type { ThemeProfile } from '../../shared/theme'
import { useStableVideoPlayback } from './useStableVideoPlayback'

interface PreviewVideoProps {
  role: 'hero' | 'polaroid'
  mediaKey: string
  src: string
  playback: ThemeProfile['hero']['playback']
  className: string
  style?: React.CSSProperties
  controls: boolean
  showPlayButton?: boolean
}

export function PreviewVideo({ role, mediaKey, src, playback, className, style, controls, showPlayButton = false }: PreviewVideoProps): React.JSX.Element {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const { playbackBlocked, attemptPlay } = useStableVideoPlayback(videoRef, { role, mediaKey, playback })

  return <>
    <video ref={videoRef} className={className} src={src} style={style} autoPlay={playback.autoplay} loop={playback.loop} muted={!playback.sound} controls={controls} playsInline preload="auto" />
    {showPlayButton && playback.autoplay && playbackBlocked && <button className="preview-media-play" type="button" title="播放媒体" aria-label="播放媒体" onClick={attemptPlay}><Play size={16} fill="currentColor" /></button>}
  </>
}
