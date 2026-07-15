import { describe, it, expect } from 'vitest'
import { Rarity } from '@dcl/schemas'
import { RARITY_BACKGROUND_COLORS, RARITY_TEXT_COLORS, rarityColor, rarityGradient, readableText } from '~/lib/rarity'

const FALLBACK = { text: RARITY_TEXT_COLORS.common, background: RARITY_BACKGROUND_COLORS.common }

describe('when resolving the color for a rarity', () => {
  it('should return the common (fallback) text+background when no rarity is given', () => {
    expect(rarityColor()).toEqual(FALLBACK)
    expect(rarityColor(undefined)).toEqual(FALLBACK)
    expect(rarityColor(null)).toEqual(FALLBACK)
    expect(rarityColor('')).toEqual(FALLBACK)
  })

  it('should return the matching text+background for a known rarity', () => {
    expect(rarityColor('common')).toEqual({
      text: RARITY_TEXT_COLORS.common,
      background: RARITY_BACKGROUND_COLORS.common,
    })
    expect(rarityColor('mythic')).toEqual({
      text: RARITY_TEXT_COLORS.mythic,
      background: RARITY_BACKGROUND_COLORS.mythic,
    })
    expect(rarityColor('legendary')).toEqual({
      text: RARITY_TEXT_COLORS.legendary,
      background: RARITY_BACKGROUND_COLORS.legendary,
    })
  })

  it('and the rarity casing differs it should still resolve by lowercasing', () => {
    expect(rarityColor('EPIC')).toEqual({ text: RARITY_TEXT_COLORS.epic, background: RARITY_BACKGROUND_COLORS.epic })
    expect(rarityColor('Rare')).toEqual({ text: RARITY_TEXT_COLORS.rare, background: RARITY_BACKGROUND_COLORS.rare })
    expect(rarityColor('UnCommon')).toEqual({
      text: RARITY_TEXT_COLORS.uncommon,
      background: RARITY_BACKGROUND_COLORS.uncommon,
    })
  })

  it('should return a distinct color per rarity rather than one flat wash', () => {
    const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'unique', 'exotic']
    const texts = rarities.map(r => rarityColor(r).text)
    const backgrounds = rarities.map(r => rarityColor(r).background)
    expect(new Set(texts).size).toBe(rarities.length)
    expect(new Set(backgrounds).size).toBe(rarities.length)
  })

  it('and the rarity is unknown it returns the common colors (never undefined → would crash readableText)', () => {
    // The lookup on RARITY_*_COLORS is a plain map access: an unknown key resolves to undefined without
    // throwing. rarityColor must coalesce that to the common colors so downstream consumers are safe.
    expect(rarityColor('not-a-real-rarity')).toEqual(FALLBACK)
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
