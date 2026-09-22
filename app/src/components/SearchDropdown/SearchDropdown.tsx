import { useQuery, keepPreviousData } from '@tanstack/react-query'
import type { CatalogItem } from '~/lib/api'
import { Icon } from '~/components/Icon'
import { fetchSuggestions, type CollectionHit, type CreatorHit } from '~/lib/search'
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
// Keyboard nav is limited to Escape/Enter, owned by the parent NavBar.
export function SearchDropdown({
  query,
  recent,
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

  if (!enabled) {
    if (recent.length === 0) return null
    return (
      <S.Pop data-iap={iap || undefined} data-testid="search-pop" role="listbox" aria-label={t('search.suggestions')}>
        <S.SectionHead>
          <span>{t('search.recent')}</span>
          <S.Clear type="button" onClick={onClearRecent}>
            {t('search.clearRecent')}
          </S.Clear>
        </S.SectionHead>
        <S.List>
          {recent.map(term => (
            <S.Recent key={term}>
              <S.RecentBtn type="button" onClick={() => onRunSearch(term)}>
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

  return (
    <S.Pop data-iap={iap || undefined} data-testid="search-pop" role="listbox" aria-label={t('search.suggestions')}>
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
                        onClick={() => onSelectItem(item)}
                      >
                        <S.Thumb>{item.thumbnail ? <img src={item.thumbnail} alt="" /> : null}</S.Thumb>
                        <S.Text>
                          <S.Name title={item.name}>{item.name}</S.Name>
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
                      onClick={() => onSelectCollection(collection)}
                    >
                      <CollectionRowThumb contractAddress={collection.contractAddress} />
                      <S.Text>
                        <S.Name title={collection.name}>{collection.name}</S.Name>
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
                      onClick={() => onSelectCreator(creator)}
                    >
                      <S.Thumb data-variant="round">{creator.face ? <img src={creator.face} alt="" /> : null}</S.Thumb>
                      <S.Text>
                        <S.Name title={creator.name}>{creator.name}</S.Name>
                      </S.Text>
                    </S.Row>
                  </li>
                ))}
              </S.List>
            </>
          ) : null}

          {total > 0 ? (
            <S.SeeAll type="button" data-testid="search-see-all" onClick={() => onRunSearch(query)}>
              {t('search.seeAll', { count: total.toLocaleString() })}
            </S.SeeAll>
          ) : null}
        </>
      )}
    </S.Pop>
  )
}

export default SearchDropdown
