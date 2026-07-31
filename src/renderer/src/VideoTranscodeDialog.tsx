import * as React from 'react'
import { SlidersHorizontal, Video, X, Zap } from 'lucide-react'
import type { VideoAssetInspection, VideoImportDecision } from '../../shared/contracts'
import { t, tm, type LocalizedMessage } from '../../shared/i18n'
import {
  MAX_VIDEO_BIT_RATE,
  MIN_VIDEO_BIT_RATE,
  VIDEO_BIT_RATE_PRESETS,
  VIDEO_FRAME_RATE_PRESETS,
  VIDEO_OPTIMIZATION_NO_CHANGE_MESSAGE,
  VIDEO_RESOLUTION_PRESETS,
  VIDEO_TRANSCODE_WORKLOAD_MESSAGE,
  createDefaultVideoTranscodeSettings,
  isMeaningfulVideoOptimization,
  isVideoFrameRateAllowed,
  isVideoTranscodeWorkloadAllowed,
  resolveVideoOutputSize,
  videoResolutionBounds,
  type VideoResolutionPresetId,
  type VideoTranscodeSettings
} from '../../shared/video-transcode'

interface VideoTranscodeDialogProps {
  title: string
  originalName: string
  inspection: VideoAssetInspection
  purpose: 'import' | 'optimize'
  allowOriginal: boolean
  defaultMode: VideoImportDecision['mode']
  busy: boolean
  error: LocalizedMessage | null
  onCancel: () => void
  onSubmit: (decision: VideoImportDecision) => void
}

type FrameRateChoice = 'source' | `${number}` | 'custom'
type BitRateChoice = 'auto' | `${number}` | 'custom'

