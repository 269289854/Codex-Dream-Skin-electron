export const PARTICLE_EFFECT_IDS = ['twinkle', 'float', 'rain', 'meteor', 'snow'] as const
export const PARTICLE_VIEWPORT_TOP = 66
export const PARTICLE_PERFORMANCE_MODES = ['quality', 'balanced', 'performance'] as const

export type ParticleEffect = typeof PARTICLE_EFFECT_IDS[number]
export type ParticleEffectIconSlot = 'backgroundSparkle' | 'backgroundFloat' | 'backgroundRain' | 'backgroundMeteor' | 'backgroundSnow'
export type ParticlePerformanceMode = typeof PARTICLE_PERFORMANCE_MODES[number]

export interface ParticleRenderPolicy {
  mode: ParticlePerformanceMode
  animatedIndexes: number[]
  targetFps: number | null
  glowLimit: number | null
  showTrails: boolean
}

export interface ParticlePositionRange {
  min: number
  max: number
  minDelta: number
}

export interface ParticleCyclePositionPolicy {
  x?: ParticlePositionRange
  y?: ParticlePositionRange
  startY?: ParticlePositionRange
}

export interface ParticleCyclePosition {
  x?: number
  y?: number
  startY?: number
}

export interface ParticleEffectDefinition {
  label: string
  iconSlot: ParticleEffectIconSlot
  baseDuration: number
  maxDrift: number
}

export const PARTICLE_EFFECTS: Readonly<Record<ParticleEffect, ParticleEffectDefinition>> = Object.freeze({
  twinkle: { label: '呼吸闪烁', iconSlot: 'backgroundSparkle', baseDuration: 3.6, maxDrift: 4 },
  float: { label: '轻盈漂浮', iconSlot: 'backgroundFloat', baseDuration: 10, maxDrift: 52 },
  rain: { label: '垂直雨落', iconSlot: 'backgroundRain', baseDuration: 2.8, maxDrift: 18 },
  meteor: { label: '斜向流星', iconSlot: 'backgroundMeteor', baseDuration: 8, maxDrift: 36 },
  snow: { label: '摇曳飘雪', iconSlot: 'backgroundSnow', baseDuration: 12, maxDrift: 70 }
})

const PARTICLE_PERFORMANCE_POLICIES: Readonly<Record<ParticlePerformanceMode, Omit<ParticleRenderPolicy, 'mode' | 'animatedIndexes'>>> = Object.freeze({
  quality: { targetFps: null, glowLimit: null, showTrails: true },
  balanced: { targetFps: 30, glowLimit: 6, showTrails: true },
  performance: { targetFps: 15, glowLimit: 0, showTrails: false }
})

const PARTICLE_ANIMATION_BUDGETS: Readonly<Record<ParticlePerformanceMode, number>> = Object.freeze({
  quality: 24,
  balanced: 8,
  performance: 4
})

const PARTICLE_CYCLE_POSITION_POLICIES: Readonly<Record<ParticleEffect, ParticleCyclePositionPolicy>> = Object.freeze({
  twinkle: { x: { min: 5, max: 95, minDelta: 12 }, y: { min: 5, max: 91, minDelta: 12 } },
  float: { x: { min: 5, max: 95, minDelta: 12 } },
  rain: { x: { min: 5, max: 95, minDelta: 12 } },
  meteor: { startY: { min: 2, max: 32, minDelta: 5 } },
  snow: { x: { min: 5, max: 95, minDelta: 12 } }
})

export interface SparkleParticle {
  x: number
  y: number
  size: number
  opacity: number
  rotation: number
  colorIndex: number
  duration: number
  delay: number
  drift: number
  phase: number
  startY: number
}

export interface ParticleViewportMetrics {
  top: number
  width: number
  height: number
  travelWidth: number
  travelHeight: number
  halfHeight: number
  meteorHeight: number
  snowFirstHeight: number
  snowSecondHeight: number
}

export interface SparkleLayoutOptions {
  count: number
  minSize: number
  maxSize: number
  seed: number
  effect: ParticleEffect
  speed: number
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
  const effect = PARTICLE_EFFECTS[options.effect]
  const speed = Math.max(0.5, Math.min(2, options.speed))
  const random = seededRandom(options.seed)
  const particles: SparkleParticle[] = []

