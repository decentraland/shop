import type { SuggestedItem, SuggestionReasonKind } from '~/lib/api'

/** Why the rail is not on the page. Together with a rendered impression these account for every
 * home-page visit, which is what makes a click-through rate meaningful rather than a ratio of two
 * numbers with different denominators. */
export type HiddenReason = 'flag_off' | 'no_signal' | 'not_personalized' | 'too_few' | 'error'

/** Which part of a card was clicked. The reason line sits inside the card's click area, so without
 * this the two would be indistinguishable and the line would look like card interest. */
export type ClickTarget = 'card' | 'reason'

export type PagedAction = 'next' | 'prev' | 'dot'

/** How many rows each reason accounts for — the mix the rail actually showed, not the mix the
 * scorer produced, since the diversity re-rank can drop rows. */
export function reasonCounts(items: SuggestedItem[]): Record<string, number> {
  const counts: Partial<Record<SuggestionReasonKind, number>> = {}
  for (const item of items) {
    counts[item.reason.kind] = (counts[item.reason.kind] ?? 0) + 1
  }
  return counts
}
