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
const EMPTY = { items: [], total: 0, collections: [], creators: [] }
vi.mock('~/lib/search', () => ({
  fetchSuggestions: vi.fn().mockResolvedValue({ items: [], total: 0, collections: [], creators: [] })
}))
const useManaRate = vi.fn(() => ({ data: undefined }))
vi.mock('~/hooks/useManaRate', () => ({ useManaRate: () => useManaRate() }))

import { SearchDropdown } from '~/components/SearchDropdown'
import { fetchSuggestions } from '~/lib/search'

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
  await waitFor(() => expect(fetchSuggestions).toHaveBeenCalled())
  return vi.mocked(fetchSuggestions).mock.calls.at(-1)!
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchSuggestions).mockResolvedValue(EMPTY)
})

describe('SearchDropdown suggestions', () => {
  it('should ask for the three sections in one request, sized for a preview', async () => {
    renderDropdown('chapeau')
    // One call per keystroke: items (the grid's own feed and ranking, so a suggestion is never something
    // the results page then hides), collections and creators together, no profile lookups — and abortable.
    const call = await lastSuggestCall()
    expect(call.slice(0, 2)).toEqual(['chapeau', { items: 5, collections: 4, creators: 4 }])
    expect(call[2]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('should not hit the API for a single character', () => {
    renderDropdown('c')
    expect(fetchSuggestions).not.toHaveBeenCalled()
  })

  it('should show recent searches instead of results for an empty query', () => {
    renderDropdown('')
    expect(fetchSuggestions).not.toHaveBeenCalled()
    expect(screen.queryByTestId('search-pop')).not.toBeInTheDocument()
  })

  it('should offer to see all results with the total the grid will then report', async () => {
    vi.mocked(fetchSuggestions).mockResolvedValue({
      ...EMPTY,
      items: [
        {
          id: 'a',
          name: 'Galaxy Hat',
          creator: '',
          creatorName: null,
          contractAddress: '0xabc',
          itemId: '0',
          thumbnail: ''
        }
      ],
      total: 542
    } as never)

    renderDropdown('galaxy')

    expect(await screen.findByTestId('search-see-all')).toHaveTextContent('542')
  })

  it('should name a creator from the suggestions, and fall back to a short address for an unnamed one', async () => {
    vi.mocked(fetchSuggestions).mockResolvedValue({
      ...EMPTY,
      items: [
        {
          id: 'a',
          name: 'Galaxy Hat',
          creator: '0x1111111111111111111111111111111111111111',
          creatorName: 'Galaxy Studio',
          contractAddress: '0xabc',
          itemId: '0',
          thumbnail: ''
        },
        {
          id: 'b',
          name: 'Plain Hat',
          creator: '0x2222222222222222222222222222222222222222',
          creatorName: null,
          contractAddress: '0xabc',
          itemId: '1',
          thumbnail: ''
        }
      ],
      total: 2
    } as never)

    renderDropdown('hat')

    expect(await screen.findByText(/Galaxy Studio/)).toBeInTheDocument()
    expect(screen.getByText(/0x2222…2222/)).toBeInTheDocument()
  })
})

describe('SearchDropdown failures', () => {
  const hat = {
    id: 'a',
    name: 'Galaxy Hat',
    creator: '',
    creatorName: null,
    contractAddress: '0xabc',
    itemId: '0',
    thumbnail: ''
  }
  const visor = {
    id: 'b',
    name: 'Galaxy Visor',
    creator: '',
    creatorName: null,
    contractAddress: '0xabc',
    itemId: '1',
    thumbnail: ''
  }

  it('should say the suggestions could not load and offer a retry, never "no results", when the request fails', async () => {
    // The request retries once on its own before the panel gives up, so two failures, then the reader's retry.
    vi.mocked(fetchSuggestions)
      .mockRejectedValueOnce(new Error('fetchSuggestions 500'))
      .mockRejectedValueOnce(new Error('fetchSuggestions 500'))
      .mockResolvedValueOnce({ ...EMPTY, items: [hat], total: 1 } as never)

    renderDropdown('galaxy')

    expect(await screen.findByTestId('search-error', {}, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.queryByText(/No results/)).not.toBeInTheDocument()

    screen.getByTestId('search-retry').click()

    expect(await screen.findByTitle('Galaxy Hat')).toBeInTheDocument()
    expect(screen.queryByTestId('search-error')).not.toBeInTheDocument()
  })

  it('should report no results only for an answer that came back empty', async () => {
    renderDropdown('zzz')

    // once in the panel and once in the live region that reads it out
    expect(await screen.findAllByText(/No results/)).not.toHaveLength(0)
    expect(screen.queryByTestId('search-error')).not.toBeInTheDocument()
  })

  it('should hand the request its abort signal and never let a slow older answer replace a newer one', async () => {
    let resolveOld: (value: unknown) => void = () => undefined
    vi.mocked(fetchSuggestions).mockImplementationOnce(() => new Promise(resolve => (resolveOld = resolve)) as never)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const dropdown = (query: string) => (
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
    const { rerender } = render(dropdown('gal'))
    await waitFor(() => expect(fetchSuggestions).toHaveBeenCalledTimes(1))
    expect(vi.mocked(fetchSuggestions).mock.calls[0][2]?.signal).toBeInstanceOf(AbortSignal)

    vi.mocked(fetchSuggestions).mockResolvedValueOnce({ ...EMPTY, items: [visor], total: 1 } as never)
    rerender(dropdown('galaxy'))
    expect(await screen.findByTitle('Galaxy Visor')).toBeInTheDocument()

    // the older answer arrives late: the newer query's rows stay
    resolveOld({ ...EMPTY, items: [hat], total: 1 })
    await new Promise(r => setTimeout(r, 20))
    expect(screen.getByTitle('Galaxy Visor')).toBeInTheDocument()
    expect(screen.queryByTitle('Galaxy Hat')).not.toBeInTheDocument()
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
    vi.mocked(fetchSuggestions).mockResolvedValue({
      ...EMPTY,
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
          creatorName: null,
          priceCredits: 270,
          network: 'MATIC',
          chainId: 80002
        }
      ],
      total: 1
    } as never)

    renderDropdown('galaxy')

    // The name is split into marked and plain segments, so it is found by its title rather than its text.
    expect(await screen.findByTitle('Galaxy Hat')).toBeInTheDocument()
    // the number the row still carries must not reach the DOM
    expect(screen.queryByText('270')).not.toBeInTheDocument()
  })

  it('should not read the mana oracle at all, keeping the eager navbar chunk free of it', async () => {
    renderDropdown('galaxy')

    await waitFor(() => expect(fetchSuggestions).toHaveBeenCalled())
    expect(useManaRate).not.toHaveBeenCalled()
  })
})
