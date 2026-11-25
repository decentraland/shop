import { describe, it, expect } from 'vitest'
import { LOCALES } from '~/intl/i18n'
import { campaignHeroArt } from './campaignArt'

describe('campaignHeroArt', () => {
  describe('when the theme ships its own artwork', () => {
    it('should hand back a different wide and square image for every language', () => {
      const art = LOCALES.map(locale => campaignHeroArt('holidays', locale))

      art.forEach(pair => {
        expect(pair?.desktop).toBeTruthy()
        expect(pair?.mobile).toBeTruthy()
        expect(pair?.desktop).not.toBe(pair?.mobile)
      })
      expect(new Set(art.map(pair => pair?.desktop)).size).toBe(LOCALES.length)
      expect(new Set(art.map(pair => pair?.mobile)).size).toBe(LOCALES.length)
    })
  })

  describe('when the theme ships no artwork', () => {
    it('should hand back nothing, so the hero falls back to the CMS banner', () => {
      expect(campaignHeroArt('halloween', 'en')).toBeNull()
    })
  })

  describe('when no theme is worn', () => {
    it('should hand back nothing', () => {
      expect(campaignHeroArt(null, 'es')).toBeNull()
    })
  })
})
