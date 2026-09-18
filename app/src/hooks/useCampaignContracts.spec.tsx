import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const fetchCampaignContracts = vi.fn()
vi.mock('~/lib/campaign', () => ({
  fetchCampaignContracts: (tags: string[]) => fetchCampaignContracts(tags) as Promise<string[]>
}))

import { useCampaignContracts } from './useCampaignContracts'

const A = '0xabc0000000000000000000000000000000000001'

function wrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

afterEach(() => {
  fetchCampaignContracts.mockReset()
})

describe('useCampaignContracts', () => {
  describe('when the campaign has tags', () => {
    it('should resolve them to collection addresses', async () => {
      fetchCampaignContracts.mockResolvedValue([A])

      const { result } = renderHook(() => useCampaignContracts(['halloween']), { wrapper })

      await waitFor(() => expect(result.current.contracts).toEqual([A]))
      expect(result.current.isPending).toBe(false)
    })

    it('should be pending before the answer arrives', () => {
      // The distinction the whole hook exists for: an empty list is only an answer once this is false.
      // A caller that cannot tell the two apart either flashes an empty state on every load or issues an
      // unfiltered catalogue request and presents the entire Shop as the event.
      fetchCampaignContracts.mockReturnValue(new Promise(() => {}))

      const { result } = renderHook(() => useCampaignContracts(['halloween']), { wrapper })

      expect(result.current.isPending).toBe(true)
      expect(result.current.contracts).toEqual([])
    })

    it('should share one cache entry across orderings of the same tags', async () => {
      fetchCampaignContracts.mockResolvedValue([A])
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      const sharedWrapper = ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      )

      const first = renderHook(() => useCampaignContracts(['halloween', 'spooky']), { wrapper: sharedWrapper })
      await waitFor(() => expect(first.result.current.contracts).toEqual([A]))
      renderHook(() => useCampaignContracts(['spooky', 'halloween']), { wrapper: sharedWrapper })

      await waitFor(() => expect(fetchCampaignContracts).toHaveBeenCalledTimes(1))
    })
  })

  describe('and the campaign also names collections outright', () => {
    const NAMED = '0xdef0000000000000000000000000000000000002'

    it('should select the tagged ones and the named ones together', async () => {
      fetchCampaignContracts.mockResolvedValue([A])

      const { result } = renderHook(() => useCampaignContracts(['halloween'], [NAMED]), { wrapper })

      await waitFor(() => expect(result.current.contracts).toEqual([A, NAMED]))
    })

    it('should not repeat a collection that is both tagged and named', async () => {
      fetchCampaignContracts.mockResolvedValue([A])

      const { result } = renderHook(() => useCampaignContracts(['halloween'], [A]), { wrapper })

      await waitFor(() => expect(result.current.contracts).toEqual([A]))
    })

    it('should settle on the named ones alone when there is no tag to resolve', () => {
      // Nothing to wait for: the builder is only asked about tags.
      const { result } = renderHook(() => useCampaignContracts([], [NAMED]), { wrapper })

      expect(result.current.contracts).toEqual([NAMED])
      expect(result.current.isPending).toBe(false)
      expect(fetchCampaignContracts).not.toHaveBeenCalled()
    })
  })

  describe('when the campaign has no tags', () => {
    it('should settle empty without asking the builder', () => {
      const { result } = renderHook(() => useCampaignContracts([]), { wrapper })

      expect(result.current.contracts).toEqual([])
      expect(result.current.isPending).toBe(false)
      expect(fetchCampaignContracts).not.toHaveBeenCalled()
    })
  })

  describe('when the builder is unreachable', () => {
    it('should report the error rather than passing an empty event off as an answer', async () => {
      fetchCampaignContracts.mockRejectedValue(new Error('fetchCampaignContracts 503'))

      const { result } = renderHook(() => useCampaignContracts(['halloween']), { wrapper })

      await waitFor(() => expect(result.current.isError).toBe(true))
      // Still empty, which is the safe direction — an empty grid, never an unfiltered one.
      expect(result.current.contracts).toEqual([])
    })
  })
})
