// Keyboard navigation over the search dropdown's rows: the rows are one flat list in visual order
// (recent searches, or items, collections, creators and "See all"), and the active one is an index into
// it. Kept pure so the arrow-key semantics are testable without a DOM.

export type SuggestionRowKind = 'item' | 'collection' | 'creator' | 'see-all' | 'recent'

export type SuggestionRow = {
  // The DOM id of the row, referenced by the input's aria-activedescendant.
  id: string
  kind: SuggestionRowKind
  // What choosing the row does, whether by click or by Enter.
  activate: () => void
}

export const NO_ACTIVE_ROW = -1

/** The listbox's DOM id, which the combobox input points at with aria-controls. */
export const SUGGESTIONS_LISTBOX_ID = 'search-suggestions'

/**
 * The next active index for a navigation key, or null when the key is not one. Arrows wrap; Home and
 * End jump. With no rows nothing is ever active.
 */
export function nextActiveIndex(current: number, count: number, key: string): number | null {
  if (key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'Home' && key !== 'End') return null
  if (count <= 0) return NO_ACTIVE_ROW
  switch (key) {
    case 'ArrowDown':
      return current >= count - 1 || current < 0 ? (current < 0 ? 0 : 0) : current + 1
    case 'ArrowUp':
      return current <= 0 ? count - 1 : current - 1
    case 'Home':
      return 0
    default:
      return count - 1
  }
}

/** A DOM id for a row, safe whatever the key holds (a query with spaces, an address). */
export function suggestionRowId(kind: SuggestionRowKind, key: string): string {
  return `search-row-${kind}-${key.replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase()}`
}
