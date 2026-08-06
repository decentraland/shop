import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { resetFeatureFlagsCache } from '~/lib/featureFlags'
import { useNamesEnabled } from './useNamesEnabled'

/**
 * NAME registration is closed until the cross-chain path is proven, and this hook is what the page asks.
 *
 * The absent case is the one that matters: the flag does not exist in any environment yet, so it has to read
 * as "closed" the same way an outage does, and it has to be closed on the very FIRST render — a Claim button
 * that appears for a moment while the flag resolves is a button someone can press, and the purchase behind
 * it would be refused by credits-server after they had already chosen a name.
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

describe('useNamesEnabled', () => {
  it('should be false on the first render, before the flag has resolved', () => {
    resetFeatureFlagsCache()
    vi.stubGlobal('fetch', flagResponse({ 'dapps-shop-names': true }))

    const { result } = renderHook(() => useNamesEnabled(), { wrapper })

    expect(result.current).toBe(false)
  })

  it('should be false when the flag is absent from the file', async () => {
    // The shipped state: the flag was never created, so registration stays closed.
    resetFeatureFlagsCache()
    vi.stubGlobal('fetch', flagResponse({ 'dapps-shop-secondary-sales': true }))

    const { result } = renderHook(() => useNamesEnabled(), { wrapper })

    await waitFor(() => expect(result.current).toBe(false))
  })

  it('should be false when the flag is present but off', async () => {
    resetFeatureFlagsCache()
    vi.stubGlobal('fetch', flagResponse({ 'dapps-shop-names': false }))

    const { result } = renderHook(() => useNamesEnabled(), { wrapper })

    await waitFor(() => expect(result.current).toBe(false))
  })

  it('should be false when the flag service is unreachable', async () => {
    resetFeatureFlagsCache()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    const { result } = renderHook(() => useNamesEnabled(), { wrapper })

    await waitFor(() => expect(result.current).toBe(false))
  })

  it('should be true once the flag resolves on', async () => {
    resetFeatureFlagsCache()
    vi.stubGlobal('fetch', flagResponse({ 'dapps-shop-names': true }))

    const { result } = renderHook(() => useNamesEnabled(), { wrapper })

    await waitFor(() => expect(result.current).toBe(true))
  })
})
