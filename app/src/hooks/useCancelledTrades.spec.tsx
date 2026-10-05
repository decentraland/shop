import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor, type RenderHookResult } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getIsCancelledListingsEnabled = vi.fn()
vi.mock('~/lib/featureFlags', () => ({
  getIsCancelledListingsEnabled: () => getIsCancelledListingsEnabled()
}))

const fetchCancelledTrades = vi.fn()
vi.mock('~/lib/cancelled-trades', () => ({
  fetchCancelledTrades: (...args: unknown[]) => fetchCancelledTrades(...args)
}))

let session: { address: string; identity: object } | null
vi.mock('~/store/wallet', () => ({
  useWallet: (sel: (s: { session: typeof session }) => unknown) => sel({ session })
}))

import { useCancelledTrades } from '~/hooks/useCancelledTrades'

const IDENTITY = { ephemeralIdentity: 'fake' }

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('when reading the account’s taken-down listings', () => {
  let hook: RenderHookResult<ReturnType<typeof useCancelledTrades>, unknown>

  beforeEach(() => {
    vi.clearAllMocks()
    session = { address: '0xabc', identity: IDENTITY }
    getIsCancelledListingsEnabled.mockResolvedValue(true)
    fetchCancelledTrades.mockResolvedValue([{ id: 'gone-1' }, { id: 'gone-2' }])
  })

  describe('and the flag is on for a signed-in account', () => {
    beforeEach(async () => {
      hook = renderHook(() => useCancelledTrades(), { wrapper })
      await waitFor(() => expect(hook.result.current.count).toBeDefined())
    })

    it('should fetch with the account’s identity', () => {
      expect(fetchCancelledTrades).toHaveBeenCalledWith(IDENTITY)
    })

    it('should return the rows and their count', () => {
      expect(hook.result.current).toEqual({ trades: [{ id: 'gone-1' }, { id: 'gone-2' }], count: 2 })
    })
  })

  describe('and the flag is off', () => {
    beforeEach(async () => {
      getIsCancelledListingsEnabled.mockResolvedValue(false)
      hook = renderHook(() => useCancelledTrades(), { wrapper })
      await waitFor(() => expect(getIsCancelledListingsEnabled).toHaveBeenCalled())
    })

    it('should not fetch', () => {
      expect(fetchCancelledTrades).not.toHaveBeenCalled()
    })

    it('should leave the count unknown', () => {
      expect(hook.result.current.count).toBeUndefined()
    })
  })

  describe('and the visitor is signed out', () => {
    beforeEach(async () => {
      session = null
      hook = renderHook(() => useCancelledTrades(), { wrapper })
      await waitFor(() => expect(getIsCancelledListingsEnabled).toHaveBeenCalled())
    })

    it('should not fetch', () => {
      expect(fetchCancelledTrades).not.toHaveBeenCalled()
    })
  })
})
