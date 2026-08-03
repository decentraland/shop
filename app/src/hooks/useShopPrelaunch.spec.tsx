import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { config } from '~/config'
import { useShopPrelaunch } from '~/hooks/useShopPrelaunch'
import { resetFeatureFlagsCache } from '~/lib/featureFlags'
import { useWallet } from '~/store/wallet'

// The curtain only engages on the public surfaces (production + staging), and the test environment resolves
// to dev — so every case that expects it to engage has to stand in as production. Done by stubbing the
// resolved flag rather than the hostname, because the hostname resolution is @dcl/ui-env's job and not what
// these cases are about.
vi.mock('~/config', async importOriginal => {
  const actual = await importOriginal<typeof import('~/config')>()
  return { config: { ...actual.config, isProduction: true, isStaging: false, prelaunchLocalPreview: false } }
})

const ALLOWED = '0xaabbccddeeff00112233445566778899aabbccdd'
const OTHER = '0x1111111111111111111111111111111111111111'

/**
 * Who sees the Shop while the pre-launch gate is armed.
 *
 * The curtain is cosmetic — credits-server refuses the purchase — but "cosmetic" is not "untested": getting
 * this wrong either shows a holding page to the whole world on launch day or shows the Shop to everyone
 * before it. Both are visible failures, so both are pinned here.
 */
function mockFlagService(body: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) })
  )
}

const armed = (addresses: string) => ({
  flags: { 'dapps-shop-prelaunch': true },
  variants: { 'dapps-shop-prelaunch': { enabled: true, payload: { value: addresses } } }
})

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

async function hideDecision() {
  const { result } = renderHook(() => useShopPrelaunch(), { wrapper })
  // 'pending' IS the first render in a gated environment, so settling means leaving it — that is what
  // distinguishes "decided to show the Shop" from "has not decided yet", which used to look identical.
  await waitFor(() => expect(result.current).not.toBe('pending'))
  await new Promise(resolve => setTimeout(resolve, 0))
  return result
}

describe('useShopPrelaunch', () => {
  beforeEach(() => {
    resetFeatureFlagsCache()
    useWallet.setState({ session: null, restored: true })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('should not hide the shop when the gate is not armed', async () => {
    mockFlagService({ flags: {}, variants: {} })

    const result = await hideDecision()

    expect(result.current).toBe('open')
  })

  it('should hide the shop from a visitor with no wallet connected while armed', async () => {
    mockFlagService(armed(ALLOWED))

    const result = await hideDecision()

    await waitFor(() => expect(result.current).toBe('hidden'))
  })

  it('should show the shop to an allowlisted wallet', async () => {
    mockFlagService(armed(ALLOWED))
    useWallet.setState({ session: { address: ALLOWED }, restored: true } as never)

    const result = await hideDecision()

    expect(result.current).toBe('open')
  })

  it('should match the allowlist case-insensitively, since a wallet reports a checksummed address', async () => {
    mockFlagService(armed(ALLOWED))
    useWallet.setState({ session: { address: ALLOWED.toUpperCase().replace('0X', '0x') }, restored: true } as never)

    const result = await hideDecision()

    expect(result.current).toBe('open')
  })

  it('should hide the shop from a wallet that is not on the list', async () => {
    mockFlagService(armed(ALLOWED))
    useWallet.setState({ session: { address: OTHER }, restored: true } as never)

    const result = await hideDecision()

    await waitFor(() => expect(result.current).toBe('hidden'))
  })

  /**
   * FAILS OPEN, unlike every other flag read in this app. Deliberate: hiding is the positive condition here,
   * so an outage resolving to "not armed" reveals the Shop. On launch day the alternative would be a holding
   * page for the entire world; before launch it merely exposes an unannounced URL whose money path is still
   * closed server-side.
   */
  it('should show the shop when the flag service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    const result = await hideDecision()

    expect(result.current).toBe('open')
  })

  it('should show the shop when the flag service answers with an error status', async () => {
    mockFlagService({}, false)

    const result = await hideDecision()

    expect(result.current).toBe('open')
  })

  it('should ignore a variant that is disabled, treating it as no list at all', async () => {
    mockFlagService({
      flags: { 'dapps-shop-prelaunch': true },
      variants: { 'dapps-shop-prelaunch': { enabled: false, payload: { value: ALLOWED } } }
    })
    useWallet.setState({ session: { address: ALLOWED }, restored: true } as never)

    const result = await hideDecision()

    // Armed with no usable list: nobody has been let in, so the allowlisted address is hidden too.
    await waitFor(() => expect(result.current).toBe('hidden'))
  })
  /**
   * The environment gate, which exists so DEV is never curtained: that is the internal surface, on a
   * testnet, where QA and design work with no wallet connected. Deliberately a runtime hostname check rather
   * than a feature-flag hostname strategy — those are evaluated against the REFERER, and the browser and
   * credits-server present different ones, so the two halves of the gate could silently disagree.
   */
  it('should never hide the shop on dev, however the flag is set', async () => {
    vi.spyOn(config, 'isProduction', 'get').mockReturnValue(false)
    vi.spyOn(config, 'isStaging', 'get').mockReturnValue(false)
    vi.spyOn(config, 'prelaunchLocalPreview', 'get').mockReturnValue(false)
    mockFlagService(armed(''))

    const result = await hideDecision()

    expect(result.current).toBe('open')
  })

  /**
   * The flash. An allowed wallet saw the holding page for a moment on every refresh, because the flag
   * resolves over the network while the wallet session is read back from storage independently — so for one
   * render the gate was armed and the address still unknown, which looks exactly like "not on the list".
   *
   * Deliberately NOT using `hideDecision()`: that helper waits for the decision to leave 'pending', and
   * 'pending' is precisely what this asserts.
   */
  it('should withhold the decision while the wallet session is still being restored', async () => {
    useWallet.setState({ session: null, restored: false })
    mockFlagService(armed(ALLOWED))

    const { result } = renderHook(() => useShopPrelaunch(), { wrapper })

    // Let the flag query settle. The gate is armed and no address is known yet — the old code returned
    // "hide" here, which is the frame the user saw.
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(result.current).toBe('pending')

    // The session lands, and only now is there an answer — and it is 'open', never a flicker through
    // 'hidden'.
    act(() => {
      useWallet.setState({ session: { address: ALLOWED }, restored: true } as never)
    })
    await waitFor(() => expect(result.current).toBe('open'))
  })

  it('should still decide when the restore finishes without a session', async () => {
    // The restore failing or finding nothing must not leave the page blank forever: `restored` flips either
    // way, and a visitor with no wallet is exactly who the curtain is for.
    useWallet.setState({ session: null, restored: false })
    mockFlagService(armed(ALLOWED))

    const { result } = renderHook(() => useShopPrelaunch(), { wrapper })
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(result.current).toBe('pending')

    act(() => {
      useWallet.setState({ session: null, restored: true })
    })
    await waitFor(() => expect(result.current).toBe('hidden'))
  })

  // Staging DOES curtain: it reads the production APIs, Polygon and the production credits-server, so it is
  // the launch rehearsal, and a rehearsal that cannot show the curtain is not rehearsing the launch.
  it('should hide the shop on staging, the same as production', async () => {
    vi.spyOn(config, 'isProduction', 'get').mockReturnValue(false)
    vi.spyOn(config, 'isStaging', 'get').mockReturnValue(true)
    mockFlagService(armed(''))

    const result = await hideDecision()

    expect(result.current).toBe('hidden')
  })
})
