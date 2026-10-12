import { describe, expect, it } from 'vitest'
import { nextGiftsOffset } from './useStudios'

const page = (gifts: number, total: number) => ({ gifts: Array.from({ length: gifts }, (_, i) => i), total })

describe("when the next page of a studio's gifts is asked for", () => {
  it('should start where the loaded gifts end while the total says there are more', () => {
    const pages = [page(25, 60), page(25, 60)]

    expect(nextGiftsOffset(pages[1], pages)).toBe(50)
  })

  it('should end the list once every gift is loaded', () => {
    const pages = [page(25, 30), page(5, 30)]

    expect(nextGiftsOffset(pages[1], pages)).toBeUndefined()
  })

  it('should end the list on an empty page even if the total says more, instead of asking for it forever', () => {
    const pages = [page(25, 60), page(0, 60)]

    expect(nextGiftsOffset(pages[1], pages)).toBeUndefined()
  })
})
