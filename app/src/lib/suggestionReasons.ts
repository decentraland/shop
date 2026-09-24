import type { SuggestionReasonKind } from '~/lib/api'

/**
 * The four explanations a suggested card can carry.
 *
 * The server's reasons are finer than a reader needs, so several share one: an item worn is also an
 * item owned. `trending` has none on purpose: a rail that is personal says why of every card, and
 * "popular right now" is not a why.
 */
export type ReasonCategory = 'owned' | 'favorites' | 'creator' | 'activity'

const CATEGORY_BY_KIND: Record<SuggestionReasonKind, ReasonCategory | null> = {
  co_owned: 'owned',
  equipped_similar: 'owned',
  favorite_similar: 'favorites',
  creator_affinity: 'creator',
  seed_similar: 'activity',
  trending: null
}

/** The category a row is explained by, or undefined when it has none and so does not belong in the rail. */
export function reasonCategory(kind: SuggestionReasonKind): ReasonCategory | undefined {
  return CATEGORY_BY_KIND[kind] ?? undefined
}

/**
 * The rows the rail actually shows. The pages that decide whether to show their own row in its place read
 * this too: counting the raw answer instead would have them stand down for a rail that then hides itself.
 */
export function explainedRows<T extends { reason: { kind: SuggestionReasonKind } }>(rows: T[]): T[] {
  return rows.filter(row => reasonCategory(row.reason.kind))
}

export function reasonCopyKey(category: ReasonCategory): string {
  return `overview.suggested.reason.${category}`
}
