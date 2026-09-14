import { useMemo } from 'react'
import { displayCredits } from '~/lib/mana-convert'
import { useManaRate } from '~/hooks/useManaRate'

/**
 * Prices feed rows in credits, deciding per row which currency it is actually denominated in.
 *
 * A row that sells through a trade is quoted in USD and its `priceCredits` is the server's authoritative
 * figure. A row with NO trade is MANA-denominated: it carries `manaWei`, and its credit price is a live
 * conversion that drifts from any stored number — measured on production, a 20-MANA mint arrived as 4
 * credits where the live rate made it 14. `displayCredits` encodes that rule, and rows without `manaWei`
 * pass through it untouched.
 *
 * Exists as a hook because the rule kept being forgotten one surface at a time: every grid that renders
 * `item.priceCredits` straight from a mixed-denomination feed shows the stale number, and nothing objects.
 * Call this on the rows before handing them to a card and the question is answered in one place.
 *
 * The server's snapshot stands in while the rate is in flight, rather than the 0 `displayCredits` returns
 * without one: a card reads `priceCredits > 0` as "for sale", so a zero would flash NOT FOR SALE across
 * every MANA row until the oracle answered. The oracle is only consulted when some row needs it.
 */
export function useLivePricedItems<T extends { priceCredits: number; manaWei?: string | null }>(items: T[]): T[] {
  const hasMana = useMemo(() => items.some(item => !!item.manaWei), [items])
  const { data: rate } = useManaRate(hasMana)

  return useMemo(() => {
    // Identity when nothing needs converting, so a grid of USD-quoted rows keeps its array reference.
    if (!hasMana) return items
    return items.map(item => (item.manaWei && rate ? { ...item, priceCredits: displayCredits(item, rate) } : item))
  }, [items, rate, hasMana])
}
