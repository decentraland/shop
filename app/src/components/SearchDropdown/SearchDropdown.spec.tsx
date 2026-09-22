import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ~/lib/collections pulls decentraland-transactions transitively (via the CollectionThumb in the
// styles), which doesn't resolve under vitest — stub the seam.
vi.mock('~/lib/collections', () => ({
  fetchCatalogItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  fetchCollectionItems: vi.fn().mockResolvedValue({ items: [], total: 0 })
}))
vi.mock('~/lib/search', () => ({
  fetchCollectionSuggestions: vi.fn().mockResolvedValue([]),
  fetchCreatorSuggestions: vi.fn().mockResolvedValue([])
}))
vi.mock('~/hooks/useProfile', () => ({ useProfile: () => ({ data: undefined }) }))
const useManaRate = vi.fn(() => ({ data: undefined }))
vi.mock('~/hooks/useManaRate', () => ({ useManaRate: () => useManaRate() }))

import { SearchDropdown } from '~/components/SearchDropdown'
import { fetchCatalogItems } from '~/lib/collections'

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
  await waitFor(() => expect(fetchCatalogItems).toHaveBeenCalled())
  return vi.mocked(fetchCatalogItems).mock.calls.at(-1)![0]
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SearchDropdown suggestions', () => {
  it('should query the same feed and filter set the results grid lands on: the whole catalogue, by relevance', async () => {
    renderDropdown('chapeau')
    // No status or listing-type narrowing: a search opens the grid on All (see pages/Assets), and a
    // suggestion drawn from a narrower feed could name an item the grid then ranks elsewhere — or count
    // fewer results than the grid shows.
    expect(await lastSuggestCall()).toEqual({ search: 'chapeau', first: 5, sortBy: 'relevance' })
  })

  it('should not hit the API for a single character', () => {
    renderDropdown('c')
    expect(fetchCatalogItems).not.toHaveBeenCalled()
  })

  it('should show recent searches instead of results for an empty query', () => {
    renderDropdown('')
    expect(fetchCatalogItems).not.toHaveBeenCalled()
    expect(screen.queryByTestId('search-pop')).not.toBeInTheDocument()
  })

  it('should offer to see all results with the total the grid will then report', async () => {
    vi.mocked(fetchCatalogItems).mockResolvedValue({
      items: [{ id: 'a', name: 'Galaxy Hat', creator: '', contractAddress: '0xabc', itemId: '0', thumbnail: '' }],
      total: 542
    } as never)

    renderDropdown('galaxy')

    expect(await screen.findByTestId('search-see-all')).toHaveTextContent('542')
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
    vi.mocked(fetchCatalogItems).mockResolvedValue({
      items: [
        {
          id: '0xabc-0',
          contractAddress: '0xabc',
          itemId: '0',
          name: 'Galaxy Hat',
          thumbnail: '',
          rarity: 'epic',
          category: 'wearable',
          wearableCategory: 'hat',
          creator: '0xcreator',
          priceCredits: 270,
          network: 'MATIC',
          chainId: 80002
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

    await waitFor(() => expect(fetchCatalogItems).toHaveBeenCalled())
    expect(useManaRate).not.toHaveBeenCalled()
  })
})
