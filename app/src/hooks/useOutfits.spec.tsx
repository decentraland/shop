import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useOutfitCreatorAccess } from '~/hooks/useOutfits'
import { resetFeatureFlagsCache } from '~/lib/featureFlags'
import { useWallet } from '~/store/wallet'

// The studio is hidden entirely when there is no shop-server to author against, so every case here
// needs a configured host to be about the allowlist rather than about availability.
vi.mock('~/config', async importOriginal => {
  const actual = await importOriginal<typeof import('~/config')>()
  return { config: { ...actual.config, shopServerUrl: 'https://shop-server.example.com' } }
})

const CREATOR = '0xaabbccddeeff00112233445566778899aabbccdd'
const OTHER = '0x1111111111111111111111111111111111111111'

function mockFlagService(body: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) }))
}

const armed = (addresses: string) => ({
  flags: { 'dapps-shop-outfit-creators': true },
  variants: { 'dapps-shop-outfit-creators': { enabled: true, payload: { value: addresses } } }
})

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

async function settledAccess() {
  const { result } = renderHook(() => useOutfitCreatorAccess(), { wrapper })
  await waitFor(() => expect(result.current).not.toBe('pending'))
  await new Promise(resolve => setTimeout(resolve, 0))
  return result
}

describe('useOutfitCreatorAccess', () => {
  beforeEach(() => {
    // Vite loads .env.local in EVERY mode, and `import.meta.env.DEV` is true under vitest — so a
    // developer's own studio overrides would otherwise decide these cases instead of the mocked
    // service, silently. Neutralised with empty strings, which both override readers treat as absent.
    vi.stubEnv('VITE_FEATURE_FLAG_OVERRIDES', '')
    vi.stubEnv('VITE_FEATURE_FLAG_VARIANT_OVERRIDES', '')
    resetFeatureFlagsCache()
    useWallet.setState({ session: null, restored: true })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('should admit an allowlisted account', async () => {
    mockFlagService(armed(CREATOR))
    useWallet.setState({ session: { address: CREATOR }, restored: true } as never)

    const result = await settledAccess()

    expect(result.current).toBe('creator')
  })

  it('should match the allowlist case-insensitively, since a wallet reports a checksummed address', async () => {
    mockFlagService(armed(CREATOR))
    useWallet.setState({
      session: { address: CREATOR.toUpperCase().replace('0X', '0x') },
      restored: true
    } as never)

    const result = await settledAccess()

    expect(result.current).toBe('creator')
  })

  it('should deny an account that is not on the list', async () => {
    mockFlagService(armed(CREATOR))
    useWallet.setState({ session: { address: OTHER }, restored: true } as never)

    const result = await settledAccess()

    expect(result.current).toBe('denied')
  })

  it('should deny everyone while the flag is off, list or no list', async () => {
    mockFlagService({ flags: {}, variants: {} })
    useWallet.setState({ session: { address: CREATOR }, restored: true } as never)

    const result = await settledAccess()

    expect(result.current).toBe('denied')
  })

  // FAILS CLOSED, the opposite of useShopPrelaunch: showing the studio is the positive condition
  // here, so an outage hides it. Harmless — shop-server refuses the writes regardless.
  it('should deny when the flag service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    useWallet.setState({ session: { address: CREATOR }, restored: true } as never)

    const result = await settledAccess()

    expect(result.current).toBe('denied')
  })

  /**
   * The flash. A creator saw the sign-in gate, then the not-available gate, for a moment on every
   * refresh of the studio: the flag resolves over the network while the session is read back from
   * storage independently, so for one render there was no address — indistinguishable from signed
   * out. Deliberately not using `settledAccess()`, since 'pending' is what this asserts.
   */
  it('should withhold the verdict while the session is still being restored', async () => {
    useWallet.setState({ session: null, restored: false })
    mockFlagService(armed(CREATOR))

    const { result } = renderHook(() => useOutfitCreatorAccess(), { wrapper })

    // Long enough for the flag query to settle. No address is known yet — the old code answered
    // "not a creator" here, which is the frame the user saw.
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(result.current).toBe('pending')

    act(() => {
      useWallet.setState({ session: { address: CREATOR }, restored: true } as never)
    })
    await waitFor(() => expect(result.current).toBe('creator'))
  })

  it('should answer a signed-out visitor without waiting on the flag fetch', async () => {
    // A restore that finds nothing must not leave the studio spinning, and the public detail page
    // reads this hook too — making it wait on a network round-trip to learn that nobody is signed
    // in would delay a page that has no stake in the answer.
    let resolveFlags: (value: unknown) => void = () => {}
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(resolve => (resolveFlags = resolve))))
    useWallet.setState({ session: null, restored: false })

    const { result } = renderHook(() => useOutfitCreatorAccess(), { wrapper })
    expect(result.current).toBe('pending')

    act(() => {
      useWallet.setState({ session: null, restored: true })
    })

    // Decided with the flag request still in flight.
    await waitFor(() => expect(result.current).toBe('denied'))
    resolveFlags({ ok: true, json: () => Promise.resolve(armed(CREATOR)) })
  })
})