export function VideoTranscodeDialog({
  title,
  originalName,
  inspection,
  purpose,
  allowOriginal,
  defaultMode,
  busy,
  error,
  onCancel,
  onSubmit
}: VideoTranscodeDialogProps): React.JSX.Element {
  const defaults = createDefaultVideoTranscodeSettings(inspection)
  const [mode, setMode] = React.useState<VideoImportDecision['mode']>(allowOriginal ? defaultMode : 'transcode')
  const [resolution, setResolution] = React.useState<VideoResolutionPresetId>(() => defaultResolutionChoice(inspection))
  const [customWidth, setCustomWidth] = React.useState(String(resolveVideoOutputSize(inspection, defaults).width))
  const [customHeight, setCustomHeight] = React.useState(String(resolveVideoOutputSize(inspection, defaults).height))
  const [frameRateChoice, setFrameRateChoice] = React.useState<FrameRateChoice>(() => defaultFrameRateChoice(inspection.frameRate))
  const [customFrameRate, setCustomFrameRate] = React.useState(formatNumber(defaults.frameRate))
  const [bitRateChoice, setBitRateChoice] = React.useState<BitRateChoice>('auto')
  const [customBitRate, setCustomBitRate] = React.useState('8')
  const dialogRef = React.useRef<HTMLElement>(null)

  React.useLayoutEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogRef.current?.focus()
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  const bounds = resolution === 'custom'
    ? { maxWidth: evenDimension(numericValue(customWidth)), maxHeight: evenDimension(numericValue(customHeight)) }
    : videoResolutionBounds(resolution, inspection)
  const frameRate = frameRateChoice === 'source'
    ? inspection.frameRate
    : frameRateChoice === 'custom'
      ? numericValue(customFrameRate)
      : Number(frameRateChoice)
  const videoBitRate = bitRateChoice === 'auto'
    ? null
    : Math.round((bitRateChoice === 'custom' ? numericValue(customBitRate) : Number(bitRateChoice)) * 1_000_000)
  const settings: VideoTranscodeSettings = { ...bounds, frameRate, videoBitRate }
  const settingsError = validateSettings(settings, inspection, purpose)
  const output = settingsError ? null : resolveVideoOutputSize(inspection, settings)
  const bitRateWarning = videoBitRate !== null && inspection.bitRate !== null && videoBitRate > inspection.bitRate

  const updateCustomWidth = (value: string): void => {
    setCustomWidth(value)
    const width = numericValue(value)
    if (width >= 2 && width <= inspection.width) {
      setCustomHeight(String(evenDimension(width * inspection.height / inspection.width)))
    }
  }

  const updateCustomHeight = (value: string): void => {
    setCustomHeight(value)
    const height = numericValue(value)
    if (height >= 2 && height <= inspection.height) {
      setCustomWidth(String(evenDimension(height * inspection.width / inspection.height)))
    }
  }

  const close = (): void => {
    if (!busy) onCancel()
  }

  const submit = (): void => {
    if (busy) return
    if (mode === 'original') {
      if (allowOriginal) onSubmit({ mode: 'original' })
      return
    }
    if (!settingsError) onSubmit({ mode: 'transcode', settings })
  }

  return <div className="theme-dialog-backdrop video-transcode-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
    <section
      ref={dialogRef}
      className="theme-dialog video-transcode-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="video-transcode-title"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          close()
        }
      }}
    >
      <header><span><SlidersHorizontal size={16} /></span><h2 id="video-transcode-title">{t(title)}</h2><button type="button" title={t('关闭')} disabled={busy} onClick={close}><X size={16} /></button></header>
      <form noValidate onSubmit={(event) => { event.preventDefault(); submit() }}>
        <div className="video-source-summary">
          <Video size={17} />
          <span><strong>{originalName}</strong><small>{inspection.width}×{inspection.height} · {formatNumber(inspection.frameRate)} FPS · {formatBitRate(inspection.bitRate)}</small></span>
          {inspection.portable ? inspection.highLoad ? <em className="is-warning">{t('高负载')}</em> : <em>{t('兼容')}</em> : <em className="is-warning">{t('需转换')}</em>}
        </div>

        {allowOriginal
          ? <div className="segmented-control video-import-modes" aria-label={t('视频导入方式')}>
            <button type="button" className={mode === 'original' ? 'active' : ''} aria-pressed={mode === 'original'} onClick={() => setMode('original')}>{t('原样使用')}</button>
            <button type="button" className={mode === 'transcode' ? 'active' : ''} aria-pressed={mode === 'transcode'} onClick={() => setMode('transcode')}>{t('转换后使用')}</button>
          </div>
          : !inspection.portable && <p className="video-transcode-notice">{t('源视频不兼容，必须转换后使用。')}</p>}

        <fieldset className="video-transcode-fields" disabled={busy || mode === 'original'}>
          <label>
            <span>{t('分辨率')}</span>
            <select value={resolution} onChange={(event) => setResolution(event.currentTarget.value as VideoResolutionPresetId)}>
              {VIDEO_RESOLUTION_PRESETS.map((preset) => {
                const presetBounds = videoResolutionBounds(preset.id, inspection)
                const presetOutput = resolveVideoOutputSize(inspection, presetBounds)
                const sourceOutput = resolveVideoOutputSize(inspection, videoResolutionBounds('source', inspection))
                const disabled = preset.id !== 'source' && presetOutput.width === sourceOutput.width && presetOutput.height === sourceOutput.height
                return <option key={preset.id} value={preset.id} disabled={disabled}>{t(preset.label)}</option>
              })}
              <option value="custom">{t('自定义')}</option>
            </select>
          </label>
          {resolution === 'custom' && <div className="video-custom-resolution" aria-label={t('自定义分辨率')}>
            <label><span>{t('宽度')}</span><input type="number" min={2} max={inspection.width} step="any" value={customWidth} onInput={(event) => updateCustomWidth(event.currentTarget.value)} onChange={(event) => updateCustomWidth(event.currentTarget.value)} /></label>
            <span aria-hidden="true">×</span>
            <label><span>{t('高度')}</span><input type="number" min={2} max={inspection.height} step="any" value={customHeight} onInput={(event) => updateCustomHeight(event.currentTarget.value)} onChange={(event) => updateCustomHeight(event.currentTarget.value)} /></label>
          </div>}

          <label>
            <span>{t('帧率')}</span>
            <select value={frameRateChoice} onChange={(event) => setFrameRateChoice(event.currentTarget.value as FrameRateChoice)}>
              <option value="source">{t('原始（{frameRate} FPS）', { frameRate: formatNumber(inspection.frameRate) })}</option>
              {VIDEO_FRAME_RATE_PRESETS.map((value) => <option key={value} value={String(value)} disabled={!isVideoFrameRateAllowed(value, inspection.frameRate)}>{value} FPS</option>)}
              <option value="custom">{t('自定义')}</option>
            </select>
          </label>
          {frameRateChoice === 'custom' && <label className="video-custom-value"><span>{t('自定义帧率')}</span><div><input type="number" min={1} max={240} step="any" value={customFrameRate} onInput={(event) => setCustomFrameRate(event.currentTarget.value)} onChange={(event) => setCustomFrameRate(event.currentTarget.value)} /><span>FPS</span></div></label>}

          <label>
            <span>{t('视频码率')}</span>
            <select value={bitRateChoice} onChange={(event) => setBitRateChoice(event.currentTarget.value as BitRateChoice)}>
              <option value="auto">{t('自动（CRF 23）')}</option>
              {VIDEO_BIT_RATE_PRESETS.map((value) => <option key={value} value={String(value)}>{value} Mbps</option>)}
              <option value="custom">{t('自定义')}</option>
            </select>
          </label>
          {bitRateChoice === 'custom' && <label className="video-custom-value"><span>{t('自定义码率')}</span><div><input type="number" min={MIN_VIDEO_BIT_RATE / 1_000_000} max={MAX_VIDEO_BIT_RATE / 1_000_000} step="any" value={customBitRate} onInput={(event) => setCustomBitRate(event.currentTarget.value)} onChange={(event) => setCustomBitRate(event.currentTarget.value)} /><span>Mbps</span></div></label>}
        </fieldset>

        {mode === 'transcode' && <div className="video-output-summary" aria-live="polite">
          <span>{t('输出')}</span>
          <strong>{output ? `${output.width}×${output.height} · ${formatNumber(frameRate)} FPS · ${videoBitRate === null ? t('自动码率') : `${formatNumber(videoBitRate / 1_000_000)} Mbps`}` : t('参数无效')}</strong>
        </div>}
        {mode === 'transcode' && settingsError && <p className="theme-dialog-error" role="alert">{settingsError}</p>}
        {mode === 'transcode' && bitRateWarning && !settingsError && <p className="video-transcode-notice">{t('目标码率高于源视频，不会增加已有画质。')}</p>}
        {error && <p className="theme-dialog-error" role="alert">{tm(error)}</p>}

        <footer>
          <button className="secondary-command" type="button" disabled={busy} onClick={close}>{t('取消')}</button>
          <button className="primary-button" type="submit" disabled={busy || (mode === 'transcode' && Boolean(settingsError))}>
            {mode === 'transcode' ? <Zap size={14} /> : <Video size={14} />}
            {t(busy ? '处理中' : mode === 'original' ? '原样导入' : purpose === 'import' ? '转换并导入' : '生成优化版')}
          </button>
        </footer>
      </form>
    </section>
  </div>
}

