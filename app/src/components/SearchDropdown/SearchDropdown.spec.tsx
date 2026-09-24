import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
vi.mock('~/lib/analytics', () => ({ track: vi.fn() }))

import { SearchDropdown } from '~/components/SearchDropdown'
import { fetchSuggestions } from '~/lib/search'
import { track } from '~/lib/analytics'
import type { SuggestionRow } from '~/lib/suggestionNavigation'

type Handlers = Partial<React.ComponentProps<typeof SearchDropdown>>

function dropdownIn(qc: QueryClient, query: string, handlers: Handlers = {}) {
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <SearchDropdown
          query={query}
          recent={[]}
          onSelectItem={vi.fn()}
          onSelectCollection={vi.fn()}
          onSelectCreator={vi.fn()}
          onSelectFacet={vi.fn()}
          onRunSearch={vi.fn()}
          onRemoveRecent={vi.fn()}
          onClearRecent={vi.fn()}
          {...handlers}
        />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function renderDropdown(query: string, handlers: Handlers = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(dropdownIn(qc, query, handlers))
  return {
    ...view,
    qc,
    rerenderWith: (next: string, more: Handlers = {}) => view.rerender(dropdownIn(qc, next, { ...handlers, ...more }))
  }
}

const galaxyHat = {
  id: 'a',
  name: 'Galaxy Hat',
  creator: '0x1111111111111111111111111111111111111111',
  creatorName: 'Galaxy Studio',
  contractAddress: '0xabc',
  itemId: '0',
  thumbnail: ''
}
const galaxyCollection = {
  contractAddress: '0xc0ffee',
  name: 'Galaxy Wear',
  creator: '0x1111111111111111111111111111111111111111',
  creatorName: 'Galaxy Studio',
  items: 3,
  sales: 1
}
const galaxyStudio = { address: '0x1111111111111111111111111111111111111111', name: 'Galaxy Studio', face: '' }
const galaxy = { items: [galaxyHat], total: 12, collections: [galaxyCollection], creators: [galaxyStudio] }

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

  it('should show recent and popular searches instead of results for an empty query', () => {
    renderDropdown('')
    expect(fetchSuggestions).not.toHaveBeenCalled()
    expect(screen.queryByTestId('search-pop-row')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('search-popular-row').length).toBeGreaterThan(0)
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
    const { rerenderWith } = renderDropdown('gal')
    await waitFor(() => expect(fetchSuggestions).toHaveBeenCalledTimes(1))
    expect(vi.mocked(fetchSuggestions).mock.calls[0][2]?.signal).toBeInstanceOf(AbortSignal)

    vi.mocked(fetchSuggestions).mockResolvedValueOnce({ ...EMPTY, items: [visor], total: 1 } as never)
    rerenderWith('galaxy')
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

describe('SearchDropdown as the listbox of the search combobox', () => {
  beforeEach(() => {
    vi.mocked(fetchSuggestions).mockResolvedValue(galaxy as never)
  })

  it('should keep every row an option, out of the tab order, in a group per section', async () => {
    renderDropdown('galaxy')

    const options = await screen.findAllByRole('option')
    const listbox = screen.getByRole('listbox')
    expect(listbox).toHaveAttribute('id', 'search-suggestions')
    // item, collection, creator and "See all"
    expect(options).toHaveLength(4)
    for (const option of options) {
      expect(listbox).toContainElement(option)
      expect(option).toHaveAttribute('tabindex', '-1')
      expect(option).toHaveAttribute('aria-selected', 'false')
    }
    expect(screen.getAllByRole('group').map(group => group.getAttribute('aria-labelledby'))).toEqual([
      'search-group-items',
      'search-group-collections',
      'search-group-creators'
    ])
  })

  it('should mark the row the keyboard is on, and only that one', async () => {
    const { rerenderWith } = renderDropdown('galaxy')
    const creatorId = (await screen.findByRole('option', { name: 'Galaxy Studio' })).id

    rerenderWith('galaxy', { activeId: creatorId })

    const marked = screen.getAllByRole('option').filter(option => option.getAttribute('aria-selected') === 'true')
    expect(marked.map(option => option.id)).toEqual([creatorId])
    expect(marked[0]).toHaveAttribute('data-active', 'true')
  })

  it('should report the rows once, in visual order, and not again on a rerender', async () => {
    const onRows = vi.fn()
    const { rerenderWith } = renderDropdown('galaxy', { onRows })

    await screen.findByRole('listbox')
    await waitFor(() =>
      expect(onRows).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ kind: 'see-all' })]))
    )
    const reports = onRows.mock.calls.length
    const rows: SuggestionRow[] = onRows.mock.calls.at(-1)![0]
    expect(rows.map(row => row.kind)).toEqual(['item', 'collection', 'creator', 'see-all'])

    // the parent rerenders for its own reasons: the same list is not news
    rerenderWith('galaxy', { activeId: rows[1].id })
    rerenderWith('galaxy', { activeId: rows[2].id })
    expect(onRows).toHaveBeenCalledTimes(reports)
  })

  it('should tell the parent when the list empties on an error, and keep quiet across a pending answer', async () => {
    const onRows = vi.fn()
    vi.mocked(fetchSuggestions).mockRejectedValue(new Error('fetchSuggestions 500'))
    renderDropdown('galaxy', { onRows })

    await screen.findByTestId('search-error')
    // the pending state and the error both hold no rows: reported once, as the same empty list
    expect(onRows).toHaveBeenCalledTimes(1)
    expect(onRows).toHaveBeenLastCalledWith([])
    // the listbox stays, empty, so the box's aria-controls keeps pointing at something real
    expect(screen.getByRole('listbox')).toBeEmptyDOMElement()
    expect(screen.getByTestId('search-retry')).not.toHaveAttribute('role', 'option')
  })

  it('should hand a chosen row back with its section and position, chosen by click', async () => {
    const onSelectCollection = vi.fn()
    const onRows = vi.fn()
    renderDropdown('galaxy', { onSelectCollection, onRows })

    fireEvent.click(await screen.findByRole('option', { name: /Galaxy Wear/ }))
    expect(onSelectCollection).toHaveBeenCalledWith(galaxyCollection, {
      section: 'collections',
      position: 0,
      via: 'click'
    })

    // and the same row, activated from the keyboard through the reported list
    const rows: SuggestionRow[] = onRows.mock.calls.at(-1)![0]
    rows[1].activate('keyboard')
    expect(onSelectCollection).toHaveBeenLastCalledWith(galaxyCollection, {
      section: 'collections',
      position: 0,
      via: 'keyboard'
    })
  })
})

