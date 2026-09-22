// The search dropdown's analytics, as pure builders: what each event carries, and what makes two showings
// of the panel the same exposure. Event names and properties follow the tracking spec; the components call
// `track` with what these return.

import type { Suggestions } from '~/lib/search'

export type SuggestionSection = 'items' | 'collections' | 'creators'

/**
 * One exposure = one normalized query while the panel is open: retyping the same word with different
 * case or spacing, a rerender, StrictMode's double effects and a refetch all map to the same key and
 * are not counted twice. Reopening the panel starts a new set of exposures.
 */
export function exposureKey(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function suggestionsViewedProps(
  query: string,
  suggestions: Suggestions,
  timing: { fetchMs: number | null; cacheHit: boolean }
): Record<string, unknown> {
  return {
    query: query.trim(),
    item_count: suggestions.items.length,
    collection_count: suggestions.collections.length,
    creator_count: suggestions.creators.length,
    total: suggestions.total,
    fetch_ms: timing.cacheHit ? null : timing.fetchMs === null ? null : Math.round(timing.fetchMs),
    cache_hit: timing.cacheHit
  }
}

export function noResultsProps(query: string): Record<string, unknown> {
  return { query: query.trim() }
}

/** True when the answer offers nothing in any of the three sections. */
export function hasNoResults(suggestions: Suggestions): boolean {
  return suggestions.items.length === 0 && suggestions.collections.length === 0 && suggestions.creators.length === 0
}

export type SuggestionClick = {
  query: string
  section: SuggestionSection
  // 0-based, within the section as shown.
  position: number
  via: 'click' | 'keyboard'
}

export function suggestionClickedProps(
  click: SuggestionClick,
  target: Record<string, unknown>
): Record<string, unknown> {
  const type = click.section === 'items' ? 'item' : click.section === 'collections' ? 'collection' : 'creator'
  return {
    query: click.query.trim(),
    // `type` predates `section`; both are kept so nothing built on the old name breaks.
    type,
    ...target,
    section: click.section,
    position: click.position,
    via: click.via
  }
}

/** `page` is the route alone: never the query string, which could carry the search itself. */
export function clearedSearchProps(pathname: string): Record<string, unknown> {
  return { page: pathname }
}
