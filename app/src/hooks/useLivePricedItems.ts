import { useMemo } from 'react'
import { creditsAtLiveRate } from '~/lib/mana-convert'
import { useManaRate } from '~/hooks/useManaRate'

export type LivePricedItems<T> = {
  /** The rows, each priced in the currency it is actually quoted in. */
  items: T[]
  /** Whether any row needed the oracle at all — the gate for a rate-dependent skeleton or banner. */
  hasManaRows: boolean
  /** The oracle read is still in flight. Rows are showing their stored figure meanwhile. */
  ratePending: boolean
  /** The oracle read FAILED, so no row carrying `manaWei` can be priced at the live rate. */
  rateError: boolean
}

/**
 * Prices feed rows in credits, deciding per row which currency it is actually denominated in.
 *
 * A row that sells through a trade is quoted in USD and its `priceCredits` is the server's authoritative
 * figure. A row with NO trade is MANA-denominated: it carries `manaWei`, and its credit price is a live
 * conversion that drifts from any stored number — measured on production, a 20-MANA mint arrived as 4
 * credits where the live rate made it 14. Rows without `manaWei` pass through untouched.
 *
 * Exists as a hook because the rule kept being forgotten one surface at a time: every grid that renders
 * `item.priceCredits` straight from a mixed-denomination feed shows the stale number, and nothing objects.
 *
 * `ratePending` / `rateError` are returned rather than kept private because the pages differ on what to do
 * with them — one holds a skeleton until the rate lands, another shows the stored figure and corrects it —
 * and that is a presentation decision, not a pricing one. The oracle is only read when a row needs it.
 */
export function useLivePricedItems<T extends { priceCredits: number; manaWei?: string | null }>(
  items: T[]
): LivePricedItems<T> {
  const hasManaRows = useMemo(() => items.some(item => !!item.manaWei), [items])
  const { data: rate, isPending, isError } = useManaRate(hasManaRows)

  const priced = useMemo(() => {
    // Identity when nothing needs converting, so a grid of USD-quoted rows keeps its array reference.
    if (!hasManaRows) return items
    return items.map(item => {
      const credits = creditsAtLiveRate(item, rate)
      return credits === item.priceCredits ? item : { ...item, priceCredits: credits }
    })
  }, [items, rate, hasManaRows])

  return {
    items: priced,
    hasManaRows,
    // useManaRate is disabled when nothing needs it, and a disabled query reports `isPending` forever —
    // which would hang any skeleton keyed on this. Nothing is pending when nothing was asked for.
    ratePending: hasManaRows && isPending,
    rateError: hasManaRows && isError
  }
}
