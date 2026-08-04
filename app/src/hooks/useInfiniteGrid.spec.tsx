import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useInfiniteGrid, type Page } from './useInfiniteGrid'

/**
 * OFFSET PAGING MUST BE ABLE TO END.
 *
 * The next offset is derived from how many items have actually ARRIVED, not from a page index — which is what
 * makes a server-side cap on `first` harmless, and is worth keeping. The cost is that a page adding zero items
 * leaves the offset where it was: return it again and react-query appends another empty page, `hasNextPage`
 * stays true, and the grid requests that identical offset for as long as the tab is open. Today's endpoints all
 * report `total: 0` for an over-the-end page, which stops it by accident; a feed that filters rows out
 * server-side (as the sibling marketplace's does for social emotes) would not.
 */

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

const page = (items: number[], total: number): Page<number> => ({ items, total })

let key = 0
beforeEach(() => {
  key += 1 // a fresh query key per test, so no cache carries over
})

function renderGrid(fetchPage: (skip: number) => Promise<Page<number>>) {
  return renderHook(() => useInfiniteGrid<number>(['grid', key], fetchPage), { wrapper: wrapper() })
}

describe('useInfiniteGrid', () => {
  it('should page by cumulative offset and stop when the accumulated items reach the total', async () => {
    const fetchPage = vi.fn(async (skip: number) => (skip === 0 ? page([1, 2], 4) : page([3, 4], 4)))
    const { result } = renderGrid(fetchPage)

    await waitFor(() => expect(result.current.hasNextPage).toBe(true))
    await act(async () => void (await result.current.fetchNextPage()))

    expect(fetchPage).toHaveBeenNthCalledWith(2, 2) // the offset is the count already loaded
    await waitFor(() => expect(result.current.items).toEqual([1, 2, 3, 4]))
    expect(result.current.hasNextPage).toBe(false)
  })

  it('should end the list on an empty page even while the total claims there is more', async () => {
    // The shape that loops: a page returns nothing, so the offset cannot advance, while `total` still says 10.
    const fetchPage = vi.fn(async (skip: number) => (skip === 0 ? page([1, 2], 10) : page([], 10)))
    const { result } = renderGrid(fetchPage)

    await waitFor(() => expect(result.current.hasNextPage).toBe(true))
    await act(async () => void (await result.current.fetchNextPage()))

    await waitFor(() => expect(result.current.hasNextPage).toBe(false))
    expect(result.current.items).toEqual([1, 2])
    // Two requests, and no third at the same offset.
    expect(fetchPage).toHaveBeenCalledTimes(2)
    expect(fetchPage.mock.calls.map(c => c[0])).toEqual([0, 2])
  })

  it('should report a failed next page separately from the pages already on screen', async () => {
    const fetchPage = vi.fn(async (skip: number) => {
      if (skip === 0) return page([1, 2], 10)
      throw new Error('catalog timed out')
    })
    const { result } = renderGrid(fetchPage)

    await waitFor(() => expect(result.current.hasNextPage).toBe(true))
    await act(async () => void (await result.current.fetchNextPage()))

    // What <LoadMore/> reads to stand down — and the first page is untouched, so the grid keeps its cards.
    await waitFor(() => expect(result.current.isFetchNextPageError).toBe(true))
    expect(result.current.items).toEqual([1, 2])
    expect(result.current.hasNextPage).toBe(true)
  })
})
