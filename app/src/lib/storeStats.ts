import { weiOf, type SaleRow, type SalesSummary } from '~/lib/sales'
import type { PublishableItem } from '~/lib/builder'

import type { CollectionSaleState } from '~/lib/collections'
export type StoreCatalogueItem = PublishableItem

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
  /** First sales over the item's whole life, when the server can say — not the window's count. */
  lifetimeSold: number | null
  priceCredits: number | null
  /** Set when the listing is priced in MANA, so the row can show what it actually asks. */
  manaWei: string | null
  /** When the item was created, where the source carries it — the newest-first ordering reads this. */
  createdAt: number | null
  state: 'discounted' | 'classic' | 'unlisted' | 'soldout' | 'unknown'
}

export type StoreCollection = {
  contractAddress: string
  /** The builder's own id for it — what its management page is keyed by. */
  collectionId: string
  name: string
  items: StoreItem[]
  listed: number
  classic: number
  soldOut: number
  sold: number
  /** What first sales of this collection brought in over the window, in MANA wei. */
  earningsWei: bigint
  /** The newest item in it, when the source dates them. */
  createdAt: number | null
  /** Sales across the window, oldest first — the sparkline's series. */
  trend: number[]
}

export type StoreStats = {
  collections: StoreCollection[]
  /** Sales in the window, by kind — both exact, counted by the feed rather than from the rows fetched. */
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
  /** Resales of this creator's items, by anyone. Volume traded, not what they were paid. */
  royalties: { resales: number; volumeWei: bigint } | null
  /** Days the trend lines span. Shorter than the period when the rows do not reach back that far. */
  trendDays: number
  listed: number
  neverListed: number
  classic: number
  soldOut: number
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
  mints,
  summary,
  catalogue,
  saleState,
  unreadable,
  days,
  now
}: {
  rows: SaleRow[]
  total: number
  truncated: boolean
  /** Exact count of first sales in the window, counted by the feed rather than derived from the rows. */
  mints: number
  /**
   * The server's own aggregate, when it answers.
   *
   * Every figure it carries is exact at any size, so it wins over anything derived from the fetched rows —
   * which are capped. The rows are still what the per-item counts and the trend are drawn from.
   */
  summary?: SalesSummary | null
  catalogue: StoreCatalogueItem[]
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
    // Only first sales are counted against an item, because that is what these figures measure: how much
    // of a run has gone. A resale moves a copy that was already sold — and `seller` on one only means this
    // account sold that token, which for a creator is as often somebody else's item as their own. Verified
    // on a production store: all 34 of its resales were tokens from collections it did not create.
    //
    // A row with no item cannot be attributed to one either, and a resale frequently has none: the order
    // was on a token, not on an item.
    if (row.type !== 'mint' || row.itemId == null) continue
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

  const lifetimeByItem = new Map(
    (summary?.byItem ?? []).map(row => [`${row.contractAddress.toLowerCase()}-${row.itemId}`, row.soldLifetime])
  )
  const summaryByCollection = new Map(
    (summary?.byCollection ?? []).map(row => [row.contractAddress.toLowerCase(), row])
  )

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
      collectionId: item.collectionId,
      name: item.collectionName,
      items: [],
      listed: 0,
      classic: 0,
      soldOut: 0,
      sold: 0,
      earningsWei: 0n,
      createdAt: null,
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
      lifetimeSold: lifetimeByItem.get(`${ca}-${item.blockchainItemId}`) ?? null,
      priceCredits: sale?.priceCredits ?? null,
      manaWei: sale?.manaWei ?? null,
      createdAt: item.createdAt ?? null,
      state
    })
    entry.sold += sold
    if (item.createdAt && (entry.createdAt == null || item.createdAt > entry.createdAt)) {
      entry.createdAt = item.createdAt
    }
    if (state === 'soldout') entry.soldOut += 1
    else if (state === 'classic') entry.classic += 1
    else if (state === 'discounted') entry.listed += 1
    byAddress.set(ca, entry)
  }

  for (const [ca, entry] of byAddress) {
    const own = rowsByCollection.get(ca) ?? []
    // Exact from the server where it answers; otherwise summed from the rows the cap allowed.
    const fromSummary = summaryByCollection.get(ca)
    entry.earningsWei = fromSummary
      ? weiOf(fromSummary.earnedWei)
      : own.reduce((sum, row) => sum + weiOf(row.price), 0n)
    if (fromSummary) entry.sold = fromSummary.sold
    entry.trend = bucketSales(own, trendDays, now)
    // Best-selling first: a store's own page should open on what is working.
    entry.items.sort((a, b) => b.sold - a.sold || a.name.localeCompare(b.name))
  }

  const attributed = [...byAddress.values()].reduce((n, entry) => n + entry.sold, 0)

  return {
    collections: [...byAddress.values()].sort((a, b) => b.sold - a.sold || a.name.localeCompare(b.name)),
    sold: summary?.total ?? total,
    mints: summary?.mints ?? mints,
    resales: summary ? summary.resales : total - mints,
    earningsWei: summary ? weiOf(summary.earnedWei) : rows.reduce((sum, row) => sum + weiOf(row.price), 0n),
    // The server's sum covers the whole window whatever its size; only a client-side one can fall short.
    partial: summary ? false : truncated,
    fetched: rows.length,
    unattributed: rows.length - attributed,
    trendDays,
    unknownCollections: [...byAddress.keys()].filter(ca => unreadable?.has(ca)).length,
    royalties: summary ? { resales: summary.royalties.resales, volumeWei: weiOf(summary.royalties.volumeWei) } : null,
    listed,
    neverListed,
    classic,
    soldOut
  }
}
