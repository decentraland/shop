import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuthIdentity } from '@dcl/crypto'
import type { CatalogItem } from '~/lib/api'

// Server plumbing is mocked; favoriteKey stays real (pure). The store under test decides WHEN to
// call these, so the assertions are about mode switching, optimism and rollback — not HTTP shapes
// (lib/favorites.spec.ts covers those).
const { fetchFavoriteIds, setFavorite, fetchCatalogByIds, captureError } = vi.hoisted(() => ({
  fetchFavoriteIds: vi.fn(),
  setFavorite: vi.fn(),
  fetchCatalogByIds: vi.fn(),
  captureError: vi.fn()
}))
vi.mock('~/lib/favorites', async importOriginal => ({
  ...(await importOriginal<typeof import('~/lib/favorites')>()),
  fetchFavoriteIds,
  setFavorite
}))
vi.mock('~/lib/api', () => ({ fetchCatalogByIds }))
vi.mock('~/lib/monitoring', () => ({ captureError }))

import { useFavorites } from '~/store/favorites'
import { useToast } from '~/store/toast'

const IDENTITY = {} as AuthIdentity

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
  isSmart: false,
  ...overrides
})

// The stable favorite key makeItem produces (contract-itemId; itemId mirrors the id).
const keyOf = (id: string) => `0xcontract-${id}`

// The store is a module-level zustand singleton (mode lives in module scope); clear storage and swap
// back to the anonymous bucket so each test starts from a clean slate regardless of ordering.
beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  useToast.setState({ toasts: [] })
  useFavorites.getState().reloadFor(null)
})

describe('when anonymous (no session)', () => {
  it('should add the full item keyed by its stable favorite key, not its feed id', () => {
    const item = makeItem('a', { id: 'trade-1' })
    useFavorites.getState().toggle(item)
    expect(useFavorites.getState().items).toEqual({ [keyOf('a')]: item })
  })

  it('should toggle a stored favorite off', () => {
    const item = makeItem('a')
    const { toggle } = useFavorites.getState()
    toggle(item)
    toggle(item)
    expect(useFavorites.getState().items).toEqual({})
  })

  it('should remove even when a different object with the same identity is passed', () => {
    useFavorites.getState().toggle(makeItem('a', { name: 'Original' }))
    useFavorites.getState().toggle(makeItem('a', { name: 'Different object same identity' }))
    expect(useFavorites.getState().items).toEqual({})
  })

  it('should keep previously stored items untouched and produce a new items object', () => {
    const a = makeItem('a')
    const b = makeItem('b')
    const before = useFavorites.getState().items
    useFavorites.getState().toggle(a)
    useFavorites.getState().toggle(b)
    expect(useFavorites.getState().items).toEqual({ [keyOf('a')]: a, [keyOf('b')]: b })
    expect(before).toEqual({})
    useFavorites.getState().toggle(a)
    expect(useFavorites.getState().items).toEqual({ [keyOf('b')]: b })
  })

  it('should ignore items with no derivable favorite key', () => {
    useFavorites.getState().toggle(makeItem('a', { itemId: null }))
    expect(useFavorites.getState().items).toEqual({})
  })

  it('should persist to localStorage under the shop-favorites key and never call the server', () => {
    useFavorites.getState().toggle(makeItem('a'))
    const persisted = JSON.parse(localStorage.getItem('shop-favorites') as string)
    expect(persisted[keyOf('a')].name).toBe('Item a')
    expect(setFavorite).not.toHaveBeenCalled()
  })

  it('should hydrate from a legacy snapshot keyed by feed id, re-keying by favorite key', () => {
    localStorage.setItem('shop-favorites', JSON.stringify({ 'trade-1': makeItem('a', { id: 'trade-1' }) }))
    useFavorites.getState().reloadFor(null)
    expect(useFavorites.getState().items[keyOf('a')]?.id).toBe('trade-1')
  })

  it('should hydrate from a legacy zustand-persist envelope', () => {
    localStorage.setItem('shop-favorites', JSON.stringify({ state: { items: { a: makeItem('a') } }, version: 0 }))
    useFavorites.getState().reloadFor(null)
    expect(useFavorites.getState().items[keyOf('a')]?.id).toBe('a')
  })

  it('should tolerate a malformed or non-object snapshot', () => {
    localStorage.setItem('shop-favorites', 'not json {')
    useFavorites.getState().reloadFor(null)
    expect(useFavorites.getState().items).toEqual({})
    localStorage.setItem('shop-favorites', JSON.stringify('a string'))
    useFavorites.getState().reloadFor(null)
    expect(useFavorites.getState().items).toEqual({})
  })

  it('should keep favorites working in-memory when localStorage writes fail (private mode / quota)', () => {
    const a = makeItem('a')
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    try {
      useFavorites.getState().toggle(a)
    } finally {
      spy.mockRestore()
    }
    expect(useFavorites.getState().items).toEqual({ [keyOf('a')]: a })
  })

  it('retry() is a no-op with no session', () => {
    useFavorites.getState().retry()
    expect(fetchFavoriteIds).not.toHaveBeenCalled()
    expect(useFavorites.getState().status).toBe('ready')
  })
})

