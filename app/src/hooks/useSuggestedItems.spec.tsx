import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CatalogItem } from '~/lib/api'
import { useSuggestedItems } from './useSuggestedItems'

/**
 * The rail's fetch CASCADE. What the tiers merge into is covered by lib/suggestions.spec; what matters here
 * is that a request is only spent when the previous tier came up short — and that the padding tiers ask for
 * items that can actually be bought.
 */

const { fetchCollectionItems, fetchCatalogItems } = vi.hoisted(() => ({
  fetchCollectionItems: vi.fn(),
  fetchCatalogItems: vi.fn()
}))
vi.mock('~/lib/collections', () => ({ fetchCollectionItems, fetchCatalogItems }))

const { fetchRelatedItems } = vi.hoisted(() => ({ fetchRelatedItems: vi.fn() }))
vi.mock('~/lib/api', () => ({ fetchRelatedItems }))

const CONTRACT = '0xanchor'
const CREATOR = '0xcreator'

function wrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function item(id: string, over: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id,
    name: id,
    creator: CREATOR,
    contractAddress: CONTRACT,
    itemId: id,
    category: 'wearable',
    rarity: 'rare',
    network: 'MATIC',
    chainId: 80002,
    thumbnail: '',
    priceCredits: 10,
    gender: 'unisex',
    isSmart: false,
    ...over
  }
}

const many = (prefix: string, n: number, over: Partial<CatalogItem> = {}) =>
  Array.from({ length: n }, (_, i) => item(`${prefix}${i}`, over))

const render = () =>
  renderHook(() => useSuggestedItems({ id: 'anchor', contractAddress: CONTRACT, itemId: 'anchor', creator: CREATOR }), {
    wrapper
  })

beforeEach(() => {
  vi.clearAllMocks()
  fetchCatalogItems.mockResolvedValue({ items: [], total: 0 })
  fetchRelatedItems.mockResolvedValue([])
})

describe('useSuggestedItems', () => {
  it('should spend no padding request when the collection fills the rail on its own', async () => {
    fetchCollectionItems.mockResolvedValue({ items: many('c', 16), total: 16 })

    const { result } = render()

    await waitFor(() => expect(result.current.items).toHaveLength(16))
    expect(result.current.isCollectionOnly).toBe(true)
    expect(fetchCatalogItems).not.toHaveBeenCalled()
    expect(fetchRelatedItems).not.toHaveBeenCalled()
  })

  it('should pad a two-item collection from the creator, asking only for items on sale', async () => {
    fetchCollectionItems.mockResolvedValue({ items: many('c', 2), total: 2 })
    fetchCatalogItems.mockResolvedValue({ items: many('k', 30, { contractAddress: '0xother' }), total: 30 })

    const { result } = render()

    await waitFor(() => expect(result.current.items).toHaveLength(15))
    expect(fetchCatalogItems).toHaveBeenCalledWith(expect.objectContaining({ creator: CREATOR, isOnSale: true }))
    expect(result.current.isCollectionOnly).toBe(false)
    // The creator tier filled it, so the last resort is never reached.
    expect(fetchRelatedItems).not.toHaveBeenCalled()
  })

  it('should reach for similar items only once the creator tier has settled and still left the rail short', async () => {
    fetchCollectionItems.mockResolvedValue({ items: many('c', 2), total: 2 })
    fetchCatalogItems.mockResolvedValue({ items: many('k', 3, { contractAddress: '0xother' }), total: 3 })
    fetchRelatedItems.mockResolvedValue(many('r', 15, { contractAddress: '0xelse' }))

    const { result } = render()

    await waitFor(() => expect(result.current.items).toHaveLength(15))
    expect(fetchRelatedItems).toHaveBeenCalledWith(CONTRACT, 'anchor', { first: 15 })
  })

  it('should still reach the last resort when the creator request fails', async () => {
    fetchCollectionItems.mockResolvedValue({ items: many('c', 2), total: 2 })
    fetchCatalogItems.mockRejectedValue(new Error('nope'))
    fetchRelatedItems.mockResolvedValue(many('r', 15, { contractAddress: '0xelse' }))

    const { result } = render()

    await waitFor(() => expect(result.current.items).toHaveLength(15))
  })

  it('should keep the collection rail intact when every padding tier is empty', async () => {
    fetchCollectionItems.mockResolvedValue({ items: many('c', 2), total: 2 })

    const { result } = render()

    await waitFor(() => expect(fetchRelatedItems).toHaveBeenCalled())
    expect(result.current.items).toHaveLength(2)
    // Nothing was appended, so the rail can still be titled after the collection.
    expect(result.current.isCollectionOnly).toBe(true)
  })

  it('should not fetch the collection at all until the item has a contract', () => {
    renderHook(() => useSuggestedItems({ id: 'anchor', itemId: 'anchor' }), { wrapper })

    expect(fetchCollectionItems).not.toHaveBeenCalled()
    expect(fetchCatalogItems).not.toHaveBeenCalled()
  })

  it('should skip the creator tier for an item whose creator is not resolved yet', async () => {
    fetchCollectionItems.mockResolvedValue({ items: many('c', 1), total: 1 })
    fetchRelatedItems.mockResolvedValue(many('r', 2, { contractAddress: '0xelse' }))

    const { result } = renderHook(
      () => useSuggestedItems({ id: 'anchor', contractAddress: CONTRACT, itemId: 'anchor' }),
      { wrapper }
    )

    await waitFor(() => expect(result.current.items).toHaveLength(3))
    expect(fetchCatalogItems).not.toHaveBeenCalled()
  })

  it('should return the raw collection read the page uses to backfill an unhydrated item', async () => {
    fetchCollectionItems.mockResolvedValue({ items: [item('anchor'), item('c1')], total: 2 })

    const { result } = render()

    await waitFor(() => expect(result.current.siblingsFetched).toBe(true))
    // The anchor is dropped from the rail but must survive in `siblings` — it is the row the page hydrates from.
    expect(result.current.siblings.map(s => s.id)).toEqual(['anchor', 'c1'])
    expect(result.current.items.map(s => s.id)).toEqual(['c1'])
  })
})
