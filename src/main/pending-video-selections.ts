import type { VideoMediaRole } from '../shared/contracts'
import { VIDEO_SELECTION_EXPIRED_MESSAGE } from '../shared/video-transcode'
import type { VideoSourcePreflight } from './profile-store'

export const VIDEO_SELECTION_TTL_MS = 10 * 60 * 1000

export interface PendingVideoSelection {
  themeId: string
  purpose: VideoMediaRole
  sourcePath: string
  originalName: string
  preflight: VideoSourcePreflight
  expiresAt: number
  state: 'ready' | 'processing'
}

type PendingVideoSelectionInput = Omit<PendingVideoSelection, 'expiresAt' | 'state'>

export class PendingVideoSelectionRegistry {
  private readonly selections = new Map<string, PendingVideoSelection>()

  constructor(
    private readonly ttlMs = VIDEO_SELECTION_TTL_MS,
    private readonly now: () => number = Date.now
  ) {}

  add(selectionId: string, input: PendingVideoSelectionInput): void {
    this.cleanupExpired()
    this.selections.set(selectionId, {
      ...input,
      expiresAt: this.now() + this.ttlMs,
      state: 'ready'
    })
  }

  begin(themeId: string, selectionId: string): PendingVideoSelection {
    this.cleanupExpired()
    const selection = this.selections.get(selectionId)
    if (!selection || selection.themeId !== themeId) throw new Error(VIDEO_SELECTION_EXPIRED_MESSAGE)
    if (selection.state === 'processing') throw new Error('该视频选择正在处理中，请等待当前操作完成。')
    selection.state = 'processing'
    return selection
  }

  complete(selectionId: string, selection: PendingVideoSelection): void {
    if (this.selections.get(selectionId) === selection) this.selections.delete(selectionId)
  }

  cancel(selectionId: string, selection: PendingVideoSelection): void {
    this.complete(selectionId, selection)
  }

  restore(selectionId: string, selection: PendingVideoSelection): void {
    if (this.selections.get(selectionId) !== selection) return
    selection.state = 'ready'
    selection.expiresAt = this.now() + this.ttlMs
  }

  discard(themeId: string, selectionId: string): void {
    this.cleanupExpired()
    const selection = this.selections.get(selectionId)
    if (!selection || selection.themeId !== themeId) return
    if (selection.state === 'processing') throw new Error('该视频选择正在处理中，暂时无法放弃。')
    this.selections.delete(selectionId)
  }

  private cleanupExpired(): void {
    const now = this.now()
    for (const [selectionId, selection] of this.selections) {
      if (selection.state === 'ready' && selection.expiresAt <= now) this.selections.delete(selectionId)
    }
  }
}
