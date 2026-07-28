import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { fetchListings, type CatalogItem } from '~/lib/api'
import { Icon } from '~/components/Icon'
import { fetchCollectionSuggestions, fetchCreatorSuggestions, type CollectionHit, type CreatorHit } from '~/lib/search'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { useProfile } from '~/hooks/useProfile'
import { t } from '~/intl/i18n'
import * as S from './SearchDropdown.styles'
import { theme } from '~/styles/theme'

function shortAddress(addr: string): string {
  return /^0x[a-fA-F0-9]{40}$/.test(addr) ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr
}

// Text-only "By {creator}" subline for item/collection rows. Resolves the address → DCL profile
// name via the shared useProfile query (dedupes with the cards elsewhere), falls back to a short
// address. Mirrors the marketplace's <Profile textOnly> in the suggestion rows.
function CreatorName({ address }: { address: string }) {
  const { data } = useProfile(address)
  const name = data?.name || shortAddress(address)
  return <S.Sub>{t('search.byCreator', { name })}</S.Sub>
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
      <S.Pop data-testid="search-pop" role="listbox" aria-label={t('search.suggestions')}>
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
    <S.Pop data-testid="search-pop" role="listbox" aria-label={t('search.suggestions')}>
      {nothing ? (
        <S.Empty>{itemsFetching ? t('search.searching') : t('search.noResults', { query })}</S.Empty>
      ) : (
        <>
          {items.length > 0 ? (
            <>
              <S.SectionHead>
                <span>{t('search.items')}</span>
              </S.SectionHead>
              <S.List>
                {items.map(item => (
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
                        {item.creator ? <CreatorName address={item.creator} /> : null}
                      </S.Text>
                      <S.Price>
                        <CurrencyIcon className="ccy-mark" /> {item.priceCredits}
                      </S.Price>
                    </S.Row>
                  </li>
                ))}
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
                        {collection.creator ? <CreatorName address={collection.creator} /> : null}
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
            <S.SeeAll type="button" onClick={() => onRunSearch(query)}>
              {t('search.seeAll', { count: total.toLocaleString() })}
            </S.SeeAll>
          ) : null}
        </>
      )}
    </S.Pop>
  )
}

export default SearchDropdown
