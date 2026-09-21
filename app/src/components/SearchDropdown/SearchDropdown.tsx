import { useEffect, useMemo } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import type { CatalogItem } from '~/lib/api'
import { Icon } from '~/components/Icon'
import { fetchSuggestions, type CollectionHit, type CreatorHit } from '~/lib/search'
import { highlightMatches } from '~/lib/highlight'
import { SUGGESTIONS_LISTBOX_ID, suggestionRowId, type SuggestionRow } from '~/lib/suggestionNavigation'
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

// Rows per section shown while typing. Small pages — this is a preview, not the full grid.
const SUGGEST_SIZES = { items: 5, collections: 4, creators: 4 }
// Don't hit the API for a single character — too noisy, matches the Assets page which lowercases/trims.
const MIN_QUERY_LEN = 2

type SearchDropdownProps = {
  // The (debounced) query the dropdown should reflect. Empty string → show recent searches instead.
  query: string
  recent: string[]
  // The row the keyboard has moved to (see lib/suggestionNavigation), by DOM id; null when none.
  activeId?: string | null
  // Every row currently shown, in visual order, so the parent can drive the keyboard over them.
  onRows?: (rows: SuggestionRow[]) => void
  // Item chosen from the suggestions → open its detail page.
  onSelectItem: (item: CatalogItem) => void
  // Collection / creator chosen → open its storefront page.
  onSelectCollection: (collection: CollectionHit) => void
  onSelectCreator: (creator: CreatorHit) => void
  // "See all results" / a recent-search pick → run a full search on /items.
  onRunSearch: (query: string) => void
  onRemoveRecent: (query: string) => void
  onClearRecent: () => void
}

