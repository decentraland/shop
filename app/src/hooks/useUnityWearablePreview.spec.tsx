import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { resetFeatureFlagsCache } from '~/lib/featureFlags'
import { useUnityWearablePreview } from './useUnityWearablePreview'

/**
 * The switch the builder and the shop share for the Unity preview. Its contract is that Babylon is the
 * answer to every uncertainty, and that `pending` says which kind of `false` a caller is looking at.
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

describe('useUnityWearablePreview', () => {
  it('should be disabled and pending on the first render', () => {
    resetFeatureFlagsCache()
    vi.stubGlobal('fetch', flagResponse({ 'dapps-unity-wearable-preview': true }))

    const { result } = renderHook(() => useUnityWearablePreview(), { wrapper })

    expect(result.current).toEqual({ enabled: false, pending: true })
  })

  it('should be enabled once the flag resolves on', async () => {
    resetFeatureFlagsCache()
    vi.stubGlobal('fetch', flagResponse({ 'dapps-unity-wearable-preview': true }))

    const { result } = renderHook(() => useUnityWearablePreview(), { wrapper })

    await waitFor(() => expect(result.current).toEqual({ enabled: true, pending: false }))
  })

  it('should be disabled when the flag is absent from the file', async () => {
    resetFeatureFlagsCache()
    vi.stubGlobal('fetch', flagResponse({ 'dapps-shop-prelaunch': true }))

    const { result } = renderHook(() => useUnityWearablePreview(), { wrapper })

    await waitFor(() => expect(result.current).toEqual({ enabled: false, pending: false }))
  })

  it('should stop pending and stay disabled when the flag service is unreachable', async () => {
    resetFeatureFlagsCache()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    const { result } = renderHook(() => useUnityWearablePreview(), { wrapper })

    // Not pending forever: the accessor swallows the failure, so callers get a decision (Babylon) instead of
    // a preview that never mounts.
    await waitFor(() => expect(result.current).toEqual({ enabled: false, pending: false }))
  })
})
