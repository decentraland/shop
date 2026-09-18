import type { SuggestedItem, SuggestionReasonKind } from '~/lib/api'

/** Why the rail is not on the page. Together with a rendered impression these account for every
 * home-page visit, which is what makes a click-through rate meaningful rather than a ratio of two
 * numbers with different denominators. */
export type HiddenReason = 'flag_off' | 'no_signal' | 'not_personalized' | 'too_few' | 'error'

/** Which part of a card was clicked. The reason line sits inside the card's click area, so without
 * this the two would be indistinguishable and the line would look like card interest. */
export type ClickTarget = 'card' | 'reason'

export type PagedAction = 'next' | 'prev' | 'dot'

/**
 * Which page the rail was on. Carried on every event because the same row means different things in
 * different places — on the home page it is discovery, in the cart it is an upsell against a decision
 * already made — and a click-through rate that averages them is a number about nothing.
 */
export type SuggestionSurface = 'home' | 'pdp' | 'cart' | 'favorites'

/** How many rows each reason accounts for — the mix the rail actually showed, not the mix the
 * scorer produced, since the diversity re-rank can drop rows. */
export function reasonCounts(items: SuggestedItem[]): Record<string, number> {
  const counts: Partial<Record<SuggestionReasonKind, number>> = {}
  for (const item of items) {
    counts[item.reason.kind] = (counts[item.reason.kind] ?? 0) + 1
  }
  return counts
}

/** The fewest rows worth the space. An empty personalised rail is worse than no rail. */
export const MIN_SUGGESTED_ROWS = 4

/**
 * Why the rail is not on the page, or null when it is.
 *
 * Ordered the way the decision is actually made, so the reported reason is the FIRST thing that stopped
 * it rather than a later symptom: a rail that never asked cannot also be "not personalized".
 *
 * Shared rather than inlined because the PDP has to make the same call from outside the component — it
 * shows its own collection cascade only when this rail is absent, and two copies of the rule would
 * eventually disagree and render both rows or neither.
 */
export function suggestedHiddenReason(input: {
  enabled: boolean
  hasSignal: boolean
  isLoading: boolean
  isError: boolean
  personalized?: boolean
  rowCount: number
}): HiddenReason | null {
  if (!input.enabled) return 'flag_off'
  if (!input.hasSignal) return 'no_signal'
  if (input.isLoading) return null
  if (input.isError) return 'error'
  if (input.personalized !== true) return 'not_personalized'
  if (input.rowCount < MIN_SUGGESTED_ROWS) return 'too_few'
  return null
}
