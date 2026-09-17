import { weiOf, type SaleRow } from '~/lib/sales'

const DAY_MS = 86_400_000

/**
 * A figure against the same figure one window earlier.
 *
 * `pct` is null when the earlier window held nothing: a rise from zero has no percentage, and rendering
 * one would either divide by zero or invent a baseline that was never there. The UI says "new" for that
 * case rather than a number.
 */
export type Delta = { current: number; previous: number; pct: number | null }

export function deltaOf(current: number, previous: number): Delta {
  return { current, previous, pct: previous === 0 ? null : ((current - previous) / previous) * 100 }
}

/**
 * The same, for MANA wei.
 *
 * The percentage is worked out in bigint and only then narrowed, so a large store's earnings do not lose
 * their last digits to a float on the way. The two raw figures are narrowed too and are past what a number
 * holds exactly, which is why nothing downstream divides them: {@link Delta.pct} already carries the
 * comparison, and a multiple can be read back off it.
 */
export function deltaOfWei(current: bigint, previous: bigint): Delta {
  const pct = previous === 0n ? null : Number(((current - previous) * 10_000n) / previous) / 100
  return { current: Number(current), previous: Number(previous), pct }
}

/**
 * Who bought, and how many came back.
 *
 * Counts every sale the creator was the seller of, first sales and resales alike: the question is how many
 * PEOPLE the store has, and someone buying a copy a collector resold is not one of them, but someone
 * buying a second item straight from the store is. A store with 200 sales across 190 buyers is a different
 * business from one with 200 across 60, and nothing on the page said which one you had.
 */
export type Collectors = {
  /** Distinct buyers in the window. */
  total: number
  /** How many of them bought more than once. */
  repeat: number
  /** `repeat` as a percentage of `total`, 0 when nobody has bought yet. */
  repeatPct: number
  /** The most frequent buyers, best first. */
  top: { address: string; bought: number }[]
  /**
   * What share of the sales the single biggest buyer accounts for.
   *
   * The figure that reframes the rest of the page when it is high. A store reading "2,206 sold" where one
   * address took 2,202 of them does not have the business its headline suggests, and no other number here
   * would have said so.
   */
  topSharePct: number
}

