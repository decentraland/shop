import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import type { CatalogItem } from '~/lib/api'
import { Icon } from '~/components/Icon'
import { track } from '~/lib/analytics'
import { fetchSuggestions, type CollectionHit, type CreatorHit, type Suggestions } from '~/lib/search'
import {
  exposureKey,
  hasNoResults,
  noResultsProps,
  suggestionsViewedProps,
  type SuggestionSection
} from '~/lib/searchAnalytics'
import { highlightMatches } from '~/lib/highlight'
import { popularSearchesFor } from '~/lib/popularSearches'
import { facetId, facetsFor, type Facet } from '~/lib/searchFacets'
import { rarityColor } from '~/lib/rarity'
import {
  SUGGESTIONS_LISTBOX_ID,
  suggestionRowId,
  type SuggestionActivation,
  type SuggestionRow,
  type SuggestionRowKind
} from '~/lib/suggestionNavigation'
import { isIapMode } from '~/lib/iap'
import { t } from '~/intl/i18n'
import * as S from './SearchDropdown.styles'
import { theme } from '~/styles/theme'

function shortAddress(addr: string): string {
  return /^0x[a-fA-F0-9]{40}$/.test(addr) ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr
}

// Text-only "By {creator}" subline for item/collection rows. The name comes resolved with the
// suggestions (the server keeps the creators' profile names), so no profile is fetched per row; an
// unnamed creator shows as a short address.
function CreatorName({ address, name }: { address: string; name: string | null }) {
  return <S.Sub>{t('search.byCreator', { name: name || shortAddress(address) })}</S.Sub>
}

// A row's name with the word prefixes the query matched marked up, so the reader sees why the row is there.
function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightMatches(text, query).map((segment, index) =>
        segment.match ? <mark key={index}>{segment.text}</mark> : <span key={index}>{segment.text}</span>
      )}
    </>
  )
}

// The collection suggestion row's thumbnail is the shared mosaic (CollectionThumb) sized as a small
// rounded tile, falling back to the neutral icon tile while loading or when the collection is empty.
function CollectionRowThumb({ contractAddress }: { contractAddress: string }) {
  return (
    <S.CollThumb
      contractAddress={contractAddress}
      fallback={
        <S.Thumb data-variant="icon">
          <Icon name="search" />
        </S.Thumb>
      }
    />
  )
}

function facetLabel(facet: Facet): string {
  return facet.kind === 'category' ? t(facet.labelKey) : t(`rarity.${facet.key}`)
}

// Where the facet sits: "Wearables · Accessories" for a category, "Rarity" for a rarity.
function facetPath(facet: Facet): string {
  return facet.kind === 'category' ? facet.parents.map(key => t(key)).join(' · ') : t('filterBar.rarity')
}

function FacetThumb({ facet }: { facet: Facet }) {
  return (
    <S.Thumb data-variant="icon">
      {facet.kind === 'rarity' ? (
        <S.RarityDot style={{ background: rarityColor(facet.key) }} />
      ) : (
        <Icon name={facet.icon ?? 'search'} />
      )}
    </S.Thumb>
  )
}

// Rows per section shown while typing. Small pages — this is a preview, not the full grid.
const SUGGEST_SIZES = { items: 5, collections: 4, creators: 4 }
// Don't hit the API for a single character — too noisy, matches the Assets page which lowercases/trims.
const MIN_QUERY_LEN = 2

// Shared empties: a fresh [] on every render would make the rows a new list each time, and the parent
// would be told of "new rows" for ever.
const NO_ITEMS: Suggestions['items'] = []
const NO_COLLECTIONS: CollectionHit[] = []
const NO_CREATORS: CreatorHit[] = []
const NO_TERMS: string[] = []
const NO_FACETS: Facet[] = []

/** How a chosen suggestion is reported: where it sat and how it was chosen. */
export type SuggestionChoice = { section: SuggestionSection; position: number; via: SuggestionActivation }

