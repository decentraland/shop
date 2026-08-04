import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useRelatedItems } from './useRelatedItems'

/**
 * The PDP's similar-items read.
 *
 * Two things carry risk here and neither is the happy path. First, the request must NOT go out until the
 * page has decided it needs the fallback — every item detail view would otherwise pay for a rail that is
 * usually hidden behind the collection carousel. Second, the shape it returns has to be the same
 * item-unified row the browse grid renders, because it is handed to the same card.
 */

const CONTRACT = '0x1234567890123456789012345678901234567890'

function wrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const relatedRow = (overrides: Record<string, unknown> = {}) => ({
  source: 'native',
  tradeId: 'trade-1',
  listingType: 'primary',
  contractAddress: '0xother',
  itemId: '7',
  tokenId: null,
  name: 'Another Hat',
  thumbnail: 'ipfs://hat.png',
  rarity: 'rare',
  category: 'wearable',
  wearableCategory: 'hat',
  gender: 'unisex',
  creator: '0xcreator',
  priceCredits: 4,
  available: 2,
  network: 'MATIC',
  chainId: 80002,
  listingCount: 3,
  ...overrides
})

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: [relatedRow()] }) })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

describe('useRelatedItems', () => {
  it('should ask the related endpoint for the anchor item', async () => {
    const { result } = renderHook(() => useRelatedItems(CONTRACT, '3'), { wrapper })

    await waitFor(() => expect(result.current.isFetched).toBe(true))
    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.pathname).toBe('/v3/catalog/related')
    expect(url.searchParams.get('contractAddress')).toBe(CONTRACT)
    expect(url.searchParams.get('itemId')).toBe('3')
    expect(url.searchParams.get('first')).toBe('10')
  })

  it('should pass an explicit rail size through', async () => {
    const { result } = renderHook(() => useRelatedItems(CONTRACT, '3', { first: 4 }), { wrapper })

    await waitFor(() => expect(result.current.isFetched).toBe(true))
    expect(new URL(fetchMock.mock.calls[0][0] as string).searchParams.get('first')).toBe('4')
  })

  it('should return the item-unified rows the shared card consumes', async () => {
    const { result } = renderHook(() => useRelatedItems(CONTRACT, '3'), { wrapper })

    await waitFor(() => expect(result.current.items).toHaveLength(1))
    expect(result.current.items[0]).toMatchObject({
      id: 'trade-1',
      tradeId: 'trade-1',
      name: 'Another Hat',
      rarity: 'rare',
      wearableCategory: 'hat',
      priceCredits: 4,
      listingCount: 3,
      source: 'native',
      // Defaulted for a server that predates the field — a related row is always a trade, never a mint.
      acquisition: 'trade',
      manaWei: null
    })
  })

  it('should not fetch while disabled, so a PDP with a full collection rail costs no request', () => {
    const { result } = renderHook(() => useRelatedItems(CONTRACT, '3', { enabled: false }), { wrapper })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.items).toEqual([])
    expect(result.current.isFetched).toBe(false)
  })

  it('should not fetch until the anchor item is identified', () => {
    renderHook(() => useRelatedItems(undefined, null), { wrapper })

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('should return an empty rail when the endpoint answers with no data', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })

    const { result } = renderHook(() => useRelatedItems(CONTRACT, '3'), { wrapper })

    await waitFor(() => expect(result.current.isFetched).toBe(true))
    expect(result.current.items).toEqual([])
  })

  it('should return an empty rail when the endpoint fails, so the page loses a row and not the fold', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 })

    const { result } = renderHook(() => useRelatedItems(CONTRACT, '3'), { wrapper })

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(result.current.items).toEqual([])
  })
})
