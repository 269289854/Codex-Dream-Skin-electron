import { describe, expect, it } from 'vitest'
import { PARTICLE_EFFECT_IDS, PARTICLE_VIEWPORT_TOP, createParticleViewportMetrics, createSparkleParticles, particleEffectIconSlot } from '../src/shared/particle-effects'
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
    expect(() => parseThemeProfile({ ...profile, decorations: { ...profile.decorations, composerMelody: { ...profile.decorations.composerMelody, text: 'x'.repeat(65) } } })).toThrow()
    expect(() => parseThemeProfile({ ...profile, decorations: { ...profile.decorations, composerMelody: { ...profile.decorations.composerMelody, position: { x: 0.05, y: 0.35 } } } })).toThrow()
    expect(() => parseThemeProfile({ ...profile, decorations: { ...profile.decorations, composerMelody: { ...profile.decorations.composerMelody, effect: 'spin' } } })).toThrow()
    expect(() => parseThemeProfile({ ...profile, decorations: { ...profile.decorations, composerMelody: { ...profile.decorations.composerMelody, direction: 'up' } } })).toThrow()
    expect(() => parseThemeProfile({ ...profile, decorations: { ...profile.decorations, composerMelody: { ...profile.decorations.composerMelody, speed: 2.01 } } })).toThrow()
    expect(() => parseThemeProfile({ ...profile, decorations: { ...profile.decorations, composerMelody: { ...profile.decorations.composerMelody, gifWidth: 241 } } })).toThrow()
    expect(() => parseThemeProfile({ ...profile, decorations: { ...profile.decorations, composerMelody: { ...profile.decorations.composerMelody, mode: 'gif', source: null } } })).toThrow('GIF')
    expect(() => parseThemeProfile({ ...profile, decorations: { ...profile.decorations, composerMelody: { ...profile.decorations.composerMelody, source: { asset: 'assets/not-gif.png', kind: 'image', mimeType: 'image/png' } } } })).toThrow('GIF')
  })

  it('adds static text defaults to older version fifteen composer decorations', () => {
    const profile = createDefaultTheme(id)
    const legacy = structuredClone(profile) as unknown as { decorations: { composerMelody: Record<string, unknown> } }
    for (const field of ['mode', 'source', 'effect', 'direction', 'speed', 'gifWidth']) delete legacy.decorations.composerMelody[field]

    const parsed = parseThemeProfile(legacy)
    expect(parsed.version).toBe(15)
    expect(parsed.decorations.composerMelody).toMatchObject({ mode: 'text', source: null, effect: 'none', direction: 'left', speed: 1, gifWidth: 96 })
    expect(COMPOSER_DECORATION_EFFECT_IDS).toEqual(['none', 'wave', 'barrage', 'scroll', 'float', 'pulse'])
    expect(COMPOSER_DECORATION_DIRECTION_IDS).toEqual(['left', 'right'])
  })
})
