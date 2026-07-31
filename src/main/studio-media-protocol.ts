import { createReadStream, type ReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'

export interface ResolvedStudioMedia {
  path: string
  mimeType: string
  size: number
}

export type StudioMediaResolver = (themeId: string, asset: string) => Promise<ResolvedStudioMedia>

export function toThemeDeleteError(reason: unknown): Error {
  const code = reason && typeof reason === 'object' && 'code' in reason ? reason.code : undefined
  if (code === 'EPERM' || code === 'EBUSY') return new Error('主题素材仍被其他程序占用，请关闭相关程序后重试。')
  return reason instanceof Error ? reason : new Error(String(reason))
}

export class StudioMediaProtocol {
  private readonly activeStreams = new Map<string, Set<ReadStream>>()
  private readonly suspendedThemes = new Set<string>()

  constructor(private readonly resolveMedia: StudioMediaResolver) {}

  async handleRequest(request: Request): Promise<Response> {
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 })
      const url = new URL(request.url)
      const themeId = decodeURIComponent(url.hostname)
      const asset = url.pathname.replace(/^\//, '').split('/').map((part) => decodeURIComponent(part)).join('/')
      this.assertAvailable(themeId)
      const resolved = await this.resolveMedia(themeId, asset)
      this.assertAvailable(themeId)
      const fileStat = await stat(resolved.path)
      this.assertAvailable(themeId)
      const range = request.headers.get('range') ?? url.searchParams.get('range')
      let start = 0
      let end = fileStat.size - 1
      let status = 200
      const headers = new Headers({ 'Content-Type': resolved.mimeType, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' })
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range)
        if (!match) return new Response('Invalid range', { status: 416 })
        if (match[1]) start = Number(match[1])
        if (match[2]) end = Number(match[2])
        if (!match[1] && match[2]) { const length = Number(match[2]); start = Math.max(0, fileStat.size - length); end = fileStat.size - 1 }
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= fileStat.size) return new Response('Range not satisfiable', { status: 416 })
        end = Math.min(end, fileStat.size - 1)
        status = 206
        headers.set('Content-Range', `bytes ${start}-${end}/${fileStat.size}`)
      }
      headers.set('Content-Length', String(end - start + 1))
      if (request.method === 'HEAD') return new Response(null, { status, headers })
      const stream = createReadStream(resolved.path, { start, end })
      this.trackStream(themeId, stream)
      return new Response(Readable.toWeb(stream) as ReadableStream, { status, headers })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  }

  async withThemeSuspended<T>(themeId: string, operation: () => Promise<T>): Promise<T> {
    if (this.suspendedThemes.has(themeId)) throw new Error('主题正在删除，请稍后重试。')
    this.suspendedThemes.add(themeId)
    try {
      await this.closeThemeStreams(themeId)
      return await operation()
    } finally {
      this.suspendedThemes.delete(themeId)
    }
  }

  private assertAvailable(themeId: string): void {
    if (this.suspendedThemes.has(themeId)) throw new Error('Theme media is unavailable.')
  }

  private trackStream(themeId: string, stream: ReadStream): void {
    const streams = this.activeStreams.get(themeId) ?? new Set<ReadStream>()
    streams.add(stream)
    this.activeStreams.set(themeId, streams)
    stream.once('close', () => {
      streams.delete(stream)
      if (streams.size === 0) this.activeStreams.delete(themeId)
    })
  }

  private async closeThemeStreams(themeId: string): Promise<void> {
    const streams = [...(this.activeStreams.get(themeId) ?? [])]
    await Promise.all(streams.map((stream) => {
      if (stream.closed) return Promise.resolve()
      return new Promise<void>((resolve) => {
        stream.once('close', resolve)
        stream.destroy()
      })
    }))
  }
}
