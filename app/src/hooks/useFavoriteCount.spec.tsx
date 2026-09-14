import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useFavoriteCount } from '~/hooks/useFavoriteCount'
import type { CatalogItem } from '~/lib/api'
import { useFavorites } from '~/store/favorites'

/**
 * The save count beside the PDP heart.
 *
 * What carries the risk is not the read but the ±1 on top of it: the heart is optimistic and never
 * refetches this number, so a count that ignores the viewer's own save contradicts the icon it sits
 * next to — and one that applies it twice inflates it.
 */

const ITEM = { contractAddress: '0xABC', itemId: '1' }
const KEY = '0xabc-1'

function wrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function statsResponse(count: number, pickedByUser?: boolean) {
  return {
    ok: true,
    json: () => Promise.resolve({ ok: true, data: { itemId: KEY, count, pickedByUser } })
  }
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  useFavorites.setState({ items: {}, status: 'ready' })
  fetchMock = vi.fn().mockResolvedValue(statsResponse(4))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

describe('when reading how many people saved an item', () => {
  it('should report nothing until the service answers', async () => {
    const { result } = renderHook(() => useFavoriteCount(ITEM), { wrapper })

    expect(result.current).toBeUndefined()
    await waitFor(() => expect(result.current).toBe(4))
    expect(new URL(fetchMock.mock.calls[0][0] as string).pathname).toBe(`/v1/picks/${KEY}/stats`)
  })

  it('and the item has no favorite key it should not ask at all', async () => {
    const { result } = renderHook(() => useFavoriteCount({ contractAddress: '0xabc', itemId: null }), { wrapper })

    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled())
    expect(result.current).toBeUndefined()
  })

  it('and the viewer saved it after the service counted it should add their save', async () => {
    useFavorites.setState({ items: { [KEY]: ITEM as CatalogItem } })
    const { result } = renderHook(() => useFavoriteCount(ITEM), { wrapper })

    await waitFor(() => expect(result.current).toBe(5))
  })

  it('and the viewer removed a save the service still counts it should take it off', async () => {
    fetchMock.mockResolvedValue(statsResponse(4, true))
    const { result } = renderHook(() => useFavoriteCount(ITEM), { wrapper })

    await waitFor(() => expect(result.current).toBe(3))
  })

  it('and the service already counts the viewer it should leave the number alone', async () => {
    fetchMock.mockResolvedValue(statsResponse(4, true))
    useFavorites.setState({ items: { [KEY]: ITEM as CatalogItem } })
    const { result } = renderHook(() => useFavoriteCount(ITEM), { wrapper })

    await waitFor(() => expect(result.current).toBe(4))
  })

  it('and the favorites list is still hydrating it should trust the service over an empty list', async () => {
    fetchMock.mockResolvedValue(statsResponse(4, true))
    useFavorites.setState({ items: {}, status: 'loading' })
    const { result } = renderHook(() => useFavoriteCount(ITEM), { wrapper })

    await waitFor(() => expect(result.current).toBe(4))
  })

  it('and the service fails it should report nothing rather than a zero', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) })
    const { result } = renderHook(() => useFavoriteCount(ITEM), { wrapper })

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(result.current).toBeUndefined()
  })
})