describe('SearchDropdown with nothing typed', () => {
  it('should list the recent searches, then the popular ones, without repeating a recent one', () => {
    const onRunSearch = vi.fn()
    const onRemoveRecent = vi.fn()
    renderDropdown('', { recent: ['Duck', 'nebula'], onRunSearch, onRemoveRecent })

    expect(fetchSuggestions).not.toHaveBeenCalled()
    const recentRows = screen.getAllByTestId('search-recent-row')
    expect(recentRows.map(row => row.textContent)).toEqual(['Duck', 'nebula'])
    const popular = screen.getAllByTestId('search-popular-row').map(chip => chip.textContent)
    expect(popular).not.toContain('duck')
    expect(popular).toContain('sword')

    // every one of them is an option of the listbox, out of the tab order
    const listbox = screen.getByRole('listbox')
    for (const option of [...recentRows, ...screen.getAllByTestId('search-popular-row')]) {
      expect(listbox).toContainElement(option)
      expect(option).toHaveAttribute('role', 'option')
      expect(option).toHaveAttribute('tabindex', '-1')
    }

    fireEvent.click(screen.getAllByTestId('search-popular-row')[0])
    expect(onRunSearch).toHaveBeenCalledWith('sword')
  })

  it('should keep the removal and clear controls outside the listbox, focusable on their own', () => {
    const onRemoveRecent = vi.fn()
    const onClearRecent = vi.fn()
    renderDropdown('', { recent: ['Duck'], onRemoveRecent, onClearRecent })

    const listbox = screen.getByRole('listbox')
    const remove = screen.getByTestId('search-recent-remove')
    const clear = screen.getByTestId('search-clear-recent')
    expect(listbox).not.toContainElement(remove)
    expect(listbox).not.toContainElement(clear)
    expect(remove).not.toHaveAttribute('tabindex')
    expect(clear).not.toHaveAttribute('tabindex')

    fireEvent.click(remove)
    expect(onRemoveRecent).toHaveBeenCalledWith('Duck')
    fireEvent.click(clear)
    expect(onClearRecent).toHaveBeenCalled()
  })

  it('should show the popular searches to a reader who has searched nothing yet', () => {
    renderDropdown('')
    expect(screen.getByTestId('search-pop')).toBeInTheDocument()
    expect(screen.queryByTestId('search-recent-row')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('search-popular-row').length).toBeGreaterThan(0)
  })
})

