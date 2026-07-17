import { useQuery, keepPreviousData } from '@tanstack/react-query'
import CloseIcon from '@mui/icons-material/CloseRounded'
import { fetchListings, type CatalogItem } from '~/lib/api'
import { fetchCollectionSuggestions, fetchCreatorSuggestions, type CollectionHit, type CreatorHit } from '~/lib/search'
import { CollectionThumb } from '~/components/CollectionThumb'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { useProfile } from '~/hooks/useProfile'
import { t } from '~/intl/i18n'

function shortAddress(addr: string): string {
  return /^0x[a-fA-F0-9]{40}$/.test(addr) ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr
}

// Text-only "By {creator}" subline for item/collection rows. Resolves the address → DCL profile
// name via the shared useProfile query (dedupes with the cards elsewhere), falls back to a short
// address. Mirrors the marketplace's <Profile textOnly> in the suggestion rows.
function CreatorName({ address, className }: { address: string; className?: string }) {
  const { data } = useProfile(address)
  const name = data?.name || shortAddress(address)
  return <span className={className}>{t('search.byCreator', { name })}</span>
}

// The collection suggestion row's thumbnail is the shared mosaic (CollectionThumb) sized as a small
// rounded tile, falling back to the neutral icon tile while loading or when the collection is empty.
function CollectionRowThumb({ contractAddress }: { contractAddress: string }) {
  return (
    <CollectionThumb
      contractAddress={contractAddress}
      className="search-pop__collthumb"
      fallback={
        <span className="search-pop__thumb search-pop__thumb--icon">
          <span className="ico ico-search" aria-hidden />
        </span>
      }
    />
  )
}

// Top-N item suggestions shown while typing. Small page — this is a preview, not the full grid.
const SUGGEST_COUNT = 5
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
  // "See all results" / a recent-search pick → run a full search on /assets.
  onRunSearch: (query: string) => void
  onRemoveRecent: (query: string) => void
  onClearRecent: () => void
}

// The autocomplete panel anchored under the NavBar search input. Two modes:
// - empty query  → recent searches (from localStorage, via the parent)
// - typed query  → live matches in three sections: Creators, Collections, and Items.
//   Items come from /v3/catalog/shop (name + tags). Collections come from /v1/collections?search=,
//   and Creators are derived from those collections' authors (see lib/search). The grid stays
//   items-only — only the dropdown surfaces creators/collections as jump-to links.
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

  const { data: itemData, isFetching: itemsFetching } = useQuery({
    queryKey: ['search-suggest', query],
    queryFn: () => fetchListings({ search: query, first: SUGGEST_COUNT }),
    enabled,
    // Keep the previous suggestions on screen while the next keystroke's results load (no flicker).
    placeholderData: keepPreviousData,
    staleTime: 30_000
  })

  const { data: collections = [] } = useQuery({
    queryKey: ['search-suggest-collections', query],
    queryFn: () => fetchCollectionSuggestions(query),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000
  })

  const { data: creators = [] } = useQuery({
    queryKey: ['search-suggest-creators', query],
    queryFn: () => fetchCreatorSuggestions(query),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000
  })

  const items = enabled ? (itemData?.items ?? []) : []
  const total = itemData?.total ?? 0

  if (!enabled) {
    if (recent.length === 0) return null
    return (
      <div className="search-pop" role="listbox" aria-label={t('search.suggestions')}>
        <div className="search-pop__section-head">
          <span>{t('search.recent')}</span>
          <button type="button" className="search-pop__clear" onClick={onClearRecent}>
            {t('search.clearRecent')}
          </button>
        </div>
        <ul className="search-pop__list">
          {recent.map(term => (
            <li key={term} className="search-pop__recent">
              <button type="button" className="search-pop__recent-btn" onClick={() => onRunSearch(term)}>
                <span className="ico ico-search search-pop__recent-ico" aria-hidden />
                <span className="search-pop__recent-text">{term}</span>
              </button>
              <button
                type="button"
                className="search-pop__recent-remove"
                aria-label={t('search.removeRecent', { query: term })}
                onClick={() => onRemoveRecent(term)}
              >
                <CloseIcon />
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const nothing = items.length === 0 && collections.length === 0 && creators.length === 0

  return (
    <div className="search-pop" role="listbox" aria-label={t('search.suggestions')}>
      {nothing ? (
        <p className="search-pop__empty">{itemsFetching ? t('search.searching') : t('search.noResults', { query })}</p>
      ) : (
        <>
          {items.length > 0 ? (
            <>
              <div className="search-pop__section-head">
                <span>{t('search.items')}</span>
              </div>
              <ul className="search-pop__list">
                {items.map(item => (
                  <li key={item.id}>
                    <button type="button" className="search-pop__row" onClick={() => onSelectItem(item)}>
                      <span className="search-pop__thumb">
                        {item.thumbnail ? <img src={item.thumbnail} alt="" /> : null}
                      </span>
                      <span className="search-pop__text">
                        <span className="search-pop__name" title={item.name}>
                          {item.name}
                        </span>
                        {item.creator ? <CreatorName address={item.creator} className="search-pop__sub" /> : null}
                      </span>
                      <span className="search-pop__price">
                        <CurrencyIcon className="ccy-mark" /> {item.priceCredits}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {collections.length > 0 ? (
            <>
              <div className="search-pop__section-head">
                <span>{t('search.collections')}</span>
              </div>
              <ul className="search-pop__list">
                {collections.map(collection => (
                  <li key={collection.contractAddress}>
                    <button
                      type="button"
                      className="search-pop__row search-pop__row--collection"
                      onClick={() => onSelectCollection(collection)}
                    >
                      <CollectionRowThumb contractAddress={collection.contractAddress} />
                      <span className="search-pop__text">
                        <span className="search-pop__name" title={collection.name}>
                          {collection.name}
                        </span>
                        {collection.creator ? (
                          <CreatorName address={collection.creator} className="search-pop__sub" />
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {creators.length > 0 ? (
            <>
              <div className="search-pop__section-head">
                <span>{t('search.creators')}</span>
              </div>
              <ul className="search-pop__list">
                {creators.map(creator => (
                  <li key={creator.address}>
                    <button
                      type="button"
                      className="search-pop__row search-pop__row--creator"
                      onClick={() => onSelectCreator(creator)}
                    >
                      <span className="search-pop__thumb search-pop__thumb--round">
                        {creator.face ? <img src={creator.face} alt="" /> : null}
                      </span>
                      <span className="search-pop__text">
                        <span className="search-pop__name" title={creator.name}>
                          {creator.name}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {total > 0 ? (
            <button type="button" className="search-pop__seeall" onClick={() => onRunSearch(query)}>
              {t('search.seeAll', { count: total.toLocaleString() })}
            </button>
          ) : null}
        </>
      )}
    </div>
  )
}
