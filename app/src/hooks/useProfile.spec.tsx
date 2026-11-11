import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useProfile } from './useProfile'

const ADDRESS = '0x0000000000000000000000000000000000000001'

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useProfile', () => {
  it('should resolve an address without a profile as a successful empty result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))

    const { result } = renderHook(() => useProfile(ADDRESS), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeUndefined()
  })

  it('should not refetch a missing profile when another consumer mounts', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = makeWrapper()

    const first = renderHook(() => useProfile(ADDRESS), { wrapper })
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true))
    const second = renderHook(() => useProfile(ADDRESS), { wrapper })

    expect(second.result.current.isLoading).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