describe('SearchDropdown exposure events', () => {
  it('should report a viewed exposure once per query, with the counts and the request time', async () => {
    vi.mocked(fetchSuggestions).mockResolvedValue(galaxy as never)
    const { rerenderWith } = renderDropdown('galaxy')

    await screen.findByRole('listbox')
    await waitFor(() => expect(track).toHaveBeenCalledWith('Shop Viewed Search Suggestions', expect.anything()))
    expect(vi.mocked(track).mock.calls).toHaveLength(1)
    expect(vi.mocked(track).mock.calls[0][1]).toEqual({
      query: 'galaxy',
      item_count: 1,
      collection_count: 1,
      creator_count: 1,
      facet_count: 0,
      total: 12,
      fetch_ms: expect.any(Number),
      cache_hit: false
    })

    // a rerender, and the same query typed with a different case, are the same exposure
    rerenderWith('galaxy', { activeId: 'x' })
    rerenderWith('Galaxy ')
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(track).toHaveBeenCalledTimes(1)
  })

  it('should report no results only when the three sections are empty, and nothing on an error', async () => {
    // the request retries once on its own, so the failure has to hold for two calls
    vi.mocked(fetchSuggestions).mockResolvedValueOnce(EMPTY).mockRejectedValue(new Error('fetchSuggestions 500'))
    const { rerenderWith } = renderDropdown('zzz')

    await waitFor(() => expect(track).toHaveBeenCalledWith('Shop Search No Results', { query: 'zzz', facet_count: 0 }))
    expect(track).toHaveBeenCalledTimes(1)

    rerenderWith('zzzz')
    await screen.findByTestId('search-error', {}, { timeout: 4000 })
    expect(track).toHaveBeenCalledTimes(1)
  })

  it('should not count the previous answer kept on screen while the next one loads', async () => {
    let resolveNext: (value: unknown) => void = () => undefined
    vi.mocked(fetchSuggestions)
      .mockResolvedValueOnce(galaxy as never)
      .mockImplementationOnce(() => new Promise(resolve => (resolveNext = resolve)) as never)
    const { rerenderWith } = renderDropdown('galaxy')
    await waitFor(() => expect(track).toHaveBeenCalledTimes(1))

    rerenderWith('galaxy hat')
    await waitFor(() => expect(fetchSuggestions).toHaveBeenCalledTimes(2))
    // the panel still shows the "galaxy" rows as a placeholder: no exposure for "galaxy hat" yet
    expect(track).toHaveBeenCalledTimes(1)

    resolveNext({ ...galaxy, total: 3 })
    await waitFor(() => expect(track).toHaveBeenCalledTimes(2))
    expect(vi.mocked(track).mock.calls[1]).toEqual([
      'Shop Viewed Search Suggestions',
      expect.objectContaining({ query: 'galaxy hat', total: 3 })
    ])
  })
})