describe('when signed in (server-backed)', () => {
  it('should hydrate from the favorites service and mark the store ready', async () => {
    const a = makeItem('a')
    fetchFavoriteIds.mockResolvedValueOnce([keyOf('a')])
    fetchCatalogByIds.mockResolvedValueOnce([a])
    useFavorites.getState().reloadFor('0xAAA', IDENTITY)
    expect(useFavorites.getState().status).toBe('loading')
    await vi.waitFor(() => expect(useFavorites.getState().status).toBe('ready'))
    expect(fetchFavoriteIds).toHaveBeenCalledWith(IDENTITY)
    expect(fetchCatalogByIds).toHaveBeenCalledWith([keyOf('a')])
    expect(useFavorites.getState().items).toEqual({ [keyOf('a')]: a })
  })

  it('should not leak the previous account/anonymous items while hydrating', async () => {
    useFavorites.getState().toggle(makeItem('z'))
    fetchFavoriteIds.mockResolvedValueOnce([])
    fetchCatalogByIds.mockResolvedValueOnce([])
    useFavorites.getState().reloadFor('0xAAA', IDENTITY)
    expect(useFavorites.getState().items).toEqual({})
    await vi.waitFor(() => expect(useFavorites.getState().status).toBe('ready'))
    expect(useFavorites.getState().items).toEqual({})
  })

  it('and hydration fails it should report the error state and recover via retry()', async () => {
    fetchFavoriteIds.mockRejectedValueOnce(new Error('boom'))
    useFavorites.getState().reloadFor('0xAAA', IDENTITY)
    await vi.waitFor(() => expect(useFavorites.getState().status).toBe('error'))
    expect(captureError).toHaveBeenCalled()

    const a = makeItem('a')
    fetchFavoriteIds.mockResolvedValueOnce([keyOf('a')])
    fetchCatalogByIds.mockResolvedValueOnce([a])
    useFavorites.getState().retry()
    await vi.waitFor(() => expect(useFavorites.getState().status).toBe('ready'))
    expect(useFavorites.getState().items).toEqual({ [keyOf('a')]: a })
  })

  it('and the user signs out mid-hydration it should discard the stale result', async () => {
    let resolveIds!: (ids: string[]) => void
    fetchFavoriteIds.mockImplementationOnce(() => new Promise<string[]>(r => (resolveIds = r)))
    useFavorites.getState().reloadFor('0xAAA', IDENTITY)
    useFavorites.getState().reloadFor(null)
    resolveIds([keyOf('a')])
    fetchCatalogByIds.mockResolvedValueOnce([makeItem('a')])
    await new Promise(r => setTimeout(r, 0))
    expect(useFavorites.getState().items).toEqual({})
    expect(useFavorites.getState().status).toBe('ready')
  })

  it('should toggle optimistically and write the pick to the server, not localStorage', async () => {
    fetchFavoriteIds.mockResolvedValueOnce([])
    fetchCatalogByIds.mockResolvedValueOnce([])
    useFavorites.getState().reloadFor('0xAAA', IDENTITY)
    await vi.waitFor(() => expect(useFavorites.getState().status).toBe('ready'))

    setFavorite.mockResolvedValueOnce(undefined)
    const a = makeItem('a')
    useFavorites.getState().toggle(a)
    expect(useFavorites.getState().items).toEqual({ [keyOf('a')]: a })
    expect(setFavorite).toHaveBeenCalledWith(keyOf('a'), true, IDENTITY)
    expect(localStorage.getItem('shop-favorites')).toBeNull()

    setFavorite.mockResolvedValueOnce(undefined)
    useFavorites.getState().toggle(a)
    expect(useFavorites.getState().items).toEqual({})
    expect(setFavorite).toHaveBeenCalledWith(keyOf('a'), false, IDENTITY)
  })

  it('and the server write fails it should roll the toggle back and toast a friendly error', async () => {
    fetchFavoriteIds.mockResolvedValueOnce([])
    fetchCatalogByIds.mockResolvedValueOnce([])
    useFavorites.getState().reloadFor('0xAAA', IDENTITY)
    await vi.waitFor(() => expect(useFavorites.getState().status).toBe('ready'))

    setFavorite.mockRejectedValueOnce(new Error('boom'))
    useFavorites.getState().toggle(makeItem('a'))
    expect(useFavorites.getState().items[keyOf('a')]).toBeDefined()
    await vi.waitFor(() => expect(useFavorites.getState().items).toEqual({}))
    expect(captureError).toHaveBeenCalled()
    expect(useToast.getState().toasts).toEqual([expect.objectContaining({ kind: 'error' })])
  })

  it('and the server write fails on an unfavorite it should restore the item', async () => {
    const a = makeItem('a')
    fetchFavoriteIds.mockResolvedValueOnce([keyOf('a')])
    fetchCatalogByIds.mockResolvedValueOnce([a])
    useFavorites.getState().reloadFor('0xAAA', IDENTITY)
    await vi.waitFor(() => expect(useFavorites.getState().status).toBe('ready'))

    setFavorite.mockRejectedValueOnce(new Error('boom'))
    useFavorites.getState().toggle(a)
    expect(useFavorites.getState().items).toEqual({})
    await vi.waitFor(() => expect(useFavorites.getState().items).toEqual({ [keyOf('a')]: a }))
  })

  it('and there is an address but no identity it should fall back to the anonymous bucket', () => {
    useFavorites.getState().reloadFor('0xAAA')
    expect(useFavorites.getState().status).toBe('ready')
    expect(fetchFavoriteIds).not.toHaveBeenCalled()
  })

  it('and the user signs out while a toggle write is in flight its failure is discarded', async () => {
    fetchFavoriteIds.mockResolvedValueOnce([])
    fetchCatalogByIds.mockResolvedValueOnce([])
    useFavorites.getState().reloadFor('0xAAA', IDENTITY)
    await vi.waitFor(() => expect(useFavorites.getState().status).toBe('ready'))

    let rejectWrite!: (e: Error) => void
    setFavorite.mockImplementationOnce(() => new Promise<void>((_, rej) => (rejectWrite = rej)))
    useFavorites.getState().toggle(makeItem('a'))
    useFavorites.getState().reloadFor(null)
    rejectWrite(new Error('boom'))
    await new Promise(r => setTimeout(r, 0))
    // no rollback into the anonymous bucket, no toast
    expect(useFavorites.getState().items).toEqual({})
    expect(useToast.getState().toasts).toEqual([])
  })

  it('signing out swaps back to the anonymous localStorage bucket', async () => {
    localStorage.setItem('shop-favorites', JSON.stringify({ [keyOf('z')]: makeItem('z') }))
    fetchFavoriteIds.mockResolvedValueOnce([])
    fetchCatalogByIds.mockResolvedValueOnce([])
    useFavorites.getState().reloadFor('0xAAA', IDENTITY)
    await vi.waitFor(() => expect(useFavorites.getState().status).toBe('ready'))
    useFavorites.getState().reloadFor(null)
    expect(useFavorites.getState().items[keyOf('z')]?.id).toBe('z')
  })
})
