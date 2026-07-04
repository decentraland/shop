import { describe, it, expect, beforeEach } from 'vitest'
import type { CatalogItem } from '~/lib/api'
import { useFavorites } from '~/store/favorites'

const makeItem = (id: string, overrides: Partial<CatalogItem> = {}): CatalogItem => ({
  id,
  name: `Item ${id}`,
  creator: '0xcreator',
  contractAddress: '0xcontract',
  itemId: id,
  category: 'wearable',
  rarity: 'common',
  network: 'MATIC',
  chainId: 137,
  thumbnail: 'https://example.com/thumb.png',
  priceCredits: 100,
  gender: 'unisex',
  ...overrides
})

// The store is a module-level zustand singleton persisted to localStorage; reset both so each
// test starts from a clean slate regardless of ordering.
beforeEach(() => {
  useFavorites.setState({ items: {} })
  localStorage.clear()
})

describe('when toggling a favorite that is not yet stored', () => {
  it('should add the full item keyed by its id', () => {
    const item = makeItem('a')
    useFavorites.getState().toggle(item)
    expect(useFavorites.getState().items).toEqual({ a: item })
  })

  it('should store the whole CatalogItem so the favorites page can render without refetching', () => {
    const item = makeItem('a', { tradeId: 'trade-1', tokenId: 'tok-1' })
    useFavorites.getState().toggle(item)
    expect(useFavorites.getState().items.a).toBe(item)
  })
})

describe('when toggling a favorite that is already stored', () => {
  it('should remove it (toggle off)', () => {
    const item = makeItem('a')
    const { toggle } = useFavorites.getState()
    toggle(item)
    expect(useFavorites.getState().items.a).toBeDefined()
    toggle(item)
    expect(useFavorites.getState().items.a).toBeUndefined()
    expect(useFavorites.getState().items).toEqual({})
  })

  it('and only the id matters it should remove even when a different object with the same id is passed', () => {
    const first = makeItem('a', { name: 'Original' })
    const second = makeItem('a', { name: 'Different object same id' })
    useFavorites.getState().toggle(first)
    useFavorites.getState().toggle(second)
    expect(useFavorites.getState().items.a).toBeUndefined()
  })
})

describe('when toggling multiple distinct favorites', () => {
  it('should keep previously stored items untouched', () => {
    const a = makeItem('a')
    const b = makeItem('b')
    useFavorites.getState().toggle(a)
    useFavorites.getState().toggle(b)
    expect(useFavorites.getState().items).toEqual({ a, b })
  })

  it('and toggling one off should leave the others in place', () => {
    const a = makeItem('a')
    const b = makeItem('b')
    const { toggle } = useFavorites.getState()
    toggle(a)
    toggle(b)
    toggle(a)
    expect(useFavorites.getState().items).toEqual({ b })
  })

  it('should produce a new items object rather than mutating the previous one', () => {
    const before = useFavorites.getState().items
    useFavorites.getState().toggle(makeItem('a'))
    const after = useFavorites.getState().items
    expect(after).not.toBe(before)
    expect(before).toEqual({})
  })
})

describe('when removing a favorite by id', () => {
  it('should delete the matching entry', () => {
    const a = makeItem('a')
    const b = makeItem('b')
    useFavorites.getState().toggle(a)
    useFavorites.getState().toggle(b)
    useFavorites.getState().remove('a')
    expect(useFavorites.getState().items).toEqual({ b })
  })

  it('and the id is not stored it should be a no-op', () => {
    const a = makeItem('a')
    useFavorites.getState().toggle(a)
    useFavorites.getState().remove('does-not-exist')
    expect(useFavorites.getState().items).toEqual({ a })
  })

  it('should produce a new items object rather than mutating the previous one', () => {
    useFavorites.getState().toggle(makeItem('a'))
    const before = useFavorites.getState().items
    useFavorites.getState().remove('a')
    const after = useFavorites.getState().items
    expect(after).not.toBe(before)
    expect(after).toEqual({})
  })
})

describe('when favorites change', () => {
  it('should persist the items to localStorage under the shop-favorites key', () => {
    const item = makeItem('a')
    useFavorites.getState().toggle(item)
    const raw = localStorage.getItem('shop-favorites')
    expect(raw).toBeTruthy()
    const persisted = JSON.parse(raw as string)
    expect(persisted.state.items.a.id).toBe('a')
    expect(persisted.state.items.a.name).toBe('Item a')
  })

  it('should reflect a removal in the persisted snapshot', () => {
    const item = makeItem('a')
    useFavorites.getState().toggle(item)
    useFavorites.getState().remove('a')
    const persisted = JSON.parse(localStorage.getItem('shop-favorites') as string)
    expect(persisted.state.items).toEqual({})
  })
})