  for (let index = 0; index < count; index += 1) {
    const preset = options.seed === 0 ? DEFAULT_POSITIONS[index] : undefined
    const factor = preset?.[2] ?? (0.35 + random() * 0.65)
    const x = preset?.[0] ?? 5 + random() * 90
    const y = preset?.[1] ?? 5 + random() * 86
    const opacity = preset?.[2] ?? 0.45 + random() * 0.55
    const rotation = preset ? 0 : Math.round(random() * 360)
    const duration = effect.baseDuration * (0.82 + random() * 0.36) / speed
    const phase = options.effect === 'meteor'
      ? (index / count + random() / count) % 1
      : random()
    const startY = 2 + random() * 30
    particles.push({
      x,
      y,
      size: minSize + (maxSize - minSize) * factor,
      opacity,
      rotation,
      colorIndex: index % 4,
      duration,
      delay: -duration * phase,
      drift: Math.round((random() * 2 - 1) * effect.maxDrift),
      phase,
      startY
    })
  }
  return particles
}

export function resolveParticleRenderPolicy(mode: ParticlePerformanceMode, count: number): ParticleRenderPolicy {
  const safeCount = Math.max(0, Math.min(24, Math.floor(count)))
  const animatedCount = Math.min(safeCount, PARTICLE_ANIMATION_BUDGETS[mode])
  const animatedIndexes = animatedCount === safeCount
    ? Array.from({ length: safeCount }, (_, index) => index)
    : Array.from({ length: animatedCount }, (_, index) => animatedCount === 1
        ? 0
        : Math.round(index * (safeCount - 1) / (animatedCount - 1)))
  return { mode, animatedIndexes, ...PARTICLE_PERFORMANCE_POLICIES[mode] }
}

export function resolveParticleCyclePositionPolicy(effect: ParticleEffect): ParticleCyclePositionPolicy {
  return PARTICLE_CYCLE_POSITION_POLICIES[effect]
}

export function createParticleCyclePosition(
  effect: ParticleEffect,
  current: ParticleCyclePosition = {},
  random: () => number = Math.random
): ParticleCyclePosition {
  const policy = resolveParticleCyclePositionPolicy(effect)
  const next: ParticleCyclePosition = {}
  for (const axis of ['x', 'y', 'startY'] as const) {
    const range = policy[axis]
    if (!range) continue
    next[axis] = createSeparatedPosition(range, current[axis], random)
  }
  return next
}

export function createParticleViewportMetrics(width: number, height: number, top = PARTICLE_VIEWPORT_TOP): ParticleViewportMetrics {
  const safeTop = Math.max(0, top)
  const safeWidth = Math.max(0, width)
  const safeHeight = Math.max(0, height - safeTop)
  return {
    top: safeTop,
    width: safeWidth,
    height: safeHeight,
    travelWidth: safeWidth + 96,
    travelHeight: safeHeight + 96,
    halfHeight: -(safeHeight / 2 + 48),
    meteorHeight: safeHeight * .55 + 53,
    snowFirstHeight: safeHeight * .28 + 27,
    snowSecondHeight: safeHeight * .62 + 60
  }
}

export function particleEffectIconSlot(effect: ParticleEffect): ParticleEffectIconSlot {
  return PARTICLE_EFFECTS[effect].iconSlot
}

function createSeparatedPosition(range: ParticlePositionRange, current: number | undefined, random: () => number): number {
  const randomValue = Math.min(1, Math.max(0, Number(random()) || 0))
  let next = range.min + (range.max - range.min) * randomValue
  if (typeof current !== 'number' || !Number.isFinite(current) || Math.abs(next - current) >= range.minDelta) return next

  const lower = current - range.minDelta
  const upper = current + range.minDelta
  if (next < current && lower >= range.min) next = lower
  else if (next >= current && upper <= range.max) next = upper
  else if (lower >= range.min) next = lower
  else next = Math.min(range.max, upper)
  return next
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
