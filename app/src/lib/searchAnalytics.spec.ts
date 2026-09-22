import { describe, it, expect } from 'vitest'
import {
  clearedSearchProps,
  exposureKey,
  hasNoResults,
  noResultsProps,
  suggestionClickedProps,
  suggestionsViewedProps
} from '~/lib/searchAnalytics'
import { EMPTY_SUGGESTIONS } from '~/lib/search'

const item = {
  id: 'i',
  name: 'Hat',
  creator: '',
  creatorName: null,
  contractAddress: '0x',
  itemId: '0',
  thumbnail: ''
} as never
const answer = {
  items: [item, item],
  total: 42,
  collections: [{ contractAddress: '0xc', name: 'C', creator: '', creatorName: null, items: 1, sales: 0 }],
  creators: []
}

describe('when describing an exposure of the suggestions', () => {
  it('should count the same query typed differently as one exposure', () => {
    expect(exposureKey('  Pirate   Hat ')).toBe(exposureKey('pirate hat'))
    expect(exposureKey('pirate')).not.toBe(exposureKey('pirate hat'))
  })

  it('should report what was offered, the grid total and how long the request took', () => {
    expect(suggestionsViewedProps(' galaxy ', answer, { fetchMs: 41.6, cacheHit: false })).toEqual({
      query: 'galaxy',
      item_count: 2,
      collection_count: 1,
      creator_count: 0,
      total: 42,
      fetch_ms: 42,
      cache_hit: false
    })
  })

  it('should report a cache hit with no duration', () => {
    expect(suggestionsViewedProps('galaxy', answer, { fetchMs: 41.6, cacheHit: true })).toMatchObject({
      fetch_ms: null,
      cache_hit: true
    })
  })

  it('should call an answer empty only when all three sections are', () => {
    expect(hasNoResults(EMPTY_SUGGESTIONS)).toBe(true)
    expect(hasNoResults({ ...EMPTY_SUGGESTIONS, creators: [{ address: '0xa', name: 'A' }] })).toBe(false)
    expect(noResultsProps(' zzz ')).toEqual({ query: 'zzz' })
  })
})

describe('when describing a chosen suggestion', () => {
  it('should keep the original type and target, and add the section, position and how it was chosen', () => {
    expect(
      suggestionClickedProps(
        { query: 'galaxy', section: 'creators', position: 2, via: 'keyboard' },
        { creator_address: '0xa' }
      )
    ).toEqual({
      query: 'galaxy',
      type: 'creator',
      creator_address: '0xa',
      section: 'creators',
      position: 2,
      via: 'keyboard'
    })
    expect(
      suggestionClickedProps({ query: 'g', section: 'items', position: 0, via: 'click' }, { item_id: 'i' }).type
    ).toBe('item')
    expect(suggestionClickedProps({ query: 'g', section: 'collections', position: 0, via: 'click' }, {}).type).toBe(
      'collection'
    )
  })
})

describe('when describing a cleared search', () => {
  it('should name the route only', () => {
    expect(clearedSearchProps('/items')).toEqual({ page: '/items' })
  })
})
