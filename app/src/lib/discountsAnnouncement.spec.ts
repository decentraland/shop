import { describe, it, expect } from 'vitest'
import type { SaleItem, SaleableCollection } from '~/lib/saleableCollections'
import { pickAnnouncementCollection } from './discountsAnnouncement'

const item = (key: string, priceCredits: number | null, state: SaleItem['state'] = 'discounted'): SaleItem => ({
  key,
  name: key,
  thumbnail: '',
  priceCredits,
  state,
  remainingSupply: 10
})

const collection = (contractAddress: string, items: SaleItem[]): SaleableCollection => ({
  contractAddress,
  name: contractAddress,
  listedCount: items.length,
  examplePriceCredits: null,
  items
})

describe('when choosing the collection the discounts announcement shows', () => {
  it('should pick the one that sold the most recently', () => {
    const quiet = collection('0xaa', [item('a1', 20), item('a2', 30), item('a3', 40)])
    const selling = collection('0xbb', [item('b1', 20)])
    expect(pickAnnouncementCollection([quiet, selling], new Map([['0xbb', 4]]))).toBe(selling)
  })

  it('should match recent sales whatever the case of the address', () => {
    const quiet = collection('0xaa', [item('a1', 20)])
    const selling = collection('0xBB', [item('b1', 20)])
    expect(pickAnnouncementCollection([quiet, selling], new Map([['0xbb', 1]]))).toBe(selling)
  })

  it('should fall back to the one with the most items a discount lowers when nothing sold', () => {
    const small = collection('0xaa', [item('a1', 20)])
    const full = collection('0xbb', [item('b1', 20), item('b2', 25)])
    expect(pickAnnouncementCollection([small, full], new Map())).toBe(full)
  })

  it('should leave out a collection priced only in MANA', () => {
    const classic = collection('0xaa', [item('a1', null, 'classic')])
    const credits = collection('0xbb', [item('b1', 20)])
    expect(pickAnnouncementCollection([classic, credits], new Map([['0xaa', 9]]))).toBe(credits)
  })

  it('should leave out a collection whose prices the discount rounds back to themselves', () => {
    const oneCredit = collection('0xaa', [item('a1', 1)])
    const credits = collection('0xbb', [item('b1', 20)])
    expect(pickAnnouncementCollection([oneCredit, credits], new Map([['0xaa', 9]]))).toBe(credits)
  })

  it('should not count unlisted items towards a collection', () => {
    const unlisted = collection('0xaa', [item('a1', null, 'unlisted'), item('a2', null, 'unlisted')])
    const credits = collection('0xbb', [item('b1', 20)])
    expect(pickAnnouncementCollection([unlisted, credits], new Map())).toBe(credits)
  })

  it('should return nothing when no collection has a discountable item', () => {
    expect(pickAnnouncementCollection([collection('0xaa', [item('a1', null, 'classic')])], new Map())).toBeNull()
    expect(pickAnnouncementCollection([], new Map())).toBeNull()
  })
})
