import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { resetFeatureFlagsCache } from '~/lib/featureFlags'
import { useSecondarySales } from './useSecondarySales'

/**
 * The Shop offers no secondary sales, and this hook is what every surface asks.
 *
 * Its contract is that FALSE is the answer to every uncertainty — loading, an unreachable flag service, a
 * malformed body. Unlike most fail-closed reads that is also the product default, so the risk is the
 * opposite of the usual one: a hook that returned `true` while loading would flash a Sell button, and on a
 * slow flag read a seller could open the listing flow the Shop is not supposed to have.
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

describe('useSecondarySales', () => {
  it('should be false on the first render, before the flag has resolved', () => {
    resetFeatureFlagsCache()
    vi.stubGlobal('fetch', flagResponse({ 'dapps-shop-secondary-sales': true }))

    const { result } = renderHook(() => useSecondarySales(), { wrapper })

    // The window that matters: no Sell button may render here, even though the flag will come back true.
    expect(result.current).toBe(false)
  })

  it('should be true once the flag resolves on', async () => {
    resetFeatureFlagsCache()
    vi.stubGlobal('fetch', flagResponse({ 'dapps-shop-secondary-sales': true }))

    const { result } = renderHook(() => useSecondarySales(), { wrapper })

    await waitFor(() => expect(result.current).toBe(true))
  })

  it('should be false when the flag is absent from the file', async () => {
    // Today's state in every environment: the flag has not been created, so nothing enables resales.
    resetFeatureFlagsCache()
    vi.stubGlobal('fetch', flagResponse({ 'dapps-proceeds-to-treasury': true }))

    const { result } = renderHook(() => useSecondarySales(), { wrapper })

    await waitFor(() => expect(result.current).toBe(false))
  })

  it('should be false when the flag service is unreachable', async () => {
    resetFeatureFlagsCache()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    const { result } = renderHook(() => useSecondarySales(), { wrapper })

    await waitFor(() => expect(result.current).toBe(false))
  })
})
