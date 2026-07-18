export interface SparkleParticle {
  x: number
  y: number
  size: number
  opacity: number
  rotation: number
  colorIndex: number
}

export interface SparkleLayoutOptions {
  count: number
  minSize: number
  maxSize: number
  seed: number
}

const DEFAULT_POSITIONS: ReadonlyArray<readonly [number, number, number]> = [
  [7, 11, 0.86],
  [31, 5, 0.54],
  [55, 17, 0.82],
  [78, 8, 0.64],
  [92, 27, 0.9],
  [66, 66, 0.48]
]

export function createSparkleParticles(options: SparkleLayoutOptions): SparkleParticle[] {
  const count = Math.max(0, Math.min(24, Math.floor(options.count)))
  const minSize = Math.min(options.minSize, options.maxSize)
  const maxSize = Math.max(options.minSize, options.maxSize)
  const random = seededRandom(options.seed)
  const particles: SparkleParticle[] = []

  for (let index = 0; index < count; index += 1) {
    const preset = options.seed === 0 ? DEFAULT_POSITIONS[index] : undefined
    const factor = preset?.[2] ?? (0.35 + random() * 0.65)
    particles.push({
      x: preset?.[0] ?? 5 + random() * 90,
      y: preset?.[1] ?? 5 + random() * 86,
      size: minSize + (maxSize - minSize) * factor,
      opacity: preset?.[2] ?? 0.45 + random() * 0.55,
      rotation: preset ? 0 : Math.round(random() * 360),
      colorIndex: index % 4
    })
  }
  return particles
}

function seededRandom(seed: number): () => number {
  let state = (Math.floor(seed) >>> 0) || 1
  return () => {
    state = (state + 0x6D2B79F5) | 0
    let value = Math.imul(state ^ state >>> 15, 1 | state)
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}
