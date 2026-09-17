import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useMyStoreAccess } from '~/hooks/useMyStoreEnabled'
import { resetFeatureFlagsCache } from '~/lib/featureFlags'
import { useWallet } from '~/store/wallet'

const ALLOWED = '0xaabbccddeeff00112233445566778899aabbccdd'
const OTHER = '0x1111111111111111111111111111111111111111'

function mockFlagService(body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) }))
}

const on = (addresses?: string) => ({
  flags: { 'dapps-shop-my-store': true },
  variants: addresses === undefined ? {} : { 'dapps-shop-my-store': { enabled: true, payload: { value: addresses } } }
})

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

async function settledAccess() {
  const { result } = renderHook(() => useMyStoreAccess(), { wrapper })
  await waitFor(() => expect(result.current).not.toBe('pending'))
  return result
}

/**
 * Who gets the creator dashboard.
 *
 * The flag says whether the feature exists; the variant, when present, narrows it to a list of addresses.
 * Both halves of that sentence are pinned here, because the two ways to get it wrong are opposite and both
 * visible: a missing list read as an empty guest list hides the page from every creator, and a list ignored
 * rolls the page out to all of them at once.
 */
describe('useMyStoreAccess', () => {
  beforeEach(() => {
    resetFeatureFlagsCache()
    useWallet.setState({ session: null, restored: true })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('should stay off while the flag is off, however the wallet is placed', async () => {
    mockFlagService({ flags: {}, variants: {} })
    useWallet.setState({ session: { address: ALLOWED } as never, restored: true })

    expect((await settledAccess()).current).toBe('off')
  })

  it('should be on for everyone when the flag carries no list', async () => {
    mockFlagService(on())

    expect((await settledAccess()).current).toBe('on')
  })

  it('should be on for an address the list names', async () => {
    mockFlagService(on(`${OTHER}, ${ALLOWED}`))
    useWallet.setState({ session: { address: ALLOWED } as never, restored: true })

    expect((await settledAccess()).current).toBe('on')
  })

  it('should match an address whatever case it is signed in with', async () => {
    mockFlagService(on(ALLOWED))
    useWallet.setState({ session: { address: ALLOWED.toUpperCase().replace('0X', '0x') } as never, restored: true })

    expect((await settledAccess()).current).toBe('on')
  })

  it('should be off for an address the list leaves out', async () => {
    mockFlagService(on(ALLOWED))
    useWallet.setState({ session: { address: OTHER } as never, restored: true })

    expect((await settledAccess()).current).toBe('off')
  })

  it('should be off for a visitor with no wallet once a list exists', async () => {
    mockFlagService(on(ALLOWED))

    expect((await settledAccess()).current).toBe('off')
  })

  // The flicker this guards against: the flag settles over the network while the session is still being read
  // back from storage, and answering on that first reading bounced an allowed creator off their own page.
  it('should withhold the answer until the wallet has been restored', async () => {
    mockFlagService(on(ALLOWED))
    useWallet.setState({ session: null, restored: false })

    const { result } = renderHook(() => useMyStoreAccess(), { wrapper })
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
    })
    expect(result.current).toBe('pending')
  })

  it('should not wait on the wallet when there is no list to check it against', async () => {
    mockFlagService(on())
    useWallet.setState({ session: null, restored: false })

    expect((await settledAccess()).current).toBe('on')
  })

  it('should be off when the flag service cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    expect((await settledAccess()).current).toBe('off')
  })
})