describe('SearchDropdown rows the parent keeps', () => {
  beforeEach(() => {
    vi.mocked(fetchSuggestions).mockResolvedValue(galaxy as never)
  })

  it('should run the handler in force when a kept row is activated after the handler changed', async () => {
    const before = vi.fn()
    const after = vi.fn()
    const onRows = vi.fn()
    const { rerenderWith } = renderDropdown('galaxy', { onSelectCollection: before, onRows })
    await screen.findByRole('listbox')
    await waitFor(() =>
      expect(onRows).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ kind: 'see-all' })]))
    )
    const rows: SuggestionRow[] = onRows.mock.calls.at(-1)![0]
    const reports = onRows.mock.calls.length

    rerenderWith('galaxy', { onSelectCollection: after })
    // the same ids: nothing new to report, and the parent still holds the rows from before
    expect(onRows).toHaveBeenCalledTimes(reports)

    rows[1].activate('keyboard')
    expect(after).toHaveBeenCalledWith(galaxyCollection, { section: 'collections', position: 0, via: 'keyboard' })
    expect(before).not.toHaveBeenCalled()
  })

  it('should hand a kept row the data in force after a refetch that kept the ids', async () => {
    const onSelectCollection = vi.fn()
    const onRows = vi.fn()
    const { qc } = renderDropdown('galaxy', { onSelectCollection, onRows })
    await screen.findByRole('listbox')
    await waitFor(() =>
      expect(onRows).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ kind: 'see-all' })]))
    )
    const rows: SuggestionRow[] = onRows.mock.calls.at(-1)![0]
    const reports = onRows.mock.calls.length

    const grown = { ...galaxyCollection, items: 9 }
    vi.mocked(fetchSuggestions).mockResolvedValue({ ...galaxy, collections: [grown] } as never)
    await qc.refetchQueries()
    await waitFor(() => expect(fetchSuggestions).toHaveBeenCalledTimes(2))
    await screen.findByRole('listbox')
    expect(onRows).toHaveBeenCalledTimes(reports)

    rows[1].activate('keyboard')
    expect(onSelectCollection).toHaveBeenCalledWith(grown, { section: 'collections', position: 0, via: 'keyboard' })
  })

  it('should keep its listbox mounted while loading, when empty, on an error and after recovery', async () => {
    let resolveFirst: (value: unknown) => void = () => undefined
    vi.mocked(fetchSuggestions)
      .mockImplementationOnce(() => new Promise(resolve => (resolveFirst = resolve)) as never)
      .mockRejectedValueOnce(new Error('fetchSuggestions 500'))
      .mockRejectedValueOnce(new Error('fetchSuggestions 500'))
      .mockResolvedValueOnce(galaxy as never)
    const { rerenderWith } = renderDropdown('galaxy')

    // loading
    expect(screen.getByRole('listbox')).toHaveAttribute('id', 'search-suggestions')
    expect(screen.queryAllByRole('option')).toHaveLength(0)

    // a valid empty answer
    resolveFirst(EMPTY)
    await screen.findAllByText(/No results/)
    expect(screen.getByRole('listbox')).toHaveAttribute('id', 'search-suggestions')
    expect(screen.queryAllByRole('option')).toHaveLength(0)

    // an error (the request retries once on its own)
    rerenderWith('galaxy hat')
    await screen.findByTestId('search-error', {}, { timeout: 4000 })
    expect(screen.getByRole('listbox')).toHaveAttribute('id', 'search-suggestions')
    expect(screen.getByTestId('search-retry').closest('[role="listbox"]')).toBeNull()

    // recovery
    fireEvent.click(screen.getByTestId('search-retry'))
    await screen.findByRole('option', { name: 'Galaxy Studio' })
    expect(screen.getByRole('listbox')).toHaveAttribute('id', 'search-suggestions')
  })
})

describe('SearchDropdown when a refresh of a shown answer fails', () => {
  it('should take the old rows off the screen with the error, and bring the fresh ones back on retry, DOM, reported rows and actions alike', async () => {
    const failure = new Error('fetchSuggestions 503')
    vi.mocked(fetchSuggestions)
      .mockResolvedValueOnce(galaxy as never)
      // the refresh retries once on its own before it counts as failed
      .mockRejectedValueOnce(failure)
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ ...galaxy, total: 7 } as never)
    const onRows = vi.fn()
    const onSelectCollection = vi.fn()
    const { qc } = renderDropdown('galaxy', { onRows, onSelectCollection })
    await screen.findByRole('option', { name: 'Galaxy Studio' })
    expect(screen.getAllByRole('option')).toHaveLength(4)

    await qc.refetchQueries()
    await screen.findByTestId('search-error', {}, { timeout: 4000 })
    // the answer is still in the cache, but nothing of it is shown or navigable
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.queryByTestId('search-see-all')).not.toBeInTheDocument()
    expect(onRows).toHaveBeenLastCalledWith([])
    expect(screen.getByRole('listbox')).toBeEmptyDOMElement()

    fireEvent.click(screen.getByTestId('search-retry'))
    await screen.findByRole('option', { name: 'Galaxy Studio' })
    expect(screen.queryByTestId('search-error')).not.toBeInTheDocument()
    const rows: SuggestionRow[] = onRows.mock.calls.at(-1)![0]
    expect(rows.map(row => row.id)).toEqual(screen.getAllByRole('option').map(option => option.id))
    expect(screen.getByTestId('search-see-all')).toHaveTextContent('7')
    rows[1].activate('keyboard')
    expect(onSelectCollection).toHaveBeenCalledWith(galaxyCollection, {
      section: 'collections',
      position: 0,
      via: 'keyboard'
    })
  })
})

