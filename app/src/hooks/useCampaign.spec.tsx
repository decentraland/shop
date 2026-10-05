import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ContentfulLocale } from '@dcl/schemas'

import { resetFeatureFlagsCache, type FeatureFlag } from '~/lib/featureFlags'
import type { Campaign } from '~/lib/contentful'
import { useWallet } from '~/store/wallet'

// Only ever on for the one test that needs the flag read to REJECT. `getFlagWithVariant` catches its own
// errors, so there is no other way to reach the branch that keeps a rejection from reporting "still
// loading" forever.
let flagReadRejects = false
vi.mock('~/lib/featureFlags', async importOriginal => {
  const actual = await importOriginal<typeof import('~/lib/featureFlags')>()
  return {
    ...actual,
    getFlagWithVariant: (flag: FeatureFlag) =>
      flagReadRejects ? Promise.reject(new Error('flag service exploded')) : actual.getFlagWithVariant(flag)
  }
})

const fetchCampaign = vi.fn()
let configured = true
vi.mock('~/lib/contentful', async importOriginal => {
  const actual = await importOriginal<typeof import('~/lib/contentful')>()
  return {
    ...actual,
    fetchCampaign: () => fetchCampaign() as Promise<Campaign | null>,
    isContentfulConfigured: () => configured
  }
})

import { useCampaign } from './useCampaign'
import { useCampaignTheme } from './useCampaignTheme'

const FLAG_KEY = 'dapps-shop-campaign'

function wrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const flagResponse = (flags: Record<string, boolean>, variant?: string) =>
  vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        flags,
        variants: variant === undefined ? {} : { [FLAG_KEY]: { enabled: true, payload: { value: variant } } }
      })
  })

const ALICE = '0x1111111111111111111111111111111111111111'
const BOB = '0x2222222222222222222222222222222222222222'

const signedInAs = (address: string | null) =>
  useWallet.setState({ session: address === null ? null : ({ address } as never), restored: true })

/** A flag request that never settles, so the "flag still in flight" window can be asserted on. */
const hangingFlag = () => vi.fn().mockReturnValue(new Promise(() => {}))

const aCampaign = (): Campaign => ({
  name: 'Halloween 2026',
  tabName: { [ContentfulLocale.enUS]: 'Halloween' },
  mainTag: 'halloween',
  tags: ['halloween'],
  collections: [],
  items: [],
  banners: {},
  assets: {}
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetFeatureFlagsCache()
  fetchCampaign.mockReset()
  configured = true
  flagReadRejects = false
  useWallet.setState({ session: null, restored: false })
})

