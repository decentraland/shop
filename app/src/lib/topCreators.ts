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

    const key = name.toLowerCase()
    if (taken.has(key)) continue
    taken.add(key)

    selected.push({ address: id, name, totalSales, collections, items, face: profile.avatar?.snapshots?.face256 })
  }

  return selected
}
