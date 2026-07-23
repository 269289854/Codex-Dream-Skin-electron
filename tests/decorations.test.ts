import { describe, expect, it } from 'vitest'
import { PARTICLE_EFFECT_IDS, PARTICLE_PERFORMANCE_MODES, PARTICLE_VIEWPORT_TOP, createParticleCyclePosition, createParticleViewportMetrics, createSparkleParticles, particleEffectIconSlot, resolveParticleCyclePositionPolicy, resolveParticleRenderPolicy } from '../src/shared/particle-effects'
import { COMPOSER_DECORATION_DIRECTION_IDS, COMPOSER_DECORATION_EFFECT_IDS, createDefaultTheme, parseThemeProfile } from '../src/shared/theme'

const id = '22222222-2222-4222-8222-222222222222'

describe('theme decorations', () => {
  it('generates deterministic bounded particles and preserves the legacy default positions', () => {
    const defaults = createSparkleParticles({ count: 6, minSize: 14, maxSize: 18, seed: 0, effect: 'twinkle', speed: 1 })
    expect(defaults.map(({ x, y }) => [x, y])).toEqual([[7, 11], [31, 5], [55, 17], [78, 8], [92, 27], [66, 66]])

    const options = { count: 24, minSize: 8, maxSize: 32, seed: 42, effect: 'snow' as const, speed: 1 }
    const particles = createSparkleParticles(options)
    expect(createSparkleParticles(options)).toEqual(particles)
    expect(createSparkleParticles({ ...options, seed: 43 })).not.toEqual(particles)
    expect(particles).toHaveLength(24)
    for (const particle of particles) {
      expect(particle.x).toBeGreaterThanOrEqual(5)
      expect(particle.x).toBeLessThanOrEqual(95)
      expect(particle.y).toBeGreaterThanOrEqual(5)
      expect(particle.y).toBeLessThanOrEqual(91)
      expect(particle.size).toBeGreaterThanOrEqual(8)
      expect(particle.size).toBeLessThanOrEqual(32)
      expect(particle.colorIndex).toBeGreaterThanOrEqual(0)
      expect(particle.colorIndex).toBeLessThan(4)
      expect(particle.duration).toBeGreaterThan(0)
      expect(particle.delay).toBeLessThanOrEqual(0)
      expect(particle.phase).toBeGreaterThanOrEqual(0)
      expect(particle.phase).toBeLessThan(1)
      expect(particle.startY).toBeGreaterThanOrEqual(2)
      expect(particle.startY).toBeLessThan(32)
    }
    const meteors = createSparkleParticles({ count: 6, minSize: 14, maxSize: 18, seed: 42, effect: 'meteor', speed: 1 })
    meteors.forEach((particle, index) => {
      expect(particle.phase).toBeGreaterThanOrEqual(index / meteors.length)
      expect(particle.phase).toBeLessThan((index + 1) / meteors.length)
    })
    expect(createSparkleParticles({ ...options, speed: 2 })[0]!.duration).toBeLessThan(particles[0]!.duration)
    expect(PARTICLE_EFFECT_IDS.map(particleEffectIconSlot)).toEqual(['backgroundSparkle', 'backgroundFloat', 'backgroundRain', 'backgroundMeteor', 'backgroundSnow'])

    expect(PARTICLE_VIEWPORT_TOP).toBe(66)
    const viewport = createParticleViewportMetrics(1000, 700)
    expect(viewport).toMatchObject({
      top: 66,
      width: 1000,
      height: 634,
      travelWidth: 1096,
      travelHeight: 730,
      halfHeight: -365
    })
    expect(viewport.meteorHeight).toBeCloseTo(401.7)
    expect(viewport.snowFirstHeight).toBeCloseTo(204.52)
    expect(viewport.snowSecondHeight).toBeCloseTo(453.08)
  })

  it('validates sparkle palettes, geometry, and composer melody bounds', () => {
    const profile = createDefaultTheme(id)
    profile.decorations.sparkles.extraColors = ['rgb(255 0 128 / 60%)', 'oklch(70% 0.18 210)']
    profile.decorations.composerMelody.text = '<b>♫</b>'
    expect(parseThemeProfile(profile)).toEqual(profile)

    expect(() => parseThemeProfile({ ...profile, decorations: { ...profile.decorations, sparkles: { ...profile.decorations.sparkles, count: 25 } } })).toThrow()
    expect(() => parseThemeProfile({ ...profile, decorations: { ...profile.decorations, sparkles: { ...profile.decorations.sparkles, minSize: 24, maxSize: 12 } } })).toThrow()
    expect(() => parseThemeProfile({ ...profile, decorations: { ...profile.decorations, sparkles: { ...profile.decorations.sparkles, extraColors: ['red', 'blue', 'green', 'pink'] } } })).toThrow()
    expect(() => parseThemeProfile({ ...profile, decorations: { ...profile.decorations, sparkles: { ...profile.decorations.sparkles, extraColors: ['red; background: black'] } } })).toThrow()
    expect(() => parseThemeProfile({ ...profile, decorations: { ...profile.decorations, sparkles: { ...profile.decorations.sparkles, effect: 'storm' } } })).toThrow()
    expect(() => parseThemeProfile({ ...profile, decorations: { ...profile.decorations, sparkles: { ...profile.decorations.sparkles, speed: 0.49 } } })).toThrow()
    expect(() => parseThemeProfile({ ...profile, decorations: { ...profile.decorations, sparkles: { ...profile.decorations.sparkles, speed: 2.01 } } })).toThrow()
    expect(() => parseThemeProfile({ ...profile, decorations: { ...profile.decorations, sparkles: { ...profile.decorations.sparkles, performanceMode: 'automatic' } } })).toThrow()
    expect(() => parseThemeProfile({ ...profile, decorations: { ...profile.decorations, composerMelody: { ...profile.decorations.composerMelody, text: 'x'.repeat(65) } } })).toThrow()
    expect(() => parseThemeProfile({ ...profile, decorations: { ...profile.decorations, composerMelody: { ...profile.decorations.composerMelody, position: { x: 0.05, y: 0.35 } } } })).toThrow()
    expect(() => parseThemeProfile({ ...profile, decorations: { ...profile.decorations, composerMelody: { ...profile.decorations.composerMelody, effect: 'spin' } } })).toThrow()
    expect(() => parseThemeProfile({ ...profile, decorations: { ...profile.decorations, composerMelody: { ...profile.decorations.composerMelody, direction: 'up' } } })).toThrow()
    expect(() => parseThemeProfile({ ...profile, decorations: { ...profile.decorations, composerMelody: { ...profile.decorations.composerMelody, speed: 2.01 } } })).toThrow()
    expect(() => parseThemeProfile({ ...profile, decorations: { ...profile.decorations, composerMelody: { ...profile.decorations.composerMelody, mediaWidth: 241 } } })).toThrow()
    expect(() => parseThemeProfile({ ...profile, decorations: { ...profile.decorations, composerMelody: { ...profile.decorations.composerMelody, mode: 'gif', source: null } } })).toThrow('GIF')
    expect(() => parseThemeProfile({ ...profile, decorations: { ...profile.decorations, composerMelody: { ...profile.decorations.composerMelody, mode: 'gif', source: { asset: 'assets/not-gif.png', kind: 'image', mimeType: 'image/png' } } } })).toThrow('GIF')
    expect(() => parseThemeProfile({ ...profile, decorations: { ...profile.decorations, composerMelody: { ...profile.decorations.composerMelody, mode: 'image', source: { asset: 'assets/animated.gif', kind: 'image', mimeType: 'image/gif' } } } })).toThrow('静态图片')
    expect(() => parseThemeProfile({ ...profile, decorations: { ...profile.decorations, composerMelody: { ...profile.decorations.composerMelody, source: { asset: 'assets/video.mp4', kind: 'video', mimeType: 'video/mp4' } } } })).toThrow('图片或 GIF')

    const image = structuredClone(profile)
    image.decorations.composerMelody.mode = 'image'
    image.decorations.composerMelody.source = { asset: 'assets/decoration.png', kind: 'image', mimeType: 'image/png' }
    expect(parseThemeProfile(image).decorations.composerMelody).toMatchObject({ mode: 'image', mediaWidth: 96 })
    const gif = structuredClone(profile)
    gif.decorations.composerMelody.mode = 'gif'
    gif.decorations.composerMelody.source = { asset: 'assets/decoration.gif', kind: 'image', mimeType: 'image/gif' }
    expect(parseThemeProfile(gif).decorations.composerMelody).toMatchObject({ mode: 'gif', mediaWidth: 96 })
  })

  it('resolves deterministic quality, balanced, and power-saving particle budgets', () => {
    expect(PARTICLE_PERFORMANCE_MODES).toEqual(['quality', 'balanced', 'performance'])
    expect(resolveParticleRenderPolicy('quality', 24)).toMatchObject({ animatedIndexes: Array.from({ length: 24 }, (_, index) => index), targetFps: null, glowLimit: null, showTrails: true })
    expect(resolveParticleRenderPolicy('balanced', 1).animatedIndexes).toEqual([0])
    expect(resolveParticleRenderPolicy('balanced', 8).animatedIndexes).toEqual(Array.from({ length: 8 }, (_, index) => index))
    expect(resolveParticleRenderPolicy('balanced', 20)).toMatchObject({ animatedIndexes: [0, 3, 5, 8, 11, 14, 16, 19], targetFps: 30, glowLimit: 6, showTrails: true })
    expect(resolveParticleRenderPolicy('balanced', 24).animatedIndexes).toEqual([0, 3, 7, 10, 13, 16, 20, 23])
    expect(resolveParticleRenderPolicy('performance', 20)).toMatchObject({ animatedIndexes: [0, 6, 13, 19], targetFps: 15, glowLimit: 0, showTrails: false })
  })

  it('resolves bounded per-cycle positions and keeps them visibly separated', () => {
    expect(resolveParticleCyclePositionPolicy('twinkle')).toEqual({
      x: { min: 5, max: 95, minDelta: 12 },
      y: { min: 5, max: 91, minDelta: 12 }
    })
    expect(resolveParticleCyclePositionPolicy('float')).toEqual({ x: { min: 5, max: 95, minDelta: 12 } })
    expect(resolveParticleCyclePositionPolicy('rain')).toEqual({ x: { min: 5, max: 95, minDelta: 12 } })
    expect(resolveParticleCyclePositionPolicy('snow')).toEqual({ x: { min: 5, max: 95, minDelta: 12 } })
    expect(resolveParticleCyclePositionPolicy('meteor')).toEqual({ startY: { min: 2, max: 32, minDelta: 5 } })

    expect(createParticleCyclePosition('twinkle', { x: 5, y: 5 }, () => 0)).toEqual({ x: 17, y: 17 })
    expect(createParticleCyclePosition('float', { x: 50 }, () => 0.5)).toEqual({ x: 62 })
    expect(createParticleCyclePosition('rain', { x: 50 }, () => 0.5)).toEqual({ x: 62 })
    expect(createParticleCyclePosition('snow', { x: 50 }, () => 0.5)).toEqual({ x: 62 })
    expect(createParticleCyclePosition('meteor', { startY: 17 }, () => 0.5)).toEqual({ startY: 22 })
    expect(createParticleCyclePosition('twinkle', {}, () => 2)).toEqual({ x: 95, y: 91 })
  })

  it('migrates version twenty-two composer media width without changing its GIF', () => {
    const profile = createDefaultTheme(id)
    const { mediaWidth: _mediaWidth, ...composerMelody } = profile.decorations.composerMelody
    const legacy = {
      ...profile,
      version: 22,
      decorations: {
        ...profile.decorations,
        composerMelody: {
          ...composerMelody,
          mode: 'gif',
          source: { asset: 'assets/legacy.gif', kind: 'image', mimeType: 'image/gif' },
          gifWidth: 144
        }
      }
    }

    const parsed = parseThemeProfile(legacy)
    expect(parsed.version).toBe(24)
    expect(parsed.decorations.composerMelody).toMatchObject({ mode: 'gif', source: { asset: 'assets/legacy.gif', mimeType: 'image/gif' }, effect: 'none', direction: 'left', speed: 1, mediaWidth: 144 })
    expect('gifWidth' in parsed.decorations.composerMelody).toBe(false)
    expect(COMPOSER_DECORATION_EFFECT_IDS).toEqual(['none', 'wave', 'barrage', 'scroll', 'float', 'pulse'])
    expect(COMPOSER_DECORATION_DIRECTION_IDS).toEqual(['left', 'right'])
  })
})
