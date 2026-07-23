import * as React from 'react'
import { Play } from 'lucide-react'
import type { VideoMediaRole } from '../../shared/contracts'
import type { ThemeProfile, VideoPausePolicy } from '../../shared/theme'
import { useStableVideoPlayback } from './useStableVideoPlayback'

interface PreviewVideoProps {
  role: VideoMediaRole
  mediaKey: string
  src: string
  playback: ThemeProfile['hero']['playback']
  pausePolicy: VideoPausePolicy
  className: string
  style?: React.CSSProperties
  controls: boolean
  showPlayButton?: boolean
  ariaHidden?: boolean
}

export function PreviewVideo({ role, mediaKey, src, playback, pausePolicy, className, style, controls, showPlayButton = false, ariaHidden = false }: PreviewVideoProps): React.JSX.Element {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const { playbackBlocked, attemptPlay } = useStableVideoPlayback(videoRef, { role, mediaKey, playback, pausePolicy })

  return <>
    <video ref={videoRef} className={className} src={src} style={style} autoPlay={playback.autoplay} loop={playback.loop} muted={!playback.sound} controls={controls} playsInline preload="auto" aria-hidden={ariaHidden || undefined} />
    {showPlayButton && playback.autoplay && playbackBlocked && <button className="preview-media-play" type="button" title="播放媒体" aria-label="播放媒体" onClick={attemptPlay}><Play size={16} fill="currentColor" /></button>}
  </>
}
