import { describe, it, expect } from 'vitest'
import { Rarity } from '@dcl/schemas'
import { rarityColor, rarityGradient, rarityInk, rarityTint, readableText } from '~/lib/rarity'

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
  it('should return the schema color for a known rarity', () => {
    expect(rarityColor('legendary')).toBe(Rarity.getColor(Rarity.LEGENDARY))
    expect(rarityColor('mythic')).toBe(Rarity.getColor(Rarity.MYTHIC))
    expect(rarityColor('common')).toBe(Rarity.getColor(Rarity.COMMON))
  })

  it('and the rarity casing differs it should still resolve by lowercasing', () => {
    expect(rarityColor('EPIC')).toBe(Rarity.getColor(Rarity.EPIC))
    expect(rarityColor('Rare')).toBe(Rarity.getColor(Rarity.RARE))
    expect(rarityColor('UnCommon')).toBe(Rarity.getColor(Rarity.UNCOMMON))
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
  it('should keep a dark rarity color unchanged (already legible on the pale tint)', () => {
    // legendary #842DDA has luminance ~91 (<= 120) → returned as-is.
    expect(rarityInk('legendary')).toBe(rarityColor('legendary'))
    expect(luminance(rarityColor('legendary'))).toBeLessThanOrEqual(120)
  })

  it('should darken a light rarity down to the target luminance while preserving the hue', () => {
    // exotic #CAFF73 is near-white (lum ~223) → scaled down so it reads on the pale tint.
    const raw = rarityColor('exotic')
    const ink = rarityInk('exotic')
    expect(ink).not.toBe(raw)
    expect(ink).toBe('#6d893e') // exact formula lock (k = 120/223.2 applied per channel)
    // Lands on the default target of 120 (± channel rounding).
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
    // legendary #842DDA → rgb(132, 45, 218)
    expect(rarityTint('legendary')).toBe('rgba(132, 45, 218, 0.3)')
    expect(rarityTint('legendary', 0.5)).toBe('rgba(132, 45, 218, 0.5)')
  })

  it('should tint the neutral fallback color for an unknown rarity', () => {
    // Unknown rarity → the fallback #E6E6E6 → rgb(230, 230, 230) at the given alpha.
    expect(rarityTint('nonsense')).toBe('rgba(230, 230, 230, 0.3)')
    expect(rarityTint(null)).toBe('rgba(230, 230, 230, 0.3)')
  })
})

describe('when picking readable text for a background color', () => {
  it('should use dark text on a light background', () => {
    expect(readableText('#ffffff')).toBe('#161518')
    expect(readableText('#ffb626')).toBe('#161518')
  })

  it('should use white text on a dark background', () => {
    expect(readableText('#000000')).toBe('#ffffff')
    expect(readableText('#842dda')).toBe('#ffffff')
  })

  it('should tolerate a color without the leading hash', () => {
    expect(readableText('ffffff')).toBe('#161518')
    expect(readableText('000000')).toBe('#ffffff')
  })

  it('and the hex is too short it should fall back to dark text', () => {
    expect(readableText('#fff')).toBe('#161518')
    expect(readableText('#')).toBe('#161518')
    expect(readableText('')).toBe('#161518')
  })

  it('should tolerate a non-string color (defensive) and fall back to dark text', () => {
    expect(readableText(undefined as unknown as string)).toBe('#161518')
    expect(readableText(null as unknown as string)).toBe('#161518')
  })

  it('should switch text color right around the luminance threshold', () => {
    // luminance 0.299*r + 0.587*g + 0.114*b, threshold at > 150.
    // Pure green #00ff00 -> 0.587*255 = 149.685 (<=150) -> white text.
    expect(readableText('#00ff00')).toBe('#ffffff')
    // A slightly brighter green pushes luminance above 150 -> dark text.
    expect(readableText('#00ff20')).toBe('#161518')
  })

  it('should weight green most and blue least when judging luminance', () => {
    // Pure blue is dark (0.114*255 = 29) -> white text.
    expect(readableText('#0000ff')).toBe('#ffffff')
    // Pure red is dark (0.299*255 = 76) -> white text.
    expect(readableText('#ff0000')).toBe('#ffffff')
  })

  it('should ignore any characters beyond the first six of the hex', () => {
    // Extra trailing chars (e.g. an alpha channel) are sliced off and ignored.
    expect(readableText('#ffffff00')).toBe('#161518')
    expect(readableText('#00000000')).toBe('#ffffff')
  })
})
