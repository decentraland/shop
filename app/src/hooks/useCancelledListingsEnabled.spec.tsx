import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor, type RenderHookResult } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetFeatureFlagsCache } from '~/lib/featureFlags'
import { useCancelledListingsEnabled } from './useCancelledListingsEnabled'

function wrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const flagResponse = (flags: Record<string, boolean>) =>
  vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ flags }) })

describe('when reading whether taken-down listings are shown', () => {
  let hook: RenderHookResult<boolean, unknown>

  beforeEach(() => {
    resetFeatureFlagsCache()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    resetFeatureFlagsCache()
  })

  describe('and the flag has not resolved yet', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', flagResponse({ 'dapps-cancelled-orders-banner': true }))
      hook = renderHook(() => useCancelledListingsEnabled(), { wrapper })
    })

    it('should be false', () => {
      expect(hook.result.current).toBe(false)
    })
  })

  describe('and the flag is absent from the file', () => {
    beforeEach(async () => {
      vi.stubGlobal('fetch', flagResponse({ 'dapps-shop-secondary-sales': true }))
      hook = renderHook(() => useCancelledListingsEnabled(), { wrapper })
      await waitFor(() => expect(fetch).toHaveBeenCalled())
    })

    it('should be false', () => {
      expect(hook.result.current).toBe(false)
    })
  })

  describe('and the flag service is unreachable', () => {
    beforeEach(async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
      hook = renderHook(() => useCancelledListingsEnabled(), { wrapper })
      await waitFor(() => expect(fetch).toHaveBeenCalled())
    })

    it('should be false', () => {
      expect(hook.result.current).toBe(false)
    })
  })

  describe('and the flag is on', () => {
    beforeEach(async () => {
      vi.stubGlobal('fetch', flagResponse({ 'dapps-cancelled-orders-banner': true }))
      hook = renderHook(() => useCancelledListingsEnabled(), { wrapper })
      await waitFor(() => expect(hook.result.current).toBe(true))
    })

    it('should be true', () => {
      expect(hook.result.current).toBe(true)
    })
  })
})
