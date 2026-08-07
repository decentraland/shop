import type { ProfileAvatar } from '~/lib/profile'
import type { ShopCreatorRank } from '~/lib/rankings'

// Who is presentable enough to introduce on the home page. The server ranks; this picks, because the
// two questions have different answers and only one of them is about sales.

export type TopCreator = {
  address: string
  /**
   * The claimed name, VERBATIM — no capitalisation of the first letter, which the rest of the app applies
   * to names it may have to show as an address instead. A claimed name is bought and branded (`byPolygonalMind`,
   * `metaskins`), and the storefront this card links to spells it the creator's way; the two disagreeing over
   * the same person reads as the card getting it wrong.
   */
  name: string
  /**
   * What the card says about them, straight off the ranking row. Deliberately not re-derived here: the
   * ranking already counted it, and a second source would let the card disagree with the row it is on.
   *
   * Absent when the ranking service has not shipped them yet — the card drops the line rather than the
   * creator (see CreatorCard).
   */
  totalSales?: number
  collections?: number
  items?: number
  face?: string
}

/**
 * The rail's cards, in ranking order.
 *
 * Two things disqualify a creator regardless of how well they sell:
 *
 * A CLAIMED NAME. An unclaimed one renders as `handle#abcd`, and an address renders as `0x1234…5678` —
 * neither is a creator anyone can be introduced to, and the ranking's top thirty reliably include a
 * couple of accounts literally named `test`. A claimed name is bought, so it is also the cheapest
 * available signal that there is a real storefront behind the number.
 *
 * A NAME ALREADY ON THE ROW. Claimed names are unique per wallet but a creator can have several wallets,
 * and two cards reading the same name look like a bug rather than like two people.
 *
 * Everything the card needs comes from here, so a card cannot go and read something else about the
 * creator that contradicts the row it is on.
 */
/**
 * The smallest catalogue we will introduce someone on the strength of.
 *
 * Chosen off the production distribution, not invented: of the 25 presentable candidates the median has 36
 * published items and every one of them clears 10 — except three, who have 4, 4 and ONE. There is no
 * borderline case near this line, so it removes exactly the creators whose own card undercuts them and
 * nobody else.
 */
const MIN_ITEMS = 10

export function selectTopCreators(
  ranked: ShopCreatorRank[],
  profiles: Map<string, ProfileAvatar>,
  limit: number
): TopCreator[] {
  const taken = new Set<string>()
  const selected: TopCreator[] = []

  for (const { id, totalSales, collections, items } of ranked) {
    if (selected.length >= limit) break

    const profile = profiles.get(id.toLowerCase())
    const name = profile?.name?.trim()
    if (!profile?.hasClaimedName || !name) continue

    /**
     * A month can be won on one lucky item. `sebga` reached third on the production row with 33 sales
     * of TWO items — no wash trading, 27 real buyers, simply a hit — and the card then introduced them
     * with "4 Collections | 4 Items | Total sales: 62" beside a neighbour showing 45 and 1,168. The row
     * asks a shopper to go and browse someone; four items is not something to browse.
     *
     * Only applied when the count is KNOWN: a catalogue we cannot see is not a catalogue we can call small.
     */
    if (items != null && items < MIN_ITEMS) continue

    const key = name.toLowerCase()
    if (taken.has(key)) continue
    taken.add(key)

    selected.push({ address: id, name, totalSales, collections, items, face: profile.avatar?.snapshots?.face256 })
  }

  return selected
}
