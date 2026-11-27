import { describe, it, expect } from 'vitest'
import { LOCALES, setActiveLocale, t } from '~/intl/i18n'
import { campaignThemeEvent } from './campaignEvent'

describe('campaignThemeEvent', () => {
  describe('when the theme ships an event of its own', () => {
    const event = campaignThemeEvent('holidays')!

    it('should name it in every language', () => {
      const labels = LOCALES.map(locale => {
        setActiveLocale(locale)
        return t(event.labelKey)
      })
      setActiveLocale('en')

      labels.forEach(label => expect(label).not.toBe(event.labelKey))
      expect(labels[0]).toBe('Jolly Days')
    })

    // The lists are pasted by hand, and a malformed entry would not error: the catalogue would just match
    // nothing for it, and the item would be silently missing from the event.
    it('should list each collection once, as a lowercased address', () => {
      event.collections.forEach(address => expect(address).toMatch(/^0x[0-9a-f]{40}$/))
      expect(new Set(event.collections).size).toBe(event.collections.length)
    })

    it('should list each item once, as a lowercased contract and its item id', () => {
      event.items.forEach(item => expect(item).toMatch(/^0x[0-9a-f]{40}-(0|[1-9]\d*)$/))
      expect(new Set(event.items).size).toBe(event.items.length)
    })
  })

  describe('when the theme ships no event', () => {
    it('should hand back nothing, so the cms campaign decides', () => {
      expect(campaignThemeEvent('halloween')).toBeNull()
    })
  })

  describe('when no theme is worn', () => {
    it('should hand back nothing', () => {
      expect(campaignThemeEvent(null)).toBeNull()
    })
  })
})
