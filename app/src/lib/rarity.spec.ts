import { describe, it, expect } from 'vitest'
import { Rarity } from '@dcl/schemas'
import { rarityColor, readableText } from '~/lib/rarity'

const FALLBACK = '#a09ba8'

describe('when resolving the color for a rarity', () => {
  it('should return the fallback grey when no rarity is given', () => {
    expect(rarityColor()).toBe(FALLBACK)
    expect(rarityColor(undefined)).toBe(FALLBACK)
    expect(rarityColor(null)).toBe(FALLBACK)
    expect(rarityColor('')).toBe(FALLBACK)
  })

  it('should return the schema color for a known rarity', () => {
    expect(rarityColor('common')).toBe(Rarity.getColor(Rarity.COMMON))
    expect(rarityColor('mythic')).toBe(Rarity.getColor(Rarity.MYTHIC))
    expect(rarityColor('legendary')).toBe(Rarity.getColor(Rarity.LEGENDARY))
  })

  it('and the rarity casing differs it should still resolve by lowercasing', () => {
    expect(rarityColor('EPIC')).toBe(Rarity.getColor(Rarity.EPIC))
    expect(rarityColor('Rare')).toBe(Rarity.getColor(Rarity.RARE))
    expect(rarityColor('UnCommon')).toBe(Rarity.getColor(Rarity.UNCOMMON))
  })

  it('should return a distinct color per rarity rather than one flat wash', () => {
    const colors = [
      rarityColor('common'),
      rarityColor('uncommon'),
      rarityColor('rare'),
      rarityColor('epic'),
      rarityColor('legendary'),
      rarityColor('mythic'),
      rarityColor('unique'),
      rarityColor('exotic')
    ]
    expect(new Set(colors).size).toBe(colors.length)
  })

  it('and the rarity is unknown it returns whatever the schema lookup yields', () => {
    // Rarity.getColor is a plain map lookup, so an unknown key resolves to undefined
    // without throwing; the function passes that through.
    expect(rarityColor('not-a-real-rarity')).toBeUndefined()
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
