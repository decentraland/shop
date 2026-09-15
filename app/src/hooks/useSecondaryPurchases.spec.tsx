import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { resetFeatureFlagsCache } from '~/lib/featureFlags'
import { useSecondaryPurchases } from './useSecondaryPurchases'

/**
 * The BUYER's permission, asked by every discovery and checkout surface.
 *
 * Two things it has to get right. FALSE is the answer to every uncertainty — loading, an unreachable flag
 * service, a malformed body — because this is a kill switch and a switch that reads "on" while it cannot
 * tell is not one. And it is granted by EITHER flag, so an environment already running on
 * `shop-secondary-sales` does not lose the ability to buy the day the buy-only flag appears.
 */

function wrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const flagResponse = (flags: Record<string, boolean>) =>
  vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ flags }) })

afterEach(() => {
  vi.unstubAllGlobals()
  resetFeatureFlagsCache()
})

describe('useSecondaryPurchases', () => {
  it('should be false on the first render, before the flag has resolved', () => {
    resetFeatureFlagsCache()
    vi.stubGlobal('fetch', flagResponse({ 'dapps-shop-secondary-purchases': true }))

    const { result } = renderHook(() => useSecondaryPurchases(), { wrapper })

    // The window that matters: no resale may be offered here, even though the flag will come back true.
    expect(result.current).toBe(false)
  })

  it('should be true once the purchase flag resolves on', async () => {
    resetFeatureFlagsCache()
    vi.stubGlobal('fetch', flagResponse({ 'dapps-shop-secondary-purchases': true }))

    const { result } = renderHook(() => useSecondaryPurchases(), { wrapper })

    await waitFor(() => expect(result.current).toBe(true))
  })

  it('should be true on the older sales flag alone, so an environment running on it keeps buying', async () => {
    resetFeatureFlagsCache()
    vi.stubGlobal('fetch', flagResponse({ 'dapps-shop-secondary-sales': true }))

    const { result } = renderHook(() => useSecondaryPurchases(), { wrapper })

    await waitFor(() => expect(result.current).toBe(true))
  })

  it('should be false when neither flag is in the file', async () => {
    // Today's state in every environment: neither flag has been created.
    resetFeatureFlagsCache()
    vi.stubGlobal('fetch', flagResponse({ 'dapps-proceeds-to-treasury': true }))

    const { result } = renderHook(() => useSecondaryPurchases(), { wrapper })

    await waitFor(() => expect(result.current).toBe(false))
  })

  it('should be false when the flag service is unreachable', async () => {
    resetFeatureFlagsCache()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    const { result } = renderHook(() => useSecondaryPurchases(), { wrapper })

    await waitFor(() => expect(result.current).toBe(false))
  })

  it('should not share a query key with the listing permission', async () => {
    // Both hooks can render on the same page (the PDP does exactly that). A shared key would make
    // whichever mounted first answer for both, and the buy flag would silently grant listing.
    resetFeatureFlagsCache()
    vi.stubGlobal('fetch', flagResponse({ 'dapps-shop-secondary-purchases': true }))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const sharedWrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )

    const purchases = renderHook(() => useSecondaryPurchases(), { wrapper: sharedWrapper })
    await waitFor(() => expect(purchases.result.current).toBe(true))

    const { useSecondaryListings } = await import('./useSecondaryListings')
    const listings = renderHook(() => useSecondaryListings(), { wrapper: sharedWrapper })
    await waitFor(() => expect(listings.result.current).toBe(false))
  })
})
