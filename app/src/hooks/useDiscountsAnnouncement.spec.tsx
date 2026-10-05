import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '~/lib/auth'
import type { PublishableItem } from '~/lib/builder'
import type { CollectionSaleState } from '~/lib/collections'
import { useWallet } from '~/store/wallet'
import { DISCOUNTS_ANNOUNCEMENT_PROMPT, dismissPrompt, isPromptDismissed } from '~/lib/dismissed-prompts'

const flagOn = vi.fn()
const creator = vi.fn()
const storeOpen = vi.fn()
const fetchPublishableItems = vi.fn()
const fetchCollectionSaleState = vi.fn()
const fetchSalesSummary = vi.fn()

vi.mock('~/hooks/useCreatorSalesEnabled', () => ({ useCreatorSalesEnabled: () => flagOn() }))
vi.mock('~/hooks/useIsCreator', () => ({ useIsCreator: (address?: string) => !!address && creator() }))
vi.mock('~/hooks/useMyStoreEnabled', () => ({ useMyStoreEnabled: () => storeOpen() }))
vi.mock('~/lib/builder', () => ({ fetchPublishableItems: (...args: unknown[]) => fetchPublishableItems(...args) }))
vi.mock('~/lib/collections', () => ({
  fetchCollectionSaleState: (...args: unknown[]) => fetchCollectionSaleState(...args)
}))
vi.mock('~/lib/sales', () => ({ fetchSalesSummary: (...args: unknown[]) => fetchSalesSummary(...args) }))

import { useDiscountsAnnouncement } from './useDiscountsAnnouncement'

const ADDRESS = '0x' + 'cc'.repeat(20)
const session = { address: ADDRESS, identity: {} } as unknown as Session

const item = (contractAddress: string, blockchainItemId: string): PublishableItem =>
  ({
    id: `${contractAddress}-${blockchainItemId}`,
    collectionId: contractAddress,
    collectionName: `Collection ${contractAddress}`,
    contractAddress,
    blockchainItemId,
    name: `Item ${blockchainItemId}`,
    thumbnail: '',
    remainingSupply: 10
  }) as PublishableItem

const listed = (priceCredits: number): CollectionSaleState => ({ isOnSale: true, priceCredits })

function wrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  localStorage.clear()
  useWallet.setState({ session })
  flagOn.mockReturnValue(true)
  creator.mockReturnValue(true)
  storeOpen.mockReturnValue(true)
  fetchPublishableItems.mockResolvedValue([item('0xaa', '0'), item('0xbb', '0')])
  fetchCollectionSaleState.mockImplementation((ca: string) => Promise.resolve({ '0': listed(ca === '0xaa' ? 40 : 20) }))
  fetchSalesSummary.mockResolvedValue({ byCollection: [{ contractAddress: '0xBB', sold: 3, earnedWei: '0' }] })
})

afterEach(() => {
  vi.clearAllMocks()
  useWallet.setState({ session: null })
})

describe('when a creator with collections in Credits has not seen the announcement', () => {
  it('should announce with the collection that sold the most recently', async () => {
    const { result } = renderHook(() => useDiscountsAnnouncement('/overview'), { wrapper })
    await waitFor(() => expect(result.current.collection?.contractAddress).toBe('0xbb'))
  })

  it('should fall back to the listed items when the recent sales cannot be read', async () => {
    fetchSalesSummary.mockRejectedValue(new Error('down'))
    const { result } = renderHook(() => useDiscountsAnnouncement('/overview'), { wrapper })
    await waitFor(() => expect(result.current.collection).not.toBeNull())
  })

  it.each(['/my-items', '/cart', '/my-purchases', '/success'])(
    'should stay quiet, and read nothing, on %s',
    pathname => {
      const { result } = renderHook(() => useDiscountsAnnouncement(pathname), { wrapper })
      expect(result.current.collection).toBeNull()
      expect(fetchPublishableItems).not.toHaveBeenCalled()
      expect(fetchSalesSummary).not.toHaveBeenCalled()
    }
  )

  it('should wait while another dialog is open rather than stack on it', async () => {
    const other = document.createElement('div')
    other.setAttribute('role', 'dialog')
    other.setAttribute('aria-modal', 'true')
    document.body.append(other)
    const { result } = renderHook(() => useDiscountsAnnouncement('/overview'), { wrapper })
    await waitFor(() => expect(fetchSalesSummary).toHaveBeenCalled())
    await waitFor(() => expect(fetchCollectionSaleState).toHaveBeenCalled())
    expect(result.current.collection).toBeNull()
    act(() => other.remove())
    await waitFor(() => expect(result.current.collection).not.toBeNull())
  })

  it('should open on an item page as on any browsing page', async () => {
    const { result } = renderHook(() => useDiscountsAnnouncement('/item/0xaa/0'), { wrapper })
    await waitFor(() => expect(result.current.collection).not.toBeNull())
  })

  it('should put it away for the visit without spending it', async () => {
    const { result } = renderHook(() => useDiscountsAnnouncement('/overview'), { wrapper })
    await waitFor(() => expect(result.current.collection).not.toBeNull())
    act(() => result.current.hide())
    expect(result.current.collection).toBeNull()
    expect(isPromptDismissed(DISCOUNTS_ANNOUNCEMENT_PROMPT, ADDRESS)).toBe(false)
  })

  it('should not come back once dismissed, for this account', async () => {
    const { result } = renderHook(() => useDiscountsAnnouncement('/overview'), { wrapper })
    await waitFor(() => expect(result.current.collection).not.toBeNull())
    act(() => result.current.dismiss())
    expect(result.current.collection).toBeNull()
    expect(isPromptDismissed(DISCOUNTS_ANNOUNCEMENT_PROMPT, ADDRESS)).toBe(true)
  })
})

describe('when the account could not be shown the announcement', () => {
  it('should fetch nothing while the flag is off', () => {
    flagOn.mockReturnValue(false)
    const { result } = renderHook(() => useDiscountsAnnouncement('/overview'), { wrapper })
    expect(result.current.collection).toBeNull()
    expect(fetchPublishableItems).not.toHaveBeenCalled()
  })

  it('should fetch nothing when the account cannot open the store the call to action leads to', () => {
    storeOpen.mockReturnValue(false)
    const { result } = renderHook(() => useDiscountsAnnouncement('/overview'), { wrapper })
    expect(result.current.collection).toBeNull()
    expect(fetchPublishableItems).not.toHaveBeenCalled()
  })

  it('should fetch nothing for an account that has published no collection', () => {
    creator.mockReturnValue(false)
    renderHook(() => useDiscountsAnnouncement('/overview'), { wrapper })
    expect(fetchPublishableItems).not.toHaveBeenCalled()
  })

  it('should fetch nothing once the account has dismissed it', () => {
    dismissPrompt(DISCOUNTS_ANNOUNCEMENT_PROMPT, ADDRESS)
    renderHook(() => useDiscountsAnnouncement('/overview'), { wrapper })
    expect(fetchPublishableItems).not.toHaveBeenCalled()
  })

  it('should announce nothing when no collection is priced in Credits', async () => {
    fetchCollectionSaleState.mockResolvedValue({ '0': { isOnSale: true, priceCredits: 20, manaWei: '1' } })
    const { result } = renderHook(() => useDiscountsAnnouncement('/overview'), { wrapper })
    await waitFor(() => expect(fetchSalesSummary).toHaveBeenCalled())
    await waitFor(() => expect(fetchCollectionSaleState).toHaveBeenCalled())
    expect(result.current.collection).toBeNull()
  })
})