describe('SearchDropdown facets', () => {
  it('should offer the category a query names first, before the items, with no request of its own', async () => {
    vi.mocked(fetchSuggestions).mockResolvedValue(galaxy as never)
    const onSelectFacet = vi.fn()
    const onRows = vi.fn()
    renderDropdown('hat', { onSelectFacet, onRows })

    const facet = await screen.findByRole('option', { name: /Hat/ })
    expect(facet).toHaveAttribute('data-kind', 'facet')
    expect(facet).toHaveAttribute('data-facet', 'category:Hat')
    expect(facet).toHaveTextContent('Wearables · Accessories')
    await screen.findByRole('option', { name: 'Galaxy Studio' })
    expect(screen.getAllByRole('option')[0]).toBe(facet)
    const rows: SuggestionRow[] = onRows.mock.calls.at(-1)![0]
    expect(rows.map(row => row.kind)).toEqual(['facet', 'item', 'collection', 'creator', 'see-all'])
    expect(fetchSuggestions).toHaveBeenCalledTimes(1)

    fireEvent.click(facet)
    expect(onSelectFacet).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'category', key: 'Hat', top: 'wearable' }),
      {
        section: 'facets',
        position: 0,
        via: 'click'
      }
    )
    rows[0].activate('keyboard')
    expect(onSelectFacet).toHaveBeenLastCalledWith(expect.objectContaining({ key: 'Hat' }), {
      section: 'facets',
      position: 0,
      via: 'keyboard'
    })
  })

  it('should keep the facet when the three sections come back empty, say so precisely, and count it in both events', async () => {
    vi.mocked(fetchSuggestions).mockResolvedValue(EMPTY)
    renderDropdown('zapatillas')

    expect(await screen.findByRole('option', { name: /Feet|Pies/ })).toHaveAttribute('data-kind', 'facet')
    expect(await screen.findAllByText(/No items, collections or creators/)).not.toHaveLength(0)
    expect(screen.queryByText(/^No results/)).not.toBeInTheDocument()
    await waitFor(() =>
      expect(track).toHaveBeenCalledWith('Shop Search No Results', { query: 'zapatillas', facet_count: 1 })
    )
    expect(track).toHaveBeenCalledWith(
      'Shop Viewed Search Suggestions',
      expect.objectContaining({ query: 'zapatillas', item_count: 0, facet_count: 1, cache_hit: false })
    )
    expect(track).toHaveBeenCalledTimes(2)
  })

  it('should keep the facet and the retry on an error, and report nothing', async () => {
    vi.mocked(fetchSuggestions).mockRejectedValue(new Error('fetchSuggestions 500'))
    const onRows = vi.fn()
    renderDropdown('epic', { onRows })

    await screen.findByTestId('search-error', {}, { timeout: 4000 })
    const facet = screen.getByRole('option', { name: /Epic/ })
    expect(facet).toHaveAttribute('data-facet', 'rarity:epic')
    expect(facet).toHaveTextContent('Rarity')
    expect(screen.getByRole('listbox')).toContainElement(facet)
    expect(screen.getByTestId('search-retry').closest('[role="listbox"]')).toBeNull()
    expect(onRows).toHaveBeenLastCalledWith([expect.objectContaining({ kind: 'facet' })])
    expect(track).not.toHaveBeenCalled()
  })

  it('should offer no facet for a query that is not exactly a category or rarity', async () => {
    vi.mocked(fetchSuggestions).mockResolvedValue(galaxy as never)
    renderDropdown('pirate hat')

    await screen.findByRole('option', { name: 'Galaxy Studio' })
    expect(screen.queryByRole('option', { name: /^Hat/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('option').every(option => option.getAttribute('data-kind') !== 'facet')).toBe(true)
  })
})