function defaultFrameRateChoice(sourceFrameRate: number): FrameRateChoice {
  if (sourceFrameRate <= 30) return 'source'
  return '30'
}

function defaultResolutionChoice(inspection: VideoAssetInspection): VideoResolutionPresetId {
  const source = resolveVideoOutputSize(inspection, videoResolutionBounds('source', inspection))
  const optimized = resolveVideoOutputSize(inspection, videoResolutionBounds('1080p', inspection))
  return source.width === optimized.width && source.height === optimized.height ? 'source' : '1080p'
}

function validateSettings(settings: VideoTranscodeSettings, inspection: VideoAssetInspection, purpose: 'import' | 'optimize'): string | null {
  if (!Number.isFinite(settings.maxWidth) || !Number.isFinite(settings.maxHeight) || settings.maxWidth < 2 || settings.maxHeight < 2 || settings.maxWidth > 4096 || settings.maxHeight > 4096) return t('分辨率必须在 2–4096px 之间。')
  if (!Number.isFinite(settings.frameRate) || settings.frameRate < 1 || !isVideoFrameRateAllowed(settings.frameRate, inspection.frameRate)) return t('帧率必须在 1–{frameRate} FPS 之间。', { frameRate: formatNumber(inspection.frameRate) })
  if (settings.videoBitRate !== null && (!Number.isFinite(settings.videoBitRate) || settings.videoBitRate < MIN_VIDEO_BIT_RATE || settings.videoBitRate > MAX_VIDEO_BIT_RATE)) return t('视频码率必须在 0.5–100 Mbps 之间。')
  if (!isVideoTranscodeWorkloadAllowed(inspection, settings)) return t(VIDEO_TRANSCODE_WORKLOAD_MESSAGE)
  if (purpose === 'optimize' && !isMeaningfulVideoOptimization(inspection, settings)) return t(VIDEO_OPTIMIZATION_NO_CHANGE_MESSAGE)
  return null
}

function numericValue(value: string): number {
  return value.trim() ? Number(value) : Number.NaN
}

function evenDimension(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(2, Math.floor(value / 2) * 2)
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function formatBitRate(value: number | null): string {
  if (!value) return t('未知码率')
  return value >= 1_000_000 ? `${formatNumber(value / 1_000_000)} Mbps` : `${Math.round(value / 1000)} kbps`
}
