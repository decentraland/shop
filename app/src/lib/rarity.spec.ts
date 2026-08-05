import { describe, it, expect } from 'vitest'
import { Rarity } from '@dcl/schemas'
import { rarityColor, rarityGradient, rarityInk, rarityTint } from '~/lib/rarity'
import { rarities } from '~/styles/theme'

// Neutral fallback color rarity.ts returns for a missing/unknown rarity.
const FALLBACK_COLOR = '#E6E6E6'

// ITU-R BT.601 luminance of a #rrggbb color — mirrors the weighting rarity.ts uses, so we can assert
// that rarityInk lands a light color near its target luminance without hard-coding the darkened hex.
function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return 0.299 * r + 0.587 * g + 0.114 * b
}

describe('when resolving the color for a rarity', () => {
  // The DESIGN palette, not @dcl/schemas' — every rarity differs (see rarityColor).
  it('should return the design token for a known rarity', () => {
    expect(rarityColor('legendary')).toBe(rarities.legendary)
    expect(rarityColor('mythic')).toBe(rarities.mythic)
    expect(rarityColor('common')).toBe(rarities.common)
  })

  it('should prefer the design token over the schema color', () => {
    expect(rarityColor('legendary')).not.toBe(Rarity.getColor(Rarity.LEGENDARY))
  })

  it('and the rarity casing differs it should still resolve by lowercasing', () => {
    expect(rarityColor('EPIC')).toBe(rarities.epic)
    expect(rarityColor('Rare')).toBe(rarities.rare)
    expect(rarityColor('UnCommon')).toBe(rarities.uncommon)
  })

  it('should fall back to the neutral color when no rarity is given', () => {
    expect(rarityColor()).toBe(FALLBACK_COLOR)
    expect(rarityColor(undefined)).toBe(FALLBACK_COLOR)
    expect(rarityColor(null)).toBe(FALLBACK_COLOR)
    expect(rarityColor('')).toBe(FALLBACK_COLOR)
  })

  it('and the rarity is unknown it should fall back to the neutral color', () => {
    // Rarity.getColor on an unknown key returns undefined (no throw); rarityColor coalesces that to
    // the neutral color so downstream consumers never get undefined.
    expect(rarityColor('not-a-real-rarity')).toBe(FALLBACK_COLOR)
  })

  it('should return a distinct color per rarity rather than one flat wash', () => {
    const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'unique', 'exotic']
    const colors = rarities.map(r => rarityColor(r))
    expect(new Set(colors).size).toBe(rarities.length)
  })
})

describe('when building the radial gradient for a rarity', () => {
  it('should wrap the schema light/dark stops in a radial-gradient', () => {
    const [light, dark] = Rarity.getGradient(Rarity.EPIC)
    expect(rarityGradient('epic')).toBe(`radial-gradient(${light}, ${dark})`)
  })

  it('and the rarity casing differs it should still resolve by lowercasing', () => {
    const [light, dark] = Rarity.getGradient(Rarity.LEGENDARY)
    expect(rarityGradient('Legendary')).toBe(`radial-gradient(${light}, ${dark})`)
  })

  it('should default to common when no rarity is given', () => {
    const [light, dark] = Rarity.getGradient(Rarity.COMMON)
    expect(rarityGradient()).toBe(`radial-gradient(${light}, ${dark})`)
    expect(rarityGradient(null)).toBe(`radial-gradient(${light}, ${dark})`)
  })

  it('and the rarity is unknown it should fall back to a neutral grey wash', () => {
    // Rarity.getGradient on an unknown key returns [undefined, undefined] (no throw); the guard
    // turns that into the neutral fallback rather than a broken "radial-gradient(undefined, ...)".
    expect(rarityGradient('not-a-real-rarity')).toBe('radial-gradient(#c0bdc6, #a09ba8)')
  })
})

