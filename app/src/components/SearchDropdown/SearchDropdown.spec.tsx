import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ~/lib/collections pulls decentraland-transactions transitively (via the CollectionThumb in the
// styles), which doesn't resolve under vitest — stub the seam.
vi.mock('~/lib/api', () => ({ fetchShopItems: vi.fn().mockResolvedValue({ items: [], total: 0 }) }))
vi.mock('~/lib/collections', () => ({ fetchCollectionItems: vi.fn().mockResolvedValue({ items: [], total: 0 }) }))
vi.mock('~/lib/search', () => ({
  fetchCollectionSuggestions: vi.fn().mockResolvedValue([]),
  fetchCreatorSuggestions: vi.fn().mockResolvedValue([])
}))
vi.mock('~/hooks/useProfile', () => ({ useProfile: () => ({ data: undefined }) }))
const useManaRate = vi.fn(() => ({ data: undefined }))
vi.mock('~/hooks/useManaRate', () => ({ useManaRate: () => useManaRate() }))

const secondarySales = vi.fn(() => false)
vi.mock('~/hooks/useSecondarySales', () => ({ useSecondarySales: () => secondarySales() }))

import { SearchDropdown } from '~/components/SearchDropdown'
import { fetchShopItems } from '~/lib/api'

function renderDropdown(query: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <SearchDropdown
          query={query}
          recent={[]}
          onSelectItem={vi.fn()}
          onSelectCollection={vi.fn()}
          onSelectCreator={vi.fn()}
          onRunSearch={vi.fn()}
          onRemoveRecent={vi.fn()}
          onClearRecent={vi.fn()}
        />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

async function lastSuggestCall() {
  await waitFor(() => expect(fetchShopItems).toHaveBeenCalled())
  return vi.mocked(fetchShopItems).mock.calls.at(-1)![0]
}

beforeEach(() => {
  vi.clearAllMocks()
  secondarySales.mockReturnValue(false)
})

describe('SearchDropdown suggestions', () => {
  it('should query the same feed and filter set the results grid lands on', async () => {
    renderDropdown('chapeau')
    expect(await lastSuggestCall()).toMatchObject({
      search: 'chapeau',
      onSale: true,
      listingType: 'primary'
    })
  })

  it('should stop restricting to mints once resales are enabled, matching the grid', async () => {
    secondarySales.mockReturnValue(true)
    renderDropdown('chapeau')
    expect(await lastSuggestCall()).toMatchObject({ onSale: true, listingType: undefined })
  })

  it('should not hit the API for a single character', () => {
    renderDropdown('c')
    expect(fetchShopItems).not.toHaveBeenCalled()
  })

  it('should show recent searches instead of results for an empty query', () => {
    renderDropdown('')
    expect(fetchShopItems).not.toHaveBeenCalled()
    expect(screen.queryByTestId('search-pop')).not.toBeInTheDocument()
  })
})

/**
 * The suggestions list prices nothing at all.
 *
 * It used to show a credit price per row, and rendered the cell empty whenever there wasn't one — a
 * legacy row with the oracle down, and every row without primary liquidity once those reach the feed.
 * A list where some rows carry a price and others silently don't reads as broken rather than as
 * "this one has no price", so the price belongs on the PDP, where there is room to say why.
 */
describe('SearchDropdown pricing', () => {
  it('should not price a suggestion, even when the row carries one', async () => {
    vi.mocked(fetchShopItems).mockResolvedValue({
      items: [
        {
          tradeId: 'trade-1',
          listingType: 'primary',
          contractAddress: '0xabc',
          itemId: '0',
          tokenId: null,
          name: 'Galaxy Hat',
          thumbnail: '',
          rarity: 'epic',
          category: 'wearable',
          wearableCategory: 'hat',
          creator: '0xcreator',
          priceCredits: 270,
          available: 10,
          network: 'MATIC',
          chainId: 80002,
          source: 'native',
          manaWei: null,
          listingCount: 1
        }
      ],
      total: 1
    } as never)

    renderDropdown('galaxy')

    expect(await screen.findByText('Galaxy Hat')).toBeInTheDocument()
    // the number the row still carries must not reach the DOM
    expect(screen.queryByText('270')).not.toBeInTheDocument()
  })

  it('should not read the mana oracle at all, keeping the eager navbar chunk free of it', async () => {
    renderDropdown('galaxy')

    await waitFor(() => expect(fetchShopItems).toHaveBeenCalled())
    expect(useManaRate).not.toHaveBeenCalled()
  })
})