// The autocomplete panel anchored under the NavBar search input. Two modes:
// - empty query  → recent searches (from localStorage, via the parent)
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
// It is the listbox of the search box's combobox: the input (in NavBar) owns focus and the keys, this
// renders every row as an option with a stable id and reports the rows back, in order, for the arrows.
export function SearchDropdown({
  query,
  recent,
  activeId = null,
  onRows,
  onSelectItem,
  onSelectCollection,
  onSelectCreator,
  onRunSearch,
  onRemoveRecent,
  onClearRecent
}: SearchDropdownProps) {
  const enabled = query.length >= MIN_QUERY_LEN
  // Read once so both render paths decide off the same value, as NavBar does (the module memoises it anyway).
  const iap = isIapMode()

  const {
    data: suggestions,
    isFetching: itemsFetching,
    isError,
    refetch
  } = useQuery({
    queryKey: ['search-suggest', query],
    // The signal drops a request the reader has typed past; the key keeps a slow older answer from ever
    // replacing a newer one.
    queryFn: ({ signal }) => fetchSuggestions(query, SUGGEST_SIZES, { signal }),
    enabled,
    // Keep the previous suggestions on screen while the next keystroke's results load (no flicker).
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    // One retry: a keystroke's request is not worth hammering a failing server, and the panel offers its own.
    retry: 1
  })

  const items = enabled ? (suggestions?.items ?? []) : []
  const collections = enabled ? (suggestions?.collections ?? []) : []
  const creators = enabled ? (suggestions?.creators ?? []) : []
  const total = suggestions?.total ?? 0
  const showingRecent = !enabled

  const rows = useMemo<SuggestionRow[]>(() => {
    if (showingRecent) {
      return recent.map(term => ({
        id: suggestionRowId('recent', term),
        kind: 'recent',
        activate: () => onRunSearch(term)
      }))
    }
    const list: SuggestionRow[] = [
      ...items.map(item => ({
        id: suggestionRowId('item', item.id),
        kind: 'item' as const,
        activate: () => onSelectItem(item)
      })),
      ...collections.map(collection => ({
        id: suggestionRowId('collection', collection.contractAddress),
        kind: 'collection' as const,
        activate: () => onSelectCollection(collection)
      })),
      ...creators.map(creator => ({
        id: suggestionRowId('creator', creator.address),
        kind: 'creator' as const,
        activate: () => onSelectCreator(creator)
      }))
    ]
    if (total > 0)
      list.push({ id: suggestionRowId('see-all', query), kind: 'see-all', activate: () => onRunSearch(query) })
    return list
    // The handlers are stable enough for a listbox; re-deriving on every parent render would reset the
    // keyboard position on each keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showingRecent, recent, items, collections, creators, total, query])

  useEffect(() => {
    onRows?.(rows)
  }, [rows, onRows])

  // The keyboard moved: keep the active row in view inside the scrolling panel.
  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  const option = (id: string) => ({
    id,
    role: 'option' as const,
    'aria-selected': activeId === id,
    'data-active': activeId === id || undefined
  })

  if (showingRecent) {
    if (recent.length === 0) return null
    return (
      <S.Pop
        id={SUGGESTIONS_LISTBOX_ID}
        data-iap={iap || undefined}
        data-testid="search-pop"
        role="listbox"
        aria-label={t('search.suggestions')}
      >
        <S.SectionHead>
          <span>{t('search.recent')}</span>
          <S.Clear type="button" onClick={onClearRecent}>
            {t('search.clearRecent')}
          </S.Clear>
        </S.SectionHead>
        <S.List>
          {recent.map(term => (
            <S.Recent key={term}>
              <S.RecentBtn type="button" {...option(suggestionRowId('recent', term))} onClick={() => onRunSearch(term)}>
                <Icon name="search" size={16} color={theme.colors.muted} />
                <S.RecentText>{term}</S.RecentText>
              </S.RecentBtn>
              <S.RecentRemove
                type="button"
                aria-label={t('search.removeRecent', { query: term })}
                onClick={() => onRemoveRecent(term)}
              >
                <Icon name="close" size={14} />
              </S.RecentRemove>
            </S.Recent>
          ))}
        </S.List>
      </S.Pop>
    )
  }

  const nothing = items.length === 0 && collections.length === 0 && creators.length === 0
  const count = items.length + collections.length + creators.length

  return (
    <S.Pop
      id={SUGGESTIONS_LISTBOX_ID}
      data-iap={iap || undefined}
      data-testid="search-pop"
      role="listbox"
      aria-label={t('search.suggestions')}
    >
      {/* Read out once per answer, not per keystroke: the query is already debounced. */}
      <S.Live aria-live="polite" data-testid="search-live">
        {isError
          ? t('search.error')
          : nothing
            ? itemsFetching
              ? ''
              : t('search.noResults', { query })
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
        <S.Empty>{itemsFetching ? t('search.searching') : t('search.noResults', { query })}</S.Empty>
      ) : (
        <>
          {items.length > 0 ? (
            <>
              <S.SectionHead>
                <span>{t('search.items')}</span>
              </S.SectionHead>
              <S.List>
                {items.map(item => {
                  return (
                    <li key={item.id}>
                      <S.Row
                        type="button"
                        data-testid="search-pop-row"
                        data-kind="item"
                        {...option(suggestionRowId('item', item.id))}
                        onClick={() => onSelectItem(item)}
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
                  )
                })}
              </S.List>
            </>
          ) : null}

          {collections.length > 0 ? (
            <>
              <S.SectionHead>
                <span>{t('search.collections')}</span>
              </S.SectionHead>
              <S.List>
                {collections.map(collection => (
                  <li key={collection.contractAddress}>
                    <S.Row
                      type="button"
                      data-testid="search-pop-row"
                      data-kind="collection"
                      {...option(suggestionRowId('collection', collection.contractAddress))}
                      onClick={() => onSelectCollection(collection)}
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
            </>
          ) : null}

          {creators.length > 0 ? (
            <>
              <S.SectionHead>
                <span>{t('search.creators')}</span>
              </S.SectionHead>
              <S.List>
                {creators.map(creator => (
                  <li key={creator.address}>
                    <S.Row
                      type="button"
                      data-testid="search-pop-row"
                      data-kind="creator"
                      {...option(suggestionRowId('creator', creator.address))}
                      onClick={() => onSelectCreator(creator)}
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
            </>
          ) : null}

          {total > 0 ? (
            <S.SeeAll
              type="button"
              data-testid="search-see-all"
              {...option(suggestionRowId('see-all', query))}
              onClick={() => onRunSearch(query)}
            >
              {t('search.seeAll', { count: total.toLocaleString() })}
            </S.SeeAll>
          ) : null}
        </>
      )}
    </S.Pop>
  )
}

export default SearchDropdown
