import { describe, it, expect } from 'vitest'
import { PAGE_SLOTS, pageWindow } from '~/lib/pageWindow'

describe('when laying out a pager', () => {
  describe('and every page fits', () => {
    it('should draw them all', () => {
      expect(pageWindow(2, 5)).toEqual([0, 1, 2, 3, 4])
    })
  })

  describe('and there are more pages than slots', () => {
    it('should keep the same number of slots on every page, so the arrows never move', () => {
      const widths = Array.from({ length: 40 }, (_, page) => pageWindow(page, 40).length)

      expect(new Set(widths)).toEqual(new Set([PAGE_SLOTS]))
    })

    it('should slide the window at the start rather than shrinking it', () => {
      expect(pageWindow(0, 40)).toEqual([0, 1, 2, 3, 4, 'gap', 39])
    })

    it('should slide the window at the end rather than shrinking it', () => {
      expect(pageWindow(39, 40)).toEqual([0, 'gap', 35, 36, 37, 38, 39])
      expect(pageWindow(38, 40)).toEqual([0, 'gap', 35, 36, 37, 38, 39])
    })

    it('should centre the current page in the middle of the list', () => {
      expect(pageWindow(20, 40)).toEqual([0, 'gap', 19, 20, 21, 'gap', 39])
    })

    it('should always include the current page', () => {
      for (let page = 0; page < 40; page++) expect(pageWindow(page, 40)).toContain(page)
    })
  })
})