describe('useCampaign', () => {
  describe('when the flag has not resolved yet', () => {
    it('should report itself pending rather than "no campaign"', () => {
      // The window this hook exists to get right. A consumer that acts on "settled, no campaign" — the
      // event route, which redirects away when the campaign is gone — would otherwise bounce the visitor
      // off the page on every cold load, then let the campaign appear behind them.
      vi.stubGlobal('fetch', hangingFlag())

      const { result } = renderHook(() => useCampaign(), { wrapper })

      expect(result.current.isPending).toBe(true)
      expect(result.current.campaign).toBeUndefined()
    })
  })

  describe('when the flag resolves off', () => {
    it('should settle with no campaign and never call the cms', async () => {
      vi.stubGlobal('fetch', flagResponse({ [FLAG_KEY]: false }))

      const { result } = renderHook(() => useCampaign(), { wrapper })

      await waitFor(() => expect(result.current.isPending).toBe(false))
      expect(result.current.campaign).toBeUndefined()
      expect(fetchCampaign).not.toHaveBeenCalled()
    })
  })

  describe('when the flag resolves on', () => {
    it('should expose the campaign once the cms answers', async () => {
      vi.stubGlobal('fetch', flagResponse({ [FLAG_KEY]: true }))
      fetchCampaign.mockResolvedValue(aCampaign())

      const { result } = renderHook(() => useCampaign(), { wrapper })

      await waitFor(() => expect(result.current.campaign?.mainTag).toBe('halloween'))
      expect(result.current.isPending).toBe(false)
      expect(result.current.isError).toBe(false)
    })

    it('should stay pending while the cms read is in flight', async () => {
      vi.stubGlobal('fetch', flagResponse({ [FLAG_KEY]: true }))
      fetchCampaign.mockReturnValue(new Promise(() => {}))

      const { result } = renderHook(() => useCampaign(), { wrapper })

      await waitFor(() => expect(fetchCampaign).toHaveBeenCalled())
      expect(result.current.isPending).toBe(true)
    })

    it('should report an unreachable cms as an error, not as an absent campaign', async () => {
      vi.stubGlobal('fetch', flagResponse({ [FLAG_KEY]: true }))
      fetchCampaign.mockRejectedValue(new Error('contentful 503'))

      const { result } = renderHook(() => useCampaign(), { wrapper })

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.campaign).toBeUndefined()
      expect(result.current.isPending).toBe(false)
    })
  })

  describe('when the variant restricts the event to a few accounts', () => {
    it('should show the event to an account on the list', async () => {
      vi.stubGlobal('fetch', flagResponse({ [FLAG_KEY]: true }, `halloween:${ALICE},${BOB}`))
      fetchCampaign.mockResolvedValue(aCampaign())
      signedInAs(BOB)

      const { result } = renderHook(() => useCampaign(), { wrapper })

      await waitFor(() => expect(result.current.campaign?.mainTag).toBe('halloween'))
    })

    it('should match an account whose address is checksummed rather than lowercase', async () => {
      vi.stubGlobal('fetch', flagResponse({ [FLAG_KEY]: true }, `halloween:${ALICE}`))
      fetchCampaign.mockResolvedValue(aCampaign())
      signedInAs(ALICE.toUpperCase().replace('0X', '0x'))

      const { result } = renderHook(() => useCampaign(), { wrapper })

      await waitFor(() => expect(result.current.campaign?.mainTag).toBe('halloween'))
    })

    it('should hide the event from an account that is not on the list', async () => {
      vi.stubGlobal('fetch', flagResponse({ [FLAG_KEY]: true }, `halloween:${ALICE}`))
      signedInAs(BOB)

      const { result } = renderHook(() => useCampaign(), { wrapper })

      await waitFor(() => expect(result.current.isPending).toBe(false))
      expect(result.current.campaign).toBeUndefined()
      expect(fetchCampaign).not.toHaveBeenCalled()
    })

    it('should hide the event from a visitor who is not signed in', async () => {
      vi.stubGlobal('fetch', flagResponse({ [FLAG_KEY]: true }, `halloween:${ALICE}`))
      fetchCampaign.mockResolvedValue(aCampaign())
      signedInAs(null)

      const { result } = renderHook(() => useCampaign(), { wrapper })

      await waitFor(() => expect(result.current.isPending).toBe(false))
      expect(result.current.campaign).toBeUndefined()
      expect(fetchCampaign).not.toHaveBeenCalled()
    })

    it('should resolve once the session restores, and let a listed account in', async () => {
      // The transition is the whole point of the gate; asserting only the pending state would pass even if
      // the answer never arrived.
      vi.stubGlobal('fetch', flagResponse({ [FLAG_KEY]: true }, `halloween:${ALICE}`))
      fetchCampaign.mockResolvedValue(aCampaign())

      const { result } = renderHook(() => useCampaign(), { wrapper })

      await waitFor(() => expect(fetch).toHaveBeenCalled())
      expect(result.current.isPending).toBe(true)

      act(() => signedInAs(ALICE))

      await waitFor(() => expect(result.current.campaign?.mainTag).toBe('halloween'))
    })

    it('should settle with no event once the session restores to nobody', async () => {
      vi.stubGlobal('fetch', flagResponse({ [FLAG_KEY]: true }, `halloween:${ALICE}`))

      const { result } = renderHook(() => useCampaign(), { wrapper })

      await waitFor(() => expect(fetch).toHaveBeenCalled())
      act(() => signedInAs(null))

      await waitFor(() => expect(result.current.isPending).toBe(false))
      expect(result.current.campaign).toBeUndefined()
    })

    it('should hide the event from everyone when the list was attempted and matches nobody', async () => {
      // A truncated address is the realistic mistake, and the dangerous reading of it is "no list at all".
      vi.stubGlobal('fetch', flagResponse({ [FLAG_KEY]: true }, 'halloween:0x1111'))
      signedInAs(ALICE)

      const { result } = renderHook(() => useCampaign(), { wrapper })

      await waitFor(() => expect(result.current.isPending).toBe(false))
      expect(result.current.campaign).toBeUndefined()
      expect(fetchCampaign).not.toHaveBeenCalled()
    })

    it('should not wait on the wallet when the payload restricts nobody', async () => {
      // An unrestricted event has no question for the session, so it must not inherit the gate's latency.
      vi.stubGlobal('fetch', flagResponse({ [FLAG_KEY]: true }, 'halloween'))
      fetchCampaign.mockResolvedValue(aCampaign())
      useWallet.setState({ session: null, restored: false })

      const { result } = renderHook(() => useCampaign(), { wrapper })

      await waitFor(() => expect(result.current.campaign?.mainTag).toBe('halloween'))
    })

    it('should keep the skin off an account that is not on the list', async () => {
      // The leak this feature must not have: the CMS tag alone would paint the whole Shop orange for a
      // visitor who is not supposed to know the event exists.
      vi.stubGlobal('fetch', flagResponse({ [FLAG_KEY]: true }, `halloween:${ALICE}`))
      fetchCampaign.mockResolvedValue(aCampaign())
      signedInAs(BOB)

      const { result } = renderHook(() => ({ campaign: useCampaign(), theme: useCampaignTheme() }), { wrapper })

      await waitFor(() => expect(result.current.campaign.isPending).toBe(false))
      expect(result.current.theme).toBeNull()
    })

    it('should wear the skin for an account that is on the list', async () => {
      vi.stubGlobal('fetch', flagResponse({ [FLAG_KEY]: true }, `halloween:${ALICE}`))
      fetchCampaign.mockResolvedValue(aCampaign())
      signedInAs(ALICE)

      const { result } = renderHook(() => useCampaignTheme(), { wrapper })

      await waitFor(() => expect(result.current).toBe('halloween'))
    })

    it('should stay pending until the session has been restored', async () => {
      // Answering "no event" from a half-restored session would show the ordinary Shop to a reviewer on
      // the list for a beat, then swap the event in underneath them.
      vi.stubGlobal('fetch', flagResponse({ [FLAG_KEY]: true }, `halloween:${ALICE}`))
      useWallet.setState({ session: null, restored: false })

      const { result } = renderHook(() => useCampaign(), { wrapper })

      await waitFor(() => expect(fetch).toHaveBeenCalled())
      expect(result.current.isPending).toBe(true)
    })

    it('should show the event to everyone when the payload names no account', async () => {
      // The shape every campaign to date shipped with: a theme and nothing else restricts nobody.
      vi.stubGlobal('fetch', flagResponse({ [FLAG_KEY]: true }, 'halloween'))
      fetchCampaign.mockResolvedValue(aCampaign())
      signedInAs(null)

      const { result } = renderHook(() => useCampaign(), { wrapper })

      await waitFor(() => expect(result.current.campaign?.mainTag).toBe('halloween'))
    })

    it('should ignore a list left behind on a flag that was turned off', async () => {
      vi.stubGlobal('fetch', flagResponse({ [FLAG_KEY]: false }, `halloween:${ALICE}`))
      signedInAs(ALICE)

      const { result } = renderHook(() => useCampaign(), { wrapper })

      await waitFor(() => expect(result.current.isPending).toBe(false))
      expect(result.current.campaign).toBeUndefined()
    })
  })

  describe('when the flag read itself rejects', () => {
    it('should settle with no campaign rather than report itself pending forever', async () => {
      // A rejection that never clears leaves `/event` neither rendering nor redirecting, so the visitor
      // sits on a spinner. Unreachable through the real accessor, which fails closed on its own; pinned so
      // the direction does not quietly depend on that.
      flagReadRejects = true
      vi.stubGlobal('fetch', hangingFlag())

      const { result } = renderHook(() => useCampaign(), { wrapper })

      await waitFor(() => expect(result.current.isPending).toBe(false))
      expect(result.current.campaign).toBeUndefined()
    })
  })

  describe('when the environment has no cms configured', () => {
    it('should settle immediately with no campaign', async () => {
      // Nothing to wait for: no admin entry means no event, and that is known without a request.
      configured = false
      vi.stubGlobal('fetch', hangingFlag())

      const { result } = renderHook(() => useCampaign(), { wrapper })

      expect(result.current.isPending).toBe(false)
      expect(result.current.campaign).toBeUndefined()
      await waitFor(() => expect(fetchCampaign).not.toHaveBeenCalled())
    })
  })
})
