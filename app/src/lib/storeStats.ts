import type { SaleRow } from '~/lib/sales'
import type { PublishableItem } from '~/lib/builder'
import type { CollectionSaleState } from '~/lib/collections'

/** One item of a collection, as the store dashboard reads it. */
export type StoreItem = {
  key: string
  itemId: string
  name: string
  thumbnail: string
  rarity: string
  /** Copies still mintable. */
  left: number
  /** Copies minted, from the item's own supply — not from the sales feed, which only covers the window. */
  minted: number
  sold: number
  priceCredits: number | null
  state: 'discounted' | 'classic' | 'unlisted' | 'soldout' | 'unknown'
}

export type StoreCollection = {
  contractAddress: string
  name: string
  items: StoreItem[]
  listed: number
  classic: number
  soldOut: number
  sold: number
  /** Sales across the window, oldest first — the sparkline's series. */
  trend: number[]
}

export type StoreStats = {
  collections: StoreCollection[]
  /** Sales in the window, by kind. */
  sold: number
  mints: number
  resales: number
  /** MANA wei, summed from the rows the cap allowed. */
  earningsWei: bigint
  /** True when the window held more sales than the cap fetched, so the sums cover only part of it. */
  partial: boolean
  /** How many rows the figures summed from — the whole window unless `partial`. */
  fetched: number
  /**
   * Fetched sales that no item in the catalogue accounts for, so the collection rows below add up to less
   * than the headline. A collection unpublished since it sold, or a sale the feed reports without an item.
   */
  unattributed: number
  /** Collections whose listing state could not be read, so their items carry no status. */
  unknownCollections: number
  /** Days the trend lines span. Shorter than the period when the rows do not reach back that far. */
  trendDays: number
  listed: number
  neverListed: number
  classic: number
  soldOut: number
  recent: SaleRow[]
}

const DAY_MS = 86_400_000

/**
 * The window's sales as a fixed number of points, oldest first.
 *
 * Fixed rather than one point per day: a month of daily buckets holding a handful of sales draws a comb of
 * spikes and zeroes that reads as noise rather than as a trend. Widening each point to cover several days
 * gives the same information a shape the eye can actually follow, and keeps every window — a week or a
 * year — drawing at the same density.
 */
export const TREND_POINTS = 14

export function bucketSales(rows: SaleRow[], days: number, now: number): number[] {
  const buckets: number[] = new Array<number>(TREND_POINTS).fill(0)
  const from = now - days * DAY_MS
  const span = (days * DAY_MS) / TREND_POINTS
  for (const row of rows) {
    // Measured forward from the start of the window, which is the bound the feed was asked for and is
    // inclusive: a sale landing on it belongs to the first point, not off the chart.
    if (row.timestamp < from || row.timestamp > now) continue
    buckets[Math.min(TREND_POINTS - 1, Math.floor((row.timestamp - from) / span))] += 1
  }
  return buckets
}

/**
 * Everything the store dashboard shows, from one page of sales and the creator's own catalogue.
 *
 * The sales feed is asked ONCE for the whole window and grouped here: per collection, per item, per day and
 * per kind all come out of the same rows. Asking per collection would be the same data fetched again for
 * each, and asking per item would multiply that by the catalogue.
 *
 * The catalogue is not derivable from sales: an item that has never sold still has to appear, and that is
 * exactly the item the dashboard exists to point at.
 */
