import { describe, expect, it } from 'vitest'
import { createSparkleParticles } from '../src/shared/decorations'
import { createDefaultTheme, parseThemeProfile } from '../src/shared/theme'

const id = '22222222-2222-4222-8222-222222222222'

describe('theme decorations', () => {
  it('generates deterministic bounded particles and preserves the legacy default positions', () => {
    const defaults = createSparkleParticles({ count: 6, minSize: 14, maxSize: 18, seed: 0 })
    expect(defaults.map(({ x, y }) => [x, y])).toEqual([[7, 11], [31, 5], [55, 17], [78, 8], [92, 27], [66, 66]])

    const options = { count: 24, minSize: 8, maxSize: 32, seed: 42 }
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
    }
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
    expect(() => parseThemeProfile({ ...profile, decorations: { ...profile.decorations, composerMelody: { ...profile.decorations.composerMelody, text: 'x'.repeat(65) } } })).toThrow()
    expect(() => parseThemeProfile({ ...profile, decorations: { ...profile.decorations, composerMelody: { ...profile.decorations.composerMelody, position: { x: 0.05, y: 0.35 } } } })).toThrow()
  })
})
