import type { SuggestionReasonKind } from '~/lib/api'

/**
 * The copy key for each reason. One key per kind, so a kind the server adds later renders nothing
 * rather than a missing-translation string.
 */
const REASON_KEYS: Record<SuggestionReasonKind, string> = {
  co_owned: 'overview.suggested.reason.coOwned',
  creator_affinity: 'overview.suggested.reason.creatorAffinity',
  favorite_similar: 'overview.suggested.reason.favoriteSimilar',
  equipped_similar: 'overview.suggested.reason.equippedSimilar',
  seed_similar: 'overview.suggested.reason.seedSimilar',
  trending: 'overview.suggested.reason.trending'
}

export function reasonKey(kind: SuggestionReasonKind): string | undefined {
  return REASON_KEYS[kind]
}

/**
 * Whether the copy for this kind has a name in it.
 *
 * Only "Because you have {item}" does. The others describe a relationship — to your favorites, to
 * what you are wearing, to what you looked at — and naming the specific item would be both longer
 * and less clear, so their copy is complete on its own. This is what decides whether a name has to
 * be RESOLVED, which is a network request; it is not the same question as whether the line links
 * somewhere.
 */
export function reasonInterpolatesItemName(kind: SuggestionReasonKind): boolean {
  return kind === 'co_owned'
}

/**
 * Whether the line should link to the item that triggered it.
 *
 * True of every kind the server attaches an item to, including the three whose copy does not name
 * it: "Similar to your favorites" still has a specific favorite behind it, and being able to go and
 * look at it is the point. The link needs only the id the reason already carries, so unlike the name
 * it costs nothing.
 */
export function reasonLinksToItem(kind: SuggestionReasonKind): boolean {
  return kind !== 'creator_affinity' && kind !== 'trending'
}

/** `contract-itemId` → the PDP path, or null when the id is not one the Shop can route to. */
export function triggerItemPath(triggerId: string): string | null {
  const split = triggerId.lastIndexOf('-')
  if (split <= 0) return null
  const contractAddress = triggerId.slice(0, split)
  const itemId = triggerId.slice(split + 1)
  if (!contractAddress.startsWith('0x') || !/^\d+$/.test(itemId)) return null
  return `/item/${contractAddress}/${itemId}`
}
