import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ContentfulLocale } from '@dcl/schemas'

import { resetFeatureFlagsCache } from '~/lib/featureFlags'
import type { Campaign } from '~/lib/contentful'

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

const FLAG_KEY = 'dapps-shop-campaign'

function wrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const flagResponse = (flags: Record<string, boolean>) =>
  vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ flags }) })

/** A flag request that never settles, so the "flag still in flight" window can be asserted on. */
const hangingFlag = () => vi.fn().mockReturnValue(new Promise(() => {}))

const aCampaign = (): Campaign => ({
  name: 'Halloween 2026',
  tabName: { [ContentfulLocale.enUS]: 'Halloween' },
  mainTag: 'halloween',
  tags: ['halloween'],
  banners: {},
  assets: {}
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetFeatureFlagsCache()
  fetchCampaign.mockReset()
  configured = true
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
