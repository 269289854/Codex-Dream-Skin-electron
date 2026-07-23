import * as React from 'react'
import { Gauge, Video, Zap } from 'lucide-react'
import type { VideoAssetInspection, VideoMediaRole } from '../../shared/contracts'
import type { MediaReference, ThemeProfile, VideoVariants } from '../../shared/theme'

interface VideoPlaybackPanelProps {
  profile: ThemeProfile
  inspections: Record<string, VideoAssetInspection | null>
  optimizingRole: VideoMediaRole | null
  onChange: (mutator: (profile: ThemeProfile) => void) => void
  onOptimize: (role: VideoMediaRole) => void
  onActivateVariant: (role: VideoMediaRole, variant: VideoVariants['active']) => void
}

const videoRoles: Array<{ role: VideoMediaRole; label: string }> = [
  { role: 'hero', label: '主视觉' },
  { role: 'polaroid', label: '拍立得' },
  { role: 'conversationBackground', label: '对话背景' },
  { role: 'windowBackground', label: '窗口背景' }
]

export function VideoPlaybackPanel({ profile, inspections, optimizingRole, onChange, onOptimize, onActivateVariant }: VideoPlaybackPanelProps): React.JSX.Element {
  return <div className="video-playback-panel">
    <div className="segmented-control video-pause-policies" aria-label="视频暂停策略">
      <button type="button" className={profile.videoPlayback.pausePolicy === 'hidden' ? 'active' : ''} aria-pressed={profile.videoPlayback.pausePolicy === 'hidden'} onClick={() => onChange((next) => { next.videoPlayback.pausePolicy = 'hidden' })}>仅隐藏时暂停</button>
      <button type="button" className={profile.videoPlayback.pausePolicy === 'unfocused' ? 'active' : ''} aria-pressed={profile.videoPlayback.pausePolicy === 'unfocused'} onClick={() => onChange((next) => { next.videoPlayback.pausePolicy = 'unfocused' })}>失焦即暂停</button>
    </div>
    <div className="video-role-list">
      {videoRoles.map(({ role, label }) => <VideoRoleRow
        key={role}
        role={role}
        label={label}
        reference={videoReferenceForRole(profile, role)}
        inspection={videoReferenceForRole(profile, role)?.kind === 'video' ? inspections[videoReferenceForRole(profile, role)!.asset] : null}
        optimizing={optimizingRole === role}
        onOptimize={onOptimize}
        onActivateVariant={onActivateVariant}
      />)}
    </div>
  </div>
}

function VideoRoleRow({ role, label, reference, inspection, optimizing, onOptimize, onActivateVariant }: {
  role: VideoMediaRole
  label: string
  reference: MediaReference | null
  inspection: VideoAssetInspection | null | undefined
  optimizing: boolean
  onOptimize: (role: VideoMediaRole) => void
  onActivateVariant: (role: VideoMediaRole, variant: VideoVariants['active']) => void
}): React.JSX.Element {
  if (reference?.kind !== 'video') {
    return <section className="video-role-row is-empty"><header><Video size={14} /><strong>{label}</strong></header><span>未使用视频</span></section>
  }

  const activeVariant = reference.videoVariants?.[reference.videoVariants.active]
  const width = inspection?.width ?? activeVariant?.width
  const height = inspection?.height ?? activeVariant?.height
  const frameRate = inspection?.frameRate ?? activeVariant?.frameRate
  const highLoad = inspection?.highLoad ?? Boolean(width && height && frameRate && (Math.max(width, height) > 1920 || Math.min(width, height) > 1080 || frameRate > 30.5))
  const detail = inspection === null
    ? '规格读取失败'
    : width && height && frameRate
      ? `${width}×${height} · ${formatFrameRate(frameRate)} FPS${inspection ? ` · ${inspection.codec.toUpperCase()} · ${formatDuration(inspection.duration)}${inspection.hasAudio ? ' · 含音频' : ' · 无音频'}` : ''}`
      : '正在读取规格'

  return <section className={highLoad ? 'video-role-row is-high-load' : 'video-role-row'}>
    <header><Video size={14} /><strong>{label}</strong>{highLoad && <span className="video-load-badge"><Gauge size={12} />高负载</span>}</header>
    <p>{detail}</p>
    {inspection?.bitRate ? <small>{formatBitRate(inspection.bitRate)}</small> : null}
    {reference.videoVariants
      ? <div className="segmented-control video-variant-switch" aria-label={`${label}视频版本`}>
        <button type="button" className={reference.videoVariants.active === 'original' ? 'active' : ''} aria-pressed={reference.videoVariants.active === 'original'} onClick={() => onActivateVariant(role, 'original')}>原片</button>
        <button type="button" className={reference.videoVariants.active === 'optimized' ? 'active' : ''} aria-pressed={reference.videoVariants.active === 'optimized'} onClick={() => onActivateVariant(role, 'optimized')}>优化版</button>
      </div>
      : highLoad && <button className="secondary-command optimize-video-command" type="button" disabled={optimizing || !inspection} onClick={() => onOptimize(role)}><Zap size={14} />{optimizing ? '正在优化' : '优化视频'}</button>}
  </section>
}

function videoReferenceForRole(profile: ThemeProfile, role: VideoMediaRole): MediaReference | null {
  if (role === 'hero') return profile.hero.source
  if (role === 'polaroid') return profile.polaroid.source
  if (role === 'conversationBackground') return profile.conversationBackground.source
  return profile.windowBackground.source
}

function formatFrameRate(value: number): string {
  return Math.abs(value - Math.round(value)) < 0.01 ? String(Math.round(value)) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(total / 60)
  return `${minutes}:${String(total % 60).padStart(2, '0')}`
}

function formatBitRate(bitRate: number): string {
  return bitRate >= 1_000_000 ? `${(bitRate / 1_000_000).toFixed(1)} Mbps` : `${Math.round(bitRate / 1000)} kbps`
}
