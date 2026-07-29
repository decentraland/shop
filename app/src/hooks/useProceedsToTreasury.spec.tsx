import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { config } from '~/config'
import { resetFeatureFlagsCache } from '~/lib/featureFlags'
import { useProceedsToTreasury } from '~/hooks/useProceedsToTreasury'

const FLAG_KEY = 'dapps-proceeds-to-treasury'

/**
 * This hook decides what the sell modals TELL a seller they are going to receive, so its contract is not
 * "returns the flag" — it is "never claims credits unless it is certain". Every uncertain state (loading,
 * error, absent flag) has to read as `false`, i.e. the pre-feature behaviour where the seller is paid MANA
 * directly. A `true` on a stale or failed read would put a false statement on a money screen.
 */
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } }
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function mockFlag(enabled: boolean) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ flags: { [FLAG_KEY]: enabled } }) })
  )
}

describe('useProceedsToTreasury', () => {
  beforeEach(() => {
    resetFeatureFlagsCache()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('should be false on the FIRST render, before the flag has resolved', () => {
    // The frame the seller may already be looking at. Defaulting to `true` here would flash "you will receive
    // credits" and then correct itself — or not, if they submit in that window.
    mockFlag(true)
    const { result } = renderHook(() => useProceedsToTreasury(), { wrapper })
    expect(result.current).toBe(false)
  })

  it('should become true once an enabled flag resolves', async () => {
    mockFlag(true)
    const { result } = renderHook(() => useProceedsToTreasury(), { wrapper })

    await waitFor(() => expect(result.current).toBe(true))
  })

  it('should stay false for a disabled flag', async () => {
    mockFlag(false)
    const { result } = renderHook(() => useProceedsToTreasury(), { wrapper })

    // Give the query a chance to settle so this cannot pass merely by being early.
    await waitFor(() => expect(result.current).toBe(false))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(result.current).toBe(false)
  })

  it('should stay false when the flag service is unreachable', async () => {
    // Fail-closed all the way up: the lib resolves false, and the hook must not turn that into a truthy
    // "unknown". The modal then shows the MANA copy, which is what the signed listing will actually do.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const { result } = renderHook(() => useProceedsToTreasury(), { wrapper })

    await waitFor(() => expect(result.current).toBe(false))
  })

  it('should stay false when the flag is absent from the service response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ flags: {} }) }))
    const { result } = renderHook(() => useProceedsToTreasury(), { wrapper })

    await waitFor(() => expect(result.current).toBe(false))
  })

  it('should follow the flag only when a treasury address is configured', async () => {
    // The address is the remaining provisioning guard: stg/prod ship with it empty, so a globally enabled
    // flag must not make those builds claim credits. It is NOT a second switch — the flag is the only switch;
    // an empty address simply makes routing impossible.
    mockFlag(true)
    const hasAddress = !!config.treasuryAddress
    const { result } = renderHook(() => useProceedsToTreasury(), { wrapper })

    await waitFor(() => expect(result.current).toBe(hasAddress))
  })
})
