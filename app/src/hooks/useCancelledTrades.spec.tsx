import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor, type RenderHookResult } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CancelledTrade, CancelledTradesPage, CancelledTradeType } from '~/lib/cancelled-trades'

let enabled: boolean
vi.mock('~/hooks/useCancelledListingsEnabled', () => ({
  useCancelledListingsEnabled: () => enabled
}))

const fetchCancelledTrades = vi.fn()
vi.mock('~/lib/cancelled-trades', async importActual => ({
  ...(await importActual<typeof import('~/lib/cancelled-trades')>()),
  fetchCancelledTrades: (...args: unknown[]) => fetchCancelledTrades(...args)
}))

let session: { address: string; identity: object } | null
vi.mock('~/store/wallet', () => ({
  useWallet: (sel: (s: { session: typeof session }) => unknown) => sel({ session })
}))

import { invalidateCancelledTrades, useCancelledTrades } from '~/hooks/useCancelledTrades'

const IDENTITY = { ephemeralIdentity: 'fake' }

type FetchOpts = { skip?: number; first?: number; types?: CancelledTradeType[] }

function rows(from: number, to: number, type: CancelledTradeType = 'public_item_order'): CancelledTrade[] {
  return Array.from({ length: to - from }, (_, i) => ({ id: `gone-${from + i}`, type }) as CancelledTrade)
}

describe('when reading the account’s taken-down listings', () => {
  let client: QueryClient
  let hook: RenderHookResult<ReturnType<typeof useCancelledTrades>, unknown>

  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    session = { address: '0xabc', identity: IDENTITY }
    enabled = true
  })

  afterEach(() => {
    vi.resetAllMocks()
    client.clear()
  })

  describe('and the flag is on for a signed-in account with more than one page', () => {
    beforeEach(async () => {
      fetchCancelledTrades.mockImplementation(
        async (_identity: unknown, opts: FetchOpts = {}): Promise<CancelledTradesPage> => {
          if (opts.types?.includes('bid')) return { items: rows(0, 1, 'bid'), total: 40 }
          // The second page repeats the last row of the first, as when a row before it dropped out.
          return opts.skip === 100
            ? { items: [...rows(99, 100), ...rows(100, 199)], total: 250 }
            : { items: rows(0, 100), total: 250 }
        }
      )
      hook = renderHook(() => useCancelledTrades(), { wrapper })
      await waitFor(() => expect(hook.result.current.kind).toBeDefined())
    })

    it('should fetch the first page with the account’s identity', () => {
      expect(fetchCancelledTrades).toHaveBeenCalledWith(IDENTITY, { skip: 0 })
    })

    it('should count every taken-down trade from the total, not the loaded rows', () => {
      expect(hook.result.current.count).toBe(250)
    })

    it('should return the first page of rows', () => {
      expect(hook.result.current.trades).toHaveLength(100)
    })

    it('should report that there are more pages', () => {
      expect(hook.result.current.hasNextPage).toBe(true)
    })

    it('should word the banner from the offer total the server reports', () => {
      expect(hook.result.current.kind).toBe('mixed')
    })

    describe('and the next page is loaded', () => {
      beforeEach(async () => {
        act(() => hook.result.current.fetchNextPage())
        await waitFor(() => expect(hook.result.current.trades.length).toBeGreaterThan(100))
      })

      it('should ask for it from the number of rows already loaded', () => {
        expect(fetchCancelledTrades).toHaveBeenCalledWith(IDENTITY, { skip: 100 })
      })

      it('should append its rows without repeating one already shown', () => {
        expect(hook.result.current.trades.map(trade => trade.id)).toEqual(rows(0, 199).map(trade => trade.id))
      })
    })
  })

  describe('and the offer total cannot be read for more than one page', () => {
    beforeEach(async () => {
      fetchCancelledTrades.mockImplementation(
        async (_identity: unknown, opts: FetchOpts = {}): Promise<CancelledTradesPage> => {
          if (opts.types?.includes('bid')) throw new Error('fetchCancelledTrades 500')
          return { items: rows(0, 100), total: 250 }
        }
      )
      hook = renderHook(() => useCancelledTrades(), { wrapper })
      await waitFor(() => expect(hook.result.current.kind).toBeDefined())
    })

    it('should word the banner for both listings and offers', () => {
      expect(hook.result.current.kind).toBe('mixed')
    })
  })

  describe('and every row fits on the first page', () => {
    beforeEach(async () => {
      fetchCancelledTrades.mockResolvedValueOnce({ items: [...rows(0, 2), ...rows(2, 3, 'bid')], total: 3 })
      hook = renderHook(() => useCancelledTrades(), { wrapper })
      await waitFor(() => expect(hook.result.current.kind).toBeDefined())
    })

    it('should word the banner from the rows themselves', () => {
      expect(hook.result.current.kind).toBe('mixed')
    })

    it('should not ask the server for the offer total', () => {
      expect(fetchCancelledTrades).toHaveBeenCalledTimes(1)
    })

    it('should report that there are no more pages', () => {
      expect(hook.result.current.hasNextPage).toBe(false)
    })
  })

  describe('and the list is invalidated after a listing is put back', () => {
    beforeEach(async () => {
      fetchCancelledTrades
        .mockResolvedValueOnce({ items: rows(0, 2), total: 2 })
        .mockResolvedValueOnce({ items: rows(1, 2), total: 1 })
      hook = renderHook(() => useCancelledTrades(), { wrapper })
      await waitFor(() => expect(hook.result.current.count).toBe(2))
      invalidateCancelledTrades(client)
      await waitFor(() => expect(hook.result.current.count).toBe(1))
    })

    it('should refetch and drop the re-created row', () => {
      expect(hook.result.current.trades.map(trade => trade.id)).toEqual(['gone-1'])
    })
  })

  describe('and the flag is off', () => {
    beforeEach(() => {
      enabled = false
      hook = renderHook(() => useCancelledTrades(), { wrapper })
    })

    it('should not fetch', () => {
      expect(fetchCancelledTrades).not.toHaveBeenCalled()
    })

    it('should leave the count unknown', () => {
      expect(hook.result.current.count).toBeUndefined()
    })
  })

  describe('and the visitor is signed out', () => {
    beforeEach(() => {
      session = null
      hook = renderHook(() => useCancelledTrades(), { wrapper })
    })

    it('should not fetch', () => {
      expect(fetchCancelledTrades).not.toHaveBeenCalled()
    })
  })
})