export function buildStoreStats({
  rows,
  total,
  truncated,
  catalogue,
  saleState,
  unreadable,
  days,
  now
}: {
  rows: SaleRow[]
  total: number
  truncated: boolean
  catalogue: PublishableItem[]
  saleState: Record<string, CollectionSaleState>
  /** Collections whose sale state could not be read. Their items get no status rather than a wrong one. */
  unreadable?: Set<string>
  /** The window in days, or null for all time. */
  days: number | null
  now: number
}): StoreStats {
  const soldByItem = new Map<string, number>()
  const rowsByCollection = new Map<string, SaleRow[]>()
  for (const row of rows) {
    // A row with no item cannot be attributed to one, so it is left out of both maps: counting it in a
    // collection's chart while no item row accounts for it is how a sparkline and its own figure disagree.
    if (row.itemId == null) continue
    const ca = row.contractAddress.toLowerCase()
    const key = `${ca}-${row.itemId}`
    soldByItem.set(key, (soldByItem.get(key) ?? 0) + 1)
    const list = rowsByCollection.get(ca) ?? []
    list.push(row)
    rowsByCollection.set(ca, list)
  }

  /**
   * What the chart can honestly span: the period, unless the rows do not cover it.
   *
   * All time has no window of its own. And a busy store hits the fetch cap, whose rows are the most recent
   * ones — spanning the nominal period would then draw a single spike at the end against thirteen empty
   * points, which reads as "nothing sold for weeks" about a store that sold thousands. In both cases the
   * chart covers what was actually read, and the panel says so.
   */
  const oldest = rows.reduce((min, row) => (row.timestamp < min ? row.timestamp : min), now)
  const covered = Math.max(1, Math.ceil((now - oldest) / DAY_MS))
  const trendDays = days != null && !truncated ? days : Math.max(days == null ? TREND_POINTS : 1, covered)

  const byAddress = new Map<string, StoreCollection>()
  let listed = 0
  let classic = 0
  let soldOut = 0
  let neverListed = 0

  for (const item of catalogue) {
    const ca = item.contractAddress.toLowerCase()
    const sale = saleState[`${item.contractAddress}-${item.blockchainItemId}`]
    const state: StoreItem['state'] =
      item.remainingSupply <= 0
        ? 'soldout'
        : unreadable?.has(ca)
          ? 'unknown'
          : !sale?.isOnSale
            ? 'unlisted'
            : sale.manaWei
              ? 'classic'
              : 'discounted'

    if (state === 'soldout') soldOut += 1
    else if (state === 'unlisted') neverListed += 1
    else if (state === 'classic') classic += 1
    else if (state === 'discounted') listed += 1

    const entry = byAddress.get(ca) ?? {
      contractAddress: ca,
      name: item.collectionName,
      items: [],
      listed: 0,
      classic: 0,
      soldOut: 0,
      sold: 0,
      trend: []
    }
    const sold = soldByItem.get(`${ca}-${item.blockchainItemId}`) ?? 0
    entry.items.push({
      key: `${ca}-${item.blockchainItemId}`,
      itemId: item.blockchainItemId,
      name: item.name,
      thumbnail: item.thumbnail,
      rarity: item.rarity,
      left: item.remainingSupply,
      minted: item.totalSupply,
      sold,
      priceCredits: sale?.priceCredits ?? null,
      state
    })
    entry.sold += sold
    if (state === 'soldout') entry.soldOut += 1
    else if (state === 'classic') entry.classic += 1
    else if (state === 'discounted') entry.listed += 1
    byAddress.set(ca, entry)
  }

  for (const [ca, entry] of byAddress) {
    entry.trend = bucketSales(rowsByCollection.get(ca) ?? [], trendDays, now)
    // Best-selling first: a store's own page should open on what is working.
    entry.items.sort((a, b) => b.sold - a.sold || a.name.localeCompare(b.name))
  }

  const mints = rows.filter(row => row.type === 'mint').length
  const attributed = [...byAddress.values()].reduce((n, entry) => n + entry.sold, 0)

  return {
    collections: [...byAddress.values()].sort((a, b) => b.sold - a.sold || a.name.localeCompare(b.name)),
    sold: total,
    mints,
    resales: rows.length - mints,
    earningsWei: rows.reduce((sum, row) => sum + BigInt(row.price || '0'), 0n),
    partial: truncated,
    fetched: rows.length,
    unattributed: rows.length - attributed,
    trendDays,
    unknownCollections: [...byAddress.keys()].filter(ca => unreadable?.has(ca)).length,
    listed,
    neverListed,
    classic,
    soldOut,
    recent: rows.slice(0, 6)
  }
}