export function collectorsOf(rows: SaleRow[], topN = 3): Collectors {
  const byBuyer = new Map<string, number>()
  for (const row of rows) {
    const buyer = row.buyer.toLowerCase()
    byBuyer.set(buyer, (byBuyer.get(buyer) ?? 0) + 1)
  }
  const counts = [...byBuyer.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const repeat = counts.filter(([, bought]) => bought > 1).length
  return {
    total: counts.length,
    repeat,
    repeatPct: counts.length === 0 ? 0 : (repeat / counts.length) * 100,
    topSharePct: rows.length === 0 ? 0 : ((counts[0]?.[1] ?? 0) / rows.length) * 100,
    top: counts.slice(0, topN).map(([address, bought]) => ({ address, bought }))
  }
}

/**
 * The people behind the sales, best customer first.
 *
 * Counts of DISTINCT items and collections rather than of sales, because those are the two questions the
 * total cannot answer: someone who bought nine copies of one item is a fan of that item, and someone who
 * bought one thing from each of five collections is a fan of the creator. A store's figures read very
 * differently depending on which of the two it has.
 */
export type Buyer = {
  address: string
  /** Sales to them in the window. */
  bought: number
  /** How many different items, and from how many different collections. */
  items: number
  collections: number
  /** What they paid in total, in MANA wei. */
  spentWei: bigint
  /** When they last bought, in milliseconds. */
  lastAt: number
}

export function topBuyers(rows: SaleRow[], limit = 5): Buyer[] {
  const byBuyer = new Map<
    string,
    { bought: number; items: Set<string>; collections: Set<string>; spentWei: bigint; lastAt: number }
  >()
  for (const row of rows) {
    const address = row.buyer.toLowerCase()
    const contract = row.contractAddress.toLowerCase()
    const entry = byBuyer.get(address) ?? {
      bought: 0,
      items: new Set<string>(),
      collections: new Set<string>(),
      spentWei: 0n,
      lastAt: 0
    }
    entry.bought += 1
    // A resale carries no item, only a token, so it counts towards the collection and the spend but not
    // towards "how many of your items they own".
    if (row.itemId != null) entry.items.add(`${contract}-${row.itemId}`)
    entry.collections.add(contract)
    entry.spentWei += weiOf(row.price)
    if (row.timestamp > entry.lastAt) entry.lastAt = row.timestamp
    byBuyer.set(address, entry)
  }
  return [...byBuyer.entries()]
    .map(([address, e]) => ({
      address,
      bought: e.bought,
      items: e.items.size,
      collections: e.collections.size,
      spentWei: e.spentWei,
      lastAt: e.lastAt
    }))
    .sort((a, b) => (b.spentWei > a.spentWei ? 1 : b.spentWei < a.spentWei ? -1 : b.bought - a.bought))
    .slice(0, limit)
}

/**
 * How long since anything sold, in whole days.
 *
 * Null when the rows hold no sale, which does NOT mean the store has never sold: the rows only cover the
 * window that was asked for. The caller has that window and is the one that can phrase the difference.
 */
export function daysSinceLastSale(rows: SaleRow[], now: number): number | null {
  if (rows.length === 0) return null
  const last = rows.reduce((max, row) => (row.timestamp > max ? row.timestamp : max), 0)
  return Math.max(0, Math.floor((now - last) / DAY_MS))
}

/**
 * Whether a discount moved anything, measured against the same stretch of time before it started.
 *
 * Per day rather than in total, because a sale that has been running two days cannot be compared with a
 * month that preceded it. `before` spans exactly as long as the discount has been live, ending the moment
 * it began.
 */
export type SaleLift = {
  /** Sales while the discount was live, and per day of it. */
  during: number
  duringPerDay: number
  /** The same for the stretch immediately before it. */
  before: number
  beforePerDay: number
  /** How much faster the store sold, as a percentage. Null when nothing sold before it: no baseline. */
  liftPct: number | null
  /** How long the discount has been live, in days, at least a fraction of one. */
  days: number
}

/**
 * Null when the answer cannot be honest.
 *
 * Two ways that happens, and both matter. A discount that has not started yet has nothing to measure. And
 * a comparison window reaching back further than the rows go would read every sale that was never fetched
 * as a sale that never happened, turning "we did not look" into a flattering zero, which is the worst kind
 * of wrong number: it makes every discount look like it worked.
 */
export function saleLift(
  rows: SaleRow[],
  sale: { effective: number; expiration: number },
  now: number,
  /**
   * How far back the ROWS WERE FETCHED, which is not the same as how far back these particular rows go.
   *
   * A discount covers some of the store, so its rows are a subset, and the oldest of that subset only says
   * when that collection last sold. Judging coverage by it would refuse to measure a discount on a
   * collection that has been quiet, which is precisely the collection a creator puts a discount on.
   * Defaults to the oldest row here for a caller that did not filter.
   */
  coveredSince?: number
): SaleLift | null {
  const start = sale.effective
  const end = Math.min(sale.expiration, now)
  if (end <= start) return null

  const span = end - start
  const comparisonStart = start - span
  const covered = coveredSince ?? rows.reduce((min, row) => (row.timestamp < min ? row.timestamp : min), now)
  if (comparisonStart < covered) return null

  const during = rows.filter(row => row.timestamp >= start && row.timestamp <= end).length
  const before = rows.filter(row => row.timestamp >= comparisonStart && row.timestamp < start).length
  const days = span / DAY_MS
  const duringPerDay = during / days
  const beforePerDay = before / days

  return {
    during,
    duringPerDay,
    before,
    beforePerDay,
    liftPct: beforePerDay === 0 ? null : ((duringPerDay - beforePerDay) / beforePerDay) * 100,
    days
  }
}

/**
 * Items people saved and nobody bought.
 *
 * A save is the one demand signal that costs a shopper nothing, so an item with many of them and no sales
 * is not being ignored: it is being considered and turned down, which is a price to look at rather than a
 * listing to promote. Items with no saves are left out — an item nobody has saved and nobody has bought is
 * the ordinary case, not a finding.
 */
export type WantedItem = { key: string; name: string; saves: number; sold: number }

export function wantedButUnsold(
  items: { key: string; name: string; sold: number }[],
  savesByKey: Map<string, number>
): WantedItem[] {
  return items
    .map(item => ({ key: item.key, name: item.name, saves: savesByKey.get(item.key) ?? 0, sold: item.sold }))
    .filter(item => item.saves > 0 && item.sold === 0)
    .sort((a, b) => b.saves - a.saves || a.name.localeCompare(b.name))
}