describe('when picking legible chip ink (rarityInk)', () => {
  it('should keep a color already under the target unchanged', () => {
    // Exercised with an explicit target: the design palette is bright enough that no rarity sits under
    // the default 120, so pinning the pass-through branch to a specific rarity would be vacuous.
    const legendary = rarityColor('legendary')
    expect(luminance(legendary)).toBeLessThanOrEqual(200)
    expect(rarityInk('legendary', 200)).toBe(legendary)
  })

  it('should darken a light rarity down to the target luminance while preserving the hue', () => {
    // exotic #CAFF73 is near-white (lum ~223) → scaled down so it reads on the pale tint.
    const raw = rarityColor('exotic')
    const ink = rarityInk('exotic')
    expect(ink).not.toBe(raw)
    // Lands on the default target of 120 (± channel rounding), which pins the per-channel formula
    // without hardcoding a hex that moves whenever the palette is re-tuned.
    expect(luminance(ink)).toBeGreaterThan(118.5)
    expect(luminance(ink)).toBeLessThan(121.5)
  })

  it('should honor a custom target luminance', () => {
    expect(luminance(rarityInk('exotic', 200))).toBeGreaterThan(198.5)
    expect(luminance(rarityInk('exotic', 200))).toBeLessThan(201.5)
  })

  it('and the rarity casing differs it should still resolve by lowercasing', () => {
    expect(rarityInk('EXOTIC')).toBe(rarityInk('exotic'))
  })

  it('should darken the neutral fallback for an unknown rarity (its color is light)', () => {
    // Unknown rarity → the fallback #E6E6E6 (lum ~230 > 120) → darkened, not returned raw.
    const ink = rarityInk('nonsense')
    expect(ink).toMatch(/^#[0-9a-f]{6}$/)
    expect(ink).not.toBe(FALLBACK_COLOR)
    expect(luminance(ink)).toBeGreaterThan(118.5)
    expect(luminance(ink)).toBeLessThan(121.5)
  })
})

describe('when building the tinted rarity chip background (rarityTint)', () => {
  it('should render the rarity color as an rgba at the given alpha', () => {
    // legendary #a24bf3 → rgb(162, 75, 243)
    const [r, g, b] = [1, 3, 5].map(i => parseInt(rarities.legendary.slice(i, i + 2), 16))
    expect(rarityTint('legendary')).toBe(`rgba(${r}, ${g}, ${b}, 0.3)`)
    expect(rarityTint('legendary', 0.5)).toBe(`rgba(${r}, ${g}, ${b}, 0.5)`)
  })

  it('should tint the neutral fallback color for an unknown rarity', () => {
    // Unknown rarity → the fallback #E6E6E6 → rgb(230, 230, 230) at the given alpha.
    expect(rarityTint('nonsense')).toBe('rgba(230, 230, 230, 0.3)')
    expect(rarityTint(null)).toBe('rgba(230, 230, 230, 0.3)')
  })
})

describe('when building the tinted rarity chip background (rarityTint)', () => {
  it('should render the rarity color as an rgba at the given alpha', () => {
    // legendary #a24bf3 → rgb(162, 75, 243)
    const [r, g, b] = [1, 3, 5].map(i => parseInt(rarities.legendary.slice(i, i + 2), 16))
    expect(rarityTint('legendary')).toBe(`rgba(${r}, ${g}, ${b}, 0.3)`)
    expect(rarityTint('legendary', 0.5)).toBe(`rgba(${r}, ${g}, ${b}, 0.5)`)
  })

  it('should fall back to a neutral grey rgba for an unknown rarity', () => {
    expect(rarityTint('nonsense')).toBe('rgba(230, 230, 230, 0.3)')
    expect(rarityTint(null)).toBe('rgba(230, 230, 230, 0.3)')
  })
})

describe('when picking legible chip ink (rarityInk)', () => {
  it('should keep a dark rarity color unchanged (already legible on the pale tint)', () => {
    // legendary #842DDA has luminance < 120 → returned as-is.
    expect(rarityInk('legendary')).toBe(rarityColor('legendary'))
  })

  it('should darken a light rarity color so it stays readable on the pale tint', () => {
    // exotic #CAFF73 is near-white (lum ~223) → must be darkened, and end up much darker than the raw color.
    const raw = rarityColor('exotic') // #caff73
    const ink = rarityInk('exotic')
    expect(ink).not.toBe(raw)
    // Every channel scaled down by the same factor → strictly darker.
    expect(parseInt(ink.slice(1, 3), 16)).toBeLessThan(parseInt(raw.slice(1, 3), 16))
  })

  it('should darken the neutral fallback for an unknown rarity (its grey is light)', () => {
    // Unknown rarity → rarityColor's fallback grey #a09ba8 (lum ~158 > 120) → darkened, not returned raw.
    const ink = rarityInk('nonsense')
    expect(ink).toMatch(/^#[0-9a-f]{6}$/)
    expect(ink).not.toBe('#a09ba8')
    expect(parseInt(ink.slice(1, 3), 16)).toBeLessThan(0xa0)
  })
})
