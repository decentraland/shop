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
vi.mock('~/hooks/useManaRate', () => ({ useManaRate: () => ({ data: undefined }) }))

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