type SearchDropdownProps = {
  // The (debounced) query the dropdown should reflect. Empty string → show recent and popular searches instead.
  query: string
  recent: string[]
  // The row the keyboard has moved to (see lib/suggestionNavigation), by DOM id; null when none.
  activeId?: string | null
  // Every row currently shown, in visual order, so the parent can drive the keyboard over them. Called
  // only when the list actually changes, never on a mere rerender.
  onRows?: (rows: SuggestionRow[]) => void
  // Item chosen from the suggestions → open its detail page.
  onSelectItem: (item: CatalogItem, choice: SuggestionChoice) => void
  // Collection / creator chosen → open its storefront page.
  onSelectCollection: (collection: CollectionHit, choice: SuggestionChoice) => void
  onSelectCreator: (creator: CreatorHit, choice: SuggestionChoice) => void
  // A category or rarity the query named → open its grid, the way the sidebar would.
  onSelectFacet: (facet: Facet, choice: SuggestionChoice) => void
  // "See all results" / a recent or popular search → run a full search on /items.
  onRunSearch: (query: string) => void
  onRemoveRecent: (query: string) => void
  onClearRecent: () => void
}

// The autocomplete panel anchored under the NavBar search input. Two modes:
// - empty query  → recent searches (from localStorage, via the parent) and, below them, popular ones
//   (a fixed list, see lib/popularSearches) — so a reader who has searched nothing yet still sees a way in.
// - typed query  → live matches in three sections: Items, Collections and Creators, from ONE request
//   (fetchSuggestions → /v3/catalog/suggest). The items are the SAME feed and ranking the /items grid
//   lands on (the whole catalogue, by relevance — see defaultStatusFor and defaultSortFor in
//   pages/Assets), so a suggestion is never something the results page then hides, and "See all (N)" is
//   the number the grid then shows. It used to read the on-sale feed while the grid opened on All:
//   "pirate hat" offered 188 results and landed on 542. Collections and creators are matched by the
//   same terms, and every row names its creator, so no profile is fetched per row; the collection rows'
//   mosaics (CollectionThumb) still load their own thumbnails. The grid stays items-only — only the
//   dropdown surfaces creators/collections as jump-to links.
// One request also means one failure: when it fails, the panel says so and offers to try again, and
// never reads as "no results" — that is reserved for an answer that came back empty.
// It is the listbox of the search box's combobox (WAI-ARIA APG): the input (in NavBar) keeps the DOM
// focus and the keys; every row is an option with a stable id, out of the tab order, reported back in
// order for the arrows; the controls that are not options — clear the recent searches, remove one,
// try again — sit outside the listbox and keep their own focus.
export function SearchDropdown({
  query,
  recent,
  activeId = null,
  onRows,
  onSelectItem,
  onSelectCollection,
  onSelectCreator,
  onSelectFacet,
  onRunSearch,
  onRemoveRecent,
  onClearRecent
}: SearchDropdownProps) {
  const enabled = query.length >= MIN_QUERY_LEN
  // Read once so both render paths decide off the same value, as NavBar does (the module memoises it anyway).
  const iap = isIapMode()

  const {
    data: answer,
    isFetching: itemsFetching,
    isError,
    isPlaceholderData,
    isFetchedAfterMount,
    refetch
  } = useQuery({
    queryKey: ['search-suggest', query],
    // The signal drops a request the reader has typed past; the key keeps a slow older answer from ever
    // replacing a newer one. The duration is the whole request, for the exposure event.
    queryFn: async ({ signal }) => {
      const started = performance.now()
      const suggestions = await fetchSuggestions(query, SUGGEST_SIZES, { signal })
      return { suggestions, fetchMs: performance.now() - started }
    },
    enabled,
    // Keep the previous suggestions on screen while the next keystroke's results load (no flicker).
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    // One retry: a keystroke's request is not worth hammering a failing server, and the panel offers its own.
    retry: 1
  })

  // On an error nothing of the answer is shown, even when a failed refresh left the previous one behind:
  // rows that no longer act (the actions are dropped on error) must not stay on screen either.
  const suggestions = enabled && !isError ? answer?.suggestions : undefined
  const items = suggestions?.items ?? NO_ITEMS
  const collections = suggestions?.collections ?? NO_COLLECTIONS
  const creators = suggestions?.creators ?? NO_CREATORS
  const total = suggestions?.total ?? 0
  const showingRecent = !enabled
  const popular = useMemo(() => (showingRecent ? popularSearchesFor(recent) : NO_TERMS), [showingRecent, recent])
  // A category or rarity the query names, recognised locally (lib/searchFacets): no request, and still
  // offered when the request fails.
  const facets = useMemo(() => (enabled ? facetsFor(query) : NO_FACETS), [enabled, query])

  // What each row DOES, rebuilt on every render from the props and data in force and read through a ref
  // at activation time: a row the parent kept from an earlier report still runs today's handler on
  // today's data, by click and by keyboard alike.
  const actions = new Map<string, (via: SuggestionActivation) => void>()
  if (showingRecent) {
    for (const term of recent) actions.set(suggestionRowId('recent', term), () => onRunSearch(term))
    for (const term of popular) actions.set(suggestionRowId('popular', term), () => onRunSearch(term))
  } else {
    facets.forEach((facet, position) =>
      actions.set(suggestionRowId('facet', facetId(facet)), via =>
        onSelectFacet(facet, { section: 'facets', position, via })
      )
    )
    if (!isError) {
      items.forEach((item, position) =>
        actions.set(suggestionRowId('item', item.id), via => onSelectItem(item, { section: 'items', position, via }))
      )
      collections.forEach((collection, position) =>
        actions.set(suggestionRowId('collection', collection.contractAddress), via =>
          onSelectCollection(collection, { section: 'collections', position, via })
        )
      )
      creators.forEach((creator, position) =>
        actions.set(suggestionRowId('creator', creator.address), via =>
          onSelectCreator(creator, { section: 'creators', position, via })
        )
      )
      if (total > 0) actions.set(suggestionRowId('see-all', query), () => onRunSearch(query))
    }
  }
  const latest = useRef(actions)
  useLayoutEffect(() => {
    latest.current = actions
  })
  const activate = (id: string, via: SuggestionActivation) => latest.current.get(id)?.(via)

  // What is on offer, as ids in visual order. Derived from the data alone, so a rerender of the parent
  // keeps the same list, and the keyboard its position on it.
  const rows = useMemo<SuggestionRow[]>(() => {
    const row = (kind: SuggestionRowKind, key: string): SuggestionRow => {
      const id = suggestionRowId(kind, key)
      return { id, kind, activate: via => latest.current.get(id)?.(via) }
    }
    if (showingRecent) return [...recent.map(term => row('recent', term)), ...popular.map(term => row('popular', term))]
    const list = facets.map(facet => row('facet', facetId(facet)))
    if (isError) return list
    list.push(
      ...items.map(item => row('item', item.id)),
      ...collections.map(collection => row('collection', collection.contractAddress)),
      ...creators.map(creator => row('creator', creator.address))
    )
    if (total > 0) list.push(row('see-all', query))
    return list
  }, [isError, showingRecent, recent, popular, facets, items, collections, creators, total, query])

  // Told only when the LIST changes — the same ids in the same order are the same list — so a rerender
  // of the parent never turns into another report, another render, another report. Before the paint, so
  // the input never announces (aria-activedescendant) a row that is no longer there.
  const reported = useRef<string | null>(null)
  useLayoutEffect(() => {
    const signature = rows.map(row => row.id).join('\n')
    if (reported.current === signature) return
    reported.current = signature
    onRows?.(rows)
  }, [rows, onRows])

  // The keyboard moved: keep the active row in view inside the scrolling panel.
  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView?.({ block: 'nearest' })
  }, [activeId])

  // One exposure per query while the panel is open, and only for an answer that is really this query's:
  // not the previous one kept as a placeholder, not an error, not a request still in flight. "No results"
  // is about the three sections; a facet offered next to an empty answer is counted in both events, which
  // then go out together.
  const exposed = useRef(new Set<string>())
  const settled = enabled && !isError && !isPlaceholderData && !itemsFetching && suggestions !== undefined
  useEffect(() => {
    if (!settled || !suggestions) return
    const key = exposureKey(query)
    if (exposed.current.has(key)) return
    exposed.current.add(key)
    const empty = hasNoResults(suggestions)
    if (empty) track('Shop Search No Results', noResultsProps(query, facets.length))
    if (!empty || facets.length > 0)
      track(
        'Shop Viewed Search Suggestions',
        suggestionsViewedProps(
          query,
          suggestions,
          { fetchMs: answer?.fetchMs ?? null, cacheHit: !isFetchedAfterMount },
          facets.length
        )
      )
  }, [settled, query, suggestions, answer, isFetchedAfterMount, facets])

  // Every option: out of the tab order (the input keeps the focus), marked when the keyboard is on it.
  const option = (id: string) => ({
    id,
    role: 'option' as const,
    tabIndex: -1,
    'aria-selected': activeId === id,
    'data-active': activeId === id || undefined
  })

  const nothing = items.length === 0 && collections.length === 0 && creators.length === 0
  const count = facets.length + items.length + collections.length + creators.length
  // Nothing in the three sections is not an empty panel when a facet is on offer: the copy says which.
  const emptyCopy = facets.length > 0 ? t('search.noEntities', { query }) : t('search.noResults', { query })

  if (showingRecent) {
    return (
      <S.Pop data-iap={iap || undefined} data-testid="search-pop">
        {recent.length > 0 ? (
          <S.SectionHead>
            <span>{t('search.recent')}</span>
            <S.Clear type="button" data-testid="search-clear-recent" onClick={onClearRecent}>
              {t('search.clearRecent')}
            </S.Clear>
          </S.SectionHead>
        ) : null}
        <S.RecentArea>
          <S.Listbox id={SUGGESTIONS_LISTBOX_ID} role="listbox" aria-label={t('search.suggestions')}>
            {recent.length > 0 ? (
              <S.Group role="group" aria-label={t('search.recent')}>
                {recent.map(term => (
                  <S.RecentBtn
                    key={term}
                    type="button"
                    data-testid="search-recent-row"
                    {...option(suggestionRowId('recent', term))}
                    onClick={() => activate(suggestionRowId('recent', term), 'click')}
                  >
                    <Icon name="search" size={16} color={theme.colors.muted} />
                    <S.RecentText>{term}</S.RecentText>
                  </S.RecentBtn>
                ))}
              </S.Group>
            ) : null}
            {popular.length > 0 ? (
              <S.Group role="group" aria-label={t('search.popular')}>
                <S.SectionHead role="presentation">
                  <span>{t('search.popular')}</span>
                </S.SectionHead>
                <S.Chips role="none">
                  {popular.map(term => (
                    <S.Chip
                      key={term}
                      type="button"
                      data-testid="search-popular-row"
                      {...option(suggestionRowId('popular', term))}
                      onClick={() => activate(suggestionRowId('popular', term), 'click')}
                    >
                      {term}
                    </S.Chip>
                  ))}
                </S.Chips>
              </S.Group>
            ) : null}
          </S.Listbox>
          {/* The removals are controls, not options: beside the listbox, one per recent row, in the tab order. */}
          {recent.length > 0 ? (
            <S.RemoveList aria-label={t('search.recent')}>
              {recent.map(term => (
                <li key={term}>
                  <S.RecentRemove
                    type="button"
                    data-testid="search-recent-remove"
                    aria-label={t('search.removeRecent', { query: term })}
                    onClick={() => onRemoveRecent(term)}
                  >
                    <Icon name="close" size={14} />
                  </S.RecentRemove>
                </li>
              ))}
            </S.RemoveList>
          ) : null}
        </S.RecentArea>
      </S.Pop>
    )
  }

  return (
    <S.Pop data-iap={iap || undefined} data-testid="search-pop">
      {/* Read out once per answer, not per keystroke: the query is already debounced. */}
      <S.Live aria-live="polite" data-testid="search-live">
        {isError
          ? t('search.error')
          : nothing
            ? itemsFetching
              ? ''
              : emptyCopy
            : t('search.suggestionCount', { count })}
      </S.Live>
      {isError ? (
        <S.Empty data-testid="search-error">
          {t('search.error')}{' '}
          <S.Clear type="button" data-testid="search-retry" onClick={() => void refetch()}>
            {t('search.retry')}
          </S.Clear>
        </S.Empty>
      ) : nothing ? (
        <S.Empty>{itemsFetching ? t('search.searching') : emptyCopy}</S.Empty>
      ) : null}
      {/* Mounted in every state, empty or not: the box names it as its listbox as long as the panel is open. */}
      <S.Listbox id={SUGGESTIONS_LISTBOX_ID} role="listbox" aria-label={t('search.suggestions')}>
        {facets.length > 0 ? (
          <S.Group role="group" aria-labelledby="search-group-facets">
            <S.SectionHead id="search-group-facets" role="presentation">
              <span>{t('search.explore')}</span>
            </S.SectionHead>
            <S.List role="none">
              {facets.map(facet => {
                const id = suggestionRowId('facet', facetId(facet))
                const path = facetPath(facet)
                return (
                  <li key={id} role="none">
                    <S.Row
                      type="button"
                      data-testid="search-pop-row"
                      data-kind="facet"
                      data-facet={facetId(facet)}
                      {...option(id)}
                      onClick={() => activate(id, 'click')}
                    >
                      <FacetThumb facet={facet} />
                      <S.Text>
                        <S.Name title={facetLabel(facet)}>{facetLabel(facet)}</S.Name>
                        {path ? <S.Sub>{path}</S.Sub> : null}
                      </S.Text>
                    </S.Row>
                  </li>
                )
              })}
            </S.List>
          </S.Group>
        ) : null}
        {items.length > 0 ? (
          <S.Group role="group" aria-labelledby="search-group-items">
            <S.SectionHead id="search-group-items" role="presentation">
              <span>{t('search.items')}</span>
            </S.SectionHead>
            <S.List role="none">
              {items.map(item => (
                <li key={item.id} role="none">
                  <S.Row
                    type="button"
                    data-testid="search-pop-row"
                    data-kind="item"
                    {...option(suggestionRowId('item', item.id))}
                    onClick={() => activate(suggestionRowId('item', item.id), 'click')}
                  >
                    <S.Thumb>{item.thumbnail ? <img src={item.thumbnail} alt="" /> : null}</S.Thumb>
                    <S.Text>
                      <S.Name title={item.name}>
                        <Highlighted text={item.name} query={query} />
                      </S.Name>
                      {item.creator ? <CreatorName address={item.creator} name={item.creatorName} /> : null}
                    </S.Text>
                  </S.Row>
                </li>
              ))}
            </S.List>
          </S.Group>
        ) : null}

        {collections.length > 0 ? (
          <S.Group role="group" aria-labelledby="search-group-collections">
            <S.SectionHead id="search-group-collections" role="presentation">
              <span>{t('search.collections')}</span>
            </S.SectionHead>
            <S.List role="none">
              {collections.map(collection => (
                <li key={collection.contractAddress} role="none">
                  <S.Row
                    type="button"
                    data-testid="search-pop-row"
                    data-kind="collection"
                    {...option(suggestionRowId('collection', collection.contractAddress))}
                    onClick={() => activate(suggestionRowId('collection', collection.contractAddress), 'click')}
                  >
                    <CollectionRowThumb contractAddress={collection.contractAddress} />
                    <S.Text>
                      <S.Name title={collection.name}>
                        <Highlighted text={collection.name} query={query} />
                      </S.Name>
                      {collection.creator ? (
                        <CreatorName address={collection.creator} name={collection.creatorName} />
                      ) : null}
                    </S.Text>
                  </S.Row>
                </li>
              ))}
            </S.List>
          </S.Group>
        ) : null}

        {creators.length > 0 ? (
          <S.Group role="group" aria-labelledby="search-group-creators">
            <S.SectionHead id="search-group-creators" role="presentation">
              <span>{t('search.creators')}</span>
            </S.SectionHead>
            <S.List role="none">
              {creators.map(creator => (
                <li key={creator.address} role="none">
                  <S.Row
                    type="button"
                    data-testid="search-pop-row"
                    data-kind="creator"
                    {...option(suggestionRowId('creator', creator.address))}
                    onClick={() => activate(suggestionRowId('creator', creator.address), 'click')}
                  >
                    <S.Thumb data-variant="round">{creator.face ? <img src={creator.face} alt="" /> : null}</S.Thumb>
                    <S.Text>
                      <S.Name title={creator.name}>
                        <Highlighted text={creator.name} query={query} />
                      </S.Name>
                    </S.Text>
                  </S.Row>
                </li>
              ))}
            </S.List>
          </S.Group>
        ) : null}

        {total > 0 ? (
          <S.SeeAll
            type="button"
            data-testid="search-see-all"
            {...option(suggestionRowId('see-all', query))}
            onClick={() => activate(suggestionRowId('see-all', query), 'click')}
          >
            {t('search.seeAll', { count: total.toLocaleString() })}
          </S.SeeAll>
        ) : null}
      </S.Listbox>
    </S.Pop>
  )
}

export default SearchDropdown
