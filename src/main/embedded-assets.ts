export const MAX_EMBEDDED_ASSET_BYTES = 64 * 1024 * 1024

export class EmbeddedAssetBudget {
  private readonly entries = new Map<string, number>()
  private total = 0

  set(key: string, size: number): void {
    assertSafeSize(size)
    const previous = this.entries.get(key) ?? 0
    const next = this.total - previous + size
    if (!Number.isSafeInteger(next) || next > MAX_EMBEDDED_ASSET_BYTES) {
      throw new Error('主题内嵌素材总量不能超过 64 MiB。')
    }
    this.entries.set(key, size)
    this.total = next
  }

  get size(): number {
    return this.total
  }
}

export function dataUrlByteLength(dataUrl: string): number {
  const separator = dataUrl.indexOf(',')
  if (separator < 0 || !dataUrl.slice(0, separator).endsWith(';base64')) {
    throw new Error('主题素材 Data URL 无效。')
  }
  const encoded = dataUrl.slice(separator + 1)
  if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new Error('主题素材 Base64 数据无效。')
  }
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0
  return encoded.length / 4 * 3 - padding
}

export function budgetDataUrls(assets: Record<string, string>): EmbeddedAssetBudget {
  const budget = new EmbeddedAssetBudget()
  for (const [key, dataUrl] of Object.entries(assets)) budget.set(key, dataUrlByteLength(dataUrl))
  return budget
}

function assertSafeSize(size: number): void {
  if (!Number.isSafeInteger(size) || size < 0) throw new Error('主题内嵌素材大小无效。')
}
