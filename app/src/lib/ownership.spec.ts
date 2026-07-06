import { describe, it, expect } from 'vitest'
import { isOwnListing, isOwnTrade } from './ownership'

const ME = '0xAAA0000000000000000000000000000000000AAA'
const OTHER = '0xbbb0000000000000000000000000000000000bbb'

describe('isOwnListing', () => {
  it('true for your own PRIMARY listing (creator = you, no tokenId)', () => {
    expect(isOwnListing({ creator: ME, itemId: '1', tokenId: undefined }, ME)).toBe(true)
    expect(isOwnListing({ creator: ME.toLowerCase(), itemId: '1', tokenId: undefined }, ME)).toBe(true)
  })

  it('false for a SECONDARY listing even if you created the collection (you may not be the reseller)', () => {
    expect(isOwnListing({ creator: ME, itemId: null, tokenId: '42' }, ME)).toBe(false)
  })

  it('false when the creator is someone else', () => {
    expect(isOwnListing({ creator: OTHER, itemId: '1', tokenId: undefined }, ME)).toBe(false)
  })

  it('false without an address or creator', () => {
    expect(isOwnListing({ creator: ME, itemId: '1', tokenId: undefined }, null)).toBe(false)
    expect(isOwnListing({ creator: '', itemId: '1', tokenId: undefined }, ME)).toBe(false)
  })
})

describe('isOwnTrade', () => {
  it('true when the trade signer equals the buyer (case-insensitive)', () => {
    expect(isOwnTrade({ signer: ME.toLowerCase() }, ME)).toBe(true)
  })

  it('false when signer differs from buyer', () => {
    expect(isOwnTrade({ signer: OTHER }, ME)).toBe(false)
  })

  it('false with a missing signer or buyer', () => {
    expect(isOwnTrade({ signer: '' }, ME)).toBe(false)
    expect(isOwnTrade({ signer: ME }, '')).toBe(false)
  })
})
