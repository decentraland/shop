import { config } from '~/config'
import { weiOf, type SaleRow } from '~/lib/sales'

/** Closing USD per MANA by UTC day ('YYYY-MM-DD'), from marketplace-server's /v1/rates/mana-usd. */
export type RateBook = Map<string, number>

export type StoreCurrency = 'mana' | 'usd'

const CURRENCY_KEY = 'shop.my-store.currency'

/** The UTC day a moment falls on, the way the server keys its rates. */
export function dayOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** The closing rates of every day between two instants that the server has stored. Days it has not are absent. */
export async function fetchManaUsdRates(from: number, to: number): Promise<RateBook> {
  const qs = new URLSearchParams({ from: String(Math.max(0, Math.floor(from))), to: String(Math.floor(to)) })
  const res = await fetch(`${config.marketplaceServerUrl}/v1/rates/mana-usd?${qs.toString()}`)
  if (!res.ok) {
    await res.body?.cancel()
    throw new Error(`fetchManaUsdRates ${res.status}`)
  }
  const { data } = (await res.json()) as { data?: { day: string; usd: string }[] }
  // A rate that is not a positive number is left out, so the day reads as unpriced rather than as $NaN.
  return new Map(
    (data ?? []).map(rate => [rate.day, Number(rate.usd)] as const).filter(([, usd]) => Number.isFinite(usd) && usd > 0)
  )
}

/** A MANA wei amount in dollars at a given rate. Precise to a millionth of a MANA, which is far below a cent. */
export function usdOfWei(wei: bigint, usdPerMana: number): number {
  return (Number(wei / 10n ** 12n) / 1_000_000) * usdPerMana
}

/** A sale in dollars at the close of its own day, or null when that day has no stored rate. */
export function usdOfSale(row: Pick<SaleRow, 'price' | 'timestamp'>, book: RateBook): number | null {
  const rate = book.get(dayOf(row.timestamp))
  return rate === undefined ? null : usdOfWei(weiOf(row.price), rate)
}

/**
 * Dollars per key across a set of sales, and how many of them had no rate.
 *
 * @param rows - The sales to sum.
 * @param book - The daily rates.
 * @param keyOf - What to group by (an item, a buyer).
 */
export function usdBy(
  rows: SaleRow[],
  book: RateBook,
  keyOf: (row: SaleRow) => string | null
): { totals: Map<string, number>; unpriced: number } {
  const totals = new Map<string, number>()
  let unpriced = 0
  for (const row of rows) {
    const key = keyOf(row)
    if (key === null) continue
    const usd = usdOfSale(row, book)
    if (usd === null) {
      unpriced += 1
      continue
    }
    totals.set(key, (totals.get(key) ?? 0) + usd)
  }
  return { totals, unpriced }
}

/** Dollars as the dashboard writes them: cents under a hundred, whole dollars above. */
export function formatUsd(usd: number, locale?: string): string {
  return usd >= 100
    ? Math.round(usd).toLocaleString(locale)
    : usd.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** The currency the creator last chose, per browser; MANA until they choose, since that is what they are paid in. */
export function storedCurrency(): StoreCurrency {
  try {
    return localStorage.getItem(CURRENCY_KEY) === 'usd' ? 'usd' : 'mana'
  } catch {
    return 'mana'
  }
}

export function rememberCurrency(currency: StoreCurrency): void {
  try {
    localStorage.setItem(CURRENCY_KEY, currency)
  } catch {
    // A browser that will not store it is not a reason to refuse the switch.
  }
}
