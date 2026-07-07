import { useQuery, keepPreviousData } from '@tanstack/react-query'
import CloseIcon from '@mui/icons-material/CloseRounded'
import { fetchListings, type CatalogItem } from '~/lib/api'
import { CurrencyIcon } from '~/components/CurrencyIcon'
import { t } from '~/intl/i18n'

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
  // "See all results" / a recent-search pick → run a full search on /assets.
  onRunSearch: (query: string) => void
  onRemoveRecent: (query: string) => void
  onClearRecent: () => void
}

// The autocomplete panel anchored under the NavBar search input. Two modes:
// - empty query  → recent searches (from localStorage, via the parent)
// - typed query  → live top-5 item matches from /v3/catalog/shop + a "See all" footer
// Keyboard nav (↑/↓/Enter) is owned by the parent NavBar so it can also drive the input.
export function SearchDropdown({
  query,
  recent,
  onSelectItem,
  onRunSearch,
  onRemoveRecent,
  onClearRecent,
}: SearchDropdownProps) {
  const enabled = query.length >= MIN_QUERY_LEN
  const { data, isFetching } = useQuery({
    queryKey: ['search-suggest', query],
    queryFn: () => fetchListings({ search: query, first: SUGGEST_COUNT }),
    enabled,
    // Keep the previous suggestions on screen while the next keystroke's results load (no flicker).
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })

  const items = enabled ? (data?.items ?? []) : []
  const total = data?.total ?? 0

  if (!enabled) {
    if (recent.length === 0) return null
    return (
      <div
        className="search-pop"
        role="listbox"
        aria-label={t('search.suggestions')}
      >
        <div className="search-pop__section-head">
          <span>{t('search.recent')}</span>
          <button
            type="button"
            className="search-pop__clear"
            onClick={onClearRecent}
          >
            {t('search.clearRecent')}
          </button>
        </div>
        <ul className="search-pop__list">
          {recent.map(term => (
            <li
              key={term}
              className="search-pop__recent"
            >
              <button
                type="button"
                className="search-pop__recent-btn"
                onClick={() => onRunSearch(term)}
              >
                <span
                  className="ico ico-search search-pop__recent-ico"
                  aria-hidden
                />
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

  return (
    <div
      className="search-pop"
      role="listbox"
      aria-label={t('search.suggestions')}
    >
      {items.length === 0 ? (
        <p className="search-pop__empty">
          {isFetching ? t('search.searching') : t('search.noResults', { query })}
        </p>
      ) : (
        <ul className="search-pop__list">
          {items.map(item => (
            <li key={item.id}>
              <button
                type="button"
                className="search-pop__row"
                onClick={() => onSelectItem(item)}
              >
                <span className="search-pop__thumb">
                  {item.thumbnail ? (
                    <img
                      src={item.thumbnail}
                      alt=""
                    />
                  ) : null}
                </span>
                <span
                  className="search-pop__name"
                  title={item.name}
                >
                  {item.name}
                </span>
                <span className="search-pop__price">
                  <CurrencyIcon className="ccy-mark" /> {item.priceCredits}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="search-pop__seeall"
        onClick={() => onRunSearch(query)}
      >
        {t('search.seeAll', { count: total.toLocaleString() })}
      </button>
    </div>
  )
}
