import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { resetFeatureFlagsCache } from '~/lib/featureFlags'
import { useFollowsEnabled } from './useFollowsEnabled'

/**
 * Creator follows are hidden until the feature has a backend, and this hook is what both surfaces ask.
 *
 * The flag does not exist in any environment, so the case that matters most is the absent one: it has to
 * read as "hidden" the same way an outage does, and it has to be hidden on the very first render — a Follow
 * button that appears for a moment while the flag resolves is a button someone can press.
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

describe('useFollowsEnabled', () => {
  it('should be false on the first render, before the flag has resolved', () => {
    resetFeatureFlagsCache()
    vi.stubGlobal('fetch', flagResponse({ 'dapps-shop-follows': true }))

    const { result } = renderHook(() => useFollowsEnabled(), { wrapper })

    expect(result.current).toBe(false)
  })

  it('should be false when the flag is absent from the file', async () => {
    // The shipped state: the flag was never created, so both follow surfaces stay hidden.
    resetFeatureFlagsCache()
    vi.stubGlobal('fetch', flagResponse({ 'dapps-shop-secondary-sales': true }))

    const { result } = renderHook(() => useFollowsEnabled(), { wrapper })

    await waitFor(() => expect(result.current).toBe(false))
  })

  it('should be false when the flag is present but off', async () => {
    resetFeatureFlagsCache()
    vi.stubGlobal('fetch', flagResponse({ 'dapps-shop-follows': false }))

    const { result } = renderHook(() => useFollowsEnabled(), { wrapper })

    await waitFor(() => expect(result.current).toBe(false))
  })

  it('should be false when the flag service is unreachable', async () => {
    resetFeatureFlagsCache()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    const { result } = renderHook(() => useFollowsEnabled(), { wrapper })

    await waitFor(() => expect(result.current).toBe(false))
  })

  it('should be true once the flag resolves on', async () => {
    resetFeatureFlagsCache()
    vi.stubGlobal('fetch', flagResponse({ 'dapps-shop-follows': true }))

    const { result } = renderHook(() => useFollowsEnabled(), { wrapper })

    await waitFor(() => expect(result.current).toBe(true))
  })
})
