import { config } from '~/config'

/**
 * A seller's own sales history, from GET /v1/sales.
 *
 * The endpoint returns ROWS, not aggregates, and that shapes everything the store dashboard can do
 * cheaply:
 *
 * - **Counts are one request.** `first=1` returns `total` for whatever filter is sent, so "how many did
 *   this item sell last month" costs a single call and no paging.
 * - **Sums are not.** There is no revenue aggregate, so a total has to page the rows, and past the cap
 *   below it covers part of the period rather than all of it.
 *
 * One fetch of the whole period, grouped on the client, answers per-collection, per-item, per-day and
 * per-kind at once. A request per collection (let alone per item) would be the same data, several times
 * over.
 */
export type SaleRow = {
  id: string
  itemId: string | null
  contractAddress: string
  buyer: string
  seller: string
  /**
   * MANA wei — always, whatever the listing was priced in.
   *
   * Verified against production rather than assumed: an item listed at 1 credit ($0.10) records 0.3709,
   * which is that amount of MANA at the rate of the day, not 0.1 of anything. The trade settles in MANA
   * and this is what moved, which is also what the creator is paid. So a total here is one currency and
   * means something — the only cost is that it has to be summed from rows.
   */
  price: string
  /** Milliseconds. */
  timestamp: number
  type: 'mint' | 'order' | 'bid'
  network: string
  tokenId: string | null
}

/**
 * A wei figure as a bigint, or zero.
 *
 * `BigInt('')` is 0 but `BigInt('1.5')` throws, and this runs inside a render path: one malformed row
 * from the feed would take the tree down rather than mis-state one number.
 */
export function weiOf(value: string | null | undefined): bigint {
  try {
    return BigInt(value || '0')
  } catch {
    return 0n
  }
}

/**
 * Everything about a seller's sales that is an AGGREGATE rather than a row.
 *
 * `/v1/sales` serves rows, so a total costs a page walk and a sum costs all of them — which is why the
 * figures here used to be capped, and why royalties could not be shown at all: the feed filters by `seller`
 * and `buyer`, and whoever earns a royalty is neither. This is one request, exact at any size.
 */
export type SalesSummary = {
  total: number
  mints: number
  resales: number
  /** MANA wei. */
  earnedWei: string
  byCollection: { contractAddress: string; sold: number; earnedWei: string }[]
  /** First sales per item over its WHOLE life, not the window — what says how many copies were issued. */
  byItem: { contractAddress: string; itemId: string; soldLifetime: number }[]
  /** Resales of items this address CREATED, by anyone. Traded, not paid out. */
  royalties: { resales: number; volumeWei: string }
}

export async function fetchSalesSummary(filters: {
  seller: string
  from?: number
  to?: number
}): Promise<SalesSummary> {
  const qs = new URLSearchParams({ seller: filters.seller })
  if (filters.from != null) qs.set('from', String(filters.from))
  if (filters.to != null) qs.set('to', String(filters.to))
  const res = await fetch(`${config.marketplaceServerUrl}/v1/sales/summary?${qs.toString()}`)
  if (!res.ok) {
    await res.body?.cancel()
    throw new Error(`fetchSalesSummary ${res.status}`)
  }
  const { data } = (await res.json()) as { data: SalesSummary }
  return data
}

export type SalesFilters = {
  /** Omitted when the question is about an item rather than about one account's sales. */
  seller?: string
  contractAddress?: string
  itemId?: string
  /** The feed filters by kind server-side, so a count per kind is one request and never an approximation. */
  type?: SaleRow['type']
  /** Milliseconds, inclusive. */
  from?: number
  to?: number
  first?: number
  skip?: number
}

function toQuery(filters: SalesFilters): URLSearchParams {
  const qs = new URLSearchParams()
  if (filters.seller) qs.set('seller', filters.seller)
  if (filters.contractAddress) qs.set('contractAddress', filters.contractAddress)
  if (filters.itemId != null) qs.set('itemId', filters.itemId)
  if (filters.type) qs.set('type', filters.type)
  if (filters.from != null) qs.set('from', String(filters.from))
  if (filters.to != null) qs.set('to', String(filters.to))
  qs.set('first', String(filters.first ?? 100))
  if (filters.skip) qs.set('skip', String(filters.skip))
  qs.set('sortBy', 'recently_sold')
  return qs
}

async function get(filters: SalesFilters): Promise<{ data: SaleRow[]; total: number }> {
  const res = await fetch(`${config.marketplaceServerUrl}/v1/sales?${toQuery(filters).toString()}`)
  if (!res.ok) {
    // Release the stream: nothing reads the body on this path, and leaving it unconsumed leaks it.
    await res.body?.cancel()
    throw new Error(`fetchSales ${res.status}`)
  }
  const json = (await res.json()) as { data?: SaleRow[]; total?: number }
  return { data: json.data ?? [], total: json.total ?? 0 }
}

/** How many sales match, without fetching one. `first=1` because only `total` is read. */
export async function countSales(filters: Omit<SalesFilters, 'first' | 'skip'>): Promise<number> {
  const { total } = await get({ ...filters, first: 1 })
  return total
}

/** One page of the feed, for a table that pages through it rather than summing it. */
export async function fetchSalesPage(
  filters: Omit<SalesFilters, 'first' | 'skip'>,
  { first, skip }: { first: number; skip: number }
): Promise<{ rows: SaleRow[]; total: number }> {
  const { data, total } = await get({ ...filters, first, skip })
  return { rows: data, total }
}

/**
 * Every sale in the window, to a cap.
 *
 * Capped rather than paged to the end on purpose: this feeds a dashboard, and a creator with tens of
 * thousands of sales would otherwise spend a minute of requests to draw the same shaped chart. The cap is
 * returned alongside so the page can say its figures cover part of the period rather than quietly
 * under-reporting — see `truncated`.
 *
 * The page size is the largest the feed serves: it clamps anything above 1000 to 1000, so asking for more
 * only costs a round trip. What the cap actually limits is earnings and the per-item split; the totals and
 * the per-kind counts come from `countSales`, which is exact at any size.
 */
export async function fetchSellerSales(
  filters: Omit<SalesFilters, 'first' | 'skip'>,
  { cap = 5000 }: { cap?: number } = {}
): Promise<{ rows: SaleRow[]; total: number; truncated: boolean }> {
  const PAGE = 1000
  const rows: SaleRow[] = []
  let total = 0
  for (let skip = 0; skip < cap; skip += PAGE) {
    const first = Math.min(PAGE, cap - skip)
    const page = await get({ ...filters, first, skip })
    total = page.total
    rows.push(...page.data)
    if (page.data.length < first || rows.length >= total) break
  }
  return { rows, total, truncated: total > rows.length }
}
