import { config } from '~/config'

// The shop's creator ranking (marketplace-server GET /v3/catalog/creators). Powers the Overview's
// "Meet Our Top Creators" row. Response is wrapped in `{ data: [...] }`.
//
// Ranked by SALES over a rolling window, attributed to whoever CREATED the item. Deliberately not
// /v1/rankings/creators, which the row used to read: that one credits the SELLER, and a primary mint is
// executed by the buyer against the store, so a creator who sells mostly primary barely registers in it.

export type ShopCreatorRank = {
  id: string // wallet address
  /** Sales in the requested window. What the ranking is ORDERED by. */
  sales: number
  /**
   * Sales over all time, and what they have published. What the card SHOWS — a creator's standing, not
   * their last month.
   *
   * OPTIONAL because this service and the shop deploy on their own schedules: a shop that reaches
   * production first would otherwise read `undefined` off every row. The card leaves out what it was not
   * given (see lib/topCreators); it must never be the reason a section fails to render.
   */
  totalSales?: number
  collections?: number
  items?: number
}

// Ranking only: the server has no way to tell a presentable creator from a test account, so it hands
// back more rows than the row shows and the caller picks (see lib/topCreators).
export async function fetchShopTopCreators(first: number, days: number): Promise<ShopCreatorRank[]> {
  const qs = new URLSearchParams({ first: String(first), days: String(days) })
  const res = await fetch(`${config.marketplaceServerUrl}/v3/catalog/creators?${qs.toString()}`)
  if (!res.ok) throw new Error(`fetchShopTopCreators ${res.status}`)
  const json = (await res.json()) as { data?: ShopCreatorRank[] }
  return json.data ?? []
}
